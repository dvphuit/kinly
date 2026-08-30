import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setMediaInputSizeLimitMb } from '@/features/sync';
import { detectTimelineMediaType, readTimelineMediaFiles } from './timelineMediaFiles';

const localMedia = vi.hoisted(() => ({
  setLocalMedia: vi.fn(),
  removeLocalMedia: vi.fn(),
}));

vi.mock('@/data/localDb', () => localMedia);

class SizedFile extends File {
  private readonly mockedSize: number;

  constructor(name: string, type: string, mockedSize: number) {
    super([], name, { type });
    this.mockedSize = mockedSize;
  }

  override get size(): number {
    return this.mockedSize;
  }
}

describe('timelineMediaFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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

  it('stores media that is within the configured input size limit', async () => {
    setMediaInputSizeLimitMb('video', 20);
    const file = new SizedFile('large.mp4', 'video/mp4', 16 * 1024 * 1024);

    const [media] = await readTimelineMediaFiles([file]);

    expect(localMedia.setLocalMedia).toHaveBeenCalledWith(media.blobId, file);
    expect(media.type).toBe('video');
  });

  it('rejects the whole selection before saving when a file exceeds its media limit', async () => {
    setMediaInputSizeLimitMb('photo', 1);
    setMediaInputSizeLimitMb('video', 10);
    const valid = new SizedFile('small.jpg', 'image/jpeg', 512 * 1024);
    const largePhoto = new SizedFile('family.jpg', 'image/jpeg', 2 * 1024 * 1024);
    const largeVideo = new SizedFile('memory.mp4', 'video/mp4', 12 * 1024 * 1024);

    await expect(readTimelineMediaFiles([valid, largePhoto, largeVideo])).rejects.toThrow(
      'family.jpg vượt giới hạn 1 MB cho ảnh; memory.mp4 vượt giới hạn 10 MB cho video.',
    );
    expect(localMedia.setLocalMedia).not.toHaveBeenCalled();
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
