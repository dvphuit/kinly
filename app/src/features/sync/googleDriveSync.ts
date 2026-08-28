import { exportAppSnapshot, applyAppSnapshot, subscribeAppSnapshotChanges, type AppSnapshot } from './appSnapshot';
import { serializeSyncSnapshotPayload, type SyncSnapshotSerializationInput } from './syncSnapshotSerialization';
import { serializeSyncSnapshotOffMainThread } from './syncSnapshotWorker';
import { parseSyncSnapshot, SyncSnapshotIntegrityError, type SyncSnapshot } from './syncSnapshotEnvelope';
import { getLocalRecord, setLocalRecord } from '@/data/localDb';
import { logDiagnostic } from '@/app/diagnostics/diagnosticLog';
import { scheduleIdleTask } from '@/shared/lib/idleTask';
import { registerDriveMediaStream, unregisterDriveMediaStream } from './driveMediaStreamClient';
import { createGoogleDriveStreamUrlFromBroker } from './googleOAuthBroker';

export { SyncSnapshotIntegrityError };
export type { SyncSnapshot };
export type { SyncSnapshotIntegrityReason } from './syncSnapshotEnvelope';

const SYNC_FILE_NAME = 'babygrowth-sync-v2.json';
const LEGACY_SYNC_FILE_NAME = 'babygrowth-sync.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SYNC_META_KEY = 'babygrowth_v4_sync_meta';
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_SYNC_DEBOUNCE_MS = 3_500;
const AUTO_SYNC_IDLE_TIMEOUT_MS = 3_000;
const GOOGLE_SESSION_EXPIRY_SKEW_SECONDS = 60;

/** Local persistence keys are exposed only for the storage diagnostics screen.
 * Google Drive synchronization never reads or writes them. */
export const SYNC_KEYS = [
  'babygrowth_v4_profile',
  'babygrowth_v4_growth',
  'babygrowth_v4_timeline',
  'babygrowth_v4_ui',
  'babygrowth_v4_activities',
  'babygrowth_v4_reminders',
] as const;

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

type GoogleTokenPrompt = '' | 'none' | 'select_account';

interface GoogleTokenRequestOverrides {
  prompt?: GoogleTokenPrompt;
  login_hint?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrides?: GoogleTokenRequestOverrides) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

export type GoogleAuthOptions = { selectAccount?: boolean };
export type GoogleSilentAuthOptions = { loginHint?: string };

type GoogleAccessRequest =
  | { kind: 'interactive'; selectAccount: boolean }
  | { kind: 'silent'; loginHint?: string };

export interface GoogleAccountIdentity {
  permissionId: string;
  emailAddress?: string;
  displayName?: string;
  photoLink?: string;
}

export type SyncConflictReason = 'first_sync' | 'both_changed';

interface PreparedSyncSnapshot {
  snapshot: SyncSnapshot;
  payload: Blob;
}

interface SyncMeta {
  lastSyncedFingerprint: string | null;
  remoteFileId: string | null;
  lastSyncedAt: string | null;
  autoSyncEnabled: boolean;
  googleAccountId: string | null;
}

const DEFAULT_META: SyncMeta = {
  lastSyncedFingerprint: null,
  remoteFileId: null,
  lastSyncedAt: null,
  autoSyncEnabled: false,
  googleAccountId: null,
};

export type SyncResult =
  | { status: 'uploaded'; snapshot: SyncSnapshot }
  | { status: 'downloaded'; snapshot: SyncSnapshot }
  | { status: 'unchanged'; snapshot: SyncSnapshot }
  | { status: 'conflict'; reason: SyncConflictReason; local: SyncSnapshot; remote: SyncSnapshot };

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'auth-required' | 'error' | 'conflict';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  autoSyncEnabled: boolean;
  error: string | null;
  conflict: Extract<SyncResult, { status: 'conflict' }> | null;
}

export class GoogleAuthRequiredError extends Error {
  constructor() {
    super('Cần xác thực lại Google để tiếp tục tự động đồng bộ.');
    this.name = 'GoogleAuthRequiredError';
  }
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface DriveFileList {
  files?: DriveFile[];
}

export interface DriveTimelineMediaFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
}

interface DriveTimelineMediaFileList {
  files?: Array<Omit<DriveTimelineMediaFile, 'size'> & { size?: string }>;
  nextPageToken?: string;
}

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let accessTokenExpiryTimer: number | null = null;
let activeGoogleAccount: GoogleAccountIdentity | null = null;
let tokenScriptPromise: Promise<void> | null = null;
let autoSyncStop: (() => void) | null = null;
let autoSyncStartPromise: Promise<() => void> | null = null;
let autoSyncTimer: number | null = null;
let autoSyncDebounceTimer: number | null = null;
let cancelAutoSyncIdle: (() => void) | null = null;
let autoSyncInFlight: Promise<void> | null = null;
let suppressAutoSync = false;
let autoSyncSuppressionDepth = 0;
let autoSyncSuppressionBaseline = false;
let driveMutationTail: Promise<void> = Promise.resolve();

