import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

describe('passkey Google session architecture', () => {
  it('keeps Drive calls client-side while enabling the passkey token relay in production builds', () => {
    const workflow = read('..', '.github', 'workflows', 'firebase-hosting-merge.yml');

    expect(workflow).toContain("VITE_GOOGLE_PASSKEY_AUTH: 'true'");
    expect(workflow).toContain('VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}');
    expect(workflow).toContain('VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}');
    expect(workflow).not.toContain('VITE_GOOGLE_DRIVE_BACKEND: firebase');
  });

  it('uses a claim-store-commit handoff so the backend deletes the persistent refresh token', () => {
    const functions = read('functions', 'src', 'index.ts');

    expect(functions).toContain("router.post('/google/local-token/claim'");
    expect(functions).toContain("router.post('/google/local-token/commit'");
    expect(functions).toContain("router.post('/google/local-token/refresh'");
    expect(functions).toContain('refreshTokenCiphertext: FieldValue.delete()');
    expect(functions).toContain("tokenStorage: 'local-passkey'");
    expect(functions).toContain("Cache-Control', 'no-store");
  });

  it('keeps the decrypted refresh token in runtime memory and restores it through Passkey on startup', () => {
    const drive = read('src', 'features', 'sync', 'googleDriveSync.ts');
    const sync = read('src', 'features', 'sync', 'index.ts');
    const vault = read('src', 'features', 'sync', 'passkeyTokenVault.ts');

    expect(drive).toContain('let passkeyRefreshToken: string | null = null');
    expect(drive).toContain('/api/google/local-token/refresh');
    expect(drive).toContain('USE_FIREBASE_BACKEND || USE_PASSKEY_GOOGLE_AUTH');
    expect(sync).toContain('unlockGoogleRefreshTokenFromPasskeyVault');
    expect(sync).toContain('/api/google/local-token/commit');
    expect(vault).toContain("purpose: 'google-refresh-token'");
    expect(vault).not.toContain('localStorage.setItem');
  });
});
