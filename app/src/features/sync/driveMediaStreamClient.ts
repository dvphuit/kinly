import {
  createDriveMediaStreamId,
  driveMediaStreamIdFromPath,
  driveMediaStreamPath,
  parseDriveMediaStreamReply,
  type DriveMediaStreamMessage,
  type DriveMediaStreamSession,
} from '@/shared/lib/driveMediaStreamProtocol';

const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 20_000;
const REGISTRATION_REPLY_TIMEOUT_MS = 5_000;
const SERVICE_WORKER_URL = '/sw.js';
const SERVICE_WORKER_SCOPE = '/';

function serviceWorkerContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker ?? null;
}

function currentServiceWorker(): ServiceWorker | null {
  return serviceWorkerContainer()?.controller ?? null;
}

async function requestPwaServiceWorkerRegistration(
  container: ServiceWorkerContainer,
): Promise<ServiceWorkerRegistration | null> {
  try {
    return await container.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
  } catch {
    return null;
  }
}

async function waitForActiveServiceWorker(): Promise<ServiceWorker | null> {
  const container = serviceWorkerContainer();
  if (!container) return null;
  if (container.controller) return container.controller;

  const registration = await requestPwaServiceWorkerRegistration(container);
  if (!registration) return null;
  if (container.controller) return container.controller;

  return new Promise<ServiceWorker | null>((resolve) => {
    let settled = false;
    const finish = (controller: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      container.removeEventListener('controllerchange', handleControllerChange);
      resolve(controller);
    };
    const handleControllerChange = () => finish(container.controller);
    const timeoutId = window.setTimeout(
      () => finish(container.controller),
      SERVICE_WORKER_ACTIVATION_TIMEOUT_MS,
    );

    container.addEventListener('controllerchange', handleControllerChange);
    void container.ready
      .then(() => {
        if (container.controller) finish(container.controller);
      })
      .catch(() => undefined);
  });
}

function streamUnavailableError(): Error {
  return new Error('Không thể khởi tạo streaming video từ Google Drive. Hãy tải lại ứng dụng rồi thử lại.');
}

export async function registerDriveMediaStream(
  session: Omit<DriveMediaStreamSession, 'streamId'>,
): Promise<string> {
  const controller = await waitForActiveServiceWorker();
  if (!controller || typeof MessageChannel === 'undefined') throw streamUnavailableError();

  const streamId = createDriveMediaStreamId();
  const message: DriveMediaStreamMessage = {
    kind: 'drive-media-stream/register',
    streamId,
    ...session,
  };
  const channel = new MessageChannel();

  const reply = await new Promise<ReturnType<typeof parseDriveMediaStreamReply>>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(null), REGISTRATION_REPLY_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeoutId);
      resolve(parseDriveMediaStreamReply(event.data));
    };
    controller.postMessage(message, [channel.port2]);
  }).finally(() => {
    channel.port1.close();
    channel.port2.close();
  });

  if (reply?.kind === 'drive-media-stream/error') throw new Error(reply.message);
  if (reply?.kind !== 'drive-media-stream/registered') throw streamUnavailableError();

  return new URL(driveMediaStreamPath(streamId), window.location.origin).toString();
}

export function unregisterDriveMediaStream(streamUrl: string): void {
  const controller = currentServiceWorker();
  if (!controller) return;
  let streamId: string | null = null;
  try {
    const url = new URL(streamUrl, window.location.origin);
    if (url.origin === window.location.origin) streamId = driveMediaStreamIdFromPath(url.pathname);
  } catch {
    return;
  }
  if (!streamId) return;
  const message: DriveMediaStreamMessage = { kind: 'drive-media-stream/unregister', streamId };
  controller.postMessage(message);
}