let syncState: SyncState = {
  status: 'idle',
  lastSyncedAt: null,
  autoSyncEnabled: false,
  error: null,
  conflict: null,
};
const syncStateListeners = new Set<(state: SyncState) => void>();

function publishSyncState(partial: Partial<SyncState>): void {
  syncState = { ...syncState, ...partial };
  syncStateListeners.forEach((listener) => listener(syncState));
}

export function getSyncState(): SyncState {
  return syncState;
}

export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  syncStateListeners.add(listener);
  listener(syncState);
  return () => syncStateListeners.delete(listener);
}

function getClientId(): string | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof clientId === 'string' && clientId.trim() ? clientId.trim() : null;
}

function getDeviceId(): string {
  const key = 'babygrowth_v4_device_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, created);
  return created;
}

function createSyncSnapshotInput(data: AppSnapshot): SyncSnapshotSerializationInput {
  return {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    data,
  };
}

function syncSnapshotFromInput(
  input: SyncSnapshotSerializationInput,
  fingerprint: string,
): SyncSnapshot {
  return {
    schemaVersion: input.schemaVersion,
    updatedAt: input.updatedAt,
    deviceId: input.deviceId,
    fingerprint,
    data: input.data,
  };
}

export async function createSyncSnapshot(data?: AppSnapshot): Promise<SyncSnapshot> {
  const input = createSyncSnapshotInput(data ?? await exportAppSnapshot());
  const serialized = serializeSyncSnapshotPayload(input);
  return syncSnapshotFromInput(input, serialized.fingerprint);
}

async function readMeta(): Promise<SyncMeta> {
  const raw = await getLocalRecord(SYNC_META_KEY);
  if (!raw) return { ...DEFAULT_META };
  try {
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    return { ...DEFAULT_META, ...parsed, autoSyncEnabled: parsed.autoSyncEnabled === true };
  } catch {
    return { ...DEFAULT_META };
  }
}

async function updateMeta(patch: Partial<SyncMeta>): Promise<SyncMeta> {
  const next = { ...(await readMeta()), ...patch };
  await setLocalRecord(SYNC_META_KEY, JSON.stringify(next));
  publishSyncState({ autoSyncEnabled: next.autoSyncEnabled, lastSyncedAt: next.lastSyncedAt });
  return next;
}

async function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  if (tokenScriptPromise) return tokenScriptPromise;

  tokenScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity-services]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Không tải được Google Identity Services')), { once: true });
      window.setTimeout(() => { if (window.google?.accounts?.oauth2) resolve(); }, 0);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityServices = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được Google Identity Services'));
    document.head.appendChild(script);
  });

  return tokenScriptPromise;
}

function clearAccessTokenExpiryTimer(): void {
  if (accessTokenExpiryTimer !== null) window.clearTimeout(accessTokenExpiryTimer);
  accessTokenExpiryTimer = null;
}

function clearGoogleSession(): void {
  clearAccessTokenExpiryTimer();
  accessToken = null;
  accessTokenExpiresAt = 0;
  activeGoogleAccount = null;
}

function markGoogleSessionExpired(message = 'Phiên Google đã hết hạn. Hãy xác thực lại để tiếp tục đồng bộ.'): void {
  const hadSession = accessToken !== null || accessTokenExpiresAt > 0;
  clearGoogleSession();
  if (hadSession) publishSyncState({ status: 'auth-required', error: message });
}

function setGoogleSession(token: string, expiresInSeconds: number): void {
  clearAccessTokenExpiryTimer();
  const validForSeconds = Math.max(expiresInSeconds - GOOGLE_SESSION_EXPIRY_SKEW_SECONDS, GOOGLE_SESSION_EXPIRY_SKEW_SECONDS);
  accessToken = token;
  accessTokenExpiresAt = Date.now() + validForSeconds * 1000;
  accessTokenExpiryTimer = window.setTimeout(() => markGoogleSessionExpired(), validForSeconds * 1000);
}

function parseGoogleAccountIdentity(value: unknown): GoogleAccountIdentity {
  if (typeof value !== 'object' || value === null || !('user' in value)) {
    throw new Error('Google Drive không trả về thông tin tài khoản đang xác thực.');
  }
  const user = value.user;
  if (typeof user !== 'object' || user === null || !('permissionId' in user) || typeof user.permissionId !== 'string' || !user.permissionId) {
    throw new Error('Không xác định được tài khoản Google Drive đang sử dụng.');
  }
  return {
    permissionId: user.permissionId,
    ...('emailAddress' in user && typeof user.emailAddress === 'string' ? { emailAddress: user.emailAddress } : {}),
    ...('displayName' in user && typeof user.displayName === 'string' ? { displayName: user.displayName } : {}),
    ...('photoLink' in user && typeof user.photoLink === 'string' ? { photoLink: user.photoLink } : {}),
  };
}

