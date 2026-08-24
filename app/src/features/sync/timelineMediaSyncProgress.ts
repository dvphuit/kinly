export type TimelineMediaSyncStatus = 'local' | 'queued' | 'compressing' | 'uploading' | 'synced' | 'error';

export interface TimelineMediaSyncProgress {
  status: TimelineMediaSyncStatus;
  progress: number;
  error?: string;
}

const progressByMediaId = new Map<string, TimelineMediaSyncProgress>();
const listeners = new Set<() => void>();

export function getTimelineMediaSyncProgress(mediaId: string): TimelineMediaSyncProgress | null {
  return progressByMediaId.get(mediaId) ?? null;
}

export function subscribeTimelineMediaSyncProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishTimelineMediaSyncProgress(
  mediaId: string,
  patch: Partial<TimelineMediaSyncProgress> & Pick<TimelineMediaSyncProgress, 'status'>,
): void {
  const current = progressByMediaId.get(mediaId);
  progressByMediaId.set(mediaId, {
    status: patch.status,
    progress: Math.max(0, Math.min(100, patch.progress ?? current?.progress ?? 0)),
    error: patch.error,
  });
  listeners.forEach((listener) => listener());
}

export function resetTimelineMediaSyncProgress(): void {
  if (progressByMediaId.size === 0) return;
  progressByMediaId.clear();
  listeners.forEach((listener) => listener());
}
