import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function installGoogleTokenClient(token: string): void {
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: { callback: (response: { access_token: string; expires_in: number }) => void }) => ({
            requestAccessToken: vi.fn(() => config.callback({ access_token: token, expires_in: 3600 })),
          })),
        },
      },
    },
  });
}

function accountResponse(): Response {
  return new Response(JSON.stringify({
    user: {
      permissionId: 'account-1',
      emailAddress: 'parent@example.com',
      displayName: 'Parent',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Google link persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    window.localStorage.clear();
    installGoogleTokenClient('runtime-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(accountResponse()));
  });

  afterEach(() => {
    Object.defineProperty(window, 'google', { configurable: true, value: undefined });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps Google account identity after a new runtime without persisting the access token', async () => {
    const sync = await import('./index');

    expect(sync.isGoogleConnected()).toBe(false);
    expect(sync.isGoogleLinked()).toBe(false);
    expect(sync.isGoogleSessionActive()).toBe(false);
    expect(sync.getGoogleLinkedAccount()).toBeNull();

    const account = await sync.requestGoogleAccessToken();

    expect(account).toMatchObject({ permissionId: 'account-1', emailAddress: 'parent@example.com' });
    expect(sync.isGoogleConnected()).toBe(true);
    expect(sync.isGoogleLinked()).toBe(true);
    expect(sync.isGoogleSessionActive()).toBe(true);
    expect(sync.getGoogleLinkedAccount()).toMatchObject({
      permissionId: 'account-1',
      emailAddress: 'parent@example.com',
      displayName: 'Parent',
    });
    expect(window.localStorage.getItem('babygrowth_v4_google_linked_client')).toBe('client-id');
    expect([...Array(window.localStorage.length).keys()]
      .map((index) => window.localStorage.getItem(window.localStorage.key(index) ?? ''))
      .join('|'))
      .not.toContain('runtime-token');

    vi.resetModules();
    const reloadedSync = await import('./index');

    expect(reloadedSync.isGoogleSessionActive()).toBe(false);
    expect(reloadedSync.isGoogleConnected()).toBe(false);
    expect(reloadedSync.isGoogleLinked()).toBe(true);
    expect(reloadedSync.getGoogleLinkedAccount()).toMatchObject({
      permissionId: 'account-1',
      emailAddress: 'parent@example.com',
    });
  });

  it('does not carry a remembered link or account to a different OAuth client', async () => {
    const sync = await import('./index');
    await sync.requestGoogleAccessToken();

    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'other-client-id');
    vi.resetModules();
    const reloadedSync = await import('./index');

    expect(reloadedSync.isGoogleLinked()).toBe(false);
    expect(reloadedSync.isGoogleConnected()).toBe(false);
    expect(reloadedSync.getGoogleLinkedAccount()).toBeNull();
  });
});
