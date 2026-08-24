const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TRANSIENT_TTL = 600;
const MAX_BODY = 4096;

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
function b64url(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64(value) {
  try {
    const s = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { throw new HttpError(500, 'worker_not_configured', 'Invalid TOKEN_ENCRYPTION_KEY.'); }
}
function randomToken(n = 32) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b64url(b); }
async function hash(value) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))); }
export async function sessionKeyForToken(token) { return `session:${await hash(token)}`; }
const stateKey = async (token) => `state:${await hash(token)}`;
const resultKey = async (token) => `result:${await hash(token)}`;

function db(env) {
  if (!env.OAUTH_DB?.prepare) throw new HttpError(500, 'worker_not_configured', 'OAUTH_DB is not configured.');
  return env.OAUTH_DB;
}
function clientId(env) {
  if (!env.GOOGLE_CLIENT_ID?.trim()) throw new HttpError(500, 'worker_not_configured', 'GOOGLE_CLIENT_ID is not configured.');
  return env.GOOGLE_CLIENT_ID.trim();
}
function clientSecret(env) {
  if (!env.GOOGLE_CLIENT_SECRET) throw new HttpError(500, 'worker_not_configured', 'GOOGLE_CLIENT_SECRET is not configured.');
  return env.GOOGLE_CLIENT_SECRET;
}
async function encryptionKey(env) {
  if (!env.TOKEN_ENCRYPTION_KEY) throw new HttpError(500, 'worker_not_configured', 'TOKEN_ENCRYPTION_KEY is not configured.');
  const raw = unb64(env.TOKEN_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new HttpError(500, 'worker_not_configured', 'TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptRefreshToken(token, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(env), enc.encode(token));
  return { ciphertext: b64url(new Uint8Array(ciphertext)), iv: b64url(iv) };
}
async function decryptRefreshToken(ciphertext, iv, env) {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await encryptionKey(env), unb64(ciphertext));
    return dec.decode(plain);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, 'session_decryption_failed', 'Stored OAuth session could not be decrypted.');
  }
}

function origins(env) { return String(env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean); }
function allowedOrigin(request, env) { const o = request.headers.get('Origin'); return o && origins(env).includes(o) ? o : null; }
function requireOrigin(request, env) { const o = allowedOrigin(request, env); if (!o) throw new HttpError(403, 'origin_not_allowed', 'Origin is not allowed.'); return o; }
function cors(origin) { return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }; }
function json(payload, status = 200, origin = null) { return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(origin ? cors(origin) : {}) } }); }
function errorResponse(error, origin) { return json({ error: { code: error instanceof HttpError ? error.code : 'internal_error', message: error instanceof Error ? error.message : 'Unexpected OAuth broker error.' } }, error instanceof HttpError ? error.status : 500, origin); }
function bearer(request) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m || m[1].length < 32 || m[1].length > 512) throw new HttpError(401, 'invalid_session', 'OAuth broker credential is missing or invalid.');
  return m[1];
}
async function bodyJson(request) {
  if (!request.body) return {};
  const reader = request.body.getReader(); let bytes = 0; let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY) { await reader.cancel(); throw new HttpError(413, 'request_too_large', 'Request body is too large.'); }
      text += dec.decode(value, { stream: true });
    }
    text += dec.decode();
  } finally { reader.releaseLock(); }
  if (!text) return {};
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : {}; }
  catch { throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON.'); }
}

