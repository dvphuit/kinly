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

function streamController() {
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
  return { postMessage };
}

describe('Drive media stream client', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers an opaque same-origin stream URL and unregisters it on release', async () => {
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('01234567-89ab-4cde-8fab-0123456789ab');
    const controller = streamController();
    const register = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller, register, addEventListener: vi.fn() },
    });

    const streamUrl = await registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    });

    expect(streamUrl).toBe('http://localhost:3000/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab');
    expect(register).not.toHaveBeenCalled();
    expect(controller.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'drive-media-stream/register',
      fileId: 'drive-video',
      accessToken: 'google-access-token',
    }), expect.any(Array));

    unregisterDriveMediaStream(streamUrl);
    expect(controller.postMessage).toHaveBeenLastCalledWith({
      kind: 'drive-media-stream/unregister',
      streamId: '01234567-89ab-4cde-8fab-0123456789ab',
    });
  });

  it('re-registers an open stream when a new service worker takes control', async () => {
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('01234567-89ab-4cde-8fab-0123456789ab');
    const firstController = streamController();
    const nextController = streamController();
    const controllerChangeListeners = new Set<EventListener>();
    const serviceWorker = {
      controller: firstController,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') controllerChangeListeners.add(listener);
      }),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });

    const streamUrl = await registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    });

    serviceWorker.controller = nextController;
    controllerChangeListeners.forEach((listener) => listener(new Event('controllerchange')));

    await vi.waitFor(() => expect(nextController.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'drive-media-stream/register',
      fileId: 'drive-video',
      accessToken: 'google-access-token',
    }), expect.any(Array)));

    unregisterDriveMediaStream(streamUrl);
  });

  it('registers through direct service-worker messages when MessageChannel is unavailable', async () => {
    vi.stubGlobal('MessageChannel', undefined);
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('01234567-89ab-4cde-8fab-0123456789ab')
      .mockReturnValueOnce('11234567-89ab-4cde-8fab-0123456789ab');
    const messageListeners = new Set<EventListener>();
    const controller = {
      postMessage: vi.fn((message: unknown) => {
        if (
          typeof message !== 'object'
          || message === null
          || !('kind' in message)
          || message.kind !== 'drive-media-stream/register'
          || !('requestId' in message)
          || typeof message.requestId !== 'string'
        ) {
          return;
        }
        const replyEvent = new MessageEvent('message', {
          data: {
            kind: 'drive-media-stream/registered',
            requestId: message.requestId,
          },
        });
        messageListeners.forEach((listener) => listener(replyEvent));
      }),
    };
    const serviceWorker = {
      controller,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'message') messageListeners.add(listener);
      }),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });

    await expect(registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    })).resolves.toBe(
      'http://localhost:3000/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab',
    );
  });

  it('registers the PWA worker on demand instead of falling back to a full video download', async () => {
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('01234567-89ab-4cde-8fab-0123456789ab');
    const controller = streamController();
    const serviceWorker = {
      controller: null as ReturnType<typeof streamController> | null,
      register: vi.fn(async () => {
        serviceWorker.controller = controller;
        return {};
      }),
      ready: Promise.resolve({}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });

    const streamUrl = await registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    });

    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(streamUrl).toBe('http://localhost:3000/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab');
    expect(controller.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'drive-media-stream/register',
      fileId: 'drive-video',
    }), expect.any(Array));
  });

  it('keeps the lightbox connection alive while first-time worker activation takes longer than five seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('01234567-89ab-4cde-8fab-0123456789ab');
    const controller = streamController();
    const controllerChangeListeners = new Set<EventListener>();
    const serviceWorker = {
      controller: null as ReturnType<typeof streamController> | null,
      register: vi.fn(async () => ({})),
      ready: new Promise(() => undefined),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') controllerChangeListeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') controllerChangeListeners.delete(listener);
      }),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });

    const streamPromise = registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    });

    await vi.advanceTimersByTimeAsync(5_500);
    expect(controller.postMessage).not.toHaveBeenCalled();
    expect(controllerChangeListeners.size).toBe(2);

    serviceWorker.controller = controller;
    controllerChangeListeners.forEach((listener) => listener(new Event('controllerchange')));

    expect(controllerChangeListeners.size).toBe(1);

    await expect(streamPromise).resolves.toBe(
      'http://localhost:3000/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab',
    );
    expect(controller.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'drive-media-stream/register',
      fileId: 'drive-video',
    }), expect.any(Array));
  });

  it('updates and retries when the current controller does not support Drive streaming', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('01234567-89ab-4cde-8fab-0123456789ab');
    const staleController = { postMessage: vi.fn() };
    const freshController = streamController();
    const controllerChangeListeners = new Set<EventListener>();
    const registration = { update: vi.fn(async () => undefined) };
    const serviceWorker = {
      controller: staleController as typeof staleController | ReturnType<typeof streamController> | null,
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') controllerChangeListeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') controllerChangeListeners.delete(listener);
      }),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });

    const streamPromise = registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(staleController.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'drive-media-stream/register',
      fileId: 'drive-video',
    }), expect.any(Array));
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(registration.update).toHaveBeenCalledOnce();
    expect(controllerChangeListeners.size).toBe(2);

    serviceWorker.controller = freshController;
    controllerChangeListeners.forEach((listener) => listener(new Event('controllerchange')));

    expect(controllerChangeListeners.size).toBe(1);

    await expect(streamPromise).resolves.toBe(
      'http://localhost:3000/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab',
    );
    expect(freshController.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'drive-media-stream/register',
      fileId: 'drive-video',
    }), expect.any(Array));
  });

  it('fails closed when service-worker streaming is unavailable', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });

    await expect(registerDriveMediaStream({
      fileId: 'drive-video',
      accessToken: 'google-access-token',
      expiresAt: Date.now() + 60_000,
    })).rejects.toThrow('Không thể khởi tạo streaming video từ Google Drive');
  });
});
