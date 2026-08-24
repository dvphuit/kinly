import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { sessionKeyForToken } from './index.js';

const TRUSTED_ORIGIN = 'https://baby-growth-dvphu.web.app';
const BROKER_ORIGIN = 'https://kinly-google-oauth-broker.example.workers.dev';

function createKv() {
  const values = new Map();
  return {
    values,
    async get(key, type) {
      const value = values.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      values.set(key, String(value));
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

function createEnv(kv = createKv()) {
  return {
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'server-only-secret',
    ALLOWED_ORIGINS: `${TRUSTED_ORIGIN},https://localhost:5173`,
    OAUTH_SESSIONS: kv,
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

async function readAuthorizationResult(env, attemptToken) {
  const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/result`, {
    method: 'POST',
    headers: {
      Origin: TRUSTED_ORIGIN,
      Authorization: `Bearer ${attemptToken}`,
    },
  }), env);
  assert.equal(response.status, 200);
  return response.json();
}

test('creates an offline Google authorization request with PKCE', async () => {
  const kv = createKv();
  const env = createEnv(kv);
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
  assert.equal([...kv.values.keys()].filter((key) => key.startsWith('state:')).length, 1);
});

test('rejects untrusted browser origins before creating OAuth state', async () => {
  const kv = createKv();
  const env = createEnv(kv);
  const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/start`, {
    method: 'POST',
    headers: {
      Origin: 'https://attacker.example',
      'Content-Type': 'application/json',
    },
    body: '{}',
  }), env);

  assert.equal(response.status, 403);
  assert.equal(kv.values.size, 0);
});

test('stores the refresh token server-side and refreshes access with an opaque session', async () => {
  const kv = createKv();
  const env = createEnv(kv);
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
    assert.equal(callbackResponse.status, 200);
    const callbackHtml = await callbackResponse.text();
    assert.equal(callbackHtml.includes('server-refresh-token'), false);
    assert.equal(callbackHtml.includes('initial-access-token'), false);

    const result = await readAuthorizationResult(env, startPayload.attemptToken);
    assert.equal(result.status, 'complete');
    assert.equal(result.accessToken, 'initial-access-token');
    assert.ok(result.sessionToken);

    const sessionKey = await sessionKeyForToken(result.sessionToken);
    const storedSession = JSON.parse(kv.values.get(sessionKey));
    assert.equal(storedSession.refreshToken, 'server-refresh-token');
    assert.equal(await readAuthorizationResult(env, startPayload.attemptToken).then((value) => value.status), 'pending');

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

test('invalid Google refresh grants revoke the broker session', async () => {
  const kv = createKv();
  const env = createEnv(kv);
  const sessionToken = 'x'.repeat(48);
  const sessionKey = await sessionKeyForToken(sessionToken);
  await kv.put(sessionKey, JSON.stringify({ refreshToken: 'revoked-refresh-token' }));
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Authorization: `Bearer ${sessionToken}`,
      },
    }), env);

    assert.equal(response.status, 401);
    assert.equal(kv.values.has(sessionKey), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
