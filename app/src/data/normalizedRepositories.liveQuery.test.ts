import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineItem } from '@/features/timeline';

function installIndexedDb(): void {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
}

function timelineItem(driveFileId?: string): TimelineItem {
  return {
    id: 'timeline-live-backup',
    owner: 'baby',
    date: '2026-08-28',
    timeFormatted: '13:20',
    time: '28/08/2026 • 13:20',
    author: 'Mẹ',
    authorAvatar: '/mom.jpg',
    title: 'Khoảnh khắc',
    content: '',
    mediaItems: [{
      id: 'media-live-backup',
      blobId: 'blob-live-backup',
      ...(driveFileId ? { driveFileId } : {}),
      type: 'photo',
      name: 'baby.jpg',
    }],
    mediaUrl: null,
    mediaType: 'photo',
    stats: [],
    likes: 0,
    comments: 0,
    userLiked: false,
    tag: 'Nhật ký',
    tagType: 'general',
    type: 'daily',
  };
}

describe('normalized repository live queries', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    installIndexedDb();
  });

  it('emits updated timeline media after Drive backup metadata is persisted', async () => {
    const { liveQuery } = await import('dexie');
    const { readAllJournalData, replaceTimelineItems } = await import('@/data/normalizedRepositories');

    await replaceTimelineItems([timelineItem()]);

    let resolveInitial!: () => void;
    let resolveBackedUp!: () => void;
    const initial = new Promise<void>((resolve) => { resolveInitial = resolve; });
    const backedUp = new Promise<void>((resolve) => { resolveBackedUp = resolve; });

    const subscription = liveQuery(() => readAllJournalData().then((journal) => journal.timelineItems))
      .subscribe({
        next: (items) => {
          const driveFileId = items[0]?.mediaItems?.[0]?.driveFileId;
          if (!driveFileId) resolveInitial();
          if (driveFileId === 'drive-file-1') resolveBackedUp();
        },
      });

    await initial;
    await replaceTimelineItems([timelineItem('drive-file-1')]);

    await expect(Promise.race([
      backedUp.then(() => 'updated'),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 250)),
    ])).resolves.toBe('updated');

    subscription.unsubscribe();
  });
});
