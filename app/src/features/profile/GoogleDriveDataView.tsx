import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCopy, Cloud, Image as ImageIcon,
  Play, RefreshCw, ShieldCheck, Smartphone, Terminal, Trash2, Video,
} from 'lucide-react';
import { AppBar } from '@/shared/ui/AppBar';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { HavenDialog } from '@/shared/ui/HavenDialog';
import {
  checkDriveBackup,
  createTimelineVideoStreamUrlFromDrive,
  deleteTimelineMediaFromDrive,
  downloadTimelineMediaFromDrive,
  downloadTimelineMediaThumbnailFromDrive,
  getLastSyncedAt,
  isGoogleLinked,
  isGoogleSessionActive,
  listTimelineMediaFromDrive,
  requestGoogleAccessToken,
  releaseTimelineVideoStreamUrlFromDrive,
  subscribeSyncState,
  SYNC_KEYS,
  type DriveBackupSummary,
  type DriveTimelineMediaFile,
} from '@/features/sync';
import {
  getAllLocalRecords,
  listLocalMedia,
  removeLocalMedia,
  waitForLocalRecordWrites,
  type LocalMediaRecord,
} from '@/data/localDb';
import {
  clearDiagnosticLogs,
  formatDiagnosticLogs,
  getDiagnosticLogs,
  logDiagnostic,
  subscribeDiagnosticLogs,
  type DiagnosticLogEntry,
} from '@/app/diagnostics/diagnosticLog';
import type { TimelineMediaItem } from '@/features/timeline';
import {
  MomentMediaPreview,
  type MomentMediaPreviewState,
} from '@/features/timeline/components/MomentMediaPreview';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import './data-management.css';

interface GoogleDriveDataViewProps {
  onOpenLightbox: (src: string, isVideo?: boolean) => void;
  onShowToast?: (message: string, icon?: string) => void;
}

type DataSegment = 'device' | 'drive';

type DriveMediaPreviewEvent =
  | { kind: 'open'; file: DriveTimelineMediaFile; previewSrc: string | null }
  | { kind: 'progress'; fileId: string; progress: number }
  | { kind: 'download-ready'; fileId: string; src: string }
  | { kind: 'stream-ready'; fileId: string; src: string }
  | { kind: 'playable'; fileId: string }
  | { kind: 'error'; fileId: string; message: string };

type DriveMediaDownloadOutcome =
  | { kind: 'ready'; src: string }
  | { kind: 'failed'; error: unknown };

const VIDEO_STREAM_FALLBACK_DELAY_MS = 1_500;
const VIDEO_STREAM_PROBE_TIMEOUT_MS = 4_000;

interface DataOverviewMetric {
  label: string;
  value: string;
}

