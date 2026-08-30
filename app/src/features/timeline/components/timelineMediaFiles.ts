
import type { TimelineMediaItem } from '@/features/timeline/domain/types';
import { removeLocalMedia, setLocalMedia } from '@/data/localDb';
import { getMediaCompressionSettings } from '@/features/sync';

interface FaceDetectorResult {
  boundingBox: DOMRectReadOnly;
}

interface FaceDetectorInstance {
  detect: (source: HTMLImageElement) => Promise<FaceDetectorResult[]>;
}

type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorInstance;

const DEFAULT_FOCAL_POINT = { focalX: 50, focalY: 38 };
const MEBIBYTE = 1024 * 1024;
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', '3gp', 'mpeg', 'mpg']);
const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff']);

export type TimelineMediaReadPhase = 'preparing' | 'saving' | 'complete';

export interface TimelineMediaReadProgress {
  phase: TimelineMediaReadPhase;
  completedFiles: number;
  totalFiles: number;
  fileNumber: number;
  fileName: string;
  mediaType: TimelineMediaItem['type'];
}

interface ReadTimelineMediaFilesOptions {
  onProgress?: (progress: TimelineMediaReadProgress) => void;
}

export function detectTimelineMediaType(
  source: string,
  mimeType = '',
): TimelineMediaItem['type'] | null {
  const normalizedMime = mimeType.toLocaleLowerCase('en-US');
  if (normalizedMime.startsWith('video/')) return 'video';
  if (normalizedMime.startsWith('image/')) return 'photo';

  const cleanSource = source.split(/[?#]/, 1)[0].toLocaleLowerCase('en-US');
  const extension = cleanSource.match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (PHOTO_EXTENSIONS.has(extension)) return 'photo';
  return null;
}

async function detectPhotoFocalPoint(file: File): Promise<{ focalX: number; focalY: number }> {
  const FaceDetectorApi = (globalThis as typeof globalThis & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
  if (!FaceDetectorApi) return DEFAULT_FOCAL_POINT;

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const faces = await new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 8 }).detect(image);
    if (faces.length === 0 || image.naturalWidth <= 0 || image.naturalHeight <= 0) return DEFAULT_FOCAL_POINT;
    const bounds = faces.reduce((result, face) => ({
      left: Math.min(result.left, face.boundingBox.x),
      top: Math.min(result.top, face.boundingBox.y),
      right: Math.max(result.right, face.boundingBox.x + face.boundingBox.width),
      bottom: Math.max(result.bottom, face.boundingBox.y + face.boundingBox.height),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    return {
      focalX: Math.max(8, Math.min(92, ((bounds.left + bounds.right) / 2 / image.naturalWidth) * 100)),
      focalY: Math.max(8, Math.min(92, ((bounds.top + bounds.bottom) / 2 / image.naturalHeight) * 100)),
    };
  } catch {
    return DEFAULT_FOCAL_POINT;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readTimelineMediaFile(
  file: File,
  type: TimelineMediaItem['type'],
  onSaving: () => void,
): Promise<TimelineMediaItem> {
  const id = `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const focalPoint = type === 'photo' ? await detectPhotoFocalPoint(file) : {};
  onSaving();
  await setLocalMedia(id, file);
  return {
    id,
    blobId: id,
    type,
    name: file.name,
    ...focalPoint,
  };
}

export async function readTimelineMediaFiles(
  files?: Iterable<File> | null,
  options: ReadTimelineMediaFilesOptions = {},
): Promise<TimelineMediaItem[]> {
  const selectedFiles = files ? Array.from(files) : [];
  if (selectedFiles.length === 0) return [];
  const typedFiles = selectedFiles.map((file) => {
    const mediaType = detectTimelineMediaType(file.name, file.type);
    if (!mediaType) throw new Error('Chỉ hỗ trợ tệp ảnh hoặc video.');
    return { file, mediaType };
  });
  const inputLimits = getMediaCompressionSettings().maxInputSizeMb;
  const oversizedFiles = typedFiles.filter(({ file, mediaType }) => (
    file.size > inputLimits[mediaType] * MEBIBYTE
  ));
  if (oversizedFiles.length > 0) {
    const details = oversizedFiles.map(({ file, mediaType }) => (
      `${file.name} vượt giới hạn ${inputLimits[mediaType]} MB cho ${mediaType === 'photo' ? 'ảnh' : 'video'}`
    ));
    throw new Error(`${details.join('; ')}.`);
  }
  const mediaItems: TimelineMediaItem[] = [];
  try {
    for (const [index, { file, mediaType }] of typedFiles.entries()) {
      const progress = {
        completedFiles: index,
        totalFiles: typedFiles.length,
        fileNumber: index + 1,
        fileName: file.name,
        mediaType,
      };
      options.onProgress?.({ ...progress, phase: 'preparing' });
      const mediaItem = await readTimelineMediaFile(file, mediaType, () => {
        options.onProgress?.({ ...progress, phase: 'saving' });
      });
      mediaItems.push(mediaItem);
      options.onProgress?.({
        ...progress,
        phase: 'complete',
        completedFiles: index + 1,
      });
    }
    return mediaItems;
  } catch (error) {
    await removeTimelineMediaFiles(mediaItems);
    throw error;
  }
}

export async function removeTimelineMediaFiles(items: readonly TimelineMediaItem[]): Promise<void> {
  await Promise.all(items.flatMap((item) => item.blobId ? [removeLocalMedia(item.blobId)] : []));
  const driveFileIds = items.flatMap((item) => item.driveFileId ? [item.driveFileId] : []);
  if (driveFileIds.length === 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const { deleteTimelineMediaFromDrive } = await import('@/features/sync');
  await Promise.allSettled(driveFileIds.map((fileId) => deleteTimelineMediaFromDrive(fileId, { interactive: false })));
}
