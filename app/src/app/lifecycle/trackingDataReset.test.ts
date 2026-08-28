import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_KEYS } from '@/features/sync';
import { useActivityStore } from '@/features/activities/store/useActivityStore';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import { initializeChildProfile, resetChildStoresToDefaults } from '@/features/profile';
import { useExpenseStore } from '@/features/expenses/store/useExpenseStore';
import { useReminderStore } from '@/features/reminders/store/useReminderStore';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { useUIStore } from '@/store/useUIStore';

const TRACKING_STORE_KEYS = [...SYNC_KEYS, 'babygrowth_v4_expenses'];

const persistence = vi.hoisted(() => ({
  getAllLocalRecords: vi.fn(),
  getLocalRecord: vi.fn(),
  removeLocalRecord: vi.fn(),
  setLocalRecord: vi.fn(),
  subscribeLocalRecordChanges: vi.fn(),
  waitForLocalRecordWrites: vi.fn(),
  clearLocalMedia: vi.fn(),
  indexedDbStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

const drive = vi.hoisted(() => ({
  deleteTimelineMediaFromDrive: vi.fn(),
  overwriteDriveBackupWithLocalData: vi.fn(),
  runWithAutoSyncPaused: vi.fn(),
}));

vi.mock('@/data/localDb', () => persistence);
vi.mock('@/features/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/sync')>()),
  deleteTimelineMediaFromDrive: drive.deleteTimelineMediaFromDrive,
  overwriteDriveBackupWithLocalData: drive.overwriteDriveBackupWithLocalData,
  runWithAutoSyncPaused: drive.runWithAutoSyncPaused,
}));

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

function seedTrackingData(): void {
  initializeChildProfile({
    childName: 'Bơ', childFullName: 'Nguyễn An', birthDate: '2026-01-05', birthTime: '07:30',
    gender: 'girl', bloodType: 'A+', childAvatar: '/baby.jpg', momName: 'Mai', momAvatar: '/mom.jpg',
    birthWeight: '3.2 kg', birthHeight: '49 cm', headCircAtBirth: '34 cm', hospital: 'Từ Dũ',
  }, { weight: 3.2, height: 49, headCirc: 34 });
  useGrowthStore.getState().addGrowthMeasurement({ weight: 5.1, height: 58, headCirc: 38, date: '2026-03-05' });
  useActivityStore.getState().addMomActivity({
    owner: 'mom', type: 'pumping', occurredAt: '2026-08-17T07:00:00.000Z', amountMl: 90, side: 'both',
  });
  useActivityStore.getState().addBabyActivity({
    owner: 'baby', type: 'diaper', occurredAt: '2026-08-17T08:00:00.000Z', diaperKind: 'wet',
  });
  useExpenseStore.getState().addExpense({
    amount: 120_000, category: 'Tã bỉm & vệ sinh', occurredAt: '2026-08-17T08:30:00.000Z',
  });
  useExpenseStore.getState().setMonthlyBudget(7_000_000);
  useTimelineStore.getState().addTimelineItem({ title: 'Tracked timeline item' });
  useReminderStore.getState().createReminder({
    type: 'medicine', title: 'Vitamin D', mode: 'fixed', triggerAt: '08:00', enabled: true,
  });
  useUIStore.getState().setTab('timeline');
  useUIStore.getState().setCurrentSubView('calendar');
  useUIStore.getState().setSearchQuery('sleep');
  useUIStore.getState().setProfileMode('mom');
}

function expectTrackingDataReset(): void {
  const growth = useGrowthStore.getState();
  expect(growth.currentStageData().growthHistory).toHaveLength(1);
  expect(growth.currentStageData().growthHistory[0]).toMatchObject({
    date: '2026-01-05', weight: 3.2, height: 49, headCirc: 34,
  });
  expect(useActivityStore.getState()).toMatchObject({ babyActivities: [], momActivities: [] });
  expect(useExpenseStore.getState()).toMatchObject({ expenses: [], monthlyBudget: 5_000_000 });
  expect(useTimelineStore.getState().timelineItems).toEqual([]);
  expect(useReminderStore.getState()).toMatchObject({ reminders: [], occurrenceStates: {}, systemNotificationsEnabled: false });
  expect(useUIStore.getState()).toMatchObject({ currentTab: 'home', currentSubView: null, searchQuery: '', profileMode: 'baby' });
}

