# Kinly Google OAuth broker

This Cloudflare Worker is an optional OAuth backend for Kinly's Google Drive backup. It keeps Google refresh credentials off the browser so Kinly can restore a short-lived Drive access token after the app reopens without repeating Passkey + GIS whenever the access token expires.

## Security model

- `GOOGLE_CLIENT_SECRET` is a Cloudflare Worker Secret and is never committed.
- `TOKEN_ENCRYPTION_KEY` is a 32-byte Worker Secret used to encrypt Google refresh tokens with AES-GCM before D1 persistence.
- Durable OAuth sessions live in the `OAUTH_DB` D1 binding; raw refresh tokens are never stored in D1.
- Kinly stores an opaque broker session token in IndexedDB. D1 stores only a SHA-256-derived session lookup key, not the opaque token itself.
- Google access tokens returned to Kinly remain runtime-only and expire normally.
- OAuth authorization uses Authorization Code + PKCE and single-use state/result records with a 10-minute expiry.
- Browser requests are restricted to `ALLOWED_ORIGINS`; there is no wildcard CORS.
- If Google returns `invalid_grant`, the broker deletes the durable session and Kinly falls back to explicit reauthorization.

D1 is used instead of Workers KV because OAuth state/result consumption and session creation need predictable read-after-write behavior. Cloudflare documents Workers KV as eventually consistent and recommends stronger consistency for transactional state.

The opaque broker session is still a sensitive capability: JavaScript running in the Kinly origin can use it while it is present. Keep the app's XSS protections strong and delete the broker session when disconnecting an account.

## Local verification

```bash
cd workers/google-oauth-broker
npm install
npm test
npm run check
```

`npm run check` applies the D1 migration to a local Wrangler database and then runs `wrangler deploy --dry-run` to validate the Worker bundle.

## Provision D1

Authenticate Wrangler with the Cloudflare account that should own the Worker:

```bash
cd workers/google-oauth-broker
npm install
npx wrangler login
```

Create the D1 database:

```bash
npx wrangler d1 create kinly-google-oauth
```

Copy the returned database UUID into `wrangler.jsonc` as `d1_databases[0].database_id`, replacing the all-zero placeholder.

Apply migrations remotely:

```bash
npx wrangler d1 migrations apply OAUTH_DB --remote
```

## Secrets

Store the Google OAuth client secret in Cloudflare, not GitHub source:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Generate and store a 32-byte encryption key:

```bash
openssl rand -base64 32 | npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Do not rotate `TOKEN_ENCRYPTION_KEY` without a migration plan for existing encrypted refresh tokens. Rotating it immediately invalidates existing broker sessions.

## Deploy

```bash
npx wrangler deploy
```

## Google Cloud Console

Use the same OAuth 2.0 Web application client ID configured for Kinly. Add the deployed Worker callback as an **Authorized redirect URI**:

```text
https://<your-worker-host>/oauth/callback
```

The Worker requests only:

```text
https://www.googleapis.com/auth/drive.appdata
```

## Enable the broker in Kinly

Set the Firebase Hosting build secret/environment variable to the Worker origin, without a trailing path:

```text
VITE_GOOGLE_AUTH_WORKER_URL=https://<your-worker-host>
```

When this variable is absent, Kinly keeps the existing browser GIS + Passkey fallback path. This lets the broker be deployed and verified before it becomes the production authentication path.
