import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BabyActivity } from '@/features/activities';
import type { TimelineItem } from '@/features/timeline';
import type { ExpenseRecord } from '@/types/expense';
import type { ReminderOccurrenceState } from '@/types/reminder';

function installIndexedDb(): void {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
}

function activity(id: string, occurredAt: string): BabyActivity {
  return {
    id,
    owner: 'baby',
    type: 'feeding',
    amountMl: 90,
    method: 'bottle',
    occurredAt,
    createdAt: occurredAt,
  };
}

function timelineItem(id: string, date: string): TimelineItem {
  return {
    id,
    owner: 'baby',
    date,
    timeFormatted: '08:30',
    time: `${date} • 08:30`,
    author: 'Mẹ',
    authorAvatar: '/mom.jpg',
    title: 'Khoảnh khắc',
    content: '',
    stats: [],
    likes: 0,
    comments: 0,
    userLiked: false,
    tag: 'Nhật ký',
    tagType: 'general',
    type: 'daily',
  };
}

function expense(id: string, occurredAt: string): ExpenseRecord {
  return {
    id,
    amount: 100_000,
    category: 'Khác',
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

describe('normalized Dexie repositories', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    installIndexedDb();
  });

  it('migrates legacy Zustand arrays once and removes them from JSON persistence', async () => {
    const { appDatabase, ensureNormalizedDataMigration } = await import('@/data/appDatabase');
    const activityRecord = activity('legacy-activity', '2026-08-20T08:00:00.000Z');
    const moment = timelineItem('legacy-moment', '2026-08-20');
    const expenseRecord = expense('legacy-expense', '2026-08-20T09:00:00.000Z');
    const reminderOccurrence: ReminderOccurrenceState = {
      occurrenceId: 'reminder-1@2026-08-20',
      reminderId: 'reminder-1',
      dueAt: '2026-08-20T08:00:00.000Z',
      completedAt: '2026-08-20T08:05:00.000Z',
    };

    await Promise.all([
      appDatabase.zustand.put(JSON.stringify({ state: {
        babyActivities: [activityRecord],
        momActivities: [],
        medicationCatalog: [],
      }, version: 0 }), 'babygrowth_v4_activities'),
      appDatabase.zustand.put(JSON.stringify({ state: {
        timelineItems: [moment],
        selectedCalendarDate: '2026-08-20',
      }, version: 0 }), 'babygrowth_v4_timeline'),
      appDatabase.zustand.put(JSON.stringify({ state: {
        expenses: [expenseRecord],
        monthlyBudget: 5_000_000,
      }, version: 0 }), 'babygrowth_v4_expenses'),
      appDatabase.zustand.put(JSON.stringify({ state: {
        reminders: [],
        occurrenceStates: { [reminderOccurrence.occurrenceId]: reminderOccurrence },
      }, version: 0 }), 'babygrowth_v4_reminders'),
    ]);

    await ensureNormalizedDataMigration();

    expect(await appDatabase.journalEntries.count()).toBe(2);
    expect(await appDatabase.expenses.count()).toBe(1);
    expect(await appDatabase.reminderOccurrences.count()).toBe(1);
    const activityState = await appDatabase.zustand.get('babygrowth_v4_activities');
    const timelineState = await appDatabase.zustand.get('babygrowth_v4_timeline');
    const expenseState = await appDatabase.zustand.get('babygrowth_v4_expenses');
    const reminderState = await appDatabase.zustand.get('babygrowth_v4_reminders');
    expect(activityState).not.toContain('babyActivities');
    expect(timelineState).not.toContain('timelineItems');
    expect(expenseState).not.toContain('expenses');
    expect(reminderState).not.toContain('occurrenceStates');

    await ensureNormalizedDataMigration();
    expect(await appDatabase.journalEntries.count()).toBe(2);
    expect(await appDatabase.expenses.count()).toBe(1);
    expect(await appDatabase.reminderOccurrences.count()).toBe(1);
  });

  it('keeps an 18-year history out of memory by querying only the requested page and month', async () => {
    const {
      queryExpensesByMonth,
      queryActiveReminderOccurrences,
      queryJournalPage,
      replaceExpenses,
      replaceJournalData,
      replaceReminderOccurrences,
    } = await import('@/data/normalizedRepositories');
    const years = Array.from({ length: 18 }, (_, index) => 2008 + index);
    const longHistory = Array.from({ length: 18_000 }, (_, index) => {
      const year = years[index % years.length] ?? 2008;
      const month = String((index % 12) + 1).padStart(2, '0');
      const day = String((index % 28) + 1).padStart(2, '0');
      return activity(`activity-${index}`, `${year}-${month}-${day}T08:00:00.000Z`);
    });
    const busyDay = Array.from({ length: 100 }, (_, index) => (
      activity(`busy-${index}`, `2025-08-20T${String(index % 24).padStart(2, '0')}:00:00.000Z`)
    ));
    const expenses = Array.from({ length: 2_000 }, (_, index) => (
      expense(`expense-${index}`, `${2008 + (index % 18)}-${String((index % 12) + 1).padStart(2, '0')}-15T09:00:00.000Z`)
    ));
    const reminderOccurrences = Object.fromEntries(Array.from({ length: 6_570 }, (_, index) => {
      const dueAt = new Date(Date.UTC(2008, 0, index + 1, 8)).toISOString();
      const occurrence: ReminderOccurrenceState = {
        occurrenceId: `daily-reminder@${dueAt.slice(0, 10)}`,
        reminderId: 'daily-reminder',
        dueAt,
        completedAt: new Date(new Date(dueAt).getTime() + 60_000).toISOString(),
      };
      return [occurrence.occurrenceId, occurrence];
    }));
    const openOccurrence: ReminderOccurrenceState = {
      occurrenceId: 'daily-reminder@open',
      reminderId: 'daily-reminder',
      dueAt: '2000-01-01T08:00:00.000Z',
    };
    reminderOccurrences[openOccurrence.occurrenceId] = openOccurrence;

    await Promise.all([
      replaceJournalData({ activities: [...longHistory, ...busyDay], timelineItems: [] }),
      replaceExpenses(expenses),
      replaceReminderOccurrences(reminderOccurrences),
    ]);

    const page = await queryJournalPage({
      owner: 'baby',
      startDate: '2025-08-20',
      endDate: '2025-08-20',
      limit: 25,
    });
    const month = await queryExpensesByMonth('2025-06');
    const activeReminderStates = await queryActiveReminderOccurrences();

    expect(page.entries).toHaveLength(25);
    expect(page.hasMore).toBe(true);
    expect(page.entries.every((entry) => entry.localDate === '2025-08-20')).toBe(true);
    expect(month.length).toBeGreaterThan(0);
    expect(month.every((record) => record.occurredAt.startsWith('2025-06'))).toBe(true);
    expect(Object.keys(activeReminderStates)).toHaveLength(501);
    expect(activeReminderStates[openOccurrence.occurrenceId]).toEqual(openOccurrence);
  }, 15_000);
});
