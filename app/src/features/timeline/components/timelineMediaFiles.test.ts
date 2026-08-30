import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectTimelineMediaType, readTimelineMediaFiles } from './timelineMediaFiles';

const localMedia = vi.hoisted(() => ({
  setLocalMedia: vi.fn(),
  removeLocalMedia: vi.fn(),
}));

vi.mock('@/data/localDb', () => localMedia);

describe('timelineMediaFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMedia.setLocalMedia.mockResolvedValue(undefined);
    localMedia.removeLocalMedia.mockResolvedValue(undefined);
  });

  it('persists the original file as a blob and returns only its local id', async () => {
    const file = new File(['image-bytes'], 'baby.jpg', { type: 'image/jpeg' });
    const files = { 0: file, length: 1, item: () => file, [Symbol.iterator]: function* iterator() { yield file; } } as unknown as FileList;

    const [media] = await readTimelineMediaFiles(files);

    expect(localMedia.setLocalMedia).toHaveBeenCalledWith(media.blobId, file);
    expect(media).toMatchObject({ blobId: media.id, type: 'photo', name: 'baby.jpg', focalX: 50, focalY: 38 });
    expect(media.url).toBeUndefined();
  });

  it('stores large media without an application-level size cap', async () => {
    const file = new File([new Uint8Array(16 * 1024 * 1024)], 'large.mp4', { type: 'video/mp4' });
    const files = { 0: file, length: 1, item: () => file, [Symbol.iterator]: function* iterator() { yield file; } } as unknown as FileList;

    const [media] = await readTimelineMediaFiles(files);

    expect(localMedia.setLocalMedia).toHaveBeenCalledWith(media.blobId, file);
    expect(media.type).toBe('video');
  });

  it('keeps every selected file when the live input FileList is cleared during async reads', async () => {
    const first = new File(['one'], 'one.jpg', { type: 'image/jpeg' });
    const second = new File(['two'], 'two.mp4', { type: 'video/mp4' });
    const selectedFiles = [first, second];
    const liveFiles: Iterable<File> = {
      [Symbol.iterator]: () => selectedFiles.values(),
    };
    localMedia.setLocalMedia.mockImplementation(async () => {
      selectedFiles.length = 0;
    });

    const media = await readTimelineMediaFiles(liveFiles);

    expect(media).toHaveLength(2);
    expect(media.map((item) => item.name)).toEqual(['one.jpg', 'two.mp4']);
    expect(localMedia.setLocalMedia).toHaveBeenCalledTimes(2);
  });

  it('reports preparation and local-save progress for every selected media item', async () => {
    const onProgress = vi.fn();
    const files = [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['two'], 'two.mp4', { type: 'video/mp4' }),
    ];

    await readTimelineMediaFiles(files, { onProgress });

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      {
        phase: 'preparing', completedFiles: 0, totalFiles: 2, fileNumber: 1,
        fileName: 'one.jpg', mediaType: 'photo',
      },
      {
        phase: 'saving', completedFiles: 0, totalFiles: 2, fileNumber: 1,
        fileName: 'one.jpg', mediaType: 'photo',
      },
      {
        phase: 'complete', completedFiles: 1, totalFiles: 2, fileNumber: 1,
        fileName: 'one.jpg', mediaType: 'photo',
      },
      {
        phase: 'preparing', completedFiles: 1, totalFiles: 2, fileNumber: 2,
        fileName: 'two.mp4', mediaType: 'video',
      },
      {
        phase: 'saving', completedFiles: 1, totalFiles: 2, fileNumber: 2,
        fileName: 'two.mp4', mediaType: 'video',
      },
      {
        phase: 'complete', completedFiles: 2, totalFiles: 2, fileNumber: 2,
        fileName: 'two.mp4', mediaType: 'video',
      },
    ]);
  });

  it('detects photo and video types from MIME values or file extensions', () => {
    expect(detectTimelineMediaType('gallery-item', 'image/heic')).toBe('photo');
    expect(detectTimelineMediaType('gallery-item', 'video/quicktime')).toBe('video');
    expect(detectTimelineMediaType('https://example.com/photo.webp?size=large')).toBe('photo');
    expect(detectTimelineMediaType('https://example.com/clip.MOV#preview')).toBe('video');
  });
});
