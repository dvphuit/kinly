import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localDb = vi.hoisted(() => ({
  getLocalRecord: vi.fn(),
  removeLocalRecord: vi.fn(),
  setLocalRecord: vi.fn(),
}));

vi.mock('@/data/localDb', () => localDb);

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];

  readonly close = vi.fn();
  readonly name: string;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(): void {}
}

describe('Google OAuth broker client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_GOOGLE_AUTH_WORKER_URL', 'https://oauth.example.workers.dev');
    localDb.getLocalRecord.mockResolvedValue('opaque-session');
    localDb.removeLocalRecord.mockResolvedValue(undefined);
    localDb.setLocalRecord.mockResolvedValue(undefined);
    FakeBroadcastChannel.instances = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it('receives the first access token through the same-origin completion channel', async () => {
    localDb.getLocalRecord.mockResolvedValue(null);
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      authorizationUrl: 'about:blank#google-oauth',
      attemptToken: 'attempt-token',
    })));

    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const popup = iframe.contentWindow;
    if (!popup) throw new Error('Expected iframe window');
    vi.spyOn(window, 'open').mockReturnValue(popup);

    const broker = await import('./googleOAuthBroker');
    const resultPromise = broker.requestGoogleAccessTokenFromBroker();

    await vi.waitFor(() => expect(FakeBroadcastChannel.instances).toHaveLength(1));
    const channel = FakeBroadcastChannel.instances[0];
    expect(channel.name).toBe('kinly-google-oauth:attempt-token');
    channel.onmessage?.(new MessageEvent('message', {
      data: {
        status: 'complete',
        attemptToken: 'attempt-token',
        sessionToken: 'new-opaque-session',
        accessToken: 'initial-runtime-access',
        expiresIn: 3600,
      },
    }));

    await expect(resultPromise).resolves.toEqual({
      accessToken: 'initial-runtime-access',
      expiresIn: 3600,
    });
    expect(localDb.setLocalRecord).toHaveBeenCalledWith(
      'babygrowth_v4_google_oauth_broker_session',
      'new-opaque-session',
    );
    expect(channel.close).toHaveBeenCalledTimes(1);
    iframe.remove();
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
