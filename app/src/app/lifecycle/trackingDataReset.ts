import {
  deleteTimelineMediaFromDrive,
  runWithAutoSyncPaused,
  SYNC_KEYS,
} from '@/features/sync';
import { useActivityStore } from '@/features/activities/store/useActivityStore';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import { useProfileStore } from '@/features/profile/store/useProfileStore';
import { useExpenseStore } from '@/features/expenses/store/useExpenseStore';
import { useReminderStore } from '@/features/reminders/store/useReminderStore';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { useUIStore } from '@/store/useUIStore';
import { clearLocalMedia, waitForLocalRecordWrites } from '@/data/localDb';
import { hasIndexedDb } from '@/data/appDatabase';
import { readAllJournalData } from '@/data/normalizedRepositories';
import type { TimelineItem } from '@/features/timeline';

async function getEffectiveTimelineItems(): Promise<TimelineItem[]> {
  const journal = await readAllJournalData();
  if (hasIndexedDb()) return journal.timelineItems;
  return journal.timelineItems.length > 0 ? journal.timelineItems : useTimelineStore.getState().timelineItems;
}
const TRACKING_STORE_KEYS = [...SYNC_KEYS, 'babygrowth_v4_expenses'] as const;

export type TrackingDataResetResult =
  | { status: 'synced' }
  | { status: 'local-only'; error: string };

type PersistedStore = {
  persist: {
    hasHydrated: () => boolean;
    rehydrate: () => Promise<void> | void;
  };
};

function waitForStoreHydration(store: PersistedStore): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return Promise.resolve(store.persist.rehydrate());
}

async function waitForTrackingStoresHydrated(): Promise<void> {
  await Promise.all([
    waitForStoreHydration(useGrowthStore),
    waitForStoreHydration(useProfileStore),
    waitForStoreHydration(useActivityStore),
    waitForStoreHydration(useExpenseStore),
    waitForStoreHydration(useTimelineStore),
    waitForStoreHydration(useReminderStore),
    waitForStoreHydration(useUIStore),
  ]);
}

export async function resetTrackingData(): Promise<TrackingDataResetResult> {
  return runWithAutoSyncPaused(async ({ overwriteDriveBackupWithLocalData }) => {
    await waitForTrackingStoresHydrated();
    await waitForLocalRecordWrites(TRACKING_STORE_KEYS);
    const allTimelineItems = await getEffectiveTimelineItems();
    const driveMediaIds = allTimelineItems.flatMap((item) =>
      (item.mediaItems ?? []).flatMap((media) => media.driveFileId ? [media.driveFileId] : []));

    useGrowthStore.getState().resetTrackingData(useProfileStore.getState().familyData);
    useActivityStore.getState().resetTrackingData();
    useExpenseStore.getState().resetTrackingData();
    useTimelineStore.getState().resetTrackingData();
    useReminderStore.getState().resetTrackingData();
    useUIStore.getState().resetTrackingData();

    await waitForLocalRecordWrites(TRACKING_STORE_KEYS);
    await clearLocalMedia();

    try {
      await Promise.allSettled(
        driveMediaIds.map((fileId) => deleteTimelineMediaFromDrive(fileId, { interactive: true })),
      );
      await overwriteDriveBackupWithLocalData();
      return { status: 'synced' };
    } catch (error) {
      return {
        status: 'local-only',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
