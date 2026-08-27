import {
  createDriveMediaStreamId,
  driveMediaStreamIdFromPath,
  driveMediaStreamPath,
  parseDriveMediaStreamClientReply,
  parseDriveMediaStreamReply,
  parseDriveMediaStreamSessionRequest,
  type DriveMediaStreamMessage,
  type DriveMediaStreamSession,
  type DriveMediaStreamSessionReply,
} from '@/shared/lib/driveMediaStreamProtocol';

const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 20_000;
const REGISTRATION_REPLY_TIMEOUT_MS = 5_000;
const SERVICE_WORKER_URL = '/sw.js';
const SERVICE_WORKER_SCOPE = '/';
const activeSessions = new Map<string, DriveMediaStreamSession>();
const sessionBridgeContainers = new WeakSet<ServiceWorkerContainer>();
const pendingRegistrationReplies = new Map<
  string,
  (reply: ReturnType<typeof parseDriveMediaStreamReply>) => void
>();

function serviceWorkerContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker ?? null;
}

function currentServiceWorker(): ServiceWorker | null {
  return serviceWorkerContainer()?.controller ?? null;
}

function registerMessage(
  session: DriveMediaStreamSession,
): Extract<DriveMediaStreamMessage, { kind: 'drive-media-stream/register' }> {
  return {
    kind: 'drive-media-stream/register',
    requestId: createDriveMediaStreamId(),
    ...session,
  };
}

function installSessionBridge(container: ServiceWorkerContainer): void {
  if (sessionBridgeContainers.has(container)) return;
  sessionBridgeContainers.add(container);

  container.addEventListener('message', (event: MessageEvent<unknown>) => {
    const registrationReply = parseDriveMediaStreamClientReply(event.data);
    if (registrationReply) {
      pendingRegistrationReplies.get(registrationReply.requestId)?.(registrationReply.reply);
      return;
    }

    const request = parseDriveMediaStreamSessionRequest(event.data);
    if (!request) return;
    const session = activeSessions.get(request.streamId);
    if (session && session.expiresAt <= Date.now()) activeSessions.delete(request.streamId);
    const reply: DriveMediaStreamSessionReply = session && session.expiresAt > Date.now()
      ? { kind: 'drive-media-stream/session', session }
      : { kind: 'drive-media-stream/session-unavailable' };
    event.ports[0]?.postMessage(reply);
  });

  container.addEventListener('controllerchange', () => {
    const controller = container.controller;
    if (!controller) return;
    for (const [streamId, session] of activeSessions) {
      if (session.expiresAt <= Date.now()) {
        activeSessions.delete(streamId);
        continue;
      }
      void requestStreamRegistration(controller, session);
    }
  });
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
  session: DriveMediaStreamSession,
): Promise<ReturnType<typeof parseDriveMediaStreamReply>> {
  const message = registerMessage(session);
  const channel = typeof MessageChannel === 'undefined' ? null : new MessageChannel();

  return new Promise<ReturnType<typeof parseDriveMediaStreamReply>>((resolve) => {
    let settled = false;
    const finish = (reply: ReturnType<typeof parseDriveMediaStreamReply>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      pendingRegistrationReplies.delete(message.requestId);
      resolve(reply);
    };
    const timeoutId = window.setTimeout(() => finish(null), REGISTRATION_REPLY_TIMEOUT_MS);
    pendingRegistrationReplies.set(message.requestId, finish);
    if (channel) {
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        finish(parseDriveMediaStreamReply(event.data));
      };
    }
    try {
      controller.postMessage(message, channel ? [channel.port2] : []);
    } catch {
      finish(null);
    }
  }).finally(() => {
    channel?.port1.close();
    channel?.port2.close();
  });
}

function streamUrl(streamId: string): string {
  return new URL(driveMediaStreamPath(streamId), window.location.origin).toString();
}

export async function registerDriveMediaStream(
  session: Omit<DriveMediaStreamSession, 'streamId'>,
): Promise<string> {
  const container = serviceWorkerContainer();
  if (!container) throw streamUnavailableError();
  installSessionBridge(container);

  const controller = await waitForActiveServiceWorker();
  if (!controller) throw streamUnavailableError();

  const streamId = createDriveMediaStreamId();
  const activeSession: DriveMediaStreamSession = {
    streamId,
    ...session,
  };
  activeSessions.set(streamId, activeSession);

  try {
    const reply = await requestStreamRegistration(controller, activeSession);
    if (reply?.kind === 'drive-media-stream/error') throw new Error(reply.message);
    if (reply?.kind === 'drive-media-stream/registered') return streamUrl(streamId);

    const refreshedController = await refreshServiceWorkerController(controller);
    if (!refreshedController) throw streamUnavailableError();

    const retryReply = await requestStreamRegistration(refreshedController, activeSession);
    if (retryReply?.kind === 'drive-media-stream/error') throw new Error(retryReply.message);
    if (retryReply?.kind !== 'drive-media-stream/registered') throw streamUnavailableError();

    return streamUrl(streamId);
  } catch (error) {
    activeSessions.delete(streamId);
    throw error;
  }
}

export function unregisterDriveMediaStream(streamUrlValue: string): void {
  let streamId: string | null = null;
  try {
    const url = new URL(streamUrlValue, window.location.origin);
    if (url.origin === window.location.origin) streamId = driveMediaStreamIdFromPath(url.pathname);
  } catch {
    return;
  }
  if (!streamId) return;
  activeSessions.delete(streamId);
  const controller = currentServiceWorker();
  if (!controller) return;
  const message: DriveMediaStreamMessage = { kind: 'drive-media-stream/unregister', streamId };
  controller.postMessage(message);
}
