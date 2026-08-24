import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { sessionKeyForToken } from './index.js';

const TRUSTED_ORIGIN = 'https://baby-growth-dvphu.web.app';
const BROKER_ORIGIN = 'https://kinly-google-oauth-broker.example.workers.dev';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createD1() {
  const transients = new Map();
  const sessions = new Map();

  function createStatement(sql, bindings = []) {
    const normalized = normalizeSql(sql);
    return {
      sql: normalized,
      bindings,
      bind(...values) {
        return createStatement(sql, values);
      },
      async first() {
        if (normalized.startsWith('select payload, expires_at from oauth_transients')) {
          const [keyHash, kind] = bindings;
          const row = transients.get(keyHash);
          if (!row || row.kind !== kind) return null;
          return { payload: row.payload, expires_at: row.expiresAt };
        }
        if (normalized.startsWith('select refresh_token_ciphertext, refresh_token_iv from oauth_sessions')) {
          const [sessionHash] = bindings;
          const row = sessions.get(sessionHash);
          if (!row) return null;
          return {
            refresh_token_ciphertext: row.ciphertext,
            refresh_token_iv: row.iv,
          };
        }
        throw new Error(`Unsupported first() SQL: ${normalized}`);
      },
      async run() {
        if (normalized.startsWith('insert or replace into oauth_transients')) {
          const [keyHash, kind, payload, expiresAt] = bindings;
          transients.set(keyHash, { kind, payload, expiresAt });
          return { success: true, meta: { changes: 1 }, results: [] };
        }
        if (normalized.startsWith('delete from oauth_transients where key_hash = ? and kind = ?')) {
          const [keyHash, kind] = bindings;
          const row = transients.get(keyHash);
          if (row?.kind === kind) transients.delete(keyHash);
          return { success: true, meta: { changes: row?.kind === kind ? 1 : 0 }, results: [] };
        }
        if (normalized.startsWith('delete from oauth_transients where expires_at <= ?')) {
          const [now] = bindings;
          for (const [key, row] of transients) {
            if (row.expiresAt <= now) transients.delete(key);
          }
          return { success: true, meta: { changes: 0 }, results: [] };
        }
        if (normalized.startsWith('insert or replace into oauth_sessions')) {
          const [sessionHash, ciphertext, iv, , createdAt, updatedAt] = bindings;
          sessions.set(sessionHash, { ciphertext, iv, createdAt, updatedAt });
          return { success: true, meta: { changes: 1 }, results: [] };
        }
        if (normalized.startsWith('delete from oauth_sessions where session_hash = ?')) {
          const [sessionHash] = bindings;
          const existed = sessions.delete(sessionHash);
          return { success: true, meta: { changes: existed ? 1 : 0 }, results: [] };
        }
        throw new Error(`Unsupported run() SQL: ${normalized}`);
      },
    };
  }

  return {
    transients,
    sessions,
    prepare(sql) {
      return createStatement(sql);
    },
  };
}

function createEnv(database = createD1()) {
  return {
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'server-only-secret',
    TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    ALLOWED_ORIGINS: `${TRUSTED_ORIGIN},https://localhost:5173`,
    OAUTH_DB: database,
  };
}

function createContext() {
  return { waitUntil: (promise) => void promise };
}

async function startAuthorization(env, body = {}) {
  const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/start`, {
    method: 'POST',
    headers: {
      Origin: TRUSTED_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }), env, createContext());
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
  }), env, createContext());
  assert.equal(response.status, 200);
  return response.json();
}

test('creates an offline Google authorization request with PKCE', async () => {
  const database = createD1();
  const env = createEnv(database);
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
  assert.equal([...database.transients.values()].filter((row) => row.kind === 'state').length, 1);
});

test('rejects untrusted browser origins before creating OAuth state', async () => {
  const database = createD1();
  const env = createEnv(database);
  const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/start`, {
    method: 'POST',
    headers: {
      Origin: 'https://attacker.example',
      'Content-Type': 'application/json',
    },
    body: '{}',
  }), env, createContext());

  assert.equal(response.status, 403);
  assert.equal(database.transients.size, 0);
});

test('rejects oversized JSON requests at the Worker boundary', async () => {
  const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/start`, {
    method: 'POST',
    headers: {
      Origin: TRUSTED_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ loginHint: 'x'.repeat(5000) }),
  }), createEnv(), createContext());
  assert.equal(response.status, 413);
});

test('encrypts the refresh token in D1 and refreshes access with an opaque session', async () => {
  const database = createD1();
  const env = createEnv(database);
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
    ), env, createContext());
    assert.equal(callbackResponse.status, 200);
    const callbackHtml = await callbackResponse.text();
    assert.equal(callbackHtml.includes('server-refresh-token'), false);
    assert.equal(callbackHtml.includes('initial-access-token'), false);

    const result = await readAuthorizationResult(env, startPayload.attemptToken);
    assert.equal(result.status, 'complete');
    assert.equal(result.accessToken, 'initial-access-token');
    assert.ok(result.sessionToken);

    const sessionKey = await sessionKeyForToken(result.sessionToken);
    const storedSession = database.sessions.get(sessionKey);
    assert.ok(storedSession);
    assert.equal(storedSession.ciphertext.includes('server-refresh-token'), false);
    assert.notEqual(storedSession.ciphertext, 'server-refresh-token');
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
    }), env, createContext());
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
  const database = createD1();
  const env = createEnv(database);
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
    await worker.fetch(new Request(
      `${BROKER_ORIGIN}/oauth/callback?state=${encodeURIComponent(state)}&code=authorization-code`,
    ), env, createContext());
    const result = await readAuthorizationResult(env, startPayload.attemptToken);
    const sessionKey = await sessionKeyForToken(result.sessionToken);
    assert.equal(database.sessions.has(sessionKey), true);

    globalThis.fetch = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    const response = await worker.fetch(new Request(`${BROKER_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Authorization: `Bearer ${result.sessionToken}`,
      },
    }), env, createContext());

    assert.equal(response.status, 401);
    assert.equal(database.sessions.has(sessionKey), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
