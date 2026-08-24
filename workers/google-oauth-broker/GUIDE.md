# Google OAuth Broker — E2E Setup Guide

This guide covers the full Cloudflare + Google + Kinly wiring for the optional broker that lets Kinly obtain a fresh Google Drive `drive.appdata` access token on reopen without asking the user again.

Production reference (PR #75, `experiment/cloudflare-google-oauth-broker`):

- Worker: `kinly-google-oauth-broker`
- Origin: `https://kinly-google-oauth-broker.dvphu-it.workers.dev`
- KV: `OAUTH_SESSIONS` → `cdb2f09876614bb8a227178158e08509`
- Google client: `598629342498-c8ltki5l6hfn395ts1497hu5euks33kv.apps.googleusercontent.com`
- Allowed origin: `https://baby-growth-dvphu.web.app`
- Redirect URI: `https://kinly-google-oauth-broker.dvphu-it.workers.dev/oauth/callback`

Replace those values with your own deployment if you fork the setup. The contract below must stay the same.

## 1. Architecture contract (do not break)

- Google Authorization Code + PKCE, `access_type=offline`, `scope=https://www.googleapis.com/auth/drive.appdata`.
- Google refresh token lives only in Cloudflare Workers KV, AES-GCM encrypted (`REFRESH_TOKEN_AAD=kinly-google-oauth-refresh-v1`, `src/index.js:9`).
- KV binding `OAUTH_SESSIONS`; key = `session:<SHA-256(opaque broker token)>` (`src/index.js:48`).
- Browser keeps only the opaque broker session (`babygrowth_v4_google_oauth_broker_session` in IndexedDB via `src/features/sync/googleOAuthBroker.ts:3`); Google access token is runtime-only.
- OAuth `state` is stateless/encrypted (`STATE_AAD=kinly-google-oauth-state-v1`, 10 min TTL, `src/index.js:8`) and never persisted to KV.
- No D1, no Passkey re-introduction, preserve `babygrowth_*` keys.
- When `VITE_GOOGLE_AUTH_WORKER_URL` is absent, Kinly falls back to browser-only GIS.

Flow:

```
POST /oauth/start (Kinly → Worker, Origin-checked) → authorizationUrl + attemptToken
  → popup → Google consent
  → GET /oauth/callback?code=&state= (Google → Worker, decrypts state, PKCE exchange, AES-GCM encrypts refresh token → KV)
  → 302 → https://<kinly-origin>/google-oauth-complete.html#<b64url(JSON{status,attemptToken,sessionToken,accessToken,expiresIn})>
  → completion page strips fragment, BroadcastChannel(attemptToken) → Kinly tab stores sessionToken, uses accessToken

Reopen:  POST /oauth/token  Authorization: Bearer <opaque session>  → Worker decrypts KV, refreshes at Google, returns {accessToken,expiresIn}
Disconnect: DELETE /oauth/session + local IndexedDB delete
Revoked refresh:  POST /oauth/token → 401 reauth_required, Worker deletes KV entry
```

## 2. Prerequisites

- Node 22, npm
- Cloudflare account with Workers + KV
- `wrangler` 4.x (`workers/google-oauth-broker/package.json:10`)
- Google Cloud project owning the OAuth 2.0 Web client
- Access to GitHub repo secrets (for `VITE_GOOGLE_AUTH_WORKER_URL`) and Firebase Hosting deploy

## 3. Local verification (no cloud)

```bash
cd workers/google-oauth-broker
npm install
npm test        # 6 tests: origin, body limit, state tamper, KV encryption, invalid_grant revocation
npm run check   # wrangler deploy --dry-run bundle validation
```

Checks before any deploy:

- `wrangler.jsonc` has `kv_namespaces[0].binding === "OAUTH_SESSIONS"` exactly once
- no `d1_databases`, no `00000000000000000000000000000000` placeholder
- `vars.GOOGLE_CLIENT_ID` and `vars.ALLOWED_ORIGINS` set (comma-separated, no `*`)

## 4. Cloudflare auth

```bash
cd workers/google-oauth-broker
npx wrangler --version   # must be 4.x
npx wrangler whoami
# if expired:
npx wrangler login
```

## 5. KV namespace

```bash
npx wrangler kv namespace list
npx wrangler kv namespace create OAUTH_SESSIONS
```

Copy the returned `id` into `workers/google-oauth-broker/wrangler.jsonc`:

```jsonc
"kv_namespaces": [{ "binding": "OAUTH_SESSIONS", "id": "<real-id>" }]
```

Commit only this ID change (example commit: `Configure production KV for Google OAuth broker`). Do not commit `.dev.vars` or secrets.

## 6. Worker config

`workers/google-oauth-broker/wrangler.jsonc`:

```jsonc
{
  "name": "kinly-google-oauth-broker",
  "main": "src/index.js",
  "compatibility_date": "2026-08-24",
  "compatibility_flags": ["nodejs_compat"],
  "kv_namespaces": [{ "binding": "OAUTH_SESSIONS", "id": "cdb2f09876614bb8a227178158e08509" }],
  "vars": {
    "GOOGLE_CLIENT_ID": "598629342498-c8ltki5l6hfn395ts1497hu5euks33kv.apps.googleusercontent.com",
    "ALLOWED_ORIGINS": "https://baby-growth-dvphu.web.app"
  },
  "observability": { "enabled": true, "head_sampling_rate": 1 }
}
```

- `ALLOWED_ORIGINS` must list every real production origin that will call the broker (here `https://baby-growth-dvphu.web.app` from `.firebaserc` / `firebase.json` and `app/scripts/deploy-production.sh:38`). Do not use `*`.
- `compatibility_date` is `2026-08-24` for this PR.

## 7. Secrets (never commit, never log)

```bash
# interactive — pasted value is not echoed
npx wrangler secret put GOOGLE_CLIENT_SECRET

# 32-byte AES-GCM key, piped directly — never print it
openssl rand -base64 32 | npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

If the Worker already has production KV sessions, never rotate `TOKEN_ENCRYPTION_KEY` — existing ciphertext becomes undecryptable.

Verify (names only):

```bash
npx wrangler secret list
# → GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY
```

## 8. Deploy & health

```bash
npx wrangler deploy
# → https://kinly-google-oauth-broker.<subdomain>.workers.dev
curl -s https://<worker-host>/health
# {"ok":true,"service":"kinly-google-oauth-broker"}
```

Smoke tests (replace `<worker-host>`):

```bash
# trusted origin → returns authorizationUrl
curl -s -X POST https://<worker-host>/oauth/start \
  -H "Origin: https://baby-growth-dvphu.web.app" \
  -H "Content-Type: application/json" -d '{}' | jq .

# untrusted origin → 403
curl -s -X POST https://<worker-host>/oauth/start \
  -H "Origin: https://evil.example.com" \
  -H "Content-Type: application/json" -d '{}'

# invalid session → 401 reauth_required
curl -s -X POST https://<worker-host>/oauth/token \
  -H "Origin: https://baby-growth-dvphu.web.app" \
  -H "Authorization: Bearer invalidtokeninvalidtokeninvalidtokeninvalidtoken12345678"

# delete (idempotent) → 204
curl -s -i -X DELETE https://<worker-host>/oauth/session \
  -H "Origin: https://baby-growth-dvphu.web.app" \
  -H "Authorization: Bearer invalidtokeninvalidtokeninvalidtokeninvalidtoken12345678"
```

The `/oauth/start` response must contain `authorizationUrl` with `redirect_uri=https://<worker-host>/oauth/callback`, `scope=https://www.googleapis.com/auth/drive.appdata`, `access_type=offline`, `state=v1.<iv>.<ciphertext>`.

## 9. Google Cloud Console

Same Web client as `GOOGLE_CLIENT_ID`. Add exactly:

```
https://<worker-host>/oauth/callback
```

No gcloud API exists for this; edit **APIs & Services → Credentials → OAuth 2.0 Client IDs → Authorized redirect URIs** in the console. Scheme/host/path must match exactly.

## 10. Kinly build

Kinly reads the broker origin at build time via `src/features/sync/googleOAuthBroker.ts:32` (`VITE_GOOGLE_AUTH_WORKER_URL`).

For Firebase Hosting deploys (`app/.firebaserc: baby-growth-dvphu`, `.github/workflows/firebase-hosting-merge.yml:31`):

```bash
gh secret set VITE_GOOGLE_AUTH_WORKER_URL --repo dvphuit/kinly \
  --body "https://<worker-host>"
# verify (value not shown):
gh secret list --repo dvphuit/kinly | grep VITE_GOOGLE_AUTH_WORKER_URL
```

Use the origin only (no trailing path). The completion page is `app/public/google-oauth-complete.html`.

## 11. E2E — manual Google round-trip

Prereqs: steps 8–10 done, browser allows popups, Google account.

1. Open `https://baby-growth-dvphu.web.app` (or local `npm run dev` with `ALLOWED_ORIGINS` including that origin).
2. Connect Google Drive → popup opens to `accounts.google.com` → approve `drive.appdata`.
3. Popup redirects via Worker callback → `…/google-oauth-complete.html#…` → fragment stripped, `BroadcastChannel(kinly-google-oauth:<attemptToken>)` delivers `{sessionToken, accessToken, expiresIn}` to opener.
4. Verify:
   - IndexedDB/localDb contains `babygrowth_v4_google_oauth_broker_session` (opaque token only)
   - No `refresh_token`, `GOOGLE_CLIENT_SECRET`, or `TOKEN_ENCRYPTION_KEY` in browser storage
   - Drive sync succeeds with the runtime `accessToken`

### Reopen tests

**A. Reload Kinly**
- No popup.
- Kinly calls `POST /oauth/token` with `Authorization: Bearer <opaque session>`; Worker decrypts KV, calls Google `refresh_token` grant, returns new `accessToken`. Sync works.

**B. Close and reopen**
- Same as A.

**C. Redeploy Worker without touching secrets/KV**
```bash
npx wrangler deploy
```
- Existing broker session still works; no re-auth needed (KV and secret unchanged).

**D. Disconnect**
- App calls `clearGoogleOAuthBrokerSession()` (`googleOAuthBroker.ts:244`): removes IndexedDB key + `DELETE /oauth/session` deletes KV entry.
- Subsequent restore returns `null`, no silent auth.

**E. Revoked/invalid refresh token**
- Revoke in Google Account or use an invalidated session.
- `POST /oauth/token` → `401 {code:"reauth_required"}` (`src/index.js:429`), KV entry deleted, no infinite loop.

## 12. Storage & security audit

Browser (Application → IndexedDB/LocalStorage/Storage):
- Must contain: opaque broker session only.
- Must NOT contain: Google refresh token, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, Google access token persisted.

Worker:
```bash
npx wrangler tail   # or Cloudflare Logs
# should show only: {"event":"oauth_session_created"} / {"event":"oauth_callback_failed","code":"…"} / {"event":"request_failed","code":"…"}
```
Never log `accessToken`, `refreshToken`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, or raw `Authorization` headers.

KV:
```bash
# list keys (if needed)
npx wrangler kv key list --namespace-id <id>
# get a value — must be JSON {version:1,ciphertext:"…",iv:"…"}, never plaintext refresh token
npx wrangler kv key get --namespace-id <id> "session:<hash>"
```

## 13. CI

Branch `experiment/cloudflare-google-oauth-broker` must pass on the final head:

- App CI (`verify`)
- Performance CI
- Browser E2E (`@playwright/test`, `app/playwright.config.ts`)
- Google OAuth Worker CI (`verify-worker` — `npm test` + `npm run check`)

```bash
gh pr checks 75
gh run list --branch experiment/cloudflare-google-oauth-broker --limit 5
```

Fix failures by inspecting the failing job log, patching, pushing, and re-waiting for the exact new head.

## 14. Commit discipline

Allowed durable repo change: `workers/google-oauth-broker/wrangler.jsonc` KV namespace ID (plus any genuine config/test doc fix discovered during real deploy).

Never commit: `.dev.vars`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, access/refresh tokens, Cloudflare credentials, `wrangler` logs, temp files.

Commit in English, e.g.:

```
Configure production KV for Google OAuth broker

Update OAUTH_SESSIONS binding to production KV namespace
cdb2f09876614bb8a227178158e08509.
```

Push to `experiment/cloudflare-google-oauth-broker`; update PR #75 body with final head SHA, Worker origin, health, KV/secret status, Google redirect URI status, `VITE_GOOGLE_AUTH_WORKER_URL` status, and exact CI run IDs. Do not merge PR #75 from this guide.
