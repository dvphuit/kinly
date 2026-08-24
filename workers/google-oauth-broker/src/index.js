const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COMPLETION_PATH = '/google-oauth-complete.html';
const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_BODY = 4096;
const KV_CACHE_TTL_SECONDS = 30;
const STATE_AAD = 'kinly-google-oauth-state-v1';
const REFRESH_TOKEN_AAD = 'kinly-google-oauth-refresh-v1';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function unb64(value) {
  try {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(400, 'invalid_encoding', 'OAuth broker data is not valid base64url.');
  }
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

async function hash(value) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))));
}

export async function sessionKeyForToken(token) {
  return `session:${await hash(token)}`;
}

function sessions(env) {
  if (!env.OAUTH_SESSIONS?.get || !env.OAUTH_SESSIONS?.put || !env.OAUTH_SESSIONS?.delete) {
    throw new HttpError(500, 'worker_not_configured', 'OAUTH_SESSIONS KV binding is not configured.');
  }
  return env.OAUTH_SESSIONS;
}

function clientId(env) {
  if (!env.GOOGLE_CLIENT_ID?.trim()) {
    throw new HttpError(500, 'worker_not_configured', 'GOOGLE_CLIENT_ID is not configured.');
  }
  return env.GOOGLE_CLIENT_ID.trim();
}

function clientSecret(env) {
  if (!env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(500, 'worker_not_configured', 'GOOGLE_CLIENT_SECRET is not configured.');
  }
  return env.GOOGLE_CLIENT_SECRET;
}

async function encryptionKey(env) {
  if (!env.TOKEN_ENCRYPTION_KEY) {
    throw new HttpError(500, 'worker_not_configured', 'TOKEN_ENCRYPTION_KEY is not configured.');
  }
  let raw;
  try {
    raw = unb64(env.TOKEN_ENCRYPTION_KEY);
  } catch (error) {
    if (error instanceof HttpError) {
      throw new HttpError(500, 'worker_not_configured', 'Invalid TOKEN_ENCRYPTION_KEY.');
    }
    throw error;
  }
  if (raw.byteLength !== 32) {
    throw new HttpError(500, 'worker_not_configured', 'TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptText(value, env, additionalData) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(additionalData) },
    await encryptionKey(env),
    enc.encode(value),
  );
  return { ciphertext: b64url(new Uint8Array(ciphertext)), iv: b64url(iv) };
}

async function decryptText(ciphertext, iv, env, additionalData) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(additionalData) },
    await encryptionKey(env),
    unb64(ciphertext),
  );
  return dec.decode(plaintext);
}

async function encryptRefreshToken(token, env) {
  return encryptText(token, env, REFRESH_TOKEN_AAD);
}

async function decryptRefreshToken(ciphertext, iv, env) {
  try {
    return await decryptText(ciphertext, iv, env, REFRESH_TOKEN_AAD);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, 'session_decryption_failed', 'Stored OAuth session could not be decrypted.');
  }
}

async function encodeState(payload, env) {
  const encrypted = await encryptText(JSON.stringify(payload), env, STATE_AAD);
  return `v1.${encrypted.iv}.${encrypted.ciphertext}`;
}

async function decodeState(value, env) {
  try {
    const [version, iv, ciphertext, extra] = String(value).split('.');
    if (version !== 'v1' || !iv || !ciphertext || extra) throw new Error('invalid state envelope');
    const raw = JSON.parse(await decryptText(ciphertext, iv, env, STATE_AAD));
    if (
      typeof raw !== 'object' || raw === null
      || typeof raw.verifier !== 'string' || !raw.verifier
      || typeof raw.redirectUri !== 'string' || !raw.redirectUri
      || typeof raw.origin !== 'string' || !raw.origin
      || typeof raw.attemptToken !== 'string' || !raw.attemptToken
      || typeof raw.expiresAt !== 'number' || !Number.isFinite(raw.expiresAt)
    ) {
      throw new Error('invalid state payload');
    }
    return raw;
  } catch (error) {
    if (error instanceof HttpError && error.code === 'worker_not_configured') throw error;
    throw new HttpError(400, 'invalid_state', 'OAuth state is invalid or expired.');
  }
}

