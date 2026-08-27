import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { sessionKeyForToken } from './index.js';

const TRUSTED_ORIGIN = 'https://baby-growth-dvphu.web.app';
const BROKER_ORIGIN = 'https://kinly-google-oauth-broker.example.workers.dev';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

function createKv() {
  const values = new Map();
  return {
    values,
    async get(key, options) {
      const value = values.get(key);
      if (value === undefined) return null;
      if (options === 'json' || options?.type === 'json') return JSON.parse(value);
      return value;
    },
    async put(key, value) {
      values.set(key, String(value));
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

function createEnv(namespace = createKv()) {
  return {
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'server-only-secret',
    TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    ALLOWED_ORIGINS: `${TRUSTED_ORIGIN},https://localhost:5173`,
    OAUTH_SESSIONS: namespace,
  };
}

async function startAuthorization(env, body = {}) {
  const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/start`, {
    method: 'POST',
    headers: {
      Origin: TRUSTED_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }), env);
  assert.equal(response.status, 200);
  return response.json();
}

function decodeCompletionPayload(response) {
  assert.equal(response.status, 302);
  const location = response.headers.get('Location');
  assert.ok(location);
  const url = new URL(location);
  assert.equal(url.origin, TRUSTED_ORIGIN);
  assert.equal(url.pathname, '/google-oauth-complete.html');
  assert.ok(url.hash.length > 1);
  return JSON.parse(Buffer.from(url.hash.slice(1), 'base64url').toString('utf8'));
}

test('creates an offline Google authorization request with PKCE without writing KV state', async () => {
  const namespace = createKv();
  const env = createEnv(namespace);
  const payload = await startAuthorization(env, { loginHint: 'parent@example.com' });
  const authorizationUrl = new URL(payload.authorizationUrl);

  assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
  assert.equal(authorizationUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.appdata');
  assert.equal(authorizationUrl.searchParams.get('access_type'), 'offline');
  assert.equal(authorizationUrl.searchParams.get('prompt'), 'consent');
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorizationUrl.searchParams.get('code_challenge'));
  assert.equal(authorizationUrl.searchParams.get('login_hint'), 'parent@example.com');
  assert.ok(payload.attemptToken);
  assert.ok(authorizationUrl.searchParams.get('state'));
  assert.equal(namespace.values.size, 0);
});

test('rejects untrusted browser origins before creating OAuth state', async () => {
  const namespace = createKv();
  const env = createEnv(namespace);
  const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/start`, {
    method: 'POST',
    headers: {
      Origin: 'https://attacker.example',
      'Content-Type': 'application/json',
    },
    body: '{}',
  }), env);

  assert.equal(response.status, 403);
  assert.equal(namespace.values.size, 0);
});

