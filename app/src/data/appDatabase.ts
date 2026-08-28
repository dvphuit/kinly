import Dexie, { type Table } from 'dexie';
import { INITIAL_TIMELINE_ITEMS } from '@/data/seedData';
import type { ActivityRecord } from '@/features/activities';
import type { TimelineItem } from '@/features/timeline';
import type { ExpenseRecord } from '@/types/expense';
import type { ProfileMode } from '@/features/profile';
import type { ReminderOccurrenceState } from '@/features/reminders';
import {
  isBabyActivity,
  isExpenseRecord,
  isMomActivity,
  isReminderOccurrenceState,
  isTimelineItem,
} from '@/features/sync';

export const DATABASE_NAME = 'babygrowth-local';

export type JournalEntryKind = 'activity' | 'timeline';

interface JournalEntryBase {
  id: string;
  sourceId: string;
  owner: ProfileMode;
  localDate: string;
  sortKey: string;
  occurredAt: string;
}

export type ActivityJournalEntry = JournalEntryBase & {
  kind: 'activity';
  activityType: ActivityRecord['type'];
  payload: ActivityRecord;
};

export type TimelineJournalEntry = JournalEntryBase & {
  kind: 'timeline';
  activityType: '';
  payload: TimelineItem;
};

export type JournalEntry = ActivityJournalEntry | TimelineJournalEntry;

export type ExpenseRow = ExpenseRecord & {
  localMonth: string;
};

export interface DatabaseMetaRow {
  key: string;
  value: string;
}

export type ReminderOccurrenceRow = ReminderOccurrenceState & {
  status: 'open' | 'completed';
};

export function reminderOccurrenceRow(occurrence: ReminderOccurrenceState): ReminderOccurrenceRow {
  return {
    ...occurrence,
    status: occurrence.completedAt ? 'completed' : 'open',
  };
}

class KinlyDatabase extends Dexie {
  declare zustand: Table<string, string>;
  declare media: Table<Blob, string>;
  declare journalEntries: Table<JournalEntry, string>;
  declare expenses: Table<ExpenseRow, string>;
  declare reminderOccurrences: Table<ReminderOccurrenceRow, string>;
  declare meta: Table<DatabaseMetaRow, string>;

  constructor() {
    super(DATABASE_NAME);
    this.version(3).stores({
      zustand: '',
      media: '',
      journalEntries: 'id,sourceId,kind,owner,localDate,sortKey,[owner+localDate],[owner+sortKey],[kind+sourceId],[owner+activityType+sortKey]',
      expenses: 'id,occurredAt,localMonth,[localMonth+occurredAt]',
      reminderOccurrences: 'occurrenceId,reminderId,dueAt,status,[reminderId+dueAt]',
      meta: 'key',
    });
  }
}

