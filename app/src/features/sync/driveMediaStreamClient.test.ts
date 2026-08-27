import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDriveMediaStream, unregisterDriveMediaStream } from './driveMediaStreamClient';

class FakeMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  peer: FakeMessagePort | null = null;

  postMessage(data: unknown): void {
    this.peer?.onmessage?.(new MessageEvent('message', { data }));
  }

  close(): void {}
}

class FakeMessageChannel {
  port1 = new FakeMessagePort();
  port2 = new FakeMessagePort();

  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

describe('Drive media stream client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers an opaque same-origin stream URL and unregisters it on release', async () => {
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('01234567-89ab-4cde-8fab-0123456789ab');
    const postMessage = vi.fn((message: unknown, ports?: FakeMessagePort[]) => {
      if (
        typeof message === 'object'
        && message !== null
        && 'kind' in message
        && message.kind === 'drive-media-stream/register'
      ) {
        ports?.[0]?.postMessage({ kind: 'drive-media-stream/registered' });
      }
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: { postMessage } },
    });

    const streamUrl = await registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    });

    expect(streamUrl).toBe('http://localhost:3000/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'drive-media-stream/register',
      fileId: 'drive-video',
      accessToken: 'google-access-token',
    }), expect.any(Array));

    unregisterDriveMediaStream(streamUrl ?? '');
    expect(postMessage).toHaveBeenLastCalledWith({
      kind: 'drive-media-stream/unregister',
      streamId: '01234567-89ab-4cde-8fab-0123456789ab',
    });
  });

  it('returns null when the page is not controlled by the service worker', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null },
    });

    await expect(registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    })).resolves.toBeNull();
  });
});