test('rejects oversized JSON requests at the Worker boundary', async () => {
  const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/start`, {
    method: 'POST',
    headers: {
      Origin: TRUSTED_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ loginHint: 'x'.repeat(5000) }),
  }), createEnv());
  assert.equal(response.status, 413);
});

test('encrypts the refresh token in KV and returns the initial access token through the completion redirect', async () => {
  const namespace = createKv();
  const env = createEnv(namespace);
  const startPayload = await startAuthorization(env, { selectAccount: true });
  const authorizationUrl = new URL(startPayload.authorizationUrl);
  const state = authorizationUrl.searchParams.get('state');
  assert.ok(state);
  assert.equal(authorizationUrl.searchParams.get('prompt'), 'consent select_account');

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://oauth2.googleapis.com/token');
      const body = String(init?.body || '');
      assert.match(body, /client_secret=server-only-secret/);
      assert.match(body, /grant_type=authorization_code/);
      assert.match(body, /code_verifier=/);
      return Response.json({
        access_token: 'initial-access-token',
        refresh_token: 'server-refresh-token',
        expires_in: 3600,
      });
    };

    const callbackResponse = await worker.fetch(new Request(
      `${BROKER_ORIGIN}/oauth/callback?state=${encodeURIComponent(state)}&code=authorization-code`,
    ), env);
    const result = decodeCompletionPayload(callbackResponse);

    assert.equal(result.status, 'complete');
    assert.equal(result.attemptToken, startPayload.attemptToken);
    assert.equal(result.accessToken, 'initial-access-token');
    assert.ok(result.sessionToken);

    const sessionKey = await sessionKeyForToken(result.sessionToken);
    const storedSession = namespace.values.get(sessionKey);
    assert.ok(storedSession);
    assert.equal(storedSession.includes('server-refresh-token'), false);
    assert.equal(callbackResponse.headers.get('Location').includes('server-refresh-token'), false);

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://oauth2.googleapis.com/token');
      const body = String(init?.body || '');
      assert.match(body, /grant_type=refresh_token/);
      assert.match(body, /refresh_token=server-refresh-token/);
      return Response.json({ access_token: 'refreshed-access-token', expires_in: 3600 });
    };

    const refreshResponse = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Authorization: `Bearer ${result.sessionToken}`,
      },
    }), env);
    assert.equal(refreshResponse.status, 200);
    assert.deepEqual(await refreshResponse.json(), {
      accessToken: 'refreshed-access-token',
      expiresIn: 3600,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects tampered OAuth state without touching KV', async () => {
  const namespace = createKv();
  const env = createEnv(namespace);
  const startPayload = await startAuthorization(env);
  const authorizationUrl = new URL(startPayload.authorizationUrl);
  const state = authorizationUrl.searchParams.get('state');
  assert.ok(state);
  const tampered = `${state.slice(0, -1)}${state.endsWith('a') ? 'b' : 'a'}`;

  const response = await worker.fetch(new Request(
    `${BROKER_ORIGIN}/oauth/callback?state=${encodeURIComponent(tampered)}&code=authorization-code`,
  ), env);

  assert.equal(response.status, 400);
  assert.equal(namespace.values.size, 0);
});

test('invalid Google refresh grants revoke the KV broker session', async () => {
  const namespace = createKv();
  const env = createEnv(namespace);
  const startPayload = await startAuthorization(env);
  const state = new URL(startPayload.authorizationUrl).searchParams.get('state');
  assert.ok(state);
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({
      access_token: 'initial-access-token',
      refresh_token: 'revoked-refresh-token',
      expires_in: 3600,
    });
    const callbackResponse = await worker.fetch(new Request(
      `${BROKER_ORIGIN}/oauth/callback?state=${encodeURIComponent(state)}&code=authorization-code`,
    ), env);
    const result = decodeCompletionPayload(callbackResponse);
    const sessionKey = await sessionKeyForToken(result.sessionToken);
    assert.equal(namespace.values.has(sessionKey), true);

    globalThis.fetch = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Authorization: `Bearer ${result.sessionToken}`,
      },
    }), env);

    assert.equal(response.status, 401);
    assert.equal(namespace.values.has(sessionKey), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('issues an encrypted short-lived Drive stream URL and forwards byte ranges without buffering', async () => {
  const namespace = createKv();
  const env = createEnv(namespace);
  const startPayload = await startAuthorization(env);
  const state = new URL(startPayload.authorizationUrl).searchParams.get('state');
  assert.ok(state);
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({
      access_token: 'initial-access-token',
      refresh_token: 'server-refresh-token',
      expires_in: 3600,
    });
    const callbackResponse = await worker.fetch(new Request(
      `${BROKER_ORIGIN}/oauth/callback?state=${encodeURIComponent(state)}&code=authorization-code`,
    ), env);
    const session = decodeCompletionPayload(callbackResponse);

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://oauth2.googleapis.com/token');
      assert.match(String(init?.body || ''), /grant_type=refresh_token/);
      return Response.json({ access_token: 'drive-stream-access-token', expires_in: 3600 });
    };
    const createResponse = await worker.fetch(new Request(`${BROKER_ORIGIN}/drive/streams`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Authorization: `Bearer ${session.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: 'private-drive-video' }),
    }), env);

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(typeof created.streamUrl, 'string');
    assert.ok(created.expiresAt > Date.now());
    assert.equal(created.streamUrl.includes('drive-stream-access-token'), false);
    assert.equal(created.streamUrl.includes(session.sessionToken), false);
    assert.equal(created.streamUrl.includes('private-drive-video'), false);

    globalThis.fetch = async (input, init) => {
      assert.equal(
        String(input),
        'https://www.googleapis.com/drive/v3/files/private-drive-video?alt=media',
      );
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer drive-stream-access-token');
      assert.equal(headers.get('Range'), 'bytes=0-2');
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': '3',
          'Content-Range': 'bytes 0-2/4096',
          'Content-Type': 'video/mp4',
        },
      });
    };
    const streamResponse = await worker.fetch(new Request(created.streamUrl, {
      headers: { Origin: TRUSTED_ORIGIN, Range: 'bytes=0-2' },
    }), env);

    assert.equal(streamResponse.status, 206);
    assert.equal(streamResponse.headers.get('Content-Range'), 'bytes 0-2/4096');
    assert.equal(streamResponse.headers.get('Content-Type'), 'video/mp4');
    assert.equal(streamResponse.headers.get('Access-Control-Allow-Origin'), TRUSTED_ORIGIN);
    assert.deepEqual(new Uint8Array(await streamResponse.arrayBuffer()), new Uint8Array([1, 2, 3]));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects tampered Drive stream tickets before contacting Google Drive', async () => {
  const namespace = createKv();
  const env = createEnv(namespace);
  const startPayload = await startAuthorization(env);
  const state = new URL(startPayload.authorizationUrl).searchParams.get('state');
  assert.ok(state);
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({
      access_token: 'initial-access-token',
      refresh_token: 'server-refresh-token',
      expires_in: 3600,
    });
    const callbackResponse = await worker.fetch(new Request(
      `${BROKER_ORIGIN}/oauth/callback?state=${encodeURIComponent(state)}&code=authorization-code`,
    ), env);
    const session = decodeCompletionPayload(callbackResponse);
    globalThis.fetch = async () => Response.json({ access_token: 'drive-stream-access-token', expires_in: 3600 });
    const createResponse = await worker.fetch(new Request(`${BROKER_ORIGIN}/drive/streams`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Authorization: `Bearer ${session.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: 'private-drive-video' }),
    }), env);
    const created = await createResponse.json();
    const tamperedUrl = `${created.streamUrl.slice(0, -1)}${created.streamUrl.endsWith('a') ? 'b' : 'a'}`;
    globalThis.fetch = async () => {
      throw new Error('Google Drive must not be called for a tampered ticket.');
    };

    const response = await worker.fetch(new Request(tamperedUrl, {
      headers: { Origin: TRUSTED_ORIGIN, Range: 'bytes=0-0' },
    }), env);

    assert.equal(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
