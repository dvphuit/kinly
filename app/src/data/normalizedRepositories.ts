import {
  appDatabase,
  activityJournalEntry,
  ensureNormalizedDataMigration,
  expenseRow,
  hasIndexedDb,
  reminderOccurrenceRow,
  timelineJournalEntry,
  type JournalEntry,
  type ReminderOccurrenceRow,
} from '@/data/appDatabase';
import { runTrackedLocalWrite } from '@/data/localWriteTracker';
import type { ActivityRecord } from '@/features/activities';
import type { TimelineItem } from '@/features/timeline';
import type { ProfileMode } from '@/features/profile';
import type { ExpenseRecord } from '@/types/expense';
import type { ReminderOccurrenceState } from '@/features/reminders';

export const ACTIVITY_WRITE_KEY = 'babygrowth_v4_activities';
export const TIMELINE_WRITE_KEY = 'babygrowth_v4_timeline';
export const EXPENSE_WRITE_KEY = 'babygrowth_v4_expenses';
export const REMINDER_WRITE_KEY = 'babygrowth_v4_reminders';

const memoryJournalEntries = new Map<string, JournalEntry>();
const memoryExpenses = new Map<string, ExpenseRecord>();
const memoryReminderOccurrences = new Map<string, ReminderOccurrenceState>();

function storedReminderOccurrence(row: ReminderOccurrenceRow): ReminderOccurrenceState {
  return {
    occurrenceId: row.occurrenceId,
    reminderId: row.reminderId,
    dueAt: row.dueAt,
    surfacedAt: row.surfacedAt,
    completedAt: row.completedAt,
    snoozedUntil: row.snoozedUntil,
  };
}

export function journalSortDescending(left: JournalEntry, right: JournalEntry): number {
  return right.sortKey.localeCompare(left.sortKey) || right.id.localeCompare(left.id);
}
function journalInRange(
  entry: JournalEntry,
  owner: ProfileMode,
  startDate: string,
  endDate: string,
): boolean {
  return entry.owner === owner && entry.localDate >= startDate && entry.localDate <= endDate;
}

export interface JournalPage {
  entries: JournalEntry[];
  hasMore: boolean;
}

