import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const WORKFLOW_PATH = join(ROOT, '..', '.github', 'workflows', 'firebase-hosting-merge.yml');

describe('firebase hosting workflow regression', () => {
  it('injects Firebase Web config and backend flag for production builds', () => {
    const content = readFileSync(WORKFLOW_PATH, 'utf8');
    expect(content).toContain('VITE_GOOGLE_DRIVE_BACKEND: firebase');
    expect(content).toContain('VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}');
    expect(content).toContain('VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}');
    expect(content).toContain('VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}');
    expect(content).toContain('VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}');
    expect(content).toContain('VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}');
    expect(content).toContain('VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}');
    expect(content).toContain('VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}');
    expect(content).toContain('VITE_APP_VERSION');
    expect(content).toContain('VITE_BUILD_SHA');
    expect(content).toContain('VITE_BUILD_REF');
    expect(content).toContain('VITE_BUILD_TIME');
  });

  it('does not regress to browser-only Google auth silently', () => {
    const content = readFileSync(WORKFLOW_PATH, 'utf8');
    const buildSection = content.split('Build')[1] ?? content;
    expect(buildSection).toMatch(/VITE_GOOGLE_DRIVE_BACKEND:\s*firebase/);
  });
});
