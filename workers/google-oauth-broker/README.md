# Kinly Google OAuth broker

This Cloudflare Worker keeps the Google refresh token outside the browser so Kinly can request a new short-lived Drive access token when the app opens again.

It also issues encrypted, file-scoped stream URLs for private Drive video. The browser authenticates once with its opaque broker session, then the Worker forwards video byte ranges to Google without exposing the Google access token or buffering the video body.

## Storage model

Workers KV stores only durable broker sessions. OAuth state is encrypted into the Google `state` parameter, and the first authorization result returns through Kinly's same-origin completion page. KV is therefore not used for read-after-write OAuth handoff state.

The stored mapping is effectively:

```text
SHA-256(opaque broker session token)
  -> AES-GCM encrypted Google refresh token
```

Kinly stores only the opaque broker session token in IndexedDB. Google access tokens stay in browser memory and expire normally.

## Security model

- `GOOGLE_CLIENT_SECRET` is a Worker Secret and is never committed.
- `TOKEN_ENCRYPTION_KEY` is a 32-byte Worker Secret used for AES-GCM encryption.
- `OAUTH_SESSIONS` is a Workers KV binding. Raw Google refresh tokens are never stored in KV.
- The browser never receives a Google refresh token.
- Authorization Code + PKCE is used for the initial Google grant.
- OAuth state expires after 10 minutes and is authenticated by AES-GCM instead of being persisted.
- The callback redirects only to an origin listed in `ALLOWED_ORIGINS`.
- The completion page uses a same-origin `BroadcastChannel`, so the Worker does not depend on `window.opener` surviving Google's popup flow.
- If Google returns `invalid_grant`, the Worker deletes the broker session and Kinly requires explicit Google authorization again.
- Drive stream URLs contain an AES-GCM encrypted ticket, expire after at most 10 minutes, and never contain a plaintext Google or broker token.
- Drive media responses preserve `Range` semantics and stream the Google response body directly.

The opaque broker session is a sensitive capability. JavaScript running on the Kinly origin can use it while it exists, so keep the app's XSS protections strong and delete the session when disconnecting the account.

## Local verification

```bash
cd workers/google-oauth-broker
npm install
npm test
npm run check
```

`npm run check` runs a Wrangler dry-run bundle validation. There is no database migration.

## Provision Workers KV

Authenticate Wrangler with the Cloudflare account that should own the Worker:

```bash
cd workers/google-oauth-broker
npm install
npx wrangler login
```

Create the KV namespace:

```bash
npx wrangler kv namespace create OAUTH_SESSIONS
```

Copy the returned namespace ID into `wrangler.jsonc` as `kv_namespaces[0].id`, replacing the all-zero placeholder.

## Secrets

Store the Google OAuth client secret in Cloudflare:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Generate and store a 32-byte encryption key:

```bash
openssl rand -base64 32 | npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Keep `TOKEN_ENCRYPTION_KEY` in a password manager or another secure recovery location. Replacing it immediately invalidates existing encrypted broker sessions.

## Deploy

```bash
npx wrangler deploy
```

The Worker should expose:

```text
GET /health
POST /oauth/start
GET /oauth/callback
POST /oauth/token
DELETE /oauth/session
POST /drive/streams
GET /drive/streams/:encrypted-ticket
```

## Google Cloud Console

Use the same OAuth 2.0 Web application client ID configured for Kinly. Add the deployed Worker callback as an Authorized redirect URI:

```text
https://<your-worker-host>/oauth/callback
```

The Worker requests only:

```text
https://www.googleapis.com/auth/drive.appdata
```

## Enable the broker in Kinly

Set the Firebase Hosting build secret or environment variable to the Worker origin, without a trailing path:

```text
VITE_GOOGLE_AUTH_WORKER_URL=https://<your-worker-host>
```

Kinly includes `/google-oauth-complete.html` as the same-origin popup completion page. The Worker redirects the initial authorization result there using a URL fragment. The page broadcasts the result to the already-open Kinly tab and immediately removes the fragment from its history entry.

When `VITE_GOOGLE_AUTH_WORKER_URL` is absent, Kinly keeps the pre-PR-74 browser-only silent GIS restore path.