export async function queryJournalPage(input: {
  owner: ProfileMode;
  startDate: string;
  endDate: string;
  limit: number;
}): Promise<JournalPage> {
  const limit = Math.max(1, Math.floor(input.limit));
  if (!hasIndexedDb()) {
    const matches = [...memoryJournalEntries.values()]
      .filter((entry) => journalInRange(entry, input.owner, input.startDate, input.endDate))
      .sort(journalSortDescending);
    return { entries: matches.slice(0, limit), hasMore: matches.length > limit };
  }

  await ensureNormalizedDataMigration();
  const rows = await appDatabase.journalEntries
    .where('[owner+sortKey]')
    .between(
      [input.owner, `${input.startDate}T`],
      [input.owner, `${input.endDate}T\uffff`],
      true,
      true,
    )
    .reverse()
    .limit(limit + 1)
    .toArray();
  return { entries: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function queryJournalDates(owner: ProfileMode): Promise<string[]> {
  if (!hasIndexedDb()) {
    return [...new Set(
      [...memoryJournalEntries.values()]
        .filter((entry) => entry.owner === owner)
        .map((entry) => entry.localDate),
    )].sort();
  }

  await ensureNormalizedDataMigration();
  const keys = await appDatabase.journalEntries
    .where('[owner+localDate]')
    .between([owner, '0000-00-00'], [owner, '9999-99-99'], true, true)
    .uniqueKeys();
  return [...new Set(keys.flatMap((key) => (
    Array.isArray(key) && typeof key[1] === 'string' ? [key[1]] : []
  )))].sort();
}

async function queryLatestActivity(
  owner: ProfileMode,
  activityType: ActivityRecord['type'],
): Promise<ActivityRecord | null> {
  if (!hasIndexedDb()) {
    const entry = [...memoryJournalEntries.values()]
      .filter((entry) => entry.kind === 'activity' && entry.owner === owner && entry.activityType === activityType)
      .sort(journalSortDescending)[0];
    return entry?.kind === 'activity' ? entry.payload : null;
  }

  await ensureNormalizedDataMigration();
  const entry = await appDatabase.journalEntries
    .where('[owner+activityType+sortKey]')
    .between([owner, activityType, ''], [owner, activityType, '\uffff'], true, true)
    .last();
  return entry?.kind === 'activity' ? entry.payload : null;
}

export async function queryReminderSourceActivities(): Promise<ActivityRecord[]> {
  const [feeding, pumping] = await Promise.all([
    queryLatestActivity('baby', 'feeding'),
    queryLatestActivity('mom', 'pumping'),
  ]);
  return [feeding, pumping].filter((record): record is ActivityRecord => record !== null);
}

export function saveActivity(record: ActivityRecord): Promise<void> {
  const entry = activityJournalEntry(record);
  if (!entry) return Promise.reject(new Error(`Activity ${record.id} has an invalid occurredAt value.`));
  return runTrackedLocalWrite(ACTIVITY_WRITE_KEY, async () => {
    if (!hasIndexedDb()) {
      memoryJournalEntries.set(entry.id, entry);
      return;
    }
    await ensureNormalizedDataMigration();
    await appDatabase.journalEntries.put(entry);
  });
}

export function deleteActivityRecord(id: string): Promise<void> {
  return runTrackedLocalWrite(ACTIVITY_WRITE_KEY, async () => {
    memoryJournalEntries.delete(`activity:${id}`);
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.journalEntries.delete(`activity:${id}`);
  });
}

export function clearActivityRecords(): Promise<void> {
  return runTrackedLocalWrite(ACTIVITY_WRITE_KEY, async () => {
    [...memoryJournalEntries.entries()].forEach(([id, entry]) => {
      if (entry.kind === 'activity') memoryJournalEntries.delete(id);
    });
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.journalEntries.where('kind').equals('activity').delete();
  });
}

export function saveTimelineItem(item: TimelineItem): Promise<void> {
  const entry = timelineJournalEntry(item);
  if (!entry) return Promise.reject(new Error(`Timeline item ${item.id} has an invalid date value.`));
  return runTrackedLocalWrite(TIMELINE_WRITE_KEY, async () => {
    if (!hasIndexedDb()) {
      memoryJournalEntries.set(entry.id, entry);
      return;
    }
    await ensureNormalizedDataMigration();
    await appDatabase.journalEntries.put(entry);
  });
}

export function deleteTimelineRecord(id: string): Promise<void> {
  return runTrackedLocalWrite(TIMELINE_WRITE_KEY, async () => {
    memoryJournalEntries.delete(`timeline:${id}`);
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.journalEntries.delete(`timeline:${id}`);
  });
}

export function clearTimelineRecords(): Promise<void> {
  return runTrackedLocalWrite(TIMELINE_WRITE_KEY, async () => {
    [...memoryJournalEntries.entries()].forEach(([id, entry]) => {
      if (entry.kind === 'timeline') memoryJournalEntries.delete(id);
    });
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.journalEntries.where('kind').equals('timeline').delete();
  });
}

export async function readAllJournalData(): Promise<{
  activities: ActivityRecord[];
  timelineItems: TimelineItem[];
}> {
  const entries = hasIndexedDb()
    ? (await ensureNormalizedDataMigration(), await appDatabase.journalEntries.toArray())
    : [...memoryJournalEntries.values()];
  const activities: ActivityRecord[] = [];
  const timelineItems: TimelineItem[] = [];
  entries.sort(journalSortDescending).forEach((entry) => {
    if (entry.kind === 'activity') activities.push(entry.payload);
    else timelineItems.push(entry.payload);
  });
  return { activities, timelineItems };
}

export async function replaceJournalData(input: {
  activities: readonly ActivityRecord[];
  timelineItems: readonly TimelineItem[];
}): Promise<void> {
  const entries = [
    ...input.activities.flatMap((record) => {
      const entry = activityJournalEntry(record);
      return entry ? [entry] : [];
    }),
    ...input.timelineItems.flatMap((item) => {
      const entry = timelineJournalEntry(item);
      return entry ? [entry] : [];
    }),
  ];
  await runTrackedLocalWrite(ACTIVITY_WRITE_KEY, async () => {
    memoryJournalEntries.clear();
    entries.forEach((entry) => memoryJournalEntries.set(entry.id, entry));
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.transaction('rw', appDatabase.journalEntries, async () => {
      await appDatabase.journalEntries.clear();
      if (entries.length) await appDatabase.journalEntries.bulkPut(entries);
    });
  });
}

export async function replaceTimelineItems(items: readonly TimelineItem[]): Promise<void> {
  const entries = items.flatMap((item) => {
    const entry = timelineJournalEntry(item);
    return entry ? [entry] : [];
  });
  await runTrackedLocalWrite(TIMELINE_WRITE_KEY, async () => {
    [...memoryJournalEntries.entries()].forEach(([id, entry]) => {
      if (entry.kind === 'timeline') memoryJournalEntries.delete(id);
    });
    entries.forEach((entry) => memoryJournalEntries.set(entry.id, entry));
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.transaction('rw', appDatabase.journalEntries, async () => {
      await appDatabase.journalEntries.where('kind').equals('timeline').delete();
      if (entries.length) await appDatabase.journalEntries.bulkPut(entries);
    });
  });
}

export function saveExpense(record: ExpenseRecord): Promise<void> {
  const row = expenseRow(record);
  if (!row) return Promise.reject(new Error(`Expense ${record.id} has an invalid occurredAt value.`));
  return runTrackedLocalWrite(EXPENSE_WRITE_KEY, async () => {
    if (!hasIndexedDb()) {
      memoryExpenses.set(record.id, record);
      return;
    }
    await ensureNormalizedDataMigration();
    await appDatabase.expenses.put(row);
  });
}

export function deleteExpenseRecord(id: string): Promise<void> {
  return runTrackedLocalWrite(EXPENSE_WRITE_KEY, async () => {
    memoryExpenses.delete(id);
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.expenses.delete(id);
  });
}

export function clearExpenseRecords(): Promise<void> {
  return runTrackedLocalWrite(EXPENSE_WRITE_KEY, async () => {
    memoryExpenses.clear();
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.expenses.clear();
  });
}

export async function queryExpensesByMonth(localMonth: string): Promise<ExpenseRecord[]> {
  if (!hasIndexedDb()) {
    return [...memoryExpenses.values()]
      .filter((record) => expenseRow(record)?.localMonth === localMonth)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }
  await ensureNormalizedDataMigration();
  const rows = await appDatabase.expenses
    .where('[localMonth+occurredAt]')
    .between([localMonth, ''], [localMonth, '\uffff'], true, true)
    .reverse()
    .toArray();
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    category: row.category,
    occurredAt: row.occurredAt,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function readAllExpenses(): Promise<ExpenseRecord[]> {
  if (!hasIndexedDb()) return [...memoryExpenses.values()];
  await ensureNormalizedDataMigration();
  const rows = await appDatabase.expenses.toArray();
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    category: row.category,
    occurredAt: row.occurredAt,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function replaceExpenses(records: readonly ExpenseRecord[]): Promise<void> {
  const rows = records.flatMap((record) => {
    const row = expenseRow(record);
    return row ? [row] : [];
  });
  await runTrackedLocalWrite(EXPENSE_WRITE_KEY, async () => {
    memoryExpenses.clear();
    records.forEach((record) => memoryExpenses.set(record.id, record));
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.transaction('rw', appDatabase.expenses, async () => {
      await appDatabase.expenses.clear();
      if (rows.length) await appDatabase.expenses.bulkPut(rows);
    });
  });
}

export function saveReminderOccurrence(occurrence: ReminderOccurrenceState): Promise<void> {
  const row = reminderOccurrenceRow(occurrence);
  return runTrackedLocalWrite(REMINDER_WRITE_KEY, async () => {
    if (!hasIndexedDb()) {
      memoryReminderOccurrences.set(occurrence.occurrenceId, occurrence);
      return;
    }
    await ensureNormalizedDataMigration();
    await appDatabase.reminderOccurrences.put(row);
  });
}

export function deleteReminderOccurrences(reminderId: string): Promise<void> {
  return runTrackedLocalWrite(REMINDER_WRITE_KEY, async () => {
    [...memoryReminderOccurrences.entries()].forEach(([occurrenceId, occurrence]) => {
      if (occurrence.reminderId === reminderId) memoryReminderOccurrences.delete(occurrenceId);
    });
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.reminderOccurrences.where('reminderId').equals(reminderId).delete();
  });
}

export function clearReminderOccurrences(): Promise<void> {
  return runTrackedLocalWrite(REMINDER_WRITE_KEY, async () => {
    memoryReminderOccurrences.clear();
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.reminderOccurrences.clear();
  });
}

export async function queryActiveReminderOccurrences(limit = 500): Promise<Record<string, ReminderOccurrenceState>> {
  if (!hasIndexedDb()) {
    const values = [...memoryReminderOccurrences.values()];
    const open = values.filter((occurrence) => !occurrence.completedAt);
    const recent = values
      .filter((occurrence) => occurrence.completedAt)
      .sort((left, right) => right.dueAt.localeCompare(left.dueAt))
      .slice(0, limit);
    return Object.fromEntries([...open, ...recent].map((occurrence) => [occurrence.occurrenceId, occurrence]));
  }
  await ensureNormalizedDataMigration();
  const open = await appDatabase.reminderOccurrences.where('status').equals('open').toArray();
  const completed = await appDatabase.reminderOccurrences.where('status').equals('completed').toArray();
  const recentCompleted = completed
    .sort((left, right) => right.dueAt.localeCompare(left.dueAt))
    .slice(0, limit);
  const occurrences = new Map<string, ReminderOccurrenceState>();
  [...open, ...recentCompleted].map(storedReminderOccurrence).forEach((occurrence) => {
    occurrences.set(occurrence.occurrenceId, occurrence);
  });
  return Object.fromEntries(occurrences);
}

export async function readAllReminderOccurrences(): Promise<Record<string, ReminderOccurrenceState>> {
  if (!hasIndexedDb()) return Object.fromEntries(memoryReminderOccurrences);
  await ensureNormalizedDataMigration();
  const rows = await appDatabase.reminderOccurrences.toArray();
  return Object.fromEntries(rows.map((row) => {
    const occurrence = storedReminderOccurrence(row);
    return [occurrence.occurrenceId, occurrence];
  }));
}

export async function replaceReminderOccurrences(
  occurrences: Record<string, ReminderOccurrenceState>,
): Promise<void> {
  const values = Object.values(occurrences);
  const rows = values.map(reminderOccurrenceRow);
  await runTrackedLocalWrite(REMINDER_WRITE_KEY, async () => {
    memoryReminderOccurrences.clear();
    values.forEach((occurrence) => memoryReminderOccurrences.set(occurrence.occurrenceId, occurrence));
    if (!hasIndexedDb()) return;
    await ensureNormalizedDataMigration();
    await appDatabase.transaction('rw', appDatabase.reminderOccurrences, async () => {
      await appDatabase.reminderOccurrences.clear();
      if (rows.length) await appDatabase.reminderOccurrences.bulkPut(rows);
    });
  });
}

export async function resetNormalizedDatabase(): Promise<void> {
  memoryJournalEntries.clear();
  memoryExpenses.clear();
  memoryReminderOccurrences.clear();
  if (!hasIndexedDb()) return;
  await appDatabase.transaction(
    'rw',
    appDatabase.journalEntries,
    appDatabase.expenses,
    appDatabase.reminderOccurrences,
    appDatabase.meta,
    async () => {
      await Promise.all([
        appDatabase.journalEntries.clear(),
        appDatabase.expenses.clear(),
        appDatabase.reminderOccurrences.clear(),
        appDatabase.meta.clear(),
      ]);
    },
  );
}

export async function readNormalizedDataStats(): Promise<{ count: number; size: number }> {
  const [journal, expenses, reminderOccurrences] = await Promise.all([
    readAllJournalData(),
    readAllExpenses(),
    readAllReminderOccurrences(),
  ]);
  const records = {
    activities: journal.activities,
    timelineItems: journal.timelineItems,
    expenses,
    reminderOccurrences,
  };
  return {
    count: journal.activities.length
      + journal.timelineItems.length
      + expenses.length
      + Object.keys(reminderOccurrences).length,
    size: new TextEncoder().encode(JSON.stringify(records)).byteLength,
  };
}