interface DataOverviewCardProps {
  tone: DataSegment;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  status: string;
  detail: string;
  progress: number;
  progressLabel: string;
  progressAriaLabel: string;
  metrics: readonly DataOverviewMetric[];
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Không rõ dung lượng';
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** unitIndex;
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function getTextSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isMediaBackedUp(mediaItems?: TimelineMediaItem[]): boolean {
  if (!mediaItems || mediaItems.length === 0) return false;
  return mediaItems.every((media) => Boolean(media.driveFileId));
}

function formatDate(value?: string): string {
  if (!value) return 'Chưa rõ thời gian';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa rõ thời gian';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatLogTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}

function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError';
}

function drivePreviewLayoutId(fileId: string): string {
  return `drive-data-preview-${fileId}`;
}

async function verifyVideoStreamUrl(streamUrl: string): Promise<boolean> {
  try {
    if (new URL(streamUrl, window.location.origin).origin !== window.location.origin) return true;
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), VIDEO_STREAM_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(streamUrl, {
      cache: 'no-store',
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
    });
    const contentRange = response.headers.get('Content-Range');
    const supportsByteRanges = response.status === 206
      && contentRange !== null
      && /^bytes 0-0\/(?:\d+|\*)$/i.test(contentRange);
    await response.body?.cancel().catch(() => undefined);
    return supportsByteRanges;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function DataOverviewCard({
  tone,
  icon,
  eyebrow,
  title,
  status,
  detail,
  progress,
  progressLabel,
  progressAriaLabel,
  metrics,
}: DataOverviewCardProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <section
      className={`drive-overview-card is-${tone} ${safeProgress === 100 ? 'is-complete' : 'needs-attention'}`}
      aria-labelledby={`${tone}-overview-title`}
    >
      <span className="drive-overview-orb drive-overview-orb-one" aria-hidden="true" />
      <span className="drive-overview-orb drive-overview-orb-two" aria-hidden="true" />
      <div className="drive-overview-header">
        <span className="drive-overview-icon" aria-hidden="true">{icon}</span>
        <div className="drive-overview-heading">
          <span>{eyebrow}</span>
          <h2 id={`${tone}-overview-title`}>{title}</h2>
        </div>
        <span className="drive-overview-status">{status}</span>
      </div>

      <div className="drive-overview-primary">
        <div>
          <span>TRẠNG THÁI SAO LƯU</span>
          <strong>{progressLabel}</strong>
        </div>
        <strong className="drive-overview-percent">{safeProgress}<span>%</span></strong>
      </div>
      <div
        className="drive-overview-track"
        role="progressbar"
        aria-label={progressAriaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeProgress}
      >
        <i style={{ width: `${safeProgress}%` }} />
      </div>
      <p className="drive-overview-detail"><ShieldCheck size={13} /> {detail}</p>

      <div className="drive-overview-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DriveMediaTile({
  file,
  linkedTitle,
  localBlob,
  preloadFullImage,
  onPreviewEvent,
  onDelete,
}: {
  file: DriveTimelineMediaFile;
  linkedTitle?: string;
  localBlob?: Blob;
  preloadFullImage: boolean;
  onPreviewEvent: (event: DriveMediaPreviewEvent) => void;
  onDelete: () => void;
}) {
  const isVideo = file.mimeType.startsWith('video/');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const mounted = useRef(false);
  const mediaObjectUrl = useRef<string | null>(null);
  const thumbnailObjectUrl = useRef<string | null>(null);
  const mediaLoad = useRef<Promise<string | null> | null>(null);
  const mediaController = useRef<AbortController | null>(null);
  const streamFallbackTimer = useRef<number | null>(null);
  const openSequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      openSequence.current += 1;
      if (streamFallbackTimer.current !== null) window.clearTimeout(streamFallbackTimer.current);
      mediaController.current?.abort();
      if (mediaObjectUrl.current) URL.revokeObjectURL(mediaObjectUrl.current);
      if (thumbnailObjectUrl.current) URL.revokeObjectURL(thumbnailObjectUrl.current);
    };
  }, []);

  useEffect(() => {
    if (!localBlob || mediaObjectUrl.current) return;
    mediaController.current?.abort();
    const nextUrl = URL.createObjectURL(localBlob);
    mediaObjectUrl.current = nextUrl;
    if (!isVideo) setThumbnailUrl(nextUrl);
  }, [isVideo, localBlob]);

  useEffect(() => {
    if (!file.thumbnailLink) return undefined;
    const controller = new AbortController();
    void downloadTimelineMediaThumbnailFromDrive(file.thumbnailLink, {
      interactive: false,
      signal: controller.signal,
    }).then((blob) => {
      if (!mounted.current || controller.signal.aborted || mediaObjectUrl.current) return;
      const nextUrl = URL.createObjectURL(blob);
      thumbnailObjectUrl.current = nextUrl;
      setThumbnailUrl(nextUrl);
    }).catch((thumbnailError) => {
      if (isAbortError(thumbnailError)) return;
      logDiagnostic('drive-ui', 'info', 'Drive media thumbnail unavailable', { fileId: file.id });
    });
    return () => controller.abort();
  }, [file.id, file.thumbnailLink]);

  const loadFullMedia = useCallback((options: {
    interactive: boolean;
    onProgress?: (progress: number) => void;
  }): Promise<string | null> => {
    if (mediaObjectUrl.current) return Promise.resolve(mediaObjectUrl.current);
    if (mediaLoad.current) return mediaLoad.current;

    const controller = new AbortController();
    mediaController.current = controller;
    const pending = downloadTimelineMediaFromDrive(file.id, {
      interactive: options.interactive,
      signal: controller.signal,
      onProgress: options.onProgress,
    })
      .then((blob) => {
        if (!mounted.current || controller.signal.aborted) return null;
        if (mediaObjectUrl.current) return mediaObjectUrl.current;
        const nextUrl = URL.createObjectURL(blob);
        mediaObjectUrl.current = nextUrl;
        if (!isVideo) {
          if (thumbnailObjectUrl.current) {
            URL.revokeObjectURL(thumbnailObjectUrl.current);
            thumbnailObjectUrl.current = null;
          }
          setThumbnailUrl(nextUrl);
        }
        return nextUrl;
      })
      .finally(() => {
        if (mediaController.current === controller) mediaController.current = null;
        if (mediaLoad.current === pending) mediaLoad.current = null;
      });
    mediaLoad.current = pending;
    return pending;
  }, [file.id, isVideo]);

  useEffect(() => {
    if (!preloadFullImage || isVideo) return;
    void loadFullMedia({ interactive: false }).catch(() => undefined);
  }, [isVideo, loadFullMedia, preloadFullImage]);

  const openMedia = async () => {
    const sequence = openSequence.current + 1;
    openSequence.current = sequence;
    if (streamFallbackTimer.current !== null) {
      window.clearTimeout(streamFallbackTimer.current);
      streamFallbackTimer.current = null;
    }
    const isCurrentOpen = () => mounted.current && openSequence.current === sequence;
    onPreviewEvent({
      kind: 'open',
      file,
      previewSrc: thumbnailUrl || file.thumbnailLink || null,
    });

    let fallbackDownload: Promise<DriveMediaDownloadOutcome> | null = null;
    const startFallbackDownload = (): Promise<DriveMediaDownloadOutcome> => {
      if (fallbackDownload) return fallbackDownload;
      fallbackDownload = loadFullMedia({
        interactive: true,
        onProgress: (progress) => {
          if (isCurrentOpen()) onPreviewEvent({ kind: 'progress', fileId: file.id, progress });
        },
      }).then((mediaUrl): DriveMediaDownloadOutcome => {
        if (!mediaUrl) return { kind: 'failed', error: new Error('Không thể tải media từ Google Drive.') };
        if (isCurrentOpen()) onPreviewEvent({ kind: 'download-ready', fileId: file.id, src: mediaUrl });
        return { kind: 'ready', src: mediaUrl };
      }).catch((downloadError): DriveMediaDownloadOutcome => ({ kind: 'failed', error: downloadError }));
      return fallbackDownload;
    };

    const reportFallbackFailure = (outcome: DriveMediaDownloadOutcome, streamError?: unknown) => {
      if (outcome.kind !== 'failed' || !isCurrentOpen()) return;
      const failure = !isAbortError(outcome.error) ? outcome.error : streamError;
      if (isAbortError(failure)) return;
      onPreviewEvent({
        kind: 'error',
        fileId: file.id,
        message: failure instanceof Error ? failure.message : 'Không thể mở media từ Google Drive.',
      });
    };

    if (!isVideo || mediaObjectUrl.current) {
      reportFallbackFailure(await startFallbackDownload());
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      if (streamFallbackTimer.current === fallbackTimer) streamFallbackTimer.current = null;
      void startFallbackDownload();
    }, VIDEO_STREAM_FALLBACK_DELAY_MS);
    streamFallbackTimer.current = fallbackTimer;

    const clearFallbackTimer = () => {
      window.clearTimeout(fallbackTimer);
      if (streamFallbackTimer.current === fallbackTimer) streamFallbackTimer.current = null;
    };

    try {
      const streamUrl = await createTimelineVideoStreamUrlFromDrive(file.id, { interactive: true });
      if (!isCurrentOpen()) {
        clearFallbackTimer();
        if (streamUrl) void releaseTimelineVideoStreamUrlFromDrive(streamUrl);
        return;
      }

      if (mediaObjectUrl.current) {
        clearFallbackTimer();
        if (streamUrl) void releaseTimelineVideoStreamUrlFromDrive(streamUrl);
        return;
      }

      const streamSupported = streamUrl ? await verifyVideoStreamUrl(streamUrl) : false;
      if (!isCurrentOpen()) {
        clearFallbackTimer();
        if (streamUrl) void releaseTimelineVideoStreamUrlFromDrive(streamUrl);
        return;
      }
      if (mediaObjectUrl.current) {
        clearFallbackTimer();
        if (streamUrl) void releaseTimelineVideoStreamUrlFromDrive(streamUrl);
        return;
      }
      if (streamUrl && streamSupported) {
        clearFallbackTimer();
        mediaController.current?.abort();
        onPreviewEvent({ kind: 'stream-ready', fileId: file.id, src: streamUrl });
        return;
      }

      if (streamUrl) {
        logDiagnostic('drive-ui', 'info', 'Drive video stream probe failed; using authenticated download', {
          fileId: file.id,
        });
        void releaseTimelineVideoStreamUrlFromDrive(streamUrl);
      }

      clearFallbackTimer();
      reportFallbackFailure(await startFallbackDownload());
    } catch (streamError) {
      clearFallbackTimer();
      logDiagnostic('drive-ui', 'info', 'Drive video streaming unavailable; using authenticated download', {
        fileId: file.id,
      });
      reportFallbackFailure(await startFallbackDownload(), streamError);
    }
  };

  return (
    <article className="drive-media-card">
      <button
        type="button"
        className="drive-media-preview"
        onClick={() => void openMedia()}
        onPointerEnter={() => { if (!isVideo) void loadFullMedia({ interactive: false }).catch(() => undefined); }}
        onPointerDown={() => { if (!isVideo) void loadFullMedia({ interactive: false }).catch(() => undefined); }}
        onFocus={() => { if (!isVideo) void loadFullMedia({ interactive: false }).catch(() => undefined); }}
        aria-label={`Xem ${isVideo ? 'video' : 'ảnh'} ${file.name}`}
      >
        <span className="drive-media-placeholder" aria-hidden="true">{isVideo ? <Video size={22} /> : <ImageIcon size={22} />}</span>
        {(thumbnailUrl || file.thumbnailLink) && (
          <img
            key={thumbnailUrl || file.thumbnailLink}
            src={thumbnailUrl || file.thumbnailLink}
            alt=""
            loading={preloadFullImage ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={preloadFullImage ? 'high' : 'auto'}
            onError={(event) => { event.currentTarget.hidden = true; }}
          />
        )}
        {isVideo && <span className="drive-media-play" aria-hidden="true"><Play size={15} fill="currentColor" /></span>}
      </button>
      <div className="drive-media-info">
        <strong title={file.name}>{file.name}</strong>
        <div className="drive-media-meta-row">
          <span className="drive-media-size">{formatBytes(file.size)}</span>
        </div>
        <small>{linkedTitle ? `Đang dùng trong “${linkedTitle}”` : formatDate(file.modifiedTime || file.createdTime)}</small>
      </div>
      <button type="button" className="drive-media-delete" onClick={onDelete} aria-label={`Xóa ${file.name} khỏi Google Drive`}>
        <Trash2 size={15} />
      </button>
    </article>
  );
}

