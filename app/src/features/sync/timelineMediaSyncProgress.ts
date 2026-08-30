export type TimelineMediaSyncStatus = 'local' | 'queued' | 'compressing' | 'uploading' | 'synced' | 'error';

export interface TimelineMediaSyncProgress {
  status: TimelineMediaSyncStatus;
  progress: number;
  error?: string;
}

const progressByMediaId = new Map<string, TimelineMediaSyncProgress>();
const listenersByMediaId = new Map<string, Set<() => void>>();

export function getTimelineMediaSyncProgress(mediaId: string): TimelineMediaSyncProgress | null {
  return progressByMediaId.get(mediaId) ?? null;
}

export function subscribeTimelineMediaSyncProgress(mediaId: string, listener: () => void): () => void {
  const listeners = listenersByMediaId.get(mediaId) ?? new Set<() => void>();
  listeners.add(listener);
  listenersByMediaId.set(mediaId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByMediaId.delete(mediaId);
  };
}

function notifyTimelineMediaSyncProgress(mediaId: string): void {
  listenersByMediaId.get(mediaId)?.forEach((listener) => listener());
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
  notifyTimelineMediaSyncProgress(mediaId);
}

export function resetTimelineMediaSyncProgress(): void {
  if (progressByMediaId.size === 0) return;
  const changedMediaIds = [...progressByMediaId.keys()];
  progressByMediaId.clear();
  changedMediaIds.forEach(notifyTimelineMediaSyncProgress);
}
