
import { loadProfileLifecycle, type FamilyData } from '@/features/profile';
import type { GrowthHistoryRecord } from '@/features/growth';
import type { TimelineItem } from '@/features/timeline';
import type { ExpenseRecord } from '@/types/expense';
import type { Reminder } from '@/types/reminder';
import { isGoogleConfigured } from '@/features/sync';
import { setLocalRecord } from '@/data/localDb';
import { useActivityStore, type NewBabyActivity, type NewMomActivity } from '@/features/activities/store/useActivityStore';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import { useExpenseStore } from '@/features/expenses/store/useExpenseStore';
import { useReminderStore } from '@/features/reminders/store/useReminderStore';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';

function isoDate(yearsAgo = 0, monthsAgo = 0, daysAgo = 0): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsAgo, date.getMonth() - monthsAgo, date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function viDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

const BIRTH_DATE = '2026-08-05';

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export const MOCK_FAMILY: Partial<FamilyData> = {
  childName: 'Bé Bơ',
  childFullName: 'Minh Châu',
  birthDate: BIRTH_DATE,
  birthTime: '05:43',
  gender: 'boy',
  bloodType: 'Chưa rõ',
  childAvatar: '/assets/avatars/baby_avatar.jpg',
  momName: 'Mẹ Thảo',
  momAvatar: '/assets/avatars/mom_avatar.jpg',
  dadName: 'Ba Phú',
  dadAvatar: '/assets/avatars/dad_avatar.jpg',
  birthWeight: '3.1',
  birthHeight: '50',
  headCircAtBirth: '30',
  hospital: 'BV Nhân Dân Gia Định',
  insuranceCode: 'HS-2026-0085',
  allergies: [],
  notes: 'Bé sinh thường, theo dõi vàng da sinh lý tuần đầu.',
};

const BIRTH_VITALS = { weight: 3.1, height: 50, headCirc: 30 };

function growthRecord(
  id: string,
  date: string,
  ageText: string,
  labelIndex: number,
  weight: number,
  height: number,
  headCirc: number,
  note: string,
): GrowthHistoryRecord {
  return {
    id,
    date,
    ageText,
    labelIndex,
    weight,
    height,
    headCirc,
    percentileLabel: 'P50 - P75',
    status: 'optimal',
    note,
  };
}

const GROWTH_RECORDS: GrowthHistoryRecord[] = [
  growthRecord('gh_mock_1w', addDays(BIRTH_DATE, 7), '1 tuần', 0, 3.4, 51.5, 31.5, 'Tăng cân tốt, bú mẹ hoàn toàn.'),
  growthRecord('gh_mock_2w', addDays(BIRTH_DATE, 13), '2 tuần', 1, 3.6, 52.0, 32.0, 'Ngủ ngoan, vàng da đã giảm.'),
];

function timelineItem(
  id: string,
  date: string,
  title: string,
  content: string,
  tag: string,
  tagType: TimelineItem['tagType'],
  type: TimelineItem['type'],
): TimelineItem {
  return {
    id,
    stage: 'stage_0_1',
    date,
    timeFormatted: '20:15',
    time: `${viDate(date)} • 20:15`,
    author: MOCK_FAMILY.momName ?? 'Mẹ',
    authorAvatar: MOCK_FAMILY.momAvatar ?? '/assets/avatars/mom_avatar.jpg',
    title,
    content,
    mediaUrl: null,
    mediaType: null,
    stats: ['❤️ 12', '💬 3'],
    likes: 12,
    comments: 3,
    userLiked: true,
    tag,
    tagType,
    type,
  };
}

const TIMELINE_ITEMS: TimelineItem[] = [
  timelineItem('tl_mock_1', isoDate(0, 0, 1), 'Bé bú mẹ rất ngoan', 'Bơ bú đều 2-3 tiếng/lần, ngủ nhiều trong ngày 😴', 'Sinh hoạt', 'feeding', 'daily'),
  timelineItem('tl_mock_2', isoDate(0, 0, 3), 'Chăm sóc rốn & thay tã', 'Vệ sinh rốn sạch sẽ mỗi ngày, tã ướt đều 6-8 chiếc/ngày', 'Chăm sóc', 'health', 'daily'),
  timelineItem('tl_mock_3', isoDate(0, 0, 5), 'Mẹ hồi phục sau sinh', 'Vết khâu đã đỡ đau, Mẹ tập đi lại nhẹ nhàng và hợp tác cho con bú 💕', 'Tâm trạng Mẹ', 'mom', 'daily'),
];

const EXPENSES: Array<Pick<ExpenseRecord, 'amount' | 'category' | 'occurredAt' | 'note'>> = [
  { amount: 850000, category: 'Sữa & ăn dặm', occurredAt: isoDate(0, 0, 4), note: 'Sữa công thức + bột ăn dặm' },
  { amount: 420000, category: 'Tã bỉm & vệ sinh', occurredAt: isoDate(0, 0, 6), note: 'Tã Merries size M' },
  { amount: 600000, category: 'Y tế & tiêm chủng', occurredAt: isoDate(0, 1, 2), note: 'Tiêm 6in1 mũi 2' },
  { amount: 350000, category: 'Quần áo & đồ dùng', occurredAt: isoDate(0, 1, 10), note: 'Set áo mùa hè' },
  { amount: 280000, category: 'Sách & đồ chơi', occurredAt: isoDate(0, 1, 15), note: 'Đồ chơi gỗ vận động' },
  { amount: 500000, category: 'Mẹ & gia đình', occurredAt: isoDate(0, 1, 18), note: 'Vitamin tổng hợp cho Mẹ' },
];

