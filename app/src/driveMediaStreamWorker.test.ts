import { describe, expect, it, vi } from 'vitest';
import { createDriveMediaStreamRegistry } from './driveMediaStreamWorker';

const STREAM_ID = '01234567-89ab-4cde-8fab-0123456789ab';

describe('Drive media stream service worker registry', () => {
  it('forwards native video byte ranges with OAuth and preserves partial response headers', async () => {
    let received: { url: string; authorization: string | null; range: string | null } | null = null;
    const fetchUpstream: typeof fetch = vi.fn(async (input, init) => {
      const headers = new Headers(init?.headers);
      received = {
        url: input instanceof Request ? input.url : String(input),
        authorization: headers.get('Authorization'),
        range: headers.get('Range'),
      };
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': '3',
          'Content-Range': 'bytes 0-2/1000',
          'Content-Type': 'video/mp4',
        },
      });
    });
    const registry = createDriveMediaStreamRegistry({ fetch: fetchUpstream, now: () => 1_000 });
    registry.register({
      streamId: STREAM_ID,
      fileId: 'drive/video 1',
      accessToken: 'secret-google-token',
      expiresAt: 2_000,
    });

    const response = await registry.respond(new Request(
      `https://kinly.test/__kinly/drive-media/${STREAM_ID}`,
      { headers: { Range: 'bytes=0-2' } },
    ), STREAM_ID);

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 0-2/1000');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(received).toEqual({
      url: 'https://www.googleapis.com/drive/v3/files/drive%2Fvideo%201?alt=media',
      authorization: 'Bearer secret-google-token',
      range: 'bytes=0-2',
    });
  });

  it('rejects expired or unregistered stream sessions without contacting Drive', async () => {
    const fetchUpstream: typeof fetch = vi.fn();
    const registry = createDriveMediaStreamRegistry({ fetch: fetchUpstream, now: () => 2_000 });
    registry.register({
      streamId: STREAM_ID,
      fileId: 'drive-video',
      accessToken: 'expired-token',
      expiresAt: 2_000,
    });
    const request = new Request(`https://kinly.test/__kinly/drive-media/${STREAM_ID}`);

    expect((await registry.respond(request, STREAM_ID)).status).toBe(401);
    expect((await registry.respond(request, STREAM_ID)).status).toBe(404);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
});
