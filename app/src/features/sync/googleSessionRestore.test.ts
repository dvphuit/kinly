import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const googleDriveSync = vi.hoisted(() => ({
  isGoogleConnected: vi.fn(() => false),
  requestGoogleAccessToken: vi.fn(),
  requestGoogleAccessTokenSilently: vi.fn(),
}));
const oauthBroker = vi.hoisted(() => ({
  isGoogleOAuthBrokerConfigured: vi.fn(),
  requestGoogleAccessTokenFromBroker: vi.fn(),
  restoreGoogleAccessTokenFromBroker: vi.fn(),
}));

vi.mock('./googleDriveSync', () => googleDriveSync);
vi.mock('./googleOAuthBroker', () => oauthBroker);

const ACCOUNT = {
  permissionId: 'account-1',
  emailAddress: 'parent@example.com',
  displayName: 'Parent',
};

const CLIENT_ID = 'client-id';
const LINKED_CLIENT_KEY = 'babygrowth_v4_google_linked_client';
const LINKED_ACCOUNT_KEY = 'babygrowth_v4_google_linked_account';

describe('Google session restore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', CLIENT_ID);
    window.localStorage.clear();
    oauthBroker.isGoogleOAuthBrokerConfigured.mockReturnValue(false);
    oauthBroker.restoreGoogleAccessTokenFromBroker.mockResolvedValue({ accessToken: 'worker-access', expiresIn: 3600 });
    googleDriveSync.requestGoogleAccessToken.mockResolvedValue(ACCOUNT);
    googleDriveSync.requestGoogleAccessTokenSilently.mockResolvedValue(ACCOUNT);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('restores through the configured OAuth broker before browser GIS fallback', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    window.localStorage.setItem(LINKED_ACCOUNT_KEY, JSON.stringify({ clientId: CLIENT_ID, account: ACCOUNT }));
    oauthBroker.isGoogleOAuthBrokerConfigured.mockReturnValue(true);

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(true);
    expect(oauthBroker.restoreGoogleAccessTokenFromBroker).toHaveBeenCalledTimes(1);
    expect(googleDriveSync.requestGoogleAccessToken).toHaveBeenCalledTimes(1);
    expect(googleDriveSync.requestGoogleAccessTokenSilently).not.toHaveBeenCalled();
  });

  it('returns false when the configured broker has no durable session', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    oauthBroker.isGoogleOAuthBrokerConfigured.mockReturnValue(true);
    oauthBroker.restoreGoogleAccessTokenFromBroker.mockResolvedValue(null);

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(googleDriveSync.requestGoogleAccessToken).not.toHaveBeenCalled();
    expect(googleDriveSync.requestGoogleAccessTokenSilently).not.toHaveBeenCalled();
  });

  it('silently restores a remembered Google account when the broker is disabled', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    window.localStorage.setItem(LINKED_ACCOUNT_KEY, JSON.stringify({ clientId: CLIENT_ID, account: ACCOUNT }));

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(true);
    expect(googleDriveSync.requestGoogleAccessTokenSilently).toHaveBeenCalledTimes(1);
    expect(googleDriveSync.requestGoogleAccessTokenSilently).toHaveBeenCalledWith({ loginHint: 'parent@example.com' });
    expect(sync.isGoogleLinked()).toBe(true);
  });

  it('keeps the remembered link when browser silent restore needs user interaction', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    window.localStorage.setItem(LINKED_ACCOUNT_KEY, JSON.stringify({ clientId: CLIENT_ID, account: ACCOUNT }));
    googleDriveSync.requestGoogleAccessTokenSilently.mockRejectedValue(new Error('interaction_required'));

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(sync.isGoogleLinked()).toBe(true);
    expect(window.localStorage.getItem(LINKED_ACCOUNT_KEY)).toContain('parent@example.com');
  });

  it('does not contact Google when no account was linked and the broker is disabled', async () => {
    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(googleDriveSync.requestGoogleAccessTokenSilently).not.toHaveBeenCalled();
  });
});