function origins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  return origin && origins(env).includes(origin) ? origin : null;
}

function requireOrigin(request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) throw new HttpError(403, 'origin_not_allowed', 'Origin is not allowed.');
  return origin;
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(payload, status = 200, origin = null) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(origin ? cors(origin) : {}),
    },
  });
}

function errorResponse(error, origin) {
  return json({
    error: {
      code: error instanceof HttpError ? error.code : 'internal_error',
      message: error instanceof Error ? error.message : 'Unexpected OAuth broker error.',
    },
  }, error instanceof HttpError ? error.status : 500, origin);
}

function bearer(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  if (!match || match[1].length < 32 || match[1].length > 512) {
    throw new HttpError(401, 'invalid_session', 'OAuth broker credential is missing or invalid.');
  }
  return match[1];
}

async function bodyJson(request) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY) {
        await reader.cancel();
        throw new HttpError(413, 'request_too_large', 'Request body is too large.');
      }
      text += dec.decode(value, { stream: true });
    }
    text += dec.decode();
  } finally {
    reader.releaseLock();
  }
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : {};
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}

async function storeSession(namespace, key, refreshToken, env) {
  const encrypted = await encryptRefreshToken(refreshToken, env);
  await namespace.put(key, JSON.stringify({
    version: 1,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
  }));
}

async function readSession(namespace, key, env) {
  const record = await namespace.get(key, { type: 'json', cacheTtl: KV_CACHE_TTL_SECONDS });
  if (
    typeof record !== 'object' || record === null
    || record.version !== 1
    || typeof record.ciphertext !== 'string' || !record.ciphertext
    || typeof record.iv !== 'string' || !record.iv
  ) {
    return null;
  }
  return decryptRefreshToken(record.ciphertext, record.iv, env);
}

async function googleToken(params, env) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(env),
      client_secret: clientSecret(env),
      ...params,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object') {
    if (payload?.error === 'invalid_grant') {
      throw new HttpError(401, 'reauth_required', 'Google authorization was revoked or expired.');
    }
    throw new HttpError(502, 'google_token_failed', 'Google token exchange failed.');
  }
  return payload;
}

async function exchangeCode(code, verifier, redirectUri, env) {
  const payload = await googleToken({
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  }, env);
  if (!payload.access_token) {
    throw new HttpError(502, 'missing_access_token', 'Google did not return an access token.');
  }
  if (!payload.refresh_token) {
    throw new HttpError(409, 'missing_refresh_token', 'Reconnect and approve offline access again.');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: Number(payload.expires_in) || 3600,
  };
}

async function refreshToken(refreshTokenValue, env) {
  const payload = await googleToken({
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token',
  }, env);
  if (!payload.access_token) {
    throw new HttpError(502, 'missing_access_token', 'Google did not return an access token.');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || null,
    expiresIn: Number(payload.expires_in) || 3600,
  };
}

function completionRedirect(origin, payload) {
  const url = new URL(COMPLETION_PATH, origin);
  url.hash = b64url(enc.encode(JSON.stringify(payload)));
  return Response.redirect(url.toString(), 302);
}

async function start(request, env) {
  const origin = requireOrigin(request, env);
  const body = await bodyJson(request);
  const verifier = randomToken(48);
  const attemptToken = randomToken();
  const challenge = await hash(verifier);
  const redirectUri = new URL('/oauth/callback', request.url).toString();
  const state = await encodeState({
    verifier,
    redirectUri,
    origin,
    attemptToken,
    expiresAt: Date.now() + STATE_TTL_MS,
  }, env);

  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId(env),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: body.selectAccount === true ? 'consent select_account' : 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(typeof body.loginHint === 'string' && body.loginHint.trim()
      ? { login_hint: body.loginHint.trim().slice(0, 320) }
      : {}),
  }).toString();

  return json({ authorizationUrl: url.toString(), attemptToken }, 200, origin);
}

