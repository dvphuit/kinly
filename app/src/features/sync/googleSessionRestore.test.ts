import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const googleDriveSync = vi.hoisted(() => ({
  isGoogleConnected: vi.fn(() => false),
  requestGoogleAccessTokenSilently: vi.fn(),
}));

vi.mock('./googleDriveSync', () => googleDriveSync);

const ACCOUNT = {
  permissionId: 'account-1',
  emailAddress: 'parent@example.com',
  displayName: 'Parent',
};

const CLIENT_ID = 'client-id';
const LINKED_CLIENT_KEY = 'babygrowth_v4_google_linked_client';
const LINKED_ACCOUNT_KEY = 'babygrowth_v4_google_linked_account';

describe('browser Google session restore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', CLIENT_ID);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('silently restores a remembered Google account using its email as login hint', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    window.localStorage.setItem(LINKED_ACCOUNT_KEY, JSON.stringify({ clientId: CLIENT_ID, account: ACCOUNT }));
    googleDriveSync.requestGoogleAccessTokenSilently.mockResolvedValue(ACCOUNT);

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(true);
    expect(googleDriveSync.requestGoogleAccessTokenSilently).toHaveBeenCalledTimes(1);
    expect(googleDriveSync.requestGoogleAccessTokenSilently).toHaveBeenCalledWith({
      loginHint: 'parent@example.com',
    });
    expect(sync.isGoogleLinked()).toBe(true);
  });

  it('keeps the remembered link when silent restore needs user interaction', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    window.localStorage.setItem(LINKED_ACCOUNT_KEY, JSON.stringify({ clientId: CLIENT_ID, account: ACCOUNT }));
    googleDriveSync.requestGoogleAccessTokenSilently.mockRejectedValue(new Error('interaction_required'));

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(sync.isGoogleLinked()).toBe(true);
    expect(window.localStorage.getItem(LINKED_ACCOUNT_KEY)).toContain('parent@example.com');
  });

  it('does not contact Google when no account was linked before', async () => {
    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(googleDriveSync.requestGoogleAccessTokenSilently).not.toHaveBeenCalled();
  });
});
