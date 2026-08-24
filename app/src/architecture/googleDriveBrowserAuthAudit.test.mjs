import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

describe('browser-only Google Drive authentication architecture', () => {
  it('keeps production on browser Google auth without Functions or passkey session code', () => {
    const workflow = read('..', '.github', 'workflows', 'firebase-hosting-merge.yml');
    const routes = read('src', 'app', 'AppRoutes.tsx');
    const sync = read('src', 'features', 'sync', 'index.ts');

    expect(workflow).toContain('VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}');
    expect(workflow).not.toContain('functions:googleApi');
    expect(workflow).not.toContain('VITE_GOOGLE_PASSKEY_AUTH');
    expect(routes).not.toContain('passkey-vault');
    expect(sync).not.toContain('firebaseApiFetch');
  });

  it('uses a silent GIS token request and restores it when auto-sync starts', () => {
    const drive = read('src', 'features', 'sync', 'googleDriveSync.ts');
    const sync = read('src', 'features', 'sync', 'index.ts');

    expect(drive).toContain("prompt: 'none'");
    expect(drive).toContain('login_hint: request.loginHint');
    expect(drive).toContain('requestGoogleAccessTokenSilently');
    expect(drive).toContain('await restoreLinkedGoogleSession();');
    expect(drive).toContain("document.visibilityState === 'visible'");
    expect(sync).toContain('getGoogleLinkedAccount()');
    expect(sync).toContain('requestGoogleAccessTokenSilently');
  });
});
