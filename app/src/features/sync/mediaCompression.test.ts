import { describe, expect, it } from 'vitest';
import {
  IMAGE_COMPRESSION_MIN_BYTES,
  MIN_COMPRESSION_SAVINGS_RATIO,
  VIDEO_COMPRESSION_MAX_BYTES,
  VIDEO_COMPRESSION_MIN_BYTES,
  isCompressionWorthwhile,
  replaceMediaFileExtension,
  shouldCompressTimelineImage,
  shouldCompressTimelineVideo,
} from './mediaCompression';

function blobWithSize(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

describe('timeline media compression policy', () => {
  it('compresses large photographic images but leaves transparent or already efficient formats alone', () => {
    expect(shouldCompressTimelineImage(blobWithSize(IMAGE_COMPRESSION_MIN_BYTES, 'image/jpeg'))).toBe(true);
    expect(shouldCompressTimelineImage(blobWithSize(IMAGE_COMPRESSION_MIN_BYTES, 'image/heic'))).toBe(true);
    expect(shouldCompressTimelineImage(blobWithSize(IMAGE_COMPRESSION_MIN_BYTES - 1, 'image/jpeg'))).toBe(false);
    expect(shouldCompressTimelineImage(blobWithSize(IMAGE_COMPRESSION_MIN_BYTES * 2, 'image/png'))).toBe(false);
    expect(shouldCompressTimelineImage(blobWithSize(IMAGE_COMPRESSION_MIN_BYTES * 2, 'image/webp'))).toBe(false);
  });

  it('only transcodes videos inside the bounded in-memory conversion window', () => {
    expect(shouldCompressTimelineVideo(blobWithSize(VIDEO_COMPRESSION_MIN_BYTES, 'video/quicktime'))).toBe(true);
    expect(shouldCompressTimelineVideo(blobWithSize(VIDEO_COMPRESSION_MIN_BYTES - 1, 'video/mp4'))).toBe(false);
    expect(shouldCompressTimelineVideo(blobWithSize(VIDEO_COMPRESSION_MAX_BYTES, 'video/mp4'))).toBe(false);
    expect(shouldCompressTimelineVideo(blobWithSize(VIDEO_COMPRESSION_MIN_BYTES, 'application/octet-stream'))).toBe(false);
  });

  it('keeps compressed output only when it saves at least ten percent', () => {
    const originalSize = 10_000;
    expect(isCompressionWorthwhile(originalSize, originalSize * (1 - MIN_COMPRESSION_SAVINGS_RATIO))).toBe(true);
    expect(isCompressionWorthwhile(originalSize, 9_001)).toBe(false);
    expect(isCompressionWorthwhile(originalSize, 0)).toBe(false);
  });

  it('normalizes remote file extensions after transcoding', () => {
    expect(replaceMediaFileExtension('IMG_1234.HEIC', '.jpg')).toBe('IMG_1234.jpg');
    expect(replaceMediaFileExtension('clip.MOV', '.mp4')).toBe('clip.mp4');
    expect(replaceMediaFileExtension('family-video', '.mp4')).toBe('family-video.mp4');
    expect(replaceMediaFileExtension('.hidden', '.jpg')).toBe('.hidden.jpg');
  });
});
