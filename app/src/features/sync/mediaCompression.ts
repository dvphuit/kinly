import {
  getMediaCompressionSettings,
  type MediaCompressionKind,
  type MediaCompressionPreset,
} from './mediaCompressionSettings';

const MEBIBYTE = 1024 * 1024;

export const IMAGE_COMPRESSION_MIN_BYTES = MEBIBYTE;
export const VIDEO_COMPRESSION_MIN_BYTES = 8 * MEBIBYTE;
export const VIDEO_COMPRESSION_MAX_BYTES = 100 * MEBIBYTE;
export const MIN_COMPRESSION_SAVINGS_RATIO = 0.1;

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/heic',
  'image/heif',
]);

export type TimelineMediaCompressionKind = MediaCompressionKind;

export interface PreparedTimelineMedia {
  blob: Blob;
  name: string;
  compressed: boolean;
  originalSize: number;
}

interface PrepareTimelineMediaOptions {
  kind: TimelineMediaCompressionKind;
  name: string;
  onProgress?: (progress: number) => void;
}

interface CompressionWorkerRequest {
  blob: Blob;
  preset: MediaCompressionPreset;
}

type CompressionWorkerFactory = () => Worker;

type CompressionWorkerMessage =
  | { type: 'progress'; progress: number }
  | { type: 'result'; blob: Blob }
  | { type: 'error'; error: string };

function normalizedMimeType(blob: Blob): string {
  return blob.type.trim().toLowerCase();
}

export function shouldCompressTimelineImage(blob: Blob): boolean {
  return blob.size >= IMAGE_COMPRESSION_MIN_BYTES
    && COMPRESSIBLE_IMAGE_TYPES.has(normalizedMimeType(blob));
}

export function shouldCompressTimelineVideo(blob: Blob): boolean {
  const mimeType = normalizedMimeType(blob);
  return mimeType.startsWith('video/')
    && blob.size >= VIDEO_COMPRESSION_MIN_BYTES
    && blob.size < VIDEO_COMPRESSION_MAX_BYTES;
}

export function isCompressionWorthwhile(originalSize: number, compressedSize: number): boolean {
  if (originalSize <= 0 || compressedSize <= 0) return false;
  return compressedSize <= originalSize * (1 - MIN_COMPRESSION_SAVINGS_RATIO);
}

export function replaceMediaFileExtension(name: string, extension: '.jpg' | '.mp4'): string {
  const lastSlash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= lastSlash + 1) return `${name}${extension}`;
  return `${name.slice(0, lastDot)}${extension}`;
}

function isCompressionWorkerMessage(value: unknown): value is CompressionWorkerMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  if (value.type === 'progress') {
    return 'progress' in value && typeof value.progress === 'number' && Number.isFinite(value.progress);
  }
  if (value.type === 'result') {
    return 'blob' in value && value.blob instanceof Blob;
  }
  if (value.type === 'error') {
    return 'error' in value && typeof value.error === 'string';
  }
  return false;
}

function runCompressionWorker(
  createWorker: CompressionWorkerFactory,
  request: CompressionWorkerRequest,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch (error) {
      reject(error);
      return;
    }

    const finish = (callback: () => void) => {
      worker.terminate();
      callback();
    };

    worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!isCompressionWorkerMessage(message)) {
        finish(() => reject(new Error('Media compression worker returned an invalid response.')));
        return;
      }
      if (message.type === 'progress') {
        onProgress?.(Math.max(0, Math.min(100, Math.round(message.progress))));
        return;
      }
      if (message.type === 'error') {
        finish(() => reject(new Error(message.error)));
        return;
      }
      finish(() => resolve(message.blob));
    };
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'Media compression worker failed.')));
    };
    worker.postMessage(request);
  });
}

async function compressTimelineImage(
  blob: Blob,
  preset: MediaCompressionPreset,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  return runCompressionWorker(
    () => new Worker(new URL('./imageCompression.worker.ts', import.meta.url), {
      type: 'module',
      name: 'kinly-image-compression',
    }),
    { blob, preset },
    onProgress,
  );
}

async function compressTimelineVideo(
  blob: Blob,
  preset: MediaCompressionPreset,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  return runCompressionWorker(
    () => new Worker(new URL('./videoCompression.worker.ts', import.meta.url), {
      type: 'module',
      name: 'kinly-video-compression',
    }),
    { blob, preset },
    onProgress,
  );
}

export async function prepareTimelineMediaForDrive(
  blob: Blob,
  options: PrepareTimelineMediaOptions,
): Promise<PreparedTimelineMedia> {
  const original: PreparedTimelineMedia = {
    blob,
    name: options.name,
    compressed: false,
    originalSize: blob.size,
  };

  const shouldCompress = options.kind === 'photo'
    ? shouldCompressTimelineImage(blob)
    : shouldCompressTimelineVideo(blob);
  if (!shouldCompress) return original;

  const preset = getMediaCompressionSettings()[options.kind];
  try {
    options.onProgress?.(0);
    const compressedBlob = options.kind === 'photo'
      ? await compressTimelineImage(blob, preset, options.onProgress)
      : await compressTimelineVideo(blob, preset, options.onProgress);
    options.onProgress?.(100);

    if (!isCompressionWorthwhile(blob.size, compressedBlob.size)) return original;

    return {
      blob: compressedBlob,
      name: replaceMediaFileExtension(options.name, options.kind === 'photo' ? '.jpg' : '.mp4'),
      compressed: true,
      originalSize: blob.size,
    };
  } catch {
    return original;
  }
}