function LocalMediaTile({
  record,
  linkedTitle,
  linkedMedia,
  onOpen,
  onDelete,
}: {
  record: LocalMediaRecord;
  linkedTitle?: string;
  linkedMedia?: TimelineMediaItem[];
  onOpen: (src: string, isVideo: boolean) => void;
  onDelete: () => void;
}) {
  const metadata = linkedMedia?.[0];
  const isVideo = record.mimeType.startsWith('video/') || metadata?.type === 'video';
  const backedUp = isMediaBackedUp(linkedMedia);
  const name = metadata?.name || `${isVideo ? 'Video' : 'Ảnh'} ${record.id.slice(-8)}`;
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    const nextObjectUrl = URL.createObjectURL(record.blob);
    setObjectUrl(nextObjectUrl);
    return () => URL.revokeObjectURL(nextObjectUrl);
  }, [record.blob]);

  return (
    <article className="drive-media-card local-media-card">
      <button
        type="button"
        className="drive-media-preview"
        onClick={() => objectUrl && onOpen(objectUrl, isVideo)}
        aria-label={`Xem ${isVideo ? 'video' : 'ảnh'} local ${name}`}
      >
        <span className="drive-media-placeholder" aria-hidden="true">{isVideo ? <Video size={22} /> : <ImageIcon size={22} />}</span>
        {objectUrl && (isVideo
          ? <video src={objectUrl} muted preload="metadata" />
          : <img src={objectUrl} alt="" loading="lazy" />)}
        {isVideo && <span className="drive-media-play" aria-hidden="true"><Play size={15} fill="currentColor" /></span>}
      </button>
      <div className="drive-media-info">
        <strong title={name}>{name}</strong>
        <div className="drive-media-meta-row">
          <span className={`drive-media-state ${backedUp ? 'is-backed-up' : 'is-local-only'}`}>
            {backedUp ? <><CheckCircle2 size={10} /> Đã backup</> : <><Smartphone size={10} /> Chỉ trên máy</>}
          </span>
          <span>{formatBytes(record.size)}</span>
        </div>
        <small>{linkedTitle ? `Trong “${linkedTitle}”` : 'Không còn liên kết trong nhật ký'}</small>
      </div>
      <button type="button" className="drive-media-delete" onClick={onDelete} aria-label={`Xóa bản local ${name}`}>
        <Trash2 size={15} />
      </button>
    </article>
  );
}

