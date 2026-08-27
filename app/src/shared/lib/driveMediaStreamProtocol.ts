export const DRIVE_MEDIA_STREAM_PATH_PREFIX = '/__kinly/drive-media/';

export interface DriveMediaStreamSession {
  streamId: string;
  fileId: string;
  accessToken: string;
  expiresAt: number;
}

export type DriveMediaStreamMessage =
  | ({ kind: 'drive-media-stream/register'; requestId: string } & DriveMediaStreamSession)
  | { kind: 'drive-media-stream/unregister'; streamId: string };

export type ParsedDriveMediaStreamMessage =
  | ({ kind: 'drive-media-stream/register'; requestId: string | null } & DriveMediaStreamSession)
  | { kind: 'drive-media-stream/unregister'; streamId: string };

export type DriveMediaStreamReply =
  | { kind: 'drive-media-stream/registered' }
  | { kind: 'drive-media-stream/error'; message: string };

export interface ParsedDriveMediaStreamClientReply {
  requestId: string;
  reply: DriveMediaStreamReply;
}

export interface DriveMediaStreamSessionRequest {
  kind: 'drive-media-stream/session-request';
  streamId: string;
}

export type DriveMediaStreamSessionReply =
  | { kind: 'drive-media-stream/session'; session: DriveMediaStreamSession }
  | { kind: 'drive-media-stream/session-unavailable' };

const STREAM_ID_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDriveMediaStreamSession(value: unknown): DriveMediaStreamSession | null {
  if (
    !isObject(value)
    || !isDriveMediaStreamId(value.streamId)
    || typeof value.fileId !== 'string'
    || !value.fileId.trim()
    || typeof value.accessToken !== 'string'
    || !value.accessToken
    || typeof value.expiresAt !== 'number'
    || !Number.isFinite(value.expiresAt)
  ) {
    return null;
  }
  return {
    streamId: value.streamId,
    fileId: value.fileId,
    accessToken: value.accessToken,
    expiresAt: value.expiresAt,
  };
}

export function isDriveMediaStreamId(value: unknown): value is string {
  return typeof value === 'string' && STREAM_ID_PATTERN.test(value);
}

export function createDriveMediaStreamId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function driveMediaStreamPath(streamId: string): string {
  return `${DRIVE_MEDIA_STREAM_PATH_PREFIX}${encodeURIComponent(streamId)}`;
}

export function driveMediaStreamIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(DRIVE_MEDIA_STREAM_PATH_PREFIX)) return null;
  const encoded = pathname.slice(DRIVE_MEDIA_STREAM_PATH_PREFIX.length);
  if (!encoded || encoded.includes('/')) return null;
  try {
    const streamId = decodeURIComponent(encoded);
    return isDriveMediaStreamId(streamId) ? streamId : null;
  } catch {
    return null;
  }
}

export function parseDriveMediaStreamMessage(value: unknown): ParsedDriveMediaStreamMessage | null {
  if (!isObject(value) || typeof value.kind !== 'string') return null;
  if (value.kind === 'drive-media-stream/unregister') {
    return isDriveMediaStreamId(value.streamId)
      ? { kind: value.kind, streamId: value.streamId }
      : null;
  }
  if (value.kind !== 'drive-media-stream/register') return null;
  const session = parseDriveMediaStreamSession(value);
  if (!session) return null;
  return {
    kind: value.kind,
    requestId: isDriveMediaStreamId(value.requestId) ? value.requestId : null,
    ...session,
  };
}

export function parseDriveMediaStreamReply(value: unknown): DriveMediaStreamReply | null {
  if (!isObject(value) || typeof value.kind !== 'string') return null;
  if (value.kind === 'drive-media-stream/registered') return { kind: value.kind };
  if (value.kind === 'drive-media-stream/error' && typeof value.message === 'string') {
    return { kind: value.kind, message: value.message };
  }
  return null;
}

export function parseDriveMediaStreamClientReply(value: unknown): ParsedDriveMediaStreamClientReply | null {
  if (!isObject(value) || !isDriveMediaStreamId(value.requestId)) return null;
  const reply = parseDriveMediaStreamReply(value);
  return reply ? { requestId: value.requestId, reply } : null;
}

export function parseDriveMediaStreamSessionRequest(value: unknown): DriveMediaStreamSessionRequest | null {
  if (
    !isObject(value)
    || value.kind !== 'drive-media-stream/session-request'
    || !isDriveMediaStreamId(value.streamId)
  ) {
    return null;
  }
  return { kind: value.kind, streamId: value.streamId };
}

export function parseDriveMediaStreamSessionReply(value: unknown): DriveMediaStreamSessionReply | null {
  if (!isObject(value) || typeof value.kind !== 'string') return null;
  if (value.kind === 'drive-media-stream/session-unavailable') return { kind: value.kind };
  if (value.kind !== 'drive-media-stream/session') return null;
  const session = parseDriveMediaStreamSession(value.session);
  return session ? { kind: value.kind, session } : null;
}
