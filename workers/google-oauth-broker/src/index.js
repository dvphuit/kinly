const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_TRANSIENT_TTL_SECONDS = 10 * 60;
const STATE_PREFIX = 'state:';
const RESULT_PREFIX = 'result:';
const SESSION_PREFIX = 'session:';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function sessionKeyForToken(token) {
  return `${SESSION_PREFIX}${await sha256Base64Url(token)}`;
}

async function resultKeyForToken(token) {
  return `${RESULT_PREFIX}${await sha256Base64Url(token)}`;
}

function parseAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !parseAllowedOrigins(env).includes(origin)) return null;
  return origin;
}

function requireAllowedOrigin(request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) throw new HttpError(403, 'origin_not_allowed', 'Origin is not allowed to use this OAuth broker.');
  return origin;
}

function corsHeaders(origin) {
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  });
}

function jsonResponse(payload, status = 200, origin = null) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin) {
    for (const [name, value] of corsHeaders(origin)) headers.set(name, value);
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function errorResponse(error, origin = null) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'internal_error';
  const message = error instanceof Error ? error.message : 'Unexpected OAuth broker error.';
  return jsonResponse({ error: { code, message } }, status, origin);
}

function requireGoogleClientId(env) {
  if (typeof env.GOOGLE_CLIENT_ID !== 'string' || !env.GOOGLE_CLIENT_ID.trim()) {
    throw new HttpError(500, 'worker_not_configured', 'GOOGLE_CLIENT_ID is not configured.');
  }
  return env.GOOGLE_CLIENT_ID.trim();
}

function requireGoogleClientSecret(env) {
  if (typeof env.GOOGLE_CLIENT_SECRET !== 'string' || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(500, 'worker_not_configured', 'GOOGLE_CLIENT_SECRET is not configured.');
  }
  return env.GOOGLE_CLIENT_SECRET;
}

function requireSessionStore(env) {
  if (!env.OAUTH_SESSIONS || typeof env.OAUTH_SESSIONS.get !== 'function') {
    throw new HttpError(500, 'worker_not_configured', 'OAUTH_SESSIONS KV binding is not configured.');
  }
  return env.OAUTH_SESSIONS;
}

function readBearerToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || match[1].length < 32 || match[1].length > 512) {
    throw new HttpError(401, 'invalid_session', 'OAuth broker credential is missing or invalid.');
  }
  return match[1];
}

function parseJsonRecord(value) {
  if (typeof value !== 'object' || value === null) return null;
  return value;
}

async function readJsonBody(request) {
  try {
    return parseJsonRecord(await request.json()) || {};
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}

async function exchangeAuthorizationCode({ code, codeVerifier, redirectUri }, env) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireGoogleClientId(env),
      client_secret: requireGoogleClientSecret(env),
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new HttpError(502, 'google_code_exchange_failed', 'Google did not accept the authorization code.');
  }
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new HttpError(502, 'missing_access_token', 'Google did not return an access token.');
  }
  if (typeof payload.refresh_token !== 'string' || !payload.refresh_token) {
    throw new HttpError(409, 'missing_refresh_token', 'Google did not return a refresh token. Reconnect and approve offline access again.');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : 3600,
  };
}

async function refreshAccessToken(refreshToken, env) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireGoogleClientId(env),
      client_secret: requireGoogleClientSecret(env),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => null);
  const errorCode = payload && typeof payload === 'object' && typeof payload.error === 'string' ? payload.error : null;
  if (!response.ok || !payload || typeof payload !== 'object' || typeof payload.access_token !== 'string') {
    if (errorCode === 'invalid_grant') {
      throw new HttpError(401, 'reauth_required', 'Google authorization was revoked or expired.');
    }
    throw new HttpError(502, 'google_refresh_failed', 'Google could not refresh the access token.');
  }
  return {
    accessToken: payload.access_token,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : 3600,
    refreshToken: typeof payload.refresh_token === 'string' && payload.refresh_token ? payload.refresh_token : null,
  };
}

