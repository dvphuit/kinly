import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { google, type drive_v3 } from 'googleapis';
import { decryptSecret, encryptSecret, isLegacyCiphertext } from './security/tokenEncryption.js';

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const auth = getAuth();
const api = express();
const router = express.Router();

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SYNC_FILE_NAME = 'babygrowth-sync-v2.json';
const MEDIA_QUERY = "'appDataFolder' in parents and appProperties has { key='babygrowthMedia' and value='true' } and trashed = false";
const OAUTH_STATE_COOKIE = '__Host-kinly_google_oauth_state';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60_000;

const googleClientId = defineString('GOOGLE_CLIENT_ID', {
  default: '598629342498-c8ltki5l6hfn395ts1497hu5euks33kv.apps.googleusercontent.com',
});
const googleRedirectUri = defineString('GOOGLE_REDIRECT_URI', {
  default: 'https://baby-growth-dvphu.web.app/api/google/oauth/callback',
});
const frontendOrigin = defineString('FRONTEND_ORIGIN', {
  default: 'https://baby-growth-dvphu.web.app',
});
const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');
const tokenEncryptionKey = defineSecret('TOKEN_ENCRYPTION_KEY');

interface GoogleAccountDocument {
  uid: string;
  permissionId: string | null;
  email: string | null;
  displayName: string | null;
  refreshTokenCiphertext: string;
  scopes: string;
  needsReauth: boolean;
  lastRefreshAt?: Timestamp | null;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

interface OAuthTransactionDocument {
  uid: string;
  stateHash: string;
  codeVerifierCiphertext: string;
  redirectUri: string;
  expiresAt: Timestamp;
  consumedAt: Timestamp | null;
}

class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message = code) {
    super(message);
  }
}

class GoogleReauthRequiredError extends Error {
  constructor() {
    super('Google Drive cần được kết nối lại.');
  }
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof GoogleReauthRequiredError) {
    res.status(401).json({ error: { code: 'GOOGLE_REAUTH_REQUIRED', message: error.message } });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  logger.error('googleApi request failed', { error: error instanceof Error ? error.message : String(error) });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Không thể hoàn thành thao tác Google Drive.' } });
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function requireFirebaseUser(req: Request): Promise<DecodedIdToken> {
  const authorization = req.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'KINLY_AUTH_REQUIRED', 'Kinly authentication is required.');
  try {
    return await auth.verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, 'KINLY_AUTH_REQUIRED', 'Kinly authentication is required.');
  }
}

function createPkcePair(): { state: string; verifier: string; challenge: string } {
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { state, verifier, challenge };
}

function googleOAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  return new google.auth.OAuth2(
    googleClientId.value(),
    googleClientSecret.value(),
    googleRedirectUri.value(),
  );
}

function accountRef(uid: string) {
  return db.collection('googleAccounts').doc(uid);
}

async function loadGoogleAccount(uid: string): Promise<GoogleAccountDocument | null> {
  const snapshot = await accountRef(uid).get();
  return snapshot.exists ? snapshot.data() as GoogleAccountDocument : null;
}

