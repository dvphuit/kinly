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

describe('Google link persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    window.localStorage.clear();
    installGoogleTokenClient('runtime-token');
  });

  afterEach(() => {
    Object.defineProperty(window, 'google', { configurable: true, value: undefined });
    vi.unstubAllEnvs();
  });

  it('keeps the Google link after a new app runtime without pretending the token session survived', async () => {
    const sync = await import('./index');

    expect(sync.isGoogleConnected()).toBe(false);
    expect(sync.isGoogleLinked()).toBe(false);
    expect(sync.isGoogleSessionActive()).toBe(false);

    await sync.requestGoogleAccessToken();

    expect(sync.isGoogleConnected()).toBe(true);
    expect(sync.isGoogleLinked()).toBe(true);
    expect(sync.isGoogleSessionActive()).toBe(true);
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
  });

  it('does not carry a remembered link to a different OAuth client', async () => {
    const sync = await import('./index');
    await sync.requestGoogleAccessToken();

    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'other-client-id');
    vi.resetModules();
    const reloadedSync = await import('./index');

    expect(reloadedSync.isGoogleLinked()).toBe(false);
    expect(reloadedSync.isGoogleConnected()).toBe(false);
  });
});