describe('resetTrackingData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.waitForLocalRecordWrites.mockResolvedValue(undefined);
    persistence.clearLocalMedia.mockResolvedValue(undefined);
    drive.overwriteDriveBackupWithLocalData.mockResolvedValue(undefined);
    drive.deleteTimelineMediaFromDrive.mockResolvedValue(undefined);
    drive.runWithAutoSyncPaused.mockImplementation(async (operation) => operation({
      overwriteDriveBackupWithLocalData: drive.overwriteDriveBackupWithLocalData,
    }));
    resetChildStoresToDefaults();
    useActivityStore.getState().resetTrackingData();
    useExpenseStore.getState().resetTrackingData();
    useTimelineStore.getState().resetTrackingData();
    useReminderStore.getState().resetTrackingData();
    useUIStore.getState().resetTrackingData();
  });

  afterEach(() => {
    resetChildStoresToDefaults();
    useExpenseStore.getState().resetTrackingData();
  });

  it('resets every local store and persists it before overwriting the Drive backup', async () => {
    seedTrackingData();
    drive.overwriteDriveBackupWithLocalData.mockImplementation(async () => {
      expect(persistence.waitForLocalRecordWrites).toHaveBeenCalledWith(TRACKING_STORE_KEYS);
      expect(persistence.clearLocalMedia).toHaveBeenCalledOnce();
      expectTrackingDataReset();
    });

    const { resetTrackingData } = await import('./trackingDataReset');
    await expect(resetTrackingData()).resolves.toEqual({ status: 'synced' });
  });

  it('reports local-only success when Drive overwrite fails after local reset', async () => {
    seedTrackingData();
    drive.overwriteDriveBackupWithLocalData.mockRejectedValue(new Error('Drive unavailable'));
    const { resetTrackingData } = await import('./trackingDataReset');

    await expect(resetTrackingData()).resolves.toEqual({ status: 'local-only', error: 'Drive unavailable' });
    expectTrackingDataReset();
  });

  it('removes known timeline media files from Drive during reset', async () => {
    useTimelineStore.getState().addTimelineItem({
      title: 'Ảnh đã đồng bộ',
      mediaItems: [{ id: 'media-1', blobId: 'media-1', driveFileId: 'drive-media-1', type: 'photo' }],
    });
    const { resetTrackingData } = await import('./trackingDataReset');

    await expect(resetTrackingData()).resolves.toEqual({ status: 'synced' });
    expect(drive.deleteTimelineMediaFromDrive).toHaveBeenCalledWith('drive-media-1', { interactive: true });
  });

  it('is idempotent and does not recreate tracked demo content', async () => {
    seedTrackingData();
    const { resetTrackingData } = await import('./trackingDataReset');

    await expect(resetTrackingData()).resolves.toEqual({ status: 'synced' });
    await expect(resetTrackingData()).resolves.toEqual({ status: 'synced' });

    expectTrackingDataReset();
    expect(drive.overwriteDriveBackupWithLocalData).toHaveBeenCalledTimes(2);
  });

  it('waits for delayed store rehydration before clearing tracking data', async () => {
    seedTrackingData();
    let finishRehydration: (() => void) | undefined;
    vi.spyOn(useActivityStore.persist, 'hasHydrated').mockReturnValue(false);
    vi.spyOn(useActivityStore.persist, 'rehydrate').mockImplementation(() => new Promise((resolve) => {
      finishRehydration = resolve;
    }));
    const { resetTrackingData } = await import('./trackingDataReset');

    const reset = resetTrackingData();
    await flushMicrotasks();

    expect(drive.overwriteDriveBackupWithLocalData).not.toHaveBeenCalled();
    expect(useActivityStore.getState().babyActivities).not.toEqual([]);

    finishRehydration?.();
    await expect(reset).resolves.toEqual({ status: 'synced' });
    expect(useActivityStore.getState().babyActivities).toEqual([]);
  });

  it('continues with in-memory data when IndexedDB hydration fails without a finish event', async () => {
    seedTrackingData();
    vi.spyOn(useActivityStore.persist, 'hasHydrated').mockReturnValue(false);
    const onFinishHydration = vi.spyOn(useActivityStore.persist, 'onFinishHydration');
    persistence.indexedDbStorage.getItem.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const { resetTrackingData } = await import('./trackingDataReset');

    const reset = resetTrackingData();
    await expect(reset).resolves.toEqual({ status: 'synced' });

    expect(drive.overwriteDriveBackupWithLocalData).toHaveBeenCalledOnce();
    expect(persistence.indexedDbStorage.getItem).toHaveBeenCalled();
    expect(onFinishHydration).not.toHaveBeenCalled();
    expect(useActivityStore.getState().babyActivities).toEqual([]);
  });
});
