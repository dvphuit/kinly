# Kinly Google OAuth broker

This Cloudflare Worker is an optional OAuth backend for Kinly's Google Drive backup. It keeps the Google `client_secret` and refresh token off the browser so Kinly can restore a short-lived Drive access token after the app reopens without asking for Passkey + GIS on every expired browser session.

## Security model

- `GOOGLE_CLIENT_SECRET` is a Cloudflare Worker Secret and is never committed.
- Google refresh tokens are stored only in the `OAUTH_SESSIONS` Workers KV binding.
- Kinly stores an opaque broker session token in IndexedDB. The Worker stores only a SHA-256-derived lookup key, not the opaque token itself.
- Google access tokens returned to Kinly remain runtime-only and expire normally.
- OAuth authorization uses Authorization Code + PKCE and a single-use state record with a 10-minute TTL.
- Browser requests are restricted to `ALLOWED_ORIGINS`; there is no wildcard CORS.
- If Google returns `invalid_grant`, the broker deletes the session and Kinly falls back to explicit reauthorization.

The opaque broker session is still a sensitive capability: JavaScript running in the Kinly origin can use it while it is present. Keep the app's XSS protections strong and revoke the broker session when disconnecting an account.

## Local verification

```bash
cd workers/google-oauth-broker
npm install
npm test
npm run check
```

`wrangler deploy --dry-run` validates the Worker bundle. Wrangler can automatically provision the KV binding because `wrangler.jsonc` declares `OAUTH_SESSIONS` without an account-specific ID.

## Deploy

Authenticate Wrangler with the Cloudflare account that should own the Worker:

```bash
cd workers/google-oauth-broker
npm install
npx wrangler login
```

Store the Google OAuth client secret in Cloudflare, not GitHub source:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Deploy:

```bash
npx wrangler deploy
```

The first deploy may automatically provision the `OAUTH_SESSIONS` KV namespace and write its ID back to `wrangler.jsonc`.

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