async function bindGoogleAccount(account: GoogleAccountIdentity): Promise<void> {
  const meta = await readMeta();
  if (meta.googleAccountId === account.permissionId) return;

  const baselineIsUnscoped = meta.googleAccountId === null
    && (meta.lastSyncedFingerprint !== null || meta.remoteFileId !== null || meta.lastSyncedAt !== null);
  const accountChanged = meta.googleAccountId !== null && meta.googleAccountId !== account.permissionId;

  if (baselineIsUnscoped || accountChanged) {
    await updateMeta({
      googleAccountId: account.permissionId,
      lastSyncedFingerprint: null,
      remoteFileId: null,
      lastSyncedAt: null,
    });
    publishSyncState({ status: 'idle', conflict: null, error: null, lastSyncedAt: null });
    logDiagnostic('drive-auth', 'info', 'Google account changed; sync baseline reset', {
      previousAccountId: meta.googleAccountId ?? 'unscoped',
      nextAccountId: account.permissionId,
    });
    return;
  }

  await updateMeta({ googleAccountId: account.permissionId });
}

export function isGoogleConfigured(): boolean {
  return Boolean(getClientId());
}

export function isGoogleConnected(): boolean {
  return Boolean(accessToken && Date.now() < accessTokenExpiresAt);
}

export function getGoogleSessionAccount(): GoogleAccountIdentity | null {
  return isGoogleConnected() ? activeGoogleAccount : null;
}

async function readCurrentGoogleAccount(): Promise<GoogleAccountIdentity> {
  const value = await driveRequest<unknown>(
    'https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress,displayName,photoLink)',
    {},
    false,
  );
  return parseGoogleAccountIdentity(value);
}

function tokenRequestOverrides(request: GoogleAccessRequest): GoogleTokenRequestOverrides {
  if (request.kind === 'silent') {
    return request.loginHint
      ? { prompt: 'none', login_hint: request.loginHint }
      : { prompt: 'none' };
  }
  return { prompt: request.selectAccount ? 'select_account' : '' };
}

async function requestGoogleAccess(request: GoogleAccessRequest): Promise<GoogleAccountIdentity> {
  const silent = request.kind === 'silent';
  logDiagnostic('drive-auth', 'info', silent ? 'Requesting silent Google access' : 'Requesting Google access', {
    silent,
    selectAccount: request.kind === 'interactive' && request.selectAccount,
    hasLoginHint: request.kind === 'silent' && Boolean(request.loginHint),
  });
  let receivedToken = false;
  try {
    const clientId = getClientId();
    if (!clientId) throw new Error('Thiếu VITE_GOOGLE_CLIENT_ID. Hãy cấu hình Google OAuth Client ID trước.');
    await loadGoogleScript();
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services chưa sẵn sàng.');

    await new Promise<void>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || 'Google không cấp quyền truy cập.'));
            return;
          }
          receivedToken = true;
          setGoogleSession(response.access_token, response.expires_in ?? 3600);
          publishSyncState({ status: 'idle', error: null });
          resolve();
        },
        error_callback: (error) => reject(new Error(error.message || 'Không thể lấy quyền truy cập Google.')),
      });
      client.requestAccessToken(tokenRequestOverrides(request));
    });

    const account = await readCurrentGoogleAccount();
    activeGoogleAccount = account;
    await bindGoogleAccount(account);
    logDiagnostic('drive-auth', 'info', silent ? 'Silent Google access granted' : 'Google access granted', {
      accountId: account.permissionId,
      emailAddress: account.emailAddress,
      expiresAt: new Date(accessTokenExpiresAt).toISOString(),
    });
    return account;
  } catch (error) {
    if (receivedToken) clearGoogleSession();
    logDiagnostic(
      'drive-auth',
      silent ? 'info' : 'error',
      silent ? 'Silent Google access unavailable' : 'Google access failed',
      error,
    );
    throw error;
  }
}

export function requestGoogleAccessToken(options: GoogleAuthOptions = {}): Promise<GoogleAccountIdentity> {
  return requestGoogleAccess({ kind: 'interactive', selectAccount: options.selectAccount === true });
}

export function requestGoogleAccessTokenSilently(options: GoogleSilentAuthOptions = {}): Promise<GoogleAccountIdentity> {
  return requestGoogleAccess(options.loginHint
    ? { kind: 'silent', loginHint: options.loginHint }
    : { kind: 'silent' });
}

async function ensureAccessToken(interactive: boolean): Promise<string> {
  if (isGoogleConnected()) return accessToken!;
  if (accessToken) markGoogleSessionExpired();
  if (!interactive) {
    throw new GoogleAuthRequiredError();
  }
  await requestGoogleAccessToken();
  if (!accessToken) throw new GoogleAuthRequiredError();
  return accessToken;
}