async function putTransient(database, key, kind, payload) {
  const expires = Math.floor(Date.now() / 1000) + TRANSIENT_TTL;
  await database.prepare('INSERT OR REPLACE INTO oauth_transients (key_hash, kind, payload, expires_at) VALUES (?, ?, ?, ?)').bind(key, kind, JSON.stringify(payload), expires).run();
}
async function takeTransient(database, key, kind, consume = true) {
  const row = await database.prepare('SELECT payload, expires_at FROM oauth_transients WHERE key_hash = ? AND kind = ?').bind(key, kind).first();
  if (consume) await database.prepare('DELETE FROM oauth_transients WHERE key_hash = ? AND kind = ?').bind(key, kind).run();
  if (!row || Number(row.expires_at) <= Math.floor(Date.now() / 1000)) return null;
  try { return JSON.parse(row.payload); } catch { return null; }
}
async function storeSession(database, key, refreshToken, env) {
  const e = await encryptRefreshToken(refreshToken, env); const now = Math.floor(Date.now() / 1000);
  await database.prepare('INSERT OR REPLACE INTO oauth_sessions (session_hash, refresh_token_ciphertext, refresh_token_iv, created_at, updated_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM oauth_sessions WHERE session_hash = ?), ?), ?)').bind(key, e.ciphertext, e.iv, key, now, now).run();
}
async function readSession(database, key, env) {
  const row = await database.prepare('SELECT refresh_token_ciphertext, refresh_token_iv FROM oauth_sessions WHERE session_hash = ?').bind(key).first();
  if (!row) return null;
  return decryptRefreshToken(row.refresh_token_ciphertext, row.refresh_token_iv, env);
}
async function deleteSession(database, key) { await database.prepare('DELETE FROM oauth_sessions WHERE session_hash = ?').bind(key).run(); }

async function googleToken(params, env) {
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId(env), client_secret: clientSecret(env), ...params }) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object') {
    if (payload?.error === 'invalid_grant') throw new HttpError(401, 'reauth_required', 'Google authorization was revoked or expired.');
    throw new HttpError(502, 'google_token_failed', 'Google token exchange failed.');
  }
  return payload;
}
async function exchangeCode(code, verifier, redirectUri, env) {
  const p = await googleToken({ code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri }, env);
  if (!p.access_token) throw new HttpError(502, 'missing_access_token', 'Google did not return an access token.');
  if (!p.refresh_token) throw new HttpError(409, 'missing_refresh_token', 'Reconnect and approve offline access again.');
  return { accessToken: p.access_token, refreshToken: p.refresh_token, expiresIn: Number(p.expires_in) || 3600 };
}
async function refreshToken(refreshToken, env) {
  const p = await googleToken({ refresh_token: refreshToken, grant_type: 'refresh_token' }, env);
  if (!p.access_token) throw new HttpError(502, 'missing_access_token', 'Google did not return an access token.');
  return { accessToken: p.access_token, refreshToken: p.refresh_token || null, expiresIn: Number(p.expires_in) || 3600 };
}

function callbackPage(message) {
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kinly · Google Drive</title><body><p>${message}</p><script>window.close()</script>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}

