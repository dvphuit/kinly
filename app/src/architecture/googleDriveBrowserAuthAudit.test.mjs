import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

describe('browser-only Google Drive authentication architecture', () => {
  it('keeps production deployment on Firebase Hosting without Cloud Functions billing', () => {
    const workflow = read('..', '.github', 'workflows', 'firebase-hosting-merge.yml');

    expect(workflow).toContain('VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}');
    expect(workflow).toContain('FirebaseExtended/action-hosting-deploy@v0');
    expect(workflow).not.toContain('functions:googleApi');
    expect(workflow).not.toContain('VITE_GOOGLE_PASSKEY_AUTH');
  });

  it('restores linked browser sessions with silent GIS authorization and a remembered account hint', () => {
    const drive = read('src', 'features', 'sync', 'googleDriveSync.ts');
    const sync = read('src', 'features', 'sync', 'index.ts');

    expect(drive).toContain("prompt: 'none'");
    expect(drive).toContain('login_hint: request.loginHint');
    expect(drive).toContain('requestGoogleAccessTokenSilently');
    expect(sync).toContain('getGoogleLinkedAccount()');
    expect(sync).toContain('requestGoogleAccessTokenSilently');
  });
});