function driveRequestContext(url: string, method = 'GET'): Record<string, unknown> {
  try {
    const parsed = new URL(url);
    return {
      method,
      path: parsed.pathname,
      alt: parsed.searchParams.get('alt') ?? undefined,
      uploadType: parsed.searchParams.get('uploadType') ?? undefined,
      online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
    };
  } catch {
    return { method, path: url.split('?')[0] };
  }
}

async function driveRequest<T>(url: string, init: RequestInit = {}, interactive = true): Promise<T> {
  const context = driveRequestContext(url, init.method ?? 'GET');
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const token = await ensureAccessToken(interactive);
    const response = await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    });
    if (response.status === 401) {
      markGoogleSessionExpired();
      if (!interactive) throw new GoogleAuthRequiredError();
      throw new Error('Phiên Google đã hết hạn. Hãy bấm đồng bộ lại để cấp quyền mới.');
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Google Drive trả về lỗi ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }
    logDiagnostic('drive-http', 'info', 'Drive request completed', { ...context, status: response.status, durationMs: Date.now() - startedAt });
    return response.json() as Promise<T>;
  } catch (error) {
    logDiagnostic('drive-http', 'error', 'Drive request failed', { ...context, durationMs: Date.now() - startedAt, error });
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Google Drive không phản hồi kịp thời. Hãy kiểm tra kết nối rồi thử lại.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function driveUploadRequest<T>(
  url: string,
  body: Blob,
  contentType: string,
  interactive: boolean,
  onProgress: (progress: number) => void,
): Promise<T> {
  const token = await ensureAccessToken(interactive);
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('Content-Type', contentType);
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    request.onload = () => {
      if (request.status === 401) {
        markGoogleSessionExpired();
        reject(interactive ? new Error('Phiên Google đã hết hạn. Hãy bấm đồng bộ lại để cấp quyền mới.') : new GoogleAuthRequiredError());
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Google Drive trả về lỗi ${request.status}${request.responseText ? `: ${request.responseText.slice(0, 180)}` : ''}`));
        return;
      }
      try {
        onProgress(100);
        resolve(JSON.parse(request.responseText) as T);
      } catch (error) {
        reject(new Error(`Google Drive trả về dữ liệu upload không hợp lệ: ${error instanceof Error ? error.message : String(error)}`));
      }
    };
    request.onerror = () => reject(new Error('Không thể kết nối Google Drive khi tải media.'));
    request.onabort = () => reject(new Error('Đã dừng tải media lên Google Drive.'));
    request.send(body);
  });
}

export interface DriveMediaDownloadOptions {
  interactive?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

async function driveBlobProgressRequest(
  url: string,
  token: string,
  options: DriveMediaDownloadOptions,
): Promise<Blob> {
  if (options.signal?.aborted) throw new DOMException('Download aborted', 'AbortError');

  return new Promise<Blob>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abortFromCaller = () => request.abort();
    const finish = (callback: () => void) => {
      options.signal?.removeEventListener('abort', abortFromCaller);
      callback();
    };
    request.open('GET', url);
    request.responseType = 'blob';
    request.timeout = 30_000;
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      options.onProgress?.(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    request.onload = () => finish(() => {
      if (request.status === 401) {
        markGoogleSessionExpired();
        reject(options.interactive === true
          ? new Error('Phiên Google đã hết hạn. Hãy đồng bộ lại để tải media.')
          : new GoogleAuthRequiredError());
        return;
      }
      if (request.status < 200 || request.status >= 300 || !(request.response instanceof Blob)) {
        reject(new Error(`Không thể tải media từ Google Drive (${request.status}).`));
        return;
      }
      options.onProgress?.(100);
      resolve(request.response);
    });
    request.onerror = () => finish(() => reject(new Error('Không thể kết nối Google Drive khi tải media.')));
    request.ontimeout = () => finish(() => reject(new Error('Google Drive không phản hồi kịp thời. Hãy kiểm tra kết nối rồi thử lại.')));
    request.onabort = () => finish(() => reject(new DOMException('Download aborted', 'AbortError')));
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    request.send();
  });
}

async function driveBlobRequest(url: string, options: DriveMediaDownloadOptions = {}): Promise<Blob> {
  const token = await ensureAccessToken(options.interactive === true);
  if (options.onProgress) return driveBlobProgressRequest(url, token, options);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
      markGoogleSessionExpired();
      if (options.interactive !== true) throw new GoogleAuthRequiredError();
      throw new Error('Phiên Google đã hết hạn. Hãy đồng bộ lại để tải media.');
    }
    if (!response.ok) throw new Error(`Không thể tải media từ Google Drive (${response.status}).`);
    return response.blob();
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function uploadTimelineMediaToDrive(
  mediaId: string,
  blob: Blob,
  options: { name?: string; interactive?: boolean; onProgress?: (progress: number) => void } = {},
): Promise<string> {
  const interactive = options.interactive !== false;
  const boundary = `babygrowth-media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadata = {
    name: options.name || mediaId,
    mimeType: blob.type || 'application/octet-stream',
    parents: ['appDataFolder'],
    appProperties: { babygrowthMedia: 'true', babygrowthMediaId: mediaId },
  };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--\r\n`,
  ], { type: `multipart/related; boundary=${boundary}` });
  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';
  const contentType = `multipart/related; boundary=${boundary}`;
  const file = options.onProgress
    ? await driveUploadRequest<DriveFile>(url, body, contentType, interactive, options.onProgress)
    : await driveRequest<DriveFile>(url, { method: 'POST', headers: { 'Content-Type': contentType }, body }, interactive);
  return file.id;
}

export async function listTimelineMediaFromDrive(
  options: { interactive?: boolean } = {},
): Promise<DriveTimelineMediaFile[]> {
  const interactive = options.interactive !== false;
  const files: DriveTimelineMediaFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: "'appDataFolder' in parents and appProperties has { key='babygrowthMedia' and value='true' } and trashed = false",
      spaces: 'appDataFolder',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink)',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await driveRequest<DriveTimelineMediaFileList>(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      {},
      interactive,
    );
    files.push(...(result.files ?? []).map((file) => ({ ...file, size: Number(file.size ?? 0) })));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return files;
}

export function downloadTimelineMediaFromDrive(
  fileId: string,
  options: DriveMediaDownloadOptions = {},
): Promise<Blob> {
  return driveBlobRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, options);
}

export async function createTimelineVideoStreamUrlFromDrive(
  fileId: string,
  options: { interactive?: boolean } = {},
): Promise<string | null> {
  const brokerStreamUrl = await createGoogleDriveStreamUrlFromBroker(fileId);
  if (brokerStreamUrl) return brokerStreamUrl;
  const token = await ensureAccessToken(options.interactive === true);
  return registerDriveMediaStream({
    fileId,
    accessToken: token,
    expiresAt: accessTokenExpiresAt,
  });
}

export function releaseTimelineVideoStreamUrlFromDrive(streamUrl: string): void {
  unregisterDriveMediaStream(streamUrl);
}

export async function downloadTimelineMediaThumbnailFromDrive(
  thumbnailLink: string,
  options: DriveMediaDownloadOptions = {},
): Promise<Blob> {
  const url = new URL(thumbnailLink);
  const trustedHost = url.protocol === 'https:' && (
    url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')
  );
  if (!trustedHost) throw new Error('Google Drive trả về thumbnail URL không hợp lệ.');
  return driveBlobRequest(thumbnailLink, options);
}

export async function deleteTimelineMediaFromDrive(
  fileId: string,
  options: { interactive?: boolean } = {},
): Promise<void> {
  const interactive = options.interactive === true;
  const token = await ensureAccessToken(interactive);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 401) {
    markGoogleSessionExpired();
    if (!interactive) throw new GoogleAuthRequiredError();
  }
  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Không thể xóa media trên Google Drive (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
}

async function syncPendingTimelineMedia(interactive: boolean): Promise<void> {
  const { syncTimelineMediaToDrive } = await import('@/features/sync/timelineMediaDriveSync');
  await runWithAutoSyncSuppressed(() => syncTimelineMediaToDrive({ interactive }));
}

async function findSyncFileByName(fileName: string, interactive: boolean): Promise<DriveFile | null> {
  const query = encodeURIComponent(`'appDataFolder' in parents and name = '${fileName}' and trashed = false`);
  const result = await driveRequest<DriveFileList>(
    `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`,
    {},
    interactive,
  );
  return result.files?.[0] ?? null;
}

function getSyncSnapshotSchemaVersion(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value)) return null;
  const schemaVersion = value.schemaVersion;
  return typeof schemaVersion === 'number' ? schemaVersion : null;
}

async function findSyncFile(interactive: boolean): Promise<DriveFile | null> {
  const currentFile = await findSyncFileByName(SYNC_FILE_NAME, interactive);
  if (currentFile) return currentFile;

  const legacyFile = await findSyncFileByName(LEGACY_SYNC_FILE_NAME, interactive);
  if (!legacyFile) return null;

  const legacyPayload = await driveRequest<unknown>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(legacyFile.id)}?alt=media`,
    {},
    interactive,
  );
  if (getSyncSnapshotSchemaVersion(legacyPayload) === 1) {
    logDiagnostic('drive-sync', 'info', 'Ignoring legacy Google Drive backup', {
      fileId: legacyFile.id,
      schemaVersion: 1,
    });
    return null;
  }

  parseSyncSnapshot(legacyPayload);
  return legacyFile;
}

async function readRemoteSnapshot(fileId: string, interactive: boolean): Promise<SyncSnapshot> {
  const result = await driveRequest<unknown>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {},
    interactive,
  );
  return parseSyncSnapshot(result);
}

async function writeRemoteSnapshot(payload: Blob, file: DriveFile | null, interactive: boolean): Promise<DriveFile> {
  const metadata = file
    ? { name: SYNC_FILE_NAME, mimeType: 'application/json' }
    : { name: SYNC_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] };
  const boundary = `babygrowth-${Date.now()}`;
  const contentType = `multipart/related; boundary=${boundary}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    payload,
    `\r\n--${boundary}--\r\n`,
  ], { type: contentType });

  return driveRequest<DriveFile>(
    file
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=multipart&fields=id,name,modifiedTime`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    {
      method: file ? 'PATCH' : 'POST',
      headers: { 'Content-Type': contentType },
      body,
    },
    interactive,
  );
}

