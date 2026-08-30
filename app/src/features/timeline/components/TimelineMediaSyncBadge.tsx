import { useSyncExternalStore } from 'react';
import { Clock3, Cloud, CloudOff, CloudUpload, HardDrive, LoaderCircle } from 'lucide-react';
import {
  getTimelineMediaSyncProgress,
  subscribeTimelineMediaSyncProgress,
  type TimelineMediaSyncProgress,
} from '@/features/sync/timelineMediaSyncProgress';
import type { TimelineMediaItem } from '@/features/timeline/domain/types';

interface TimelineMediaSyncBadgeProps {
  media: TimelineMediaItem;
  className?: string;
}

function mediaSyncKey(media: TimelineMediaItem): string {
  return media.id || media.blobId || media.driveFileId || '';
}

export function TimelineMediaSyncBadge({ media, className = '' }: TimelineMediaSyncBadgeProps) {
  const mediaId = mediaSyncKey(media);
  const liveProgress = useSyncExternalStore(
    subscribeTimelineMediaSyncProgress,
    () => mediaId ? getTimelineMediaSyncProgress(mediaId) : null,
    () => null,
  );

  let state: TimelineMediaSyncProgress | null = liveProgress;
  if (media.driveFileId) state = { status: 'synced', progress: 100 };
  else if (!media.blobId) state = null;
  else if (!state) state = { status: 'local', progress: 0 };
  if (!state) return null;

  const roundedProgress = Math.round(state.progress);
  const kind = media.type === 'video' ? 'video' : 'ảnh';
  const kindTitle = media.type === 'video' ? 'Video' : 'Ảnh';
  const details = {
    local: {
      title: `${kindTitle} đã lưu trên thiết bị, đang chờ sao lưu lên Google Drive`,
      label: 'Chờ sao lưu',
      icon: HardDrive,
    },
    queued: {
      title: `${kindTitle} đang chờ xử lý để sao lưu lên Google Drive`,
      label: 'Chờ xử lý',
      icon: Clock3,
    },
    compressing: {
      title: `Đang tối ưu ${kind}: ${roundedProgress}%`,
      label: `Tối ưu ${roundedProgress}%`,
      icon: LoaderCircle,
    },
    uploading: {
      title: `Đang tải ${kind} lên Google Drive: ${roundedProgress}%`,
      label: `Tải lên ${roundedProgress}%`,
      icon: CloudUpload,
    },
    synced: {
      title: `${kindTitle} đã sao lưu trên Google Drive`,
      label: 'Đã sao lưu',
      icon: Cloud,
    },
    error: {
      title: state.error
        ? `Không thể sao lưu ${kind}: ${state.error}`
        : `Không thể sao lưu ${kind} lên Google Drive`,
      label: 'Lỗi sao lưu',
      icon: CloudOff,
    },
  }[state.status];
  const Icon = details.icon;
  const showsLiveProgress = state.status === 'compressing' || state.status === 'uploading';
  const expandsOnThumbnail = state.status === 'queued' || showsLiveProgress || state.status === 'error';

  return (
    <span
      className={`journal-media-sync status-${state.status} ${expandsOnThumbnail ? 'is-expanded' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      title={details.title}
      aria-label={details.title}
    >
      <Icon size={12} aria-hidden="true" />
      <span className="journal-media-sync-label" aria-hidden="true">{details.label}</span>
    </span>
  );
}