async function callback(request, env) {
  const url = new URL(request.url);
  const stateValue = url.searchParams.get('state');
  if (!stateValue) throw new HttpError(400, 'missing_state', 'OAuth state is missing.');

  const state = await decodeState(stateValue, env);
  const expectedRedirectUri = new URL('/oauth/callback', request.url).toString();
  if (
    state.expiresAt <= Date.now()
    || state.redirectUri !== expectedRedirectUri
    || !origins(env).includes(state.origin)
  ) {
    throw new HttpError(400, 'invalid_state', 'OAuth state is invalid or expired.');
  }

  const googleError = url.searchParams.get('error');
  if (googleError) {
    return completionRedirect(state.origin, {
      status: 'error',
      attemptToken: state.attemptToken,
      error: googleError,
      errorDescription: url.searchParams.get('error_description') || 'Google authorization was cancelled.',
    });
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return completionRedirect(state.origin, {
      status: 'error',
      attemptToken: state.attemptToken,
      error: 'missing_code',
      errorDescription: 'Google did not return an authorization code.',
    });
  }

  try {
    const tokens = await exchangeCode(code, state.verifier, state.redirectUri, env);
    const sessionToken = randomToken();
    await storeSession(sessions(env), await sessionKeyForToken(sessionToken), tokens.refreshToken, env);
    console.log(JSON.stringify({ event: 'oauth_session_created' }));
    return completionRedirect(state.origin, {
      status: 'complete',
      attemptToken: state.attemptToken,
      sessionToken,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    const codeValue = error instanceof HttpError ? error.code : 'oauth_callback_failed';
    console.error(JSON.stringify({ event: 'oauth_callback_failed', code: codeValue }));
    return completionRedirect(state.origin, {
      status: 'error',
      attemptToken: state.attemptToken,
      error: codeValue,
      errorDescription: error instanceof Error ? error.message : 'Google authorization failed.',
    });
  }
}

async function token(request, env) {
  const origin = requireOrigin(request, env);
  const namespace = sessions(env);
  const key = await sessionKeyForToken(bearer(request));
  const stored = await readSession(namespace, key, env);
  if (!stored) {
    throw new HttpError(401, 'reauth_required', 'OAuth broker session does not exist.');
  }

  try {
    const tokens = await refreshToken(stored, env);
    if (tokens.refreshToken && tokens.refreshToken !== stored) {
      await storeSession(namespace, key, tokens.refreshToken, env);
    }
    return json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn }, 200, origin);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'reauth_required') {
      await namespace.delete(key);
    }
    throw error;
  }
}

async function removeSession(request, env) {
  const origin = requireOrigin(request, env);
  await sessions(env).delete(await sessionKeyForToken(bearer(request)));
  return new Response(null, {
    status: 204,
    headers: { ...cors(origin), 'Cache-Control': 'no-store' },
  });
}

async function route(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(requireOrigin(request, env)) });
  }
  if (request.method === 'GET' && path === '/health') {
    return json({ ok: true, service: 'kinly-google-oauth-broker' });
  }
  if (request.method === 'POST' && path === '/oauth/start') return start(request, env);
  if (request.method === 'GET' && path === '/oauth/callback') return callback(request, env);
  if (request.method === 'POST' && path === '/oauth/token') return token(request, env);
  if (request.method === 'DELETE' && path === '/oauth/session') return removeSession(request, env);
  throw new HttpError(404, 'not_found', 'Route not found.');
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    try {
      return await route(request, env);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) {
        console.error(JSON.stringify({
          event: 'request_failed',
          code: error instanceof HttpError ? error.code : 'internal_error',
        }));
      }
      return errorResponse(error, origin);
    }
  },
};