export function GoogleDriveDataView({ onOpenLightbox, onShowToast }: GoogleDriveDataViewProps) {
  const navigate = useNavigate();
  const timelineItems = useTimelineStore((state) => state.timelineItems);
  const [activeSegment, setActiveSegment] = useState<DataSegment>('device');
  const [linked, setLinked] = useState(isGoogleLinked());
  const [sessionActive, setSessionActive] = useState(isGoogleSessionActive());
  const [files, setFiles] = useState<DriveTimelineMediaFile[]>([]);
  const [backup, setBackup] = useState<DriveBackupSummary | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DriveTimelineMediaFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [localFiles, setLocalFiles] = useState<LocalMediaRecord[]>([]);
  const [localRecordCount, setLocalRecordCount] = useState(0);
  const [localRecordSize, setLocalRecordSize] = useState(0);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate>({});
  const [localLoading, setLocalLoading] = useState(true);
  const [localDeleteTarget, setLocalDeleteTarget] = useState<LocalMediaRecord | null>(null);
  const [localDeleting, setLocalDeleting] = useState(false);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [debugSheetOpen, setDebugSheetOpen] = useState(false);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>(getDiagnosticLogs);
  const [drivePreview, setDrivePreview] = useState<MomentMediaPreviewState | null>(null);
  const driveLoadSequence = useRef(0);
  const drivePreviewFileId = useRef<string | null>(null);
  const driveStreamUrl = useRef<string | null>(null);

  useEffect(() => subscribeDiagnosticLogs(setLogs), []);
  useEffect(() => subscribeSyncState(() => {
    setLinked(isGoogleLinked());
    setSessionActive(isGoogleSessionActive());
  }), []);
  useEffect(() => () => {
    driveLoadSequence.current += 1;
  }, []);

  const releaseActiveDriveStream = useCallback(() => {
    const streamUrl = driveStreamUrl.current;
    driveStreamUrl.current = null;
    if (streamUrl) void releaseTimelineVideoStreamUrlFromDrive(streamUrl);
  }, []);

  useEffect(() => () => releaseActiveDriveStream(), [releaseActiveDriveStream]);

  const handleDrivePreviewEvent = useCallback((event: DriveMediaPreviewEvent) => {
    switch (event.kind) {
      case 'open': {
        drivePreviewFileId.current = event.file.id;
        releaseActiveDriveStream();
        const isVideo = event.file.mimeType.startsWith('video/');
        setDrivePreview({
          items: [{ id: event.file.id, type: isVideo ? 'video' : 'photo', name: event.file.name }],
          initialIndex: 0,
          title: event.file.name,
          layoutId: drivePreviewLayoutId(event.file.id),
          originSrc: event.previewSrc ?? '',
          loading: { kind: 'indeterminate', previewSrc: event.previewSrc },
        });
        return;
      }
      case 'progress':
        setDrivePreview((current) => {
          if (!current?.loading || current.layoutId !== drivePreviewLayoutId(event.fileId)) return current;
          return {
            ...current,
            loading: {
              kind: 'determinate',
              previewSrc: current.loading.previewSrc,
              progress: event.progress,
            },
          };
        });
        return;
      case 'download-ready':
        setDrivePreview((current) => {
          if (!current || current.layoutId !== drivePreviewLayoutId(event.fileId)) return current;
          return {
            ...current,
            items: current.items.map((media, index) => index === 0 ? { ...media, url: event.src } : media),
            loading: undefined,
          };
        });
        return;
      case 'stream-ready':
        if (drivePreviewFileId.current !== event.fileId) {
          void releaseTimelineVideoStreamUrlFromDrive(event.src);
          return;
        }
        releaseActiveDriveStream();
        driveStreamUrl.current = event.src;
        setDrivePreview((current) => {
          if (!current || current.layoutId !== drivePreviewLayoutId(event.fileId)) return current;
          return {
            ...current,
            items: current.items.map((media, index) => index === 0 ? { ...media, url: event.src } : media),
            loading: { kind: 'stream', previewSrc: current.loading?.previewSrc ?? null },
          };
        });
        return;
      case 'playable':
        setDrivePreview((current) => {
          if (current?.layoutId !== drivePreviewLayoutId(event.fileId) || current.loading?.kind !== 'stream') return current;
          return { ...current, loading: undefined };
        });
        return;
      case 'error':
        drivePreviewFileId.current = null;
        releaseActiveDriveStream();
        setDrivePreview((current) => {
          if (!current || current.layoutId !== drivePreviewLayoutId(event.fileId)) return current;
          return {
            ...current,
            loading: {
              kind: 'error',
              previewSrc: current.loading?.previewSrc ?? null,
              message: event.message,
            },
          };
        });
        return;
      default: {
        const exhaustiveEvent: never = event;
        return exhaustiveEvent;
      }
    }
  }, [releaseActiveDriveStream]);

  const closeDrivePreview = useCallback(() => {
    drivePreviewFileId.current = null;
    releaseActiveDriveStream();
    setDrivePreview(null);
  }, [releaseActiveDriveStream]);

  const linkedMedia = useMemo(() => {
    const result = new Map<string, { title: string; media: TimelineMediaItem[] }>();
    timelineItems.forEach((item) => {
      (item.mediaItems ?? []).forEach((media) => {
        if (!media.driveFileId) return;
        const current = result.get(media.driveFileId);
        result.set(media.driveFileId, {
          title: current?.title ?? item.title,
          media: [...(current?.media ?? []), media],
        });
      });
    });
    return result;
  }, [timelineItems]);

  const linkedLocalMedia = useMemo(() => {
    const result = new Map<string, { title: string; media: TimelineMediaItem[] }>();
    timelineItems.forEach((item) => {
      (item.mediaItems ?? []).forEach((media) => {
        if (!media.blobId) return;
        const current = result.get(media.blobId);
        result.set(media.blobId, {
          title: current?.title ?? item.title,
          media: [...(current?.media ?? []), media],
        });
      });
    });
    return result;
  }, [timelineItems]);
  const localFilesById = useMemo(() => new Map(localFiles.map((file) => [file.id, file])), [localFiles]);
  const preloadImageIds = useMemo(() => new Set(
    files
      .filter((file) => !file.mimeType.startsWith('video/'))
      .slice(0, 2)
      .map((file) => file.id),
  ), [files]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const videoCount = useMemo(() => files.filter((file) => file.mimeType.startsWith('video/')).length, [files]);
  const localMediaSize = useMemo(() => localFiles.reduce((sum, file) => sum + file.size, 0), [localFiles]);
  const localAppSize = localRecordSize + localMediaSize;
  const backedUpLocalFiles = useMemo(() => localFiles.filter((file) => (
    isMediaBackedUp(linkedLocalMedia.get(file.id)?.media)
  )), [linkedLocalMedia, localFiles]);
  const backupProgress = localFiles.length === 0
    ? 100
    : (backedUpLocalFiles.length / localFiles.length) * 100;
  const pendingBackupCount = Math.max(0, localFiles.length - backedUpLocalFiles.length);
  const backupProgressLabel = localFiles.length === 0
    ? 'Không có media chờ backup'
    : `${backedUpLocalFiles.length}/${localFiles.length} media đã backup`;

  const loadLocalData = useCallback(async () => {
    logDiagnostic('local-data', 'info', 'Local data refresh started');
    setLocalLoading(true);
    try {
      const recordKeys = [...SYNC_KEYS, 'babygrowth_v4_sync_meta'];
      const [nextFiles, records, nextStorageEstimate] = await Promise.all([
        listLocalMedia(),
        getAllLocalRecords(recordKeys),
        navigator.storage?.estimate?.() ?? Promise.resolve({}),
      ]);
      setLocalFiles(nextFiles);
      setLocalRecordCount(Object.keys(records).length);
      setLocalRecordSize(Object.values(records).reduce((sum, value) => sum + getTextSize(value), 0));
      setStorageEstimate(nextStorageEstimate);
      logDiagnostic('local-data', 'info', 'Local data refresh completed', {
        mediaCount: nextFiles.length,
        mediaBytes: nextFiles.reduce((sum, file) => sum + file.size, 0),
        recordCount: Object.keys(records).length,
      });
    } catch (loadError) {
      logDiagnostic('local-data', 'error', 'Local data refresh failed', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Không thể đọc dữ liệu trên thiết bị.');
    } finally {
      setLocalLoading(false);
    }
  }, []);

  const loadDriveData = useCallback(async () => {
    const requestSequence = driveLoadSequence.current + 1;
    driveLoadSequence.current = requestSequence;
    logDiagnostic('drive-ui', 'info', 'Drive management refresh started');
    setLoading(true);
    setError(null);
    try {
      const filesPromise = listTimelineMediaFromDrive({ interactive: false }).then((nextFiles) => {
        if (driveLoadSequence.current === requestSequence) setFiles(nextFiles);
        return nextFiles;
      });
      const backupPromise = checkDriveBackup().then((nextBackup) => {
        if (driveLoadSequence.current === requestSequence) setBackup(nextBackup);
        return nextBackup;
      });
      const lastSyncedPromise = getLastSyncedAt().then((nextLastSyncedAt) => {
        if (driveLoadSequence.current === requestSequence) setLastSyncedAt(nextLastSyncedAt);
        return nextLastSyncedAt;
      });
      const [nextFiles, nextBackup] = await Promise.all([filesPromise, backupPromise, lastSyncedPromise]);
      if (driveLoadSequence.current !== requestSequence) return;
      setLinked(true);
      setSessionActive(true);
      logDiagnostic('drive-ui', 'info', 'Drive management refresh completed', {
        mediaCount: nextFiles.length,
        backupFound: nextBackup.found,
      });
    } catch (loadError) {
      if (driveLoadSequence.current !== requestSequence) return;
      logDiagnostic('drive-ui', 'error', 'Drive management refresh failed', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Không thể đọc dữ liệu Google Drive.');
      setLinked(isGoogleLinked());
      setSessionActive(isGoogleSessionActive());
    } finally {
      if (driveLoadSequence.current === requestSequence) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionActive) void loadDriveData();
  }, [sessionActive, loadDriveData]);

  useEffect(() => {
    void loadLocalData();
  }, [loadLocalData]);

  const connectGoogle = async () => {
    logDiagnostic('drive-ui', 'info', 'Google authentication requested');
    setLoading(true);
    setError(null);
    try {
      await requestGoogleAccessToken();
      setLinked(true);
      setSessionActive(true);
    } catch (connectError) {
      logDiagnostic('drive-ui', 'error', 'Google authentication failed', connectError);
      setLinked(isGoogleLinked());
      setSessionActive(isGoogleSessionActive());
      setError(connectError instanceof Error ? connectError.message : 'Không thể kết nối Google Drive.');
      setLoading(false);
    }
  };

  const deleteFile = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    logDiagnostic('drive-ui', 'info', 'Delete media requested', { fileId: target.id, name: target.name });
    setError(null);
    try {
      await deleteTimelineMediaFromDrive(target.id, { interactive: true });
      const linkedMediaItems = linkedMedia.get(target.id)?.media ?? [];
      await Promise.all(linkedMediaItems.flatMap((media) => media.blobId ? [removeLocalMedia(media.blobId)] : []));
      if (linkedMediaItems.length > 0) {
        useTimelineStore.setState((state) => ({
          timelineItems: state.timelineItems.map((item) => {
            const mediaItems = (item.mediaItems ?? []).filter((media) => media.driveFileId !== target.id);
            if (mediaItems.length === (item.mediaItems ?? []).length) return item;
            return {
              ...item,
              mediaItems,
              mediaUrl: mediaItems[0]?.url ?? null,
              mediaType: mediaItems[0]?.type ?? null,
            };
          }),
        }));
        await waitForLocalRecordWrites(['babygrowth_v4_timeline']);
      }
      setFiles((current) => current.filter((file) => file.id !== target.id));
      await loadLocalData();
      setDeleteTarget(null);
      onShowToast?.('Đã xóa media khỏi Google Drive.', '✓');
    } catch (deleteError) {
      logDiagnostic('drive-ui', 'error', 'Delete media failed', { fileId: target.id, error: deleteError });
      setError(deleteError instanceof Error ? deleteError.message : 'Không thể xóa media khỏi Google Drive.');
    } finally {
      setDeleting(false);
    }
  };

  const removeMediaFromTimeline = async (blobIds: Set<string>) => {
    useTimelineStore.setState((state) => ({
      timelineItems: state.timelineItems.map((item) => {
        const mediaItems = (item.mediaItems ?? []).filter((media) => !media.blobId || !blobIds.has(media.blobId));
        if (mediaItems.length === (item.mediaItems ?? []).length) return item;
        return {
          ...item,
          mediaItems,
          mediaUrl: mediaItems[0]?.url ?? null,
          mediaType: mediaItems[0]?.type ?? null,
        };
      }),
    }));
    await waitForLocalRecordWrites(['babygrowth_v4_timeline']);
  };

  const deleteLocalFile = async () => {
    const target = localDeleteTarget;
    if (!target) return;
    const linkedLocal = linkedLocalMedia.get(target.id);
    const backedUp = isMediaBackedUp(linkedLocal?.media);
    setLocalDeleting(true);
    setError(null);
    logDiagnostic('local-data', 'info', 'Local media delete requested', {
      blobId: target.id,
      size: target.size,
      backedUp,
    });
    try {
      await removeLocalMedia(target.id);
      if (!backedUp && linkedLocal) await removeMediaFromTimeline(new Set([target.id]));
      setLocalDeleteTarget(null);
      await loadLocalData();
      onShowToast?.(backedUp ? 'Đã xóa bản media trên thiết bị.' : 'Đã xóa media local khỏi nhật ký.', '✓');
      logDiagnostic('local-data', 'info', 'Local media delete completed', { blobId: target.id, backedUp });
    } catch (deleteError) {
      logDiagnostic('local-data', 'error', 'Local media delete failed', { blobId: target.id, error: deleteError });
      setError(deleteError instanceof Error ? deleteError.message : 'Không thể xóa media trên thiết bị.');
    } finally {
      setLocalDeleting(false);
    }
  };

  const cleanupBackedUpMedia = async () => {
    if (backedUpLocalFiles.length === 0) return;
    setLocalDeleting(true);
    setError(null);
    const ids = backedUpLocalFiles.map((file) => file.id);
    logDiagnostic('local-data', 'info', 'Backed-up local media cleanup started', { mediaCount: ids.length });
    try {
      await Promise.all(ids.map(removeLocalMedia));
      setCleanupConfirmOpen(false);
      await loadLocalData();
      onShowToast?.(`Đã dọn ${ids.length} media đã backup.`, '✓');
      logDiagnostic('local-data', 'info', 'Backed-up local media cleanup completed', { mediaCount: ids.length });
    } catch (cleanupError) {
      logDiagnostic('local-data', 'error', 'Backed-up local media cleanup failed', cleanupError);
      setError(cleanupError instanceof Error ? cleanupError.message : 'Không thể dọn media đã backup.');
    } finally {
      setLocalDeleting(false);
    }
  };

  const copyLogs = async () => {
    try {
      await copyText(formatDiagnosticLogs(logs));
      onShowToast?.('Đã sao chép logs chẩn đoán.', '✓');
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Không thể sao chép logs.');
    }
  };

  const driveStatus = sessionActive ? 'Đã xác thực' : linked ? 'Đã liên kết' : 'Chưa kết nối';

  return createPortal(
    <div className="baby-profile-view-container profile-page-overlay drive-data-page">
      <AppBar
        className="profile-app-bar"
        tone="baby"
        variant="page"
        ariaLabel="Quản lý dữ liệu"
        start={<button type="button" className="profile-icon-btn" onClick={() => navigate('/profile')} aria-label="Về hồ sơ"><ArrowLeft size={20} /></button>}
        center={<div className="profile-top-heading"><span className="profile-top-eyebrow">DỮ LIỆU RIÊNG TƯ</span><h1>Quản lý dữ liệu</h1></div>}
        end={(
          <div className="drive-data-app-actions">
            <button
              type="button"
              className="profile-icon-btn drive-log-action"
              onClick={() => setDebugSheetOpen(true)}
              aria-haspopup="dialog"
              aria-label="Mở logs chẩn đoán"
            >
              <Terminal size={17} />
              {logs.length > 0 && <span className="drive-log-count">{logs.length > 99 ? '99+' : logs.length}</span>}
            </button>
            <button
              type="button"
              className="profile-icon-btn"
              onClick={() => { void loadLocalData(); if (sessionActive) void loadDriveData(); }}
              aria-label="Làm mới dữ liệu"
              disabled={loading || localLoading}
            >
              <RefreshCw size={18} className={loading || localLoading ? 'spin' : ''} />
            </button>
          </div>
        )}
      />

      <div className="drive-data-controls">
        <div className="drive-data-segments" role="tablist" aria-label="Nguồn dữ liệu">
          <button
            id="device-data-tab"
            type="button"
            role="tab"
            aria-label="Local · Thiết bị"
            aria-selected={activeSegment === 'device'}
            aria-controls="device-data-panel"
            className={`drive-data-segment ${activeSegment === 'device' ? 'is-active' : ''}`}
            onClick={() => setActiveSegment('device')}
          >
            <span className="drive-data-segment-icon" aria-hidden="true"><Smartphone size={17} /></span>
            <span className="drive-data-segment-copy">
              <strong>Thiết bị</strong>
              <small>{localLoading ? 'Đang đọc dữ liệu' : `${localFiles.length} media`}</small>
            </span>
          </button>
          <button
            id="drive-data-tab"
            type="button"
            role="tab"
            aria-label={`Cloud · Google Drive · ${driveStatus}`}
            aria-selected={activeSegment === 'drive'}
            aria-controls="drive-data-panel"
            className={`drive-data-segment ${activeSegment === 'drive' ? 'is-active' : ''}`}
            onClick={() => setActiveSegment('drive')}
          >
            <span className="drive-data-segment-icon" aria-hidden="true"><Cloud size={17} /></span>
            <span className="drive-data-segment-copy">
              <strong>Google Drive</strong>
              <small>{driveStatus}</small>
            </span>
            <span className={`drive-data-segment-dot ${sessionActive ? 'is-ready' : linked ? 'is-linked' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {activeSegment === 'device' && (
        <section
          id="device-data-panel"
          role="tabpanel"
          aria-labelledby="device-data-tab"
          className="drive-data-segment-panel"
        >
          <DataOverviewCard
            tone="device"
            icon={<Smartphone size={18} />}
            eyebrow="TRÊN THIẾT BỊ"
            title="Dữ liệu local"
            status={pendingBackupCount === 0 ? 'Đã an toàn' : `${pendingBackupCount} chờ backup`}
            detail={`${localRecordCount} nhóm dữ liệu · ${formatBytes(localRecordSize)} nội dung`}
            progress={backupProgress}
            progressLabel={backupProgressLabel}
            progressAriaLabel="Tiến độ backup media local"
            metrics={[
              { label: 'Media', value: `${localFiles.length}` },
              { label: 'Dữ liệu app', value: formatBytes(localAppSize) },
              { label: 'Bộ nhớ', value: formatBytes(storageEstimate.usage ?? 0) },
            ]}
          />

          <section className="drive-media-section" aria-labelledby="local-media-title">
            <div className="drive-media-section-heading">
              <div>
                <h3 id="local-media-title">Media</h3>
                <span>{localFiles.length} tệp · {formatBytes(localMediaSize)}</span>
              </div>
              {backedUpLocalFiles.length > 0 && (
                <button type="button" onClick={() => setCleanupConfirmOpen(true)} disabled={localDeleting}>
                  <Trash2 size={13} /> Dọn {backedUpLocalFiles.length} đã backup
                </button>
              )}
            </div>

            {localLoading && localFiles.length === 0 ? (
              <div className="drive-data-state local-data-state" role="status"><RefreshCw size={20} className="spin" /><span>Đang đọc dữ liệu trên thiết bị...</span></div>
            ) : localFiles.length === 0 ? (
              <div className="drive-data-state local-data-state"><Smartphone size={24} /><strong>Không có media local</strong><span>Media đã dọn vẫn có thể được đọc lại từ Google Drive nếu đã backup.</span></div>
            ) : (
              <div className="drive-media-list">
                {localFiles.map((file) => {
                  const linkedLocal = linkedLocalMedia.get(file.id);
                  return (
                    <LocalMediaTile
                      key={file.id}
                      record={file}
                      linkedTitle={linkedLocal?.title}
                      linkedMedia={linkedLocal?.media}
                      onOpen={onOpenLightbox}
                      onDelete={() => setLocalDeleteTarget(file)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </section>
      )}

      {activeSegment === 'drive' && (
        <section id="drive-data-panel" role="tabpanel" aria-labelledby="drive-data-tab" className="drive-data-segment-panel">
          {!sessionActive ? (
            <section className="drive-connect-card">
              <span className="drive-connect-icon"><Cloud size={28} /></span>
              <h2>{linked ? 'Xác thực Google Drive' : 'Kết nối Google Drive'}</h2>
              <p>{linked
                ? 'Tài khoản Google đã liên kết. Xác thực lại để xem và quản lý dữ liệu trên Drive.'
                : 'Media được lưu trong vùng riêng tư của ứng dụng. Hãy kết nối đúng tài khoản để xem và quản lý.'}</p>
              <button type="button" className="profile-action-btn primary" onClick={() => void connectGoogle()} disabled={loading}>
                <ShieldCheck size={17} /> {loading ? 'Đang xác thực...' : linked ? 'Xác thực để xem dữ liệu' : 'Kết nối Google'}
              </button>
            </section>
          ) : (
            <>
              <DataOverviewCard
                tone="drive"
                icon={<Cloud size={18} />}
                eyebrow="TRÊN ĐÁM MÂY"
                title="Google Drive"
                status={lastSyncedAt ? formatDate(lastSyncedAt) : 'Chưa đồng bộ'}
                detail={backup?.found ? 'Bản sao lưu đang hoạt động' : 'Chưa tìm thấy bản sao lưu'}
                progress={backupProgress}
                progressLabel={backupProgressLabel}
                progressAriaLabel="Tiến độ backup media lên Google Drive"
                metrics={[
                  { label: 'Media', value: `${files.length}` },
                  { label: 'Video', value: `${videoCount}` },
                  { label: 'Dung lượng', value: formatBytes(totalSize) },
                ]}
              />

              <section className="drive-media-section" aria-labelledby="drive-media-title">
                <div className="drive-media-section-heading">
                  <div>
                    <h3 id="drive-media-title">Media</h3>
                    <span>{files.length} tệp · {formatBytes(totalSize)}</span>
                  </div>
                </div>

                {loading && files.length === 0 ? (
                  <div className="drive-data-state" role="status"><RefreshCw size={20} className="spin" /><span>Đang đọc dữ liệu Drive...</span></div>
                ) : files.length === 0 ? (
                  <div className="drive-data-state"><Cloud size={24} /><strong>Chưa có media trên Drive</strong><span>Ảnh và video sẽ xuất hiện sau lần đồng bộ tiếp theo.</span></div>
                ) : (
                  <div className="drive-media-list">
                    {files.map((file) => {
                      const linkedDriveMedia = linkedMedia.get(file.id);
                      const localBlob = linkedDriveMedia?.media
                        .map((media) => media.blobId ? localFilesById.get(media.blobId)?.blob : undefined)
                        .find((blob) => blob !== undefined);
                      return (
                        <DriveMediaTile
                          key={file.id}
                          file={file}
                          linkedTitle={linkedDriveMedia?.title}
                          localBlob={localBlob}
                          preloadFullImage={preloadImageIds.has(file.id)}
                          onPreviewEvent={handleDrivePreviewEvent}
                          onDelete={() => setDeleteTarget(file)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      )}

      {error && <p className="drive-data-error" role="alert">{error}</p>}

      <MomentMediaPreview
        preview={drivePreview}
        onClose={closeDrivePreview}
        onMediaReady={(media) => {
          if (media.id) handleDrivePreviewEvent({ kind: 'playable', fileId: media.id });
        }}
        onMediaError={(media) => {
          if (!media.id) return;
          handleDrivePreviewEvent({
            kind: 'error',
            fileId: media.id,
            message: 'Không thể phát video từ Google Drive. Hãy thử lại.',
          });
        }}
      />

      <BottomSheet
        isOpen={debugSheetOpen}
        onClose={() => setDebugSheetOpen(false)}
        title="Logs chẩn đoán"
        className="drive-debug-sheet"
        footer={(
          <div className="drive-debug-sheet-actions">
            <button type="button" onClick={() => void copyLogs()} disabled={logs.length === 0}><ClipboardCopy size={14} /> Sao chép</button>
            <button type="button" className="danger" onClick={clearDiagnosticLogs} disabled={logs.length === 0}><Trash2 size={14} /> Xóa logs</button>
          </div>
        )}
      >
        <div className="drive-debug-sheet-intro">
          <span className="drive-log-icon"><Terminal size={17} /></span>
          <div><strong>{logs.length} sự kiện gần nhất</strong><small>Chỉ lưu trên thiết bị này. Không bao gồm access token.</small></div>
        </div>
        {logs.length === 0 ? (
          <p className="drive-log-empty">Chưa có log. Hãy thử kết nối hoặc làm mới Google Drive.</p>
        ) : (
          <div className="drive-log-list" aria-label="Danh sách logs chẩn đoán">
            {[...logs].reverse().map((entry) => (
              <article className={`drive-log-entry level-${entry.level}`} key={entry.id}>
                <header><time dateTime={entry.timestamp}>{formatLogTime(entry.timestamp)}</time><span>{entry.level}</span><strong>{entry.scope}</strong></header>
                <p>{entry.message}</p>
                {entry.details !== undefined && <pre>{JSON.stringify(entry.details, null, 2)}</pre>}
              </article>
            ))}
          </div>
        )}
      </BottomSheet>

      <HavenDialog
        open={deleteTarget !== null}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        title="Xóa media khỏi Drive?"
        description={deleteTarget?.name}
        footer={<><button type="button" className="haven-dialog-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Giữ lại</button><button type="button" className="haven-dialog-primary drive-delete-confirm" onClick={() => void deleteFile()} disabled={deleting}><Trash2 size={15} /> {deleting ? 'Đang xóa...' : 'Xóa media'}</button></>}
      >
        <p className="drive-delete-copy">Media sẽ bị xóa khỏi Google Drive và khỏi các khoảnh khắc đang liên kết trên thiết bị này. Thao tác này không thể hoàn tác.</p>
      </HavenDialog>

      <HavenDialog
        open={localDeleteTarget !== null}
        onClose={() => { if (!localDeleting) setLocalDeleteTarget(null); }}
        title={isMediaBackedUp(linkedLocalMedia.get(localDeleteTarget?.id ?? '')?.media) ? 'Xóa bản trên thiết bị?' : 'Media này chưa được backup'}
        description={linkedLocalMedia.get(localDeleteTarget?.id ?? '')?.media[0]?.name || localDeleteTarget?.id}
        footer={<><button type="button" className="haven-dialog-secondary" onClick={() => setLocalDeleteTarget(null)} disabled={localDeleting}>Giữ lại</button><button type="button" className="haven-dialog-primary drive-delete-confirm" onClick={() => void deleteLocalFile()} disabled={localDeleting}><Trash2 size={15} /> {localDeleting ? 'Đang xóa...' : 'Xóa media'}</button></>}
      >
        {isMediaBackedUp(linkedLocalMedia.get(localDeleteTarget?.id ?? '')?.media) ? (
          <p className="drive-delete-copy">Chỉ bản local được xóa để giải phóng dung lượng. Media vẫn còn trên Google Drive và vẫn hiển thị trong nhật ký khi có mạng.</p>
        ) : (
          <div className="local-delete-warning"><AlertTriangle size={20} /><p>Đây là bản duy nhất. Xóa sẽ gỡ media khỏi các khoảnh khắc đang liên kết và không thể khôi phục từ Drive.</p></div>
        )}
      </HavenDialog>

      <HavenDialog
        open={cleanupConfirmOpen}
        onClose={() => { if (!localDeleting) setCleanupConfirmOpen(false); }}
        title="Dọn media đã backup?"
        description={`${backedUpLocalFiles.length} ảnh/video · ${formatBytes(backedUpLocalFiles.reduce((sum, file) => sum + file.size, 0))}`}
        footer={<><button type="button" className="haven-dialog-secondary" onClick={() => setCleanupConfirmOpen(false)} disabled={localDeleting}>Để sau</button><button type="button" className="haven-dialog-primary" onClick={() => void cleanupBackedUpMedia()} disabled={localDeleting}><Trash2 size={15} /> {localDeleting ? 'Đang dọn...' : 'Dọn bản local'}</button></>}
      >
        <p className="drive-delete-copy">Chỉ các file đã có bản trên Google Drive được xóa khỏi thiết bị. Nhật ký và media chưa backup được giữ nguyên.</p>
      </HavenDialog>
    </div>,
    document.body,
  );
}
