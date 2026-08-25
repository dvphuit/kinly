import { useActivityStore } from '@/features/activities';
import { useExpenseStore } from '@/features/expenses';
import { useGrowthStore } from '@/features/growth';
import { useProfileStore } from '@/features/profile';
import { useReminderStore } from '@/features/reminders';
import { useTimelineStore } from '@/features/timeline';
import { isMockDataEnabled, seedMockData } from './mockData';

let mockBootstrapRan = false;

/** Rehydrates and seeds development-only demo data without entering the production startup graph. */
export async function bootstrapMockData(): Promise<void> {
  if (mockBootstrapRan || !isMockDataEnabled()) return;
  mockBootstrapRan = true;

  try {
    await Promise.all([
      useProfileStore.persist.rehydrate(),
      useGrowthStore.persist.rehydrate(),
      useTimelineStore.persist.rehydrate(),
      useReminderStore.persist.rehydrate(),
      useActivityStore.persist.rehydrate(),
      useExpenseStore.persist.rehydrate(),
    ]);

    const family = useProfileStore.getState().familyData;
    if (family?.isInitialized && family?.childName) return;

    seedMockData();
  } catch (error) {
    console.error('[mock] Không thể nạp dữ liệu mẫu:', error);
  }
}