export const appDatabase = new KinlyDatabase();

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localDateAndTime(value: string): { localDate: string; localTime: string } | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    localDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    localTime: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`,
  };
}

export function activityJournalEntry(record: ActivityRecord): ActivityJournalEntry | null {
  const local = localDateAndTime(record.occurredAt);
  if (!local) return null;
  return {
    id: `activity:${record.id}`,
    sourceId: record.id,
    kind: 'activity',
    owner: record.owner,
    activityType: record.type,
    localDate: local.localDate,
    sortKey: `${local.localDate}T${local.localTime}`,
    occurredAt: record.occurredAt,
    payload: record,
  };
}

function timelineOwner(item: TimelineItem): ProfileMode {
  return item.owner ?? (item.tagType === 'mom' || item.type === 'mom' ? 'mom' : 'baby');
}

export function timelineJournalEntry(item: TimelineItem): TimelineJournalEntry | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null;
  const time = /^\d{2}:\d{2}/.test(item.timeFormatted) ? item.timeFormatted : '00:00';
  const local = new Date(`${item.date}T${time}:00`);
  const occurredAt = Number.isFinite(local.getTime()) ? local.toISOString() : `${item.date}T00:00:00.000Z`;
  return {
    id: `timeline:${item.id}`,
    sourceId: item.id,
    kind: 'timeline',
    owner: timelineOwner(item),
    activityType: '',
    localDate: item.date,
    sortKey: `${item.date}T${time}`,
    occurredAt,
    payload: item,
  };
}

export function expenseRow(record: ExpenseRecord): ExpenseRow | null {
  const local = localDateAndTime(record.occurredAt);
  if (!local) return null;
  return { ...record, localMonth: local.localDate.slice(0, 7) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePersistedEnvelope(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && isRecord(parsed.state) ? parsed : null;
  } catch {
    return null;
  }
}

function persistedState(envelope: Record<string, unknown> | null): Record<string, unknown> | null {
  return envelope && isRecord(envelope.state) ? envelope.state : null;
}

function withoutStateFields(
  envelope: Record<string, unknown>,
  fields: readonly string[],
): string {
  const state = persistedState(envelope) ?? {};
  const nextState = Object.fromEntries(
    Object.entries(state).filter(([key]) => !fields.includes(key)),
  );
  return JSON.stringify({ ...envelope, state: nextState });
}

const NORMALIZED_MIGRATION_KEY = 'normalized-collections-v1';
const ACTIVITY_STORAGE_KEY = 'babygrowth_v4_activities';
const TIMELINE_STORAGE_KEY = 'babygrowth_v4_timeline';
const EXPENSE_STORAGE_KEY = 'babygrowth_v4_expenses';
const REMINDER_STORAGE_KEY = 'babygrowth_v4_reminders';

let migrationPromise: Promise<void> | null = null;

async function migrateNormalizedCollections(): Promise<void> {
  if (!hasIndexedDb()) return;

  await appDatabase.transaction(
    'rw',
    appDatabase.zustand,
    appDatabase.journalEntries,
    appDatabase.expenses,
    appDatabase.reminderOccurrences,
    appDatabase.meta,
    async () => {
      if (await appDatabase.meta.get(NORMALIZED_MIGRATION_KEY)) return;

      const [activityRaw, timelineRaw, expenseRaw, reminderRaw] = await Promise.all([
        appDatabase.zustand.get(ACTIVITY_STORAGE_KEY),
        appDatabase.zustand.get(TIMELINE_STORAGE_KEY),
        appDatabase.zustand.get(EXPENSE_STORAGE_KEY),
        appDatabase.zustand.get(REMINDER_STORAGE_KEY),
      ]);
      const activityEnvelope = parsePersistedEnvelope(activityRaw);
      const timelineEnvelope = parsePersistedEnvelope(timelineRaw);
      const expenseEnvelope = parsePersistedEnvelope(expenseRaw);
      const reminderEnvelope = parsePersistedEnvelope(reminderRaw);
      const activityState = persistedState(activityEnvelope);
      const timelineState = persistedState(timelineEnvelope);
      const expenseState = persistedState(expenseEnvelope);
      const reminderState = persistedState(reminderEnvelope);

      const activityCandidates = [
        ...(Array.isArray(activityState?.babyActivities) ? activityState.babyActivities : []),
        ...(Array.isArray(activityState?.momActivities) ? activityState.momActivities : []),
      ];
      const activityEntries = activityCandidates
        .filter((value): value is ActivityRecord => isBabyActivity(value) || isMomActivity(value))
        .flatMap((record) => {
          const entry = activityJournalEntry(record);
          return entry ? [entry] : [];
        });

      const timelineCandidates = Array.isArray(timelineState?.timelineItems)
        ? timelineState.timelineItems
        : timelineRaw === undefined
          ? INITIAL_TIMELINE_ITEMS
          : [];
      const timelineEntries = timelineCandidates
        .filter(isTimelineItem)
        .flatMap((item) => {
          const entry = timelineJournalEntry(item);
          return entry ? [entry] : [];
        });

      const expenseEntries = (Array.isArray(expenseState?.expenses) ? expenseState.expenses : [])
        .filter(isExpenseRecord)
        .flatMap((record) => {
          const row = expenseRow(record);
          return row ? [row] : [];
        });
      const reminderEntries = isRecord(reminderState?.occurrenceStates)
        ? Object.values(reminderState.occurrenceStates)
          .filter(isReminderOccurrenceState)
          .map(reminderOccurrenceRow)
        : [];

      if (activityEntries.length || timelineEntries.length) {
        await appDatabase.journalEntries.bulkPut([...activityEntries, ...timelineEntries]);
      }
      if (expenseEntries.length) await appDatabase.expenses.bulkPut(expenseEntries);
      if (reminderEntries.length) await appDatabase.reminderOccurrences.bulkPut(reminderEntries);

      if (activityEnvelope) {
        await appDatabase.zustand.put(
          withoutStateFields(activityEnvelope, ['babyActivities', 'momActivities']),
          ACTIVITY_STORAGE_KEY,
        );
      }
      if (timelineEnvelope) {
        await appDatabase.zustand.put(
          withoutStateFields(timelineEnvelope, ['timelineItems']),
          TIMELINE_STORAGE_KEY,
        );
      }
      if (expenseEnvelope) {
        await appDatabase.zustand.put(
          withoutStateFields(expenseEnvelope, ['expenses']),
          EXPENSE_STORAGE_KEY,
        );
      }
      if (reminderEnvelope) {
        await appDatabase.zustand.put(
          withoutStateFields(reminderEnvelope, ['occurrenceStates']),
          REMINDER_STORAGE_KEY,
        );
      }

      await appDatabase.meta.put({ key: NORMALIZED_MIGRATION_KEY, value: new Date().toISOString() });
    },
  );
}

export function ensureNormalizedDataMigration(): Promise<void> {
  if (!hasIndexedDb()) return Promise.resolve();
  if (!migrationPromise) {
    migrationPromise = migrateNormalizedCollections().catch((error: unknown) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}
