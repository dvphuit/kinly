import { describe, expect, it, vi } from 'vitest';
import {
  publishTimelineMediaSyncProgress,
  resetTimelineMediaSyncProgress,
  subscribeTimelineMediaSyncProgress,
} from './timelineMediaSyncProgress';

describe('timelineMediaSyncProgress', () => {
  it('notifies only subscribers for the media item that changed', () => {
    resetTimelineMediaSyncProgress();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribeFirst = subscribeTimelineMediaSyncProgress('media-1', firstListener);
    const unsubscribeSecond = subscribeTimelineMediaSyncProgress('media-2', secondListener);

    publishTimelineMediaSyncProgress('media-1', { status: 'uploading', progress: 42 });

    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).not.toHaveBeenCalled();

    unsubscribeFirst();
    unsubscribeSecond();
    resetTimelineMediaSyncProgress();
  });
});
