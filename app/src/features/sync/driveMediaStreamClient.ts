import {
  createDriveMediaStreamId,
  driveMediaStreamIdFromPath,
  driveMediaStreamPath,
  parseDriveMediaStreamReply,
  type DriveMediaStreamMessage,
  type DriveMediaStreamSession,
} from './driveMediaStreamProtocol';

const REGISTRATION_TIMEOUT_MS = 3_000;

function activeServiceWorker(): ServiceWorker | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.controller;
}

export async function registerDriveMediaStream(
  session: Omit<DriveMediaStreamSession, 'streamId'>,
): Promise<string | null> {
  const controller = activeServiceWorker();
  if (!controller || typeof MessageChannel === 'undefined') return null;

  const streamId = createDriveMediaStreamId();
  const message: DriveMediaStreamMessage = {
    kind: 'drive-media-stream/register',
    streamId,
    ...session,
  };
  const channel = new MessageChannel();

  const registered = await new Promise<boolean>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(false), REGISTRATION_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeoutId);
      const reply = parseDriveMediaStreamReply(event.data);
      resolve(reply?.kind === 'drive-media-stream/registered');
    };
    controller.postMessage(message, [channel.port2]);
  }).finally(() => {
    channel.port1.close();
    channel.port2.close();
  });

  return registered
    ? new URL(driveMediaStreamPath(streamId), window.location.origin).toString()
    : null;
}

export function unregisterDriveMediaStream(streamUrl: string): void {
  const controller = activeServiceWorker();
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