async function getLocalSnapshot(): Promise<PreparedSyncSnapshot> {
  const input = createSyncSnapshotInput(await exportAppSnapshot());
  const serialized = await serializeSyncSnapshotOffMainThread(input);
  return {
    snapshot: syncSnapshotFromInput(input, serialized.fingerprint),
    payload: serialized.payload,
  };
}

async function saveSyncedState(snapshot: SyncSnapshot, remoteFileId: string): Promise<void> {
  await updateMeta({
    lastSyncedFingerprint: snapshot.fingerprint,
    remoteFileId,
    lastSyncedAt: new Date().toISOString(),
  });
}

function publishSyncResult(result: SyncResult): void {
  if (result.status === 'downloaded') window.dispatchEvent(new Event('babygrowth:remote-updated'));
  if (result.status === 'conflict') {
    publishSyncState({ status: 'conflict', conflict: result, error: null });
    return;
  }
  publishSyncState({ status: 'synced', conflict: null, error: null, lastSyncedAt: new Date().toISOString() });
}

function clearPendingAutoSync(): void {
  if (autoSyncDebounceTimer !== null) {
    window.clearTimeout(autoSyncDebounceTimer);
    autoSyncDebounceTimer = null;
  }
  cancelAutoSyncIdle?.();
  cancelAutoSyncIdle = null;
}

