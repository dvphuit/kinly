import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const googleDriveSync = vi.hoisted(() => ({
  isGoogleConnected: vi.fn(() => false),
  requestGoogleAccessToken: vi.fn(),
}));
const passkeyGate = vi.hoisted(() => ({
  hasGooglePasskeyGate: vi.fn(),
  authenticateGooglePasskeyGate: vi.fn(),
}));
const oauthBroker = vi.hoisted(() => ({
  isGoogleOAuthBrokerConfigured: vi.fn(),
  requestGoogleAccessTokenFromBroker: vi.fn(),
  restoreGoogleAccessTokenFromBroker: vi.fn(),
}));

vi.mock('./googleDriveSync', () => googleDriveSync);
vi.mock('./googlePasskeyGate', () => passkeyGate);
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
    passkeyGate.hasGooglePasskeyGate.mockResolvedValue(true);
    passkeyGate.authenticateGooglePasskeyGate.mockResolvedValue(undefined);
    googleDriveSync.requestGoogleAccessToken.mockResolvedValue(ACCOUNT);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('restores through the configured OAuth broker before any Passkey fallback', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    window.localStorage.setItem(LINKED_ACCOUNT_KEY, JSON.stringify({ clientId: CLIENT_ID, account: ACCOUNT }));
    oauthBroker.isGoogleOAuthBrokerConfigured.mockReturnValue(true);

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(true);
    expect(oauthBroker.restoreGoogleAccessTokenFromBroker).toHaveBeenCalledTimes(1);
    expect(passkeyGate.hasGooglePasskeyGate).not.toHaveBeenCalled();
    expect(passkeyGate.authenticateGooglePasskeyGate).not.toHaveBeenCalled();
    expect(googleDriveSync.requestGoogleAccessToken).toHaveBeenCalledTimes(1);
  });

  it('reports explicit auth when the broker has no durable session', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    oauthBroker.isGoogleOAuthBrokerConfigured.mockReturnValue(true);
    oauthBroker.restoreGoogleAccessTokenFromBroker.mockResolvedValue(null);

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(passkeyGate.hasGooglePasskeyGate).not.toHaveBeenCalled();
    expect(googleDriveSync.requestGoogleAccessToken).not.toHaveBeenCalled();
  });

  it('authenticates the local Passkey before opening the GIS token dialog without a broker', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    window.localStorage.setItem(LINKED_ACCOUNT_KEY, JSON.stringify({ clientId: CLIENT_ID, account: ACCOUNT }));

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(true);
    expect(passkeyGate.authenticateGooglePasskeyGate).toHaveBeenCalledTimes(1);
    expect(googleDriveSync.requestGoogleAccessToken).toHaveBeenCalledTimes(1);
    expect(sync.isGoogleLinked()).toBe(true);
  });

  it('does not open GIS when no Passkey gate is configured', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    passkeyGate.hasGooglePasskeyGate.mockResolvedValue(false);

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(passkeyGate.authenticateGooglePasskeyGate).not.toHaveBeenCalled();
    expect(googleDriveSync.requestGoogleAccessToken).not.toHaveBeenCalled();
  });

  it('does not open GIS when Passkey verification is cancelled', async () => {
    window.localStorage.setItem(LINKED_CLIENT_KEY, CLIENT_ID);
    passkeyGate.authenticateGooglePasskeyGate.mockRejectedValue({ code: 'cancelled' });

    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(googleDriveSync.requestGoogleAccessToken).not.toHaveBeenCalled();
  });

  it('does not prompt Passkey or Google when no account was linked before', async () => {
    const sync = await import('./index');

    await expect(sync.restoreGoogleSession()).resolves.toBe(false);
    expect(passkeyGate.hasGooglePasskeyGate).not.toHaveBeenCalled();
    expect(googleDriveSync.requestGoogleAccessToken).not.toHaveBeenCalled();
  });
});
