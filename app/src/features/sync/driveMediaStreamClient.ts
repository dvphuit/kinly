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
  forceUpdate = false,
): Promise<ServiceWorkerRegistration | null> {
  try {
    const registration = await container.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
    if (forceUpdate) {
      try {
        await registration.update();
      } catch {
        // The existing registration can still activate a worker even if an explicit update check fails.
      }
    }
    return registration;
  } catch {
    return null;
  }
}

function waitForController(
  container: ServiceWorkerContainer,
  accept: (controller: ServiceWorker) => boolean,
): Promise<ServiceWorker | null> {
  const current = container.controller;
  if (current && accept(current)) return Promise.resolve(current);

  return new Promise<ServiceWorker | null>((resolve) => {
    let settled = false;
    const finish = (controller: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      container.removeEventListener('controllerchange', handleControllerChange);
      resolve(controller);
    };
    const checkController = () => {
      const controller = container.controller;
      if (controller && accept(controller)) finish(controller);
    };
    const handleControllerChange = () => checkController();
    const timeoutId = window.setTimeout(() => finish(null), SERVICE_WORKER_ACTIVATION_TIMEOUT_MS);

    container.addEventListener('controllerchange', handleControllerChange);
    void container.ready
      .then(() => checkController())
      .catch(() => undefined);
  });
}

async function waitForActiveServiceWorker(): Promise<ServiceWorker | null> {
  const container = serviceWorkerContainer();
  if (!container) return null;
  if (container.controller) return container.controller;

  const registration = await requestPwaServiceWorkerRegistration(container);
  if (!registration) return null;
  return waitForController(container, () => true);
}

async function refreshServiceWorkerController(
  previousController: ServiceWorker,
): Promise<ServiceWorker | null> {
  const container = serviceWorkerContainer();
  if (!container) return null;

  const registration = await requestPwaServiceWorkerRegistration(container, true);
  if (!registration) return null;
  return waitForController(container, (controller) => controller !== previousController);
}

function streamUnavailableError(): Error {
  return new Error('Không thể khởi tạo streaming video từ Google Drive. Hãy tải lại ứng dụng rồi thử lại.');
}

async function requestStreamRegistration(
  controller: ServiceWorker,
  message: DriveMediaStreamMessage,
): Promise<ReturnType<typeof parseDriveMediaStreamReply>> {
  const channel = new MessageChannel();

  return new Promise<ReturnType<typeof parseDriveMediaStreamReply>>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(null), REGISTRATION_REPLY_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeoutId);
      resolve(parseDriveMediaStreamReply(event.data));
    };
    try {
      controller.postMessage(message, [channel.port2]);
    } catch {
      window.clearTimeout(timeoutId);
      resolve(null);
    }
  }).finally(() => {
    channel.port1.close();
    channel.port2.close();
  });
}

function streamUrl(streamId: string): string {
  return new URL(driveMediaStreamPath(streamId), window.location.origin).toString();
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

  const reply = await requestStreamRegistration(controller, message);
  if (reply?.kind === 'drive-media-stream/error') throw new Error(reply.message);
  if (reply?.kind === 'drive-media-stream/registered') return streamUrl(streamId);

  const refreshedController = await refreshServiceWorkerController(controller);
  if (!refreshedController) throw streamUnavailableError();

  const retryReply = await requestStreamRegistration(refreshedController, message);
  if (retryReply?.kind === 'drive-media-stream/error') throw new Error(retryReply.message);
  if (retryReply?.kind !== 'drive-media-stream/registered') throw streamUnavailableError();

  return streamUrl(streamId);
}

export function unregisterDriveMediaStream(streamUrlValue: string): void {
  const controller = currentServiceWorker();
  if (!controller) return;
  let streamId: string | null = null;
  try {
    const url = new URL(streamUrlValue, window.location.origin);
    if (url.origin === window.location.origin) streamId = driveMediaStreamIdFromPath(url.pathname);
  } catch {
    return;
  }
  if (!streamId) return;
  const message: DriveMediaStreamMessage = { kind: 'drive-media-stream/unregister', streamId };
  controller.postMessage(message);
}