function callbackPage(message) {
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kinly · Google Drive</title>
</head>
<body>
<p>${message}</p>
<script>window.close();</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function writeOAuthResult(store, resultKey, payload) {
  await store.put(resultKey, JSON.stringify(payload), { expirationTtl: OAUTH_TRANSIENT_TTL_SECONDS });
}

async function handleOAuthStart(request, env) {
  const origin = requireAllowedOrigin(request, env);
  const body = await readJsonBody(request);
  const selectAccount = body.selectAccount === true;
  const loginHint = typeof body.loginHint === 'string' && body.loginHint.trim() ? body.loginHint.trim().slice(0, 320) : null;
  const state = randomToken(32);
  const attemptToken = randomToken(32);
  const codeVerifier = randomToken(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const redirectUri = new URL('/oauth/callback', request.url).toString();
  const store = requireSessionStore(env);
  const resultKey = await resultKeyForToken(attemptToken);

  await store.put(`${STATE_PREFIX}${state}`, JSON.stringify({ codeVerifier, redirectUri, resultKey }), {
    expirationTtl: OAUTH_TRANSIENT_TTL_SECONDS,
  });

  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_URL);
  authorizationUrl.search = new URLSearchParams({
    client_id: requireGoogleClientId(env),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: selectAccount ? 'consent select_account' : 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();

  return jsonResponse({ authorizationUrl: authorizationUrl.toString(), attemptToken }, 200, origin);
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  if (!state) throw new HttpError(400, 'missing_state', 'OAuth state is missing.');

  const store = requireSessionStore(env);
  const stateKey = `${STATE_PREFIX}${state}`;
  const stateRecord = parseJsonRecord(await store.get(stateKey, 'json'));
  await store.delete(stateKey);
  if (!stateRecord || typeof stateRecord.codeVerifier !== 'string' || typeof stateRecord.redirectUri !== 'string' || typeof stateRecord.resultKey !== 'string') {
    throw new HttpError(400, 'invalid_state', 'OAuth state is invalid or expired.');
  }

  const googleError = url.searchParams.get('error');
  if (googleError) {
    await writeOAuthResult(store, stateRecord.resultKey, {
      status: 'error',
      error: googleError,
      errorDescription: url.searchParams.get('error_description') || 'Google authorization was cancelled.',
    });
    return callbackPage('Đã hủy xác thực Google. Bạn có thể đóng cửa sổ này.');
  }

  const code = url.searchParams.get('code');
  if (!code) {
    await writeOAuthResult(store, stateRecord.resultKey, {
      status: 'error',
      error: 'missing_code',
      errorDescription: 'Google did not return an authorization code.',
    });
    return callbackPage('Google không trả về mã xác thực. Bạn có thể đóng cửa sổ này.');
  }

  try {
    const tokens = await exchangeAuthorizationCode({ code, codeVerifier: stateRecord.codeVerifier, redirectUri: stateRecord.redirectUri }, env);
    const sessionToken = randomToken(32);
    const sessionKey = await sessionKeyForToken(sessionToken);
    await store.put(sessionKey, JSON.stringify({ refreshToken: tokens.refreshToken, createdAt: new Date().toISOString() }));
    await writeOAuthResult(store, stateRecord.resultKey, {
      status: 'complete',
      sessionToken,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    });

    console.log(JSON.stringify({ event: 'oauth_session_created' }));
    return callbackPage('Đã kết nối Google Drive với Kinly. Cửa sổ này sẽ tự đóng.');
  } catch (error) {
    const codeValue = error instanceof HttpError ? error.code : 'oauth_callback_failed';
    const message = error instanceof Error ? error.message : 'Google authorization failed.';
    await writeOAuthResult(store, stateRecord.resultKey, {
      status: 'error',
      error: codeValue,
      errorDescription: message,
    });
    console.error(JSON.stringify({ event: 'oauth_callback_failed', code: codeValue }));
    return callbackPage('Không thể hoàn tất xác thực Google. Bạn có thể đóng cửa sổ này và thử lại trong Kinly.');
  }
}

async function handleOAuthResult(request, env) {
  const origin = requireAllowedOrigin(request, env);
  const attemptToken = readBearerToken(request);
  const resultKey = await resultKeyForToken(attemptToken);
  const store = requireSessionStore(env);
  const result = parseJsonRecord(await store.get(resultKey, 'json'));
  if (!result) return jsonResponse({ status: 'pending' }, 200, origin);
  await store.delete(resultKey);
  return jsonResponse(result, 200, origin);
}

async function handleTokenRefresh(request, env) {
  const origin = requireAllowedOrigin(request, env);
  const sessionToken = readBearerToken(request);
  const sessionKey = await sessionKeyForToken(sessionToken);
  const store = requireSessionStore(env);
  const session = parseJsonRecord(await store.get(sessionKey, 'json'));
  if (!session || typeof session.refreshToken !== 'string' || !session.refreshToken) {
    throw new HttpError(401, 'reauth_required', 'OAuth broker session does not exist.');
  }

  try {
    const tokens = await refreshAccessToken(session.refreshToken, env);
    if (tokens.refreshToken && tokens.refreshToken !== session.refreshToken) {
      await store.put(sessionKey, JSON.stringify({ ...session, refreshToken: tokens.refreshToken }));
    }
    return jsonResponse({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn }, 200, origin);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'reauth_required') {
      await store.delete(sessionKey);
    }
    throw error;
  }
}

async function handleSessionDelete(request, env) {
  const origin = requireAllowedOrigin(request, env);
  const sessionToken = readBearerToken(request);
  const store = requireSessionStore(env);
  await store.delete(await sessionKeyForToken(sessionToken));
  const headers = corsHeaders(origin);
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 204, headers });
}

async function routeRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    const origin = requireAllowedOrigin(request, env);
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse({ ok: true, service: 'kinly-google-oauth-broker' });
  }
  if (request.method === 'POST' && url.pathname === '/oauth/start') return handleOAuthStart(request, env);
  if (request.method === 'GET' && url.pathname === '/oauth/callback') return handleOAuthCallback(request, env);
  if (request.method === 'POST' && url.pathname === '/oauth/result') return handleOAuthResult(request, env);
  if (request.method === 'POST' && url.pathname === '/oauth/token') return handleTokenRefresh(request, env);
  if (request.method === 'DELETE' && url.pathname === '/oauth/session') return handleSessionDelete(request, env);
  throw new HttpError(404, 'not_found', 'Route not found.');
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    try {
      return await routeRequest(request, env);
    } catch (error) {
      const code = error instanceof HttpError ? error.code : 'internal_error';
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error(JSON.stringify({ event: 'request_failed', path: new URL(request.url).pathname, code }));
      return errorResponse(error, origin);
    }
  },
};