function beginAutoSyncSuppression(): void {
  if (autoSyncSuppressionDepth === 0) {
    autoSyncSuppressionBaseline = suppressAutoSync;
    suppressAutoSync = true;
  }
  autoSyncSuppressionDepth += 1;
}

function endAutoSyncSuppression(): void {
  autoSyncSuppressionDepth -= 1;
  if (autoSyncSuppressionDepth === 0) suppressAutoSync = autoSyncSuppressionBaseline;
}

async function runWithAutoSyncSuppressed<T>(operation: () => Promise<T>): Promise<T> {
  clearPendingAutoSync();
  beginAutoSyncSuppression();
  try {
    return await operation();
  } finally {
    endAutoSyncSuppression();
  }
}

function runDriveMutationExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = driveMutationTail.then(operation, operation);
  driveMutationTail = result.then(() => undefined, () => undefined);
  return result;
}

export interface PausedDriveOperations {
  overwriteDriveBackupWithLocalData: (options?: { interactive?: boolean }) => Promise<SyncSnapshot>;
}

export async function runWithAutoSyncPaused<T>(
  operation: (drive: PausedDriveOperations) => Promise<T>,
): Promise<T> {
  clearPendingAutoSync();
  beginAutoSyncSuppression();
  try {
    return await runDriveMutationExclusive(() => operation({ overwriteDriveBackupWithLocalData: overwriteDriveBackupWithLocalDataUnlocked }));
  } finally {
    endAutoSyncSuppression();
  }
}

export async function applyRemoteSnapshot(snapshot: SyncSnapshot): Promise<void> {
  await runWithAutoSyncSuppressed(async () => {
    await applyAppSnapshot(parseSyncSnapshot(snapshot).data);
  });
}

async function overwriteDriveBackupWithLocalDataUnlocked(
  options: { interactive?: boolean } = {},
): Promise<SyncSnapshot> {
  const interactive = options.interactive !== false;
  await syncPendingTimelineMedia(interactive);
  const preparedLocal = await getLocalSnapshot();
  const local = preparedLocal.snapshot;
  const remoteFile = await findSyncFile(interactive);
  const savedFile = await writeRemoteSnapshot(preparedLocal.payload, remoteFile, interactive);
  await saveSyncedState(local, savedFile.id);
  publishSyncState({ status: 'synced', conflict: null, error: null, lastSyncedAt: new Date().toISOString() });
  return local;
}

export function overwriteDriveBackupWithLocalData(
  options: { interactive?: boolean } = {},
): Promise<SyncSnapshot> {
  return runDriveMutationExclusive(() => overwriteDriveBackupWithLocalDataUnlocked(options));
}