async function markNeedsReauth(uid: string): Promise<void> {
  await accountRef(uid).set({ needsReauth: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

function timestampToIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function isInvalidGrant(error: unknown): boolean {
  if (!(error instanceof Error) && (typeof error !== 'object' || error === null)) return false;
  const candidate = error as { message?: string; response?: { data?: { error?: string } } };
  return candidate.message?.includes('invalid_grant') === true
    || candidate.message?.includes('unauthorized_client') === true
    || candidate.response?.data?.error === 'invalid_grant'
    || candidate.response?.data?.error === 'unauthorized_client';
}

const refreshInFlight = new Map<string, Promise<InstanceType<typeof google.auth.OAuth2>>>();

async function getGoogleDriveClient(uid: string): Promise<drive_v3.Drive> {
  const account = await loadGoogleAccount(uid);
  if (!account || account.needsReauth || !account.refreshTokenCiphertext) throw new GoogleReauthRequiredError();

  const existing = refreshInFlight.get(uid);
  if (existing) {
    const oauth = await existing;
    return google.drive({ version: 'v3', auth: oauth });
  }

  const refreshPromise = (async () => {
    const refreshToken = decryptSecret(account.refreshTokenCiphertext, tokenEncryptionKey, `google-account:${uid}`);
    const oauth = googleOAuthClient();
    oauth.setCredentials({ refresh_token: refreshToken });
    try {
      const response = await oauth.getAccessToken();
      if (!response.token) throw new GoogleReauthRequiredError();
      const rotatedRefreshToken = oauth.credentials.refresh_token;
      if (rotatedRefreshToken && rotatedRefreshToken !== refreshToken) {
        await accountRef(uid).set({
          refreshTokenCiphertext: encryptSecret(rotatedRefreshToken, tokenEncryptionKey, `google-account:${uid}`),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else if (isLegacyCiphertext(account.refreshTokenCiphertext)) {
        await accountRef(uid).set({
          refreshTokenCiphertext: encryptSecret(refreshToken, tokenEncryptionKey, `google-account:${uid}`),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await accountRef(uid).set({
        needsReauth: false,
        lastRefreshAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return oauth;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (isInvalidGrant(error) || reason.includes('invalid_grant') || reason.includes('unauthorized_client')) {
        await markNeedsReauth(uid);
        throw new GoogleReauthRequiredError();
      }
      throw error;
    }
  })();

  refreshInFlight.set(uid, refreshPromise);
  try {
    const oauth = await refreshPromise;
    return google.drive({ version: 'v3', auth: oauth });
  } finally {
    refreshInFlight.delete(uid);
  }
}

async function loadValidOAuthTransaction(state: string): Promise<{ id: string; data: OAuthTransactionDocument } | null> {
  const id = hash(state);
  const snapshot = await db.collection('oauthTransactions').doc(id).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as OAuthTransactionDocument;
  if (data.consumedAt || data.expiresAt.toMillis() <= Date.now()) return null;
  return { id, data };
}

async function consumeOAuthTransaction(id: string): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const ref = db.collection('oauthTransactions').doc(id);
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as OAuthTransactionDocument | undefined;
    if (!data || data.consumedAt || data.expiresAt.toMillis() <= Date.now()) {
      throw new HttpError(400, 'GOOGLE_OAUTH_TRANSACTION_INVALID', 'OAuth transaction is invalid or expired.');
    }
    transaction.update(ref, { consumedAt: Timestamp.now() });
  });
}

function getCookie(req: Request, name: string): string | null {
  const raw = req.header('cookie');
  if (!raw) return null;
  const prefix = `${name}=`;
  const value = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

function redirectError(res: Response, code: string): void {
  clearOAuthStateCookie(res);
  res.redirect(`${frontendOrigin.value()}/profile/google-drive?google_error=${encodeURIComponent(code)}`);
}

router.get('/google/oauth/start', async (req, res) => {
  try {
    const user = await requireFirebaseUser(req);
    const { state, verifier, challenge } = createPkcePair();
    await db.collection('oauthTransactions').doc(hash(state)).set({
      uid: user.uid,
      stateHash: hash(state),
      codeVerifierCiphertext: encryptSecret(verifier, tokenEncryptionKey, `oauth-transaction:${hash(state)}`),
      redirectUri: googleRedirectUri.value(),
      expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60_000),
      consumedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    const existing = await loadGoogleAccount(user.uid);
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: OAUTH_STATE_MAX_AGE_MS,
      path: '/',
    });
    const selectAccount = req.query.selectAccount === 'true';
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set('client_id', googleClientId.value());
    url.searchParams.set('redirect_uri', googleRedirectUri.value());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (selectAccount) url.searchParams.set('prompt', 'select_account');
    else if (!existing?.refreshTokenCiphertext || existing.needsReauth) url.searchParams.set('prompt', 'consent');

    res.json({ authorizationUrl: url.toString() });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/google/oauth/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const providerError = typeof req.query.error === 'string' ? req.query.error : null;
  if (!state) {
    redirectError(res, 'google_state_invalid');
    return;
  }
  if (providerError) {
    redirectError(res, 'google_denied');
    return;
  }
  if (!code) {
    redirectError(res, 'google_code_missing');
    return;
  }

  try {
    if (getCookie(req, OAUTH_STATE_COOKIE) !== state) {
      redirectError(res, 'google_state_invalid');
      return;
    }
    const transaction = await loadValidOAuthTransaction(state);
    if (!transaction) {
      redirectError(res, 'google_state_invalid');
      return;
    }
    const verifier = decryptSecret(transaction.data.codeVerifierCiphertext, tokenEncryptionKey, `oauth-transaction:${transaction.id}`);
    const client = new google.auth.OAuth2(
      googleClientId.value(),
      googleClientSecret.value(),
      transaction.data.redirectUri,
    );
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (!tokens.access_token) {
      redirectError(res, 'google_token_missing');
      return;
    }

    client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: client });
    const about = await drive.about.get({ fields: 'user(permissionId,emailAddress,displayName,photoLink)' });
    const googleUser = about.data.user;
    if (!googleUser?.permissionId) {
      redirectError(res, 'google_account_missing');
      return;
    }

    const existing = await loadGoogleAccount(transaction.data.uid);
    const refreshToken = tokens.refresh_token
      ? encryptSecret(tokens.refresh_token, tokenEncryptionKey, `google-account:${transaction.data.uid}`)
      : existing?.refreshTokenCiphertext;
    if (!refreshToken) {
      redirectError(res, 'google_refresh_token_missing');
      return;
    }

    await accountRef(transaction.data.uid).set({
      uid: transaction.data.uid,
      permissionId: googleUser.permissionId,
      email: googleUser.emailAddress ?? null,
      displayName: googleUser.displayName ?? null,
      refreshTokenCiphertext: refreshToken,
      scopes: tokens.scope ?? GOOGLE_SCOPE,
      needsReauth: false,
      lastRefreshAt: Timestamp.now(),
      createdAt: existing?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    } satisfies GoogleAccountDocument, { merge: true });
    await consumeOAuthTransaction(transaction.id);
    clearOAuthStateCookie(res);
    res.redirect(`${frontendOrigin.value()}/profile/google-drive?google=connected`);
  } catch (error) {
    logger.error('Google OAuth callback failed', { error: error instanceof Error ? error.message : String(error) });
    redirectError(res, error instanceof GoogleReauthRequiredError ? 'google_reauth_required' : 'google_callback_failed');
  }
});

router.get('/google/status', async (req, res) => {
  try {
    const user = await requireFirebaseUser(req);
    const account = await loadGoogleAccount(user.uid);
    res.json({
      linked: Boolean(account),
      needsReauth: Boolean(account?.needsReauth),
      email: account?.email ?? null,
      displayName: account?.displayName ?? null,
      permissionId: account?.permissionId ?? null,
      lastRefreshAt: timestampToIso(account?.lastRefreshAt),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/google/drive/media', async (req, res) => {
  try {
    const user = await requireFirebaseUser(req);
    const drive = await getGoogleDriveClient(user.uid);
    const result = await drive.files.list({
      q: MEDIA_QUERY,
      spaces: 'appDataFolder',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink)',
    });
    res.json({ files: result.data.files ?? [] });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/google/drive/snapshot', async (req, res) => {
  try {
    const user = await requireFirebaseUser(req);
    const drive = await getGoogleDriveClient(user.uid);
    const list = await drive.files.list({
      q: `'appDataFolder' in parents and name = '${SYNC_FILE_NAME}' and trashed = false`,
      spaces: 'appDataFolder',
      orderBy: 'modifiedTime desc',
      pageSize: 1,
      fields: 'files(id,name,modifiedTime)',
    });
    const file = list.data.files?.[0];
    if (!file?.id) {
      res.json({ found: false });
      return;
    }
    const content = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'json' });
    res.json({ found: true, remoteFileId: file.id, snapshot: content.data, updatedAt: file.modifiedTime ?? null });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/google/drive/snapshot', async (req, res) => {
  try {
    const user = await requireFirebaseUser(req);
    const snapshot = req.body?.snapshot;
    if (!snapshot || typeof snapshot !== 'object') throw new HttpError(400, 'INVALID_SNAPSHOT', 'Snapshot is required.');
    const drive = await getGoogleDriveClient(user.uid);
    const requestedFileId = typeof req.body.fileId === 'string' ? req.body.fileId : null;
    const fileId = requestedFileId ?? (await drive.files.list({
      q: `'appDataFolder' in parents and name = '${SYNC_FILE_NAME}' and trashed = false`,
      spaces: 'appDataFolder',
      orderBy: 'modifiedTime desc',
      pageSize: 1,
      fields: 'files(id)',
    })).data.files?.[0]?.id;
    const result = fileId
      ? await drive.files.update({ fileId, requestBody: { name: SYNC_FILE_NAME, mimeType: 'application/json' }, media: { mimeType: 'application/json', body: Readable.from([JSON.stringify(snapshot)]) }, fields: 'id,name,modifiedTime' })
      : await drive.files.create({ requestBody: { name: SYNC_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] }, media: { mimeType: 'application/json', body: Readable.from([JSON.stringify(snapshot)]) }, fields: 'id,name,modifiedTime' });
    res.json(result.data);
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/google/drive/media', async (req, res) => {
  try {
    const user = await requireFirebaseUser(req);
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'MEDIA_BODY_REQUIRED', 'Media body is required.');
    const name = typeof req.query.name === 'string' && req.query.name ? req.query.name : `media-${Date.now()}`;
    const mimeType = typeof req.query.mimeType === 'string' && req.query.mimeType ? req.query.mimeType : 'application/octet-stream';
    const mediaId = typeof req.query.mediaId === 'string' ? req.query.mediaId : name;
    const drive = await getGoogleDriveClient(user.uid);
    const result = await drive.files.create({
      requestBody: { name, mimeType, parents: ['appDataFolder'], appProperties: { babygrowthMedia: 'true', babygrowthMediaId: mediaId } },
      media: { mimeType, body: Readable.from(req.body) },
      fields: 'id,name',
    });
    res.json(result.data);
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/google/drive/media/:fileId', async (req, res) => {
  try {
    const user = await requireFirebaseUser(req);
    const drive = await getGoogleDriveClient(user.uid);
    const response = await drive.files.get({ fileId: req.params.fileId, alt: 'media' }, { responseType: 'stream' });
    res.setHeader('Content-Type', response.headers['content-type'] ?? 'application/octet-stream');
    response.data.on('error', (error) => {
      if (!res.headersSent) sendError(res, error);
      else res.destroy(error);
    });
    response.data.pipe(res);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/google/drive/media/:fileId', async (req, res) => {
  try {
    const user = await requireFirebaseUser(req);
    const drive = await getGoogleDriveClient(user.uid);
    try {
      await drive.files.delete({ fileId: req.params.fileId });
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status !== 404) throw error;
    }
    res.status(204).end();
  } catch (error) {
    sendError(res, error);
  }
});

api.use(express.json({ limit: '2mb' }));
api.use(express.raw({ type: ['application/octet-stream', 'image/*', 'video/*'], limit: '50mb' }));
api.use('/api', router);
api.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  void next;
  sendError(res, error);
});

export const googleApi = onRequest(
  {
    region: 'asia-southeast1',
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: [googleClientSecret, tokenEncryptionKey],
  },
  api,
);