async function start(request, env, ctx) {
  const origin = requireOrigin(request, env); const body = await bodyJson(request);
  const state = randomToken(); const attemptToken = randomToken(); const verifier = randomToken(48);
  const challenge = await hash(verifier); const redirectUri = new URL('/oauth/callback', request.url).toString(); const database = db(env);
  await putTransient(database, await stateKey(state), 'state', { verifier, redirectUri, resultKey: await resultKey(attemptToken) });
  ctx?.waitUntil?.(database.prepare('DELETE FROM oauth_transients WHERE expires_at <= ?').bind(Math.floor(Date.now() / 1000)).run().catch(() => undefined));
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({ client_id: clientId(env), redirect_uri: redirectUri, response_type: 'code', scope: DRIVE_SCOPE, access_type: 'offline', include_granted_scopes: 'true', prompt: body.selectAccount === true ? 'consent select_account' : 'consent', state, code_challenge: challenge, code_challenge_method: 'S256', ...(typeof body.loginHint === 'string' && body.loginHint.trim() ? { login_hint: body.loginHint.trim().slice(0, 320) } : {}) }).toString();
  return json({ authorizationUrl: url.toString(), attemptToken }, 200, origin);
}
async function callback(request, env) {
  const url = new URL(request.url); const state = url.searchParams.get('state');
  if (!state) throw new HttpError(400, 'missing_state', 'OAuth state is missing.');
  const database = db(env); const record = await takeTransient(database, await stateKey(state), 'state');
  if (!record?.verifier || !record?.redirectUri || !record?.resultKey) throw new HttpError(400, 'invalid_state', 'OAuth state is invalid or expired.');
  const googleError = url.searchParams.get('error');
  if (googleError) { await putTransient(database, record.resultKey, 'result', { status: 'error', error: googleError, errorDescription: url.searchParams.get('error_description') || 'Google authorization was cancelled.' }); return callbackPage('Đã hủy xác thực Google.'); }
  const code = url.searchParams.get('code');
  if (!code) { await putTransient(database, record.resultKey, 'result', { status: 'error', error: 'missing_code', errorDescription: 'Google did not return an authorization code.' }); return callbackPage('Google không trả về mã xác thực.'); }
  try {
    const tokens = await exchangeCode(code, record.verifier, record.redirectUri, env); const sessionToken = randomToken();
    await storeSession(database, await sessionKeyForToken(sessionToken), tokens.refreshToken, env);
    await putTransient(database, record.resultKey, 'result', { status: 'complete', sessionToken, accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
    console.log(JSON.stringify({ event: 'oauth_session_created' })); return callbackPage('Đã kết nối Google Drive với Kinly. Cửa sổ này sẽ tự đóng.');
  } catch (error) {
    const codeValue = error instanceof HttpError ? error.code : 'oauth_callback_failed';
    await putTransient(database, record.resultKey, 'result', { status: 'error', error: codeValue, errorDescription: error instanceof Error ? error.message : 'Google authorization failed.' });
    console.error(JSON.stringify({ event: 'oauth_callback_failed', code: codeValue })); return callbackPage('Không thể hoàn tất xác thực Google. Hãy thử lại trong Kinly.');
  }
}
async function result(request, env) {
  const origin = requireOrigin(request, env); const database = db(env); const key = await resultKey(bearer(request));
  const value = await takeTransient(database, key, 'result', false);
  if (!value) return json({ status: 'pending' }, 200, origin);
  await database.prepare('DELETE FROM oauth_transients WHERE key_hash = ? AND kind = ?').bind(key, 'result').run();
  return json(value, 200, origin);
}
async function token(request, env) {
  const origin = requireOrigin(request, env); const database = db(env); const key = await sessionKeyForToken(bearer(request)); const stored = await readSession(database, key, env);
  if (!stored) throw new HttpError(401, 'reauth_required', 'OAuth broker session does not exist.');
  try {
    const tokens = await refreshToken(stored, env); if (tokens.refreshToken && tokens.refreshToken !== stored) await storeSession(database, key, tokens.refreshToken, env);
    return json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn }, 200, origin);
  } catch (error) { if (error instanceof HttpError && error.code === 'reauth_required') await deleteSession(database, key); throw error; }
}
async function removeSession(request, env) {
  const origin = requireOrigin(request, env); await deleteSession(db(env), await sessionKeyForToken(bearer(request)));
  return new Response(null, { status: 204, headers: { ...cors(origin), 'Cache-Control': 'no-store' } });
}

async function route(request, env, ctx) {
  const path = new URL(request.url).pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(requireOrigin(request, env)) });
  if (request.method === 'GET' && path === '/health') return json({ ok: true, service: 'kinly-google-oauth-broker' });
  if (request.method === 'POST' && path === '/oauth/start') return start(request, env, ctx);
  if (request.method === 'GET' && path === '/oauth/callback') return callback(request, env);
  if (request.method === 'POST' && path === '/oauth/result') return result(request, env);
  if (request.method === 'POST' && path === '/oauth/token') return token(request, env);
  if (request.method === 'DELETE' && path === '/oauth/session') return removeSession(request, env);
  throw new HttpError(404, 'not_found', 'Route not found.');
}
export default { async fetch(request, env, ctx) { const origin = allowedOrigin(request, env); try { return await route(request, env, ctx); } catch (error) { const status = error instanceof HttpError ? error.status : 500; if (status >= 500) console.error(JSON.stringify({ event: 'request_failed', path: new URL(request.url).pathname, code: error instanceof HttpError ? error.code : 'internal_error' })); return errorResponse(error, origin); } } };
