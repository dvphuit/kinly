import { useSyncExternalStore } from 'react';
import { Cloud, CloudOff, CloudUpload } from 'lucide-react';
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
  const details = {
    local: { title: 'Đang lưu trên thiết bị, chờ đồng bộ Google Drive', icon: Cloud },
    queued: { title: 'Đã xếp hàng để đồng bộ Google Drive', icon: CloudUpload },
    compressing: { title: `Đang tối ưu trước khi đồng bộ: ${roundedProgress}%`, icon: CloudUpload },
    uploading: { title: `Đang tải lên Google Drive: ${roundedProgress}%`, icon: CloudUpload },
    synced: { title: 'Đã đồng bộ lên Google Drive', icon: Cloud },
    error: { title: state.error || 'Không thể đồng bộ lên Google Drive', icon: CloudOff },
  }[state.status];
  const Icon = details.icon;

  return (
    <span
      className={`journal-media-sync status-${state.status} ${className}`.trim()}
      role="status"
      title={details.title}
      aria-label={details.title}
    >
      <Icon size={12} aria-hidden="true" />
    </span>
  );
}
