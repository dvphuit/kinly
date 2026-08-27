import type { DriveMediaStreamSession } from '@/features/sync/driveMediaStreamProtocol';

const FORWARDED_RESPONSE_HEADERS = [
  'Accept-Ranges',
  'Content-Length',
  'Content-Range',
  'Content-Type',
  'ETag',
  'Last-Modified',
] as const;

interface DriveMediaStreamRegistryOptions {
  fetch: typeof fetch;
  now?: () => number;
}

export interface DriveMediaStreamRegistry {
  register: (session: DriveMediaStreamSession) => void;
  unregister: (streamId: string) => void;
  respond: (request: Request, streamId: string) => Promise<Response>;
}

function errorResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function forwardedResponse(upstream: Response): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function validSingleRange(value: string): boolean {
  return /^bytes=(?:\d+-\d*|\d*-\d+)$/.test(value);
}

export function createDriveMediaStreamRegistry({
  fetch: fetchUpstream,
  now = Date.now,
}: DriveMediaStreamRegistryOptions): DriveMediaStreamRegistry {
  const sessions = new Map<string, DriveMediaStreamSession>();

  return {
    register(session) {
      for (const [streamId, current] of sessions) {
        if (current.expiresAt <= now()) sessions.delete(streamId);
      }
      sessions.set(session.streamId, session);
    },
    unregister(streamId) {
      sessions.delete(streamId);
    },
    async respond(request, streamId) {
      const session = sessions.get(streamId);
      if (!session) return errorResponse(404, 'Stream không tồn tại hoặc đã đóng.');
      if (session.expiresAt <= now()) {
        sessions.delete(streamId);
        return errorResponse(401, 'Phiên Google Drive đã hết hạn.');
      }

      const range = request.headers.get('Range');
      if (range && !validSingleRange(range)) return errorResponse(416, 'Khoảng byte không hợp lệ.');
      const headers = new Headers({ Authorization: `Bearer ${session.accessToken}` });
      if (range) headers.set('Range', range);

      let upstream: Response;
      try {
        upstream = await fetchUpstream(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(session.fileId)}?alt=media`,
          { headers, signal: request.signal },
        );
      } catch {
        return errorResponse(502, 'Không thể kết nối Google Drive.');
      }
      if (upstream.status === 401) sessions.delete(streamId);
      return forwardedResponse(upstream);
    },
  };
}