function triggerAt(hour: number, minute: number, daysFromNow = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function reminder(
  id: string,
  type: Reminder['type'],
  title: string,
  trigger: string,
  repeat: Reminder['repeat'],
): Reminder {
  const now = new Date().toISOString();
  return {
    id,
    type,
    title,
    enabled: true,
    mode: 'fixed',
    triggerAt: trigger,
    repeat,
    quickLogAction: type === 'feeding' ? 'feeding' : type === 'medicine' ? 'medicine' : undefined,
    note: '',
    createdAt: now,
    updatedAt: now,
  };
}

const REMINDERS: Reminder[] = [
  reminder('rem_mock_1', 'feeding', 'Cữ bú 20:00', triggerAt(20, 0), 'daily'),
  reminder('rem_mock_2', 'medicine', 'Uống vitamin D3', triggerAt(8, 0), 'daily'),
  reminder('rem_mock_3', 'vaccination', 'Tiêm nhắc 6in1 mũi 3', triggerAt(9, 30, 5), 'none'),
  reminder('rem_mock_4', 'appointment', 'Đo cân nặng tháng', triggerAt(19, 0, 10), 'none'),
];

function todayAt(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const BABY_ACTIVITIES: NewBabyActivity[] = [
  { owner: 'baby', type: 'feeding', occurredAt: todayAt(7, 0), amountMl: 90, durationMinutes: 22, method: 'breast', side: 'both' },
  { owner: 'baby', type: 'diaper', occurredAt: todayAt(9, 30), diaperKind: 'wet' },
  { owner: 'baby', type: 'sleep', occurredAt: todayAt(10, 0), durationMinutes: 120 },
  { owner: 'baby', type: 'feeding', occurredAt: todayAt(13, 0), amountMl: 100, durationMinutes: 18, method: 'bottle' },
  { owner: 'baby', type: 'diaper', occurredAt: todayAt(15, 0), diaperKind: 'dirty' },
  { owner: 'baby', type: 'temperature', occurredAt: todayAt(18, 0), temperatureC: 36.8 },
  { owner: 'baby', type: 'feeding', occurredAt: todayAt(20, 0), amountMl: 95, durationMinutes: 20, method: 'breast', side: 'both' },
];

const MOM_ACTIVITIES: NewMomActivity[] = [
  { owner: 'mom', type: 'pumping', occurredAt: todayAt(8, 0), amountMl: 120, side: 'both' },
  { owner: 'mom', type: 'mood', occurredAt: todayAt(9, 0), mood: 'good' },
  { owner: 'mom', type: 'sleep', occurredAt: todayAt(13, 30), durationMinutes: 90 },
  { owner: 'mom', type: 'pumping', occurredAt: todayAt(14, 0), amountMl: 110, side: 'left' },
  { owner: 'mom', type: 'recovery_note', occurredAt: todayAt(19, 0), note: 'Vết khâu đã khô, đi lại nhẹ nhàng được.' },
];

/** Pushes demo records into the current domain stores. Development only. */
export async function seedMockData(): Promise<void> {
  const { initializeChildProfile } = await loadProfileLifecycle();
  initializeChildProfile(MOCK_FAMILY, BIRTH_VITALS);

  const growth = useGrowthStore.getState();
  GROWTH_RECORDS.forEach((record) => {
    if (!growth.currentStageData().growthHistory.some((item) => item.id === record.id)) {
      growth.addGrowthMeasurement({
        weight: record.weight,
        height: record.height,
        headCirc: record.headCirc,
        date: record.date,
        note: record.note,
      });
    }
  });

  useExpenseStore.getState().setMonthlyBudget(8_000_000);
  EXPENSES.forEach((entry) => useExpenseStore.getState().addExpense(entry));

  TIMELINE_ITEMS.forEach((item) =>
    useTimelineStore.getState().addTimelineItem({
      title: item.title,
      content: item.content,
      tag: item.tag,
      tagType: item.tagType,
      type: item.type,
      date: item.date,
    }),
  );

  REMINDERS.forEach((item) =>
    useReminderStore.getState().createReminder({
      type: item.type,
      title: item.title,
      enabled: item.enabled,
      mode: item.mode,
      triggerAt: item.triggerAt,
      repeat: item.repeat,
      quickLogAction: item.quickLogAction,
      note: item.note,
    }),
  );

  BABY_ACTIVITIES.forEach((activity) => useActivityStore.getState().addBabyActivity(activity));
  MOM_ACTIVITIES.forEach((activity) => useActivityStore.getState().addMomActivity(activity));

  void setLocalRecord(
    'babygrowth_v4_sync_meta',
    JSON.stringify({
      lastSyncedFingerprint: null,
      remoteFileId: null,
      lastSyncedAt: null,
      autoSyncEnabled: false,
    }),
  );
}

export function isMockDataEnabled(): boolean {
  if (!import.meta.env.DEV) return false;

  try {
    if (localStorage.getItem('babygrowth_mock') === '0') return false;
    if (new URLSearchParams(window.location.search).has('nomock')) return false;
  } catch {
    // Ignore storage and URL access errors in restricted environments.
  }

  if (import.meta.env.VITE_MOCK_DATA === 'true') return true;
  try {
    if (localStorage.getItem('babygrowth_mock') === '1') return true;
    if (new URLSearchParams(window.location.search).has('mock')) return true;
  } catch {
    // Ignore storage and URL access errors in restricted environments.
  }

  return !isGoogleConfigured();
}
