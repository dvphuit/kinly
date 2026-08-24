import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localDb = vi.hoisted(() => ({
  getLocalRecord: vi.fn(),
  removeLocalRecord: vi.fn(),
  setLocalRecord: vi.fn(),
}));

vi.mock('@/data/localDb', () => localDb);

describe('Google OAuth broker client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_GOOGLE_AUTH_WORKER_URL', 'https://oauth.example.workers.dev');
    localDb.getLocalRecord.mockResolvedValue('opaque-session');
    localDb.removeLocalRecord.mockResolvedValue(undefined);
    localDb.setLocalRecord.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('restores a runtime access token from the durable broker session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ accessToken: 'runtime-access', expiresIn: 3600 }));
    vi.stubGlobal('fetch', fetchMock);
    const broker = await import('./googleOAuthBroker');

    await expect(broker.restoreGoogleAccessTokenFromBroker()).resolves.toEqual({
      accessToken: 'runtime-access',
      expiresIn: 3600,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://oauth.example.workers.dev/oauth/token'),
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer opaque-session' },
      }),
    );
  });

  it('removes an expired broker session when the Worker requires reauthorization', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 401 })));
    const broker = await import('./googleOAuthBroker');

    await expect(broker.restoreGoogleAccessTokenFromBroker()).resolves.toBeNull();
    expect(localDb.removeLocalRecord).toHaveBeenCalledWith('babygrowth_v4_google_oauth_broker_session');
  });

  it('keeps the broker disabled when no Worker URL is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_AUTH_WORKER_URL', '');
    const broker = await import('./googleOAuthBroker');

    expect(broker.isGoogleOAuthBrokerConfigured()).toBe(false);
    await expect(broker.restoreGoogleAccessTokenFromBroker()).resolves.toBeNull();
  });
});