async function syncWithGoogleDriveUnlocked(options: { interactive?: boolean } = {}): Promise<SyncResult> {
  const interactive = options.interactive !== false;
  if (!navigator.onLine) {
    publishSyncState({ status: 'offline', error: 'Đang offline; dữ liệu vẫn được lưu cục bộ.' });
    throw new Error('Đang offline; hãy thử đồng bộ lại khi có kết nối mạng.');
  }

  publishSyncState({ status: 'syncing', error: null });
  try {
    await syncPendingTimelineMedia(interactive);
    const preparedLocal = await getLocalSnapshot();
    const local = preparedLocal.snapshot;
    const meta = await readMeta();
    const remoteFile = await findSyncFile(interactive);

    if (!remoteFile) {
      const created = await writeRemoteSnapshot(preparedLocal.payload, null, interactive);
      await saveSyncedState(local, created.id);
      const result: SyncResult = { status: 'uploaded', snapshot: local };
      publishSyncResult(result);
      return result;
    }

    const remote = await readRemoteSnapshot(remoteFile.id, interactive);
    if (remote.fingerprint === local.fingerprint) {
      await saveSyncedState(local, remoteFile.id);
      const result: SyncResult = { status: 'unchanged', snapshot: local };
      publishSyncResult(result);
      return result;
    }

    if (!meta.lastSyncedFingerprint) {
      const result: SyncResult = { status: 'conflict', reason: 'first_sync', local, remote };
      publishSyncResult(result);
      return result;
    }

    if (local.fingerprint === meta.lastSyncedFingerprint) {
      await applyRemoteSnapshot(remote);
      await saveSyncedState(remote, remoteFile.id);
      const result: SyncResult = { status: 'downloaded', snapshot: remote };
      publishSyncResult(result);
      return result;
    }

    if (remote.fingerprint === meta.lastSyncedFingerprint) {
      const updated = await writeRemoteSnapshot(preparedLocal.payload, remoteFile, interactive);
      await saveSyncedState(local, updated.id);
      const result: SyncResult = { status: 'uploaded', snapshot: local };
      publishSyncResult(result);
      return result;
    }

    const result: SyncResult = { status: 'conflict', reason: 'both_changed', local, remote };
    publishSyncResult(result);
    return result;
  } catch (error) {
    if (error instanceof GoogleAuthRequiredError) publishSyncState({ status: 'auth-required', error: error.message });
    else if (error instanceof SyncSnapshotIntegrityError) {
      logDiagnostic('drive-sync', 'error', 'Drive snapshot integrity check failed', { reason: error.reason });
      publishSyncState({ status: 'error', error: error.message });
    }
    else if (!navigator.onLine) publishSyncState({ status: 'offline', error: 'Đang offline; dữ liệu vẫn được lưu cục bộ.' });
    else publishSyncState({ status: 'error', error: error instanceof Error ? error.message : 'Không thể đồng bộ Google Drive.' });
    throw error;
  }
}

export function syncWithGoogleDrive(options: { interactive?: boolean } = {}): Promise<SyncResult> {
  return runDriveMutationExclusive(() => syncWithGoogleDriveUnlocked(options));
}

async function resolveSyncConflictUnlocked(
  choice: 'local' | 'remote',
  remoteSnapshot: SyncSnapshot,
): Promise<'uploaded' | 'downloaded'> {
  if (!navigator.onLine) throw new Error('Đang offline; hãy kết nối mạng trước khi xử lý xung đột.');
  const remoteFile = await findSyncFile(true);
  if (!remoteFile) throw new Error('Không tìm thấy tệp đồng bộ trên Google Drive.');

  if (choice === 'remote') {
    await applyRemoteSnapshot(remoteSnapshot);
    await saveSyncedState(remoteSnapshot, remoteFile.id);
    window.dispatchEvent(new Event('babygrowth:remote-updated'));
    publishSyncState({ status: 'synced', conflict: null, error: null });
    return 'downloaded';
  }

  await syncPendingTimelineMedia(true);
  const preparedLocal = await getLocalSnapshot();
  const local = preparedLocal.snapshot;
  const updated = await writeRemoteSnapshot(preparedLocal.payload, remoteFile, true);
  await saveSyncedState(local, updated.id);
  publishSyncState({ status: 'synced', conflict: null, error: null });
  return 'uploaded';
}

export function resolveSyncConflict(
  choice: 'local' | 'remote',
  remoteSnapshot: SyncSnapshot,
): Promise<'uploaded' | 'downloaded'> {
  return runDriveMutationExclusive(() => resolveSyncConflictUnlocked(choice, remoteSnapshot));
}

export interface DriveBackupSummary {
  found: boolean;
  snapshot?: SyncSnapshot;
  remoteFileId?: string;
  childName?: string;
  birthDate?: string;
  updatedAt?: string;
}

