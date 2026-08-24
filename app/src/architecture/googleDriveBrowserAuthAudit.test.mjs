import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

describe('Google Drive authentication architecture', () => {
  it('keeps the Cloudflare OAuth broker optional and keeps refresh credentials out of app source', () => {
    const workflow = read('..', '.github', 'workflows', 'firebase-hosting-merge.yml');
    const routes = read('src', 'app', 'AppRoutes.tsx');
    const sync = read('src', 'features', 'sync', 'index.ts');
    const broker = read('src', 'features', 'sync', 'googleOAuthBroker.ts');
    const completion = read('public', 'google-oauth-complete.html');
    const worker = read('..', 'workers', 'google-oauth-broker', 'src', 'index.js');
    const workerConfig = read('..', 'workers', 'google-oauth-broker', 'wrangler.jsonc');

    expect(workflow).toContain('VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}');
    expect(workflow).toContain('VITE_GOOGLE_AUTH_WORKER_URL: ${{ secrets.VITE_GOOGLE_AUTH_WORKER_URL }}');
    expect(routes).not.toContain('passkey-vault');
    expect(sync).not.toContain('firebaseApiFetch');
    expect(sync).not.toContain('googlePasskeyGate');
    expect(broker).not.toContain('refresh_token');
    expect(broker).not.toContain('/oauth/result');
    expect(broker).toContain('BroadcastChannel');
    expect(completion).toContain('BroadcastChannel');
    expect(completion).toContain('history.replaceState');
    expect(worker).toContain('GOOGLE_CLIENT_SECRET');
    expect(worker).toContain('TOKEN_ENCRYPTION_KEY');
    expect(worker).toContain('refresh_token');
    expect(worker).toContain('OAUTH_SESSIONS');
    expect(worker).not.toContain('OAUTH_DB');
    expect(worker).not.toContain('oauth_transients');
    expect(workerConfig).toContain('"kv_namespaces"');
    expect(workerConfig).not.toContain('"d1_databases"');
    expect(worker).toContain("code_challenge_method: 'S256'");
  });

  it('prefers broker refresh on reopen while retaining the browser-only GIS fallback', () => {
    const sync = read('src', 'features', 'sync', 'index.ts');
    const lifecycle = read('src', 'features', 'sync', 'hooks', 'useAutoSyncLifecycle.ts');
    const profile = read('src', 'features', 'profile', 'GoogleSyncCard.tsx');

    expect(sync).toContain('restoreGoogleAccessTokenFromBroker');
    expect(sync).toContain('requestGoogleAccessTokenFromBroker');
    expect(sync).toContain('requestGoogleAccessTokenSilently');
    expect(sync).not.toContain('authenticateGooglePasskeyGate');
    expect(lifecycle).not.toContain('/profile?googleAuth=required');
    expect(profile).not.toContain('Passkey');
  });
});
