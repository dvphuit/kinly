import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

describe('browser-only Google Drive authentication architecture', () => {
  it('keeps production on browser Google auth without Functions or a Passkey token vault', () => {
    const workflow = read('..', '.github', 'workflows', 'firebase-hosting-merge.yml');
    const routes = read('src', 'app', 'AppRoutes.tsx');
    const sync = read('src', 'features', 'sync', 'index.ts');
    const gate = read('src', 'features', 'sync', 'googlePasskeyGate.ts');

    expect(workflow).toContain('VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}');
    expect(workflow).not.toContain('functions:googleApi');
    expect(workflow).not.toContain('VITE_GOOGLE_PASSKEY_AUTH');
    expect(routes).not.toContain('passkey-vault');
    expect(sync).not.toContain('firebaseApiFetch');
    expect(gate).not.toContain('refresh_token');
    expect(gate).not.toContain('access_token');
    expect(gate).not.toContain('ciphertext');
  });

  it('gates GIS re-authentication with Passkey and falls back to account management', () => {
    const sync = read('src', 'features', 'sync', 'index.ts');
    const lifecycle = read('src', 'features', 'sync', 'hooks', 'useGoogleDriveReauthLifecycle.ts');
    const profile = read('src', 'features', 'profile', 'GoogleSyncCard.tsx');

    expect(sync).toContain('authenticateGooglePasskeyGate');
    expect(sync).toContain('module.requestGoogleAccessToken()');
    expect(sync).not.toContain('requestGoogleAccessTokenSilently');
    expect(lifecycle).toContain('hasGooglePasskeyGate');
    expect(lifecycle).toContain('isAutoSyncEnabled');
    expect(lifecycle).toContain('/profile?googleAuth=required');
    expect(profile).toContain('createGooglePasskeyGate');
    expect(profile).toContain('Xác thực Google & tiếp tục');
  });
});