export async function checkDriveBackup(): Promise<DriveBackupSummary> {
  const remoteFile = await findSyncFile(false);
  if (!remoteFile) return { found: false };

  const snapshot = await readRemoteSnapshot(remoteFile.id, false);
  const family = snapshot.data.profile.familyData;
  return {
    found: true,
    snapshot,
    remoteFileId: remoteFile.id,
    childName: family.isInitialized && family.childName ? family.childName : undefined,
    birthDate: family.isInitialized && family.childName ? family.birthDate : undefined,
    updatedAt: remoteFile.modifiedTime || snapshot.updatedAt,
  };
}

export async function restoreDriveBackup(snapshot: SyncSnapshot, remoteFileId: string): Promise<void> {
  await applyRemoteSnapshot(snapshot);
  await saveSyncedState(snapshot, remoteFileId);
  await setAutoSyncEnabled(true);
  window.dispatchEvent(new Event('babygrowth:remote-updated'));
}

export async function getLastSyncedAt(): Promise<string | null> {
  return (await readMeta()).lastSyncedAt;
}

export async function isAutoSyncEnabled(): Promise<boolean> {
  return (await readMeta()).autoSyncEnabled;
}

export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
  await updateMeta({ autoSyncEnabled: enabled });
  const authRequired = enabled && !isGoogleConnected();
  publishSyncState({
    autoSyncEnabled: enabled,
    status: !navigator.onLine ? 'offline' : authRequired ? 'auth-required' : syncState.status,
    error: !navigator.onLine
      ? 'Đang offline; dữ liệu vẫn được lưu cục bộ.'
      : authRequired
        ? 'Cần xác thực lại Google để tiếp tục tự động đồng bộ.'
        : syncState.error,
  });
  if (enabled && autoSyncStop) scheduleAutoSync(0);
}

function scheduleAutoSync(delay = AUTO_SYNC_DEBOUNCE_MS): void {
  if (suppressAutoSync) return;
  clearPendingAutoSync();
  autoSyncDebounceTimer = window.setTimeout(() => {
    autoSyncDebounceTimer = null;
    cancelAutoSyncIdle = scheduleIdleTask(() => {
      cancelAutoSyncIdle = null;
      void runAutoSync();
    }, { timeoutMs: AUTO_SYNC_IDLE_TIMEOUT_MS });
  }, delay);
}

async function restoreLinkedGoogleSession(): Promise<boolean> {
  try {
    const { restoreGoogleSession } = await import('./index');
    return await restoreGoogleSession();
  } catch (error) {
    logDiagnostic('drive-auth', 'info', 'Silent Google session restore was not completed', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function runAutoSync(): Promise<void> {
  if (autoSyncInFlight || suppressAutoSync || !navigator.onLine) return Promise.resolve();
  const operation = (async () => {
    try {
      const meta = await readMeta();
      if (!meta.autoSyncEnabled) return;
      if (!isGoogleConnected() && !(await restoreLinkedGoogleSession())) return;
      await syncWithGoogleDrive({ interactive: false });
    } catch {
      // Sync state already contains a user-facing error. Local writes continue normally.
    }
  })();
  autoSyncInFlight = operation;
  void operation.then(() => {
    if (autoSyncInFlight === operation) autoSyncInFlight = null;
  });
  return operation;
}

export async function startAutoSync(): Promise<() => void> {
  if (autoSyncStop) return autoSyncStop;
  if (autoSyncStartPromise) return autoSyncStartPromise;

  autoSyncStartPromise = (async () => {
    await restoreLinkedGoogleSession();
    const meta = await readMeta();
    publishSyncState({
      autoSyncEnabled: meta.autoSyncEnabled,
      lastSyncedAt: meta.lastSyncedAt,
      status: navigator.onLine ? 'idle' : 'offline',
      error: navigator.onLine ? null : 'Đang offline; dữ liệu vẫn được lưu cục bộ.',
    });

    const restoreAndSchedule = (delay = 500) => {
      void restoreLinkedGoogleSession().finally(() => scheduleAutoSync(delay));
    };
    const onDomainChanged = () => { if (!suppressAutoSync) scheduleAutoSync(); };
    const onOnline = () => {
      publishSyncState({ status: 'idle', error: null });
      restoreAndSchedule();
    };
    const onOffline = () => publishSyncState({ status: 'offline', error: 'Đang offline; dữ liệu vẫn được lưu cục bộ.' });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') restoreAndSchedule();
    };

    const unsubscribe = subscribeAppSnapshotChanges(onDomainChanged);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    autoSyncTimer = window.setInterval(() => scheduleAutoSync(0), AUTO_SYNC_INTERVAL_MS);

    autoSyncStop = () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (autoSyncTimer !== null) window.clearInterval(autoSyncTimer);
      clearPendingAutoSync();
      autoSyncTimer = null;
      autoSyncStop = null;
    };

    scheduleAutoSync(2000);
    return autoSyncStop;
  })();

  try {
    return await autoSyncStartPromise;
  } finally {
    autoSyncStartPromise = null;
  }
}
