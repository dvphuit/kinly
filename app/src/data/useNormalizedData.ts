import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  activityJournalEntry,
  hasIndexedDb,
  timelineJournalEntry,
  type JournalEntry,
} from '@/data/appDatabase';
import {
  journalSortDescending,
  queryExpensesByMonth,
  queryJournalDates,
  queryJournalPage,
  queryReminderSourceActivities,
  type JournalPage,
} from '@/data/normalizedRepositories';
import { useActivityStore, type BabyActivity, type MomActivity } from '@/features/activities';
import { useExpenseStore } from '@/features/expenses';
import type { ProfileMode } from '@/features/profile';
import { useTimelineStore, type TimelineItem } from '@/features/timeline';
import type { ExpenseRecord } from '@/types/expense';

const EMPTY_BABY_ACTIVITIES: BabyActivity[] = [];
const EMPTY_MOM_ACTIVITIES: MomActivity[] = [];
const EMPTY_TIMELINE_ITEMS: TimelineItem[] = [];
const EMPTY_EXPENSES: ExpenseRecord[] = [];

function fallbackJournalPage(input: {
  owner: ProfileMode;
  startDate: string;
  endDate: string;
  limit: number;
  babyActivities: readonly BabyActivity[];
  momActivities: readonly MomActivity[];
  timelineItems: readonly TimelineItem[];
}): JournalPage {
  const entries = [
    ...input.babyActivities.flatMap((record) => {
      const entry = activityJournalEntry(record);
      return entry ? [entry] : [];
    }),
    ...input.momActivities.flatMap((record) => {
      const entry = activityJournalEntry(record);
      return entry ? [entry] : [];
    }),
    ...input.timelineItems.flatMap((item) => {
      const entry = timelineJournalEntry(item);
      return entry ? [entry] : [];
    }),
  ]
    .filter((entry) => entry.owner === input.owner
      && entry.localDate >= input.startDate
      && entry.localDate <= input.endDate)
    .sort(journalSortDescending);
  return { entries: entries.slice(0, input.limit), hasMore: entries.length > input.limit };
}

export interface JournalRangeData {
  babyActivities: BabyActivity[];
  momActivities: MomActivity[];
  timelineItems: TimelineItem[];
  hasMore: boolean;
  loading: boolean;
}

function partitionJournalEntries(entries: readonly JournalEntry[]): {
  babyActivities: BabyActivity[];
  momActivities: MomActivity[];
  timelineItems: TimelineItem[];
} {
  const babyActivities: BabyActivity[] = [];
  const momActivities: MomActivity[] = [];
  const timelineItems: TimelineItem[] = [];
  entries.forEach((entry) => {
    if (entry.kind === 'timeline') timelineItems.push(entry.payload);
    else if (entry.payload.owner === 'baby') babyActivities.push(entry.payload);
    else momActivities.push(entry.payload);
  });
  return { babyActivities, momActivities, timelineItems };
}

export function useJournalRange(input: {
  owner: ProfileMode;
  startDate: string;
  endDate: string;
  limit: number;
}): JournalRangeData {
  const { owner, startDate, endDate, limit } = input;
  const babyActivities = useActivityStore((state) => state.babyActivities) ?? EMPTY_BABY_ACTIVITIES;
  const momActivities = useActivityStore((state) => state.momActivities) ?? EMPTY_MOM_ACTIVITIES;
  const timelineItems = useTimelineStore((state) => state.timelineItems) ?? EMPTY_TIMELINE_ITEMS;
  const persistentPage = useLiveQuery(
    () => queryJournalPage({ owner, startDate, endDate, limit }),
    [owner, startDate, endDate, limit],
  );
  const fallbackPage = useMemo(() => fallbackJournalPage({
    owner,
    startDate,
    endDate,
    limit,
    babyActivities,
    momActivities,
    timelineItems,
  }), [babyActivities, endDate, limit, owner, startDate, momActivities, timelineItems]);
  const page = persistentPage ?? fallbackPage;

  return useMemo(() => {
    const partitioned = partitionJournalEntries(page.entries);
    return {
      ...partitioned,
      hasMore: page.hasMore,
      loading: hasIndexedDb() && persistentPage === undefined,
    };
  }, [page, persistentPage]);
}

export function useJournalDates(owner: ProfileMode): string[] | undefined {
  const babyActivities = useActivityStore((state) => state.babyActivities) ?? EMPTY_BABY_ACTIVITIES;
  const momActivities = useActivityStore((state) => state.momActivities) ?? EMPTY_MOM_ACTIVITIES;
  const timelineItems = useTimelineStore((state) => state.timelineItems) ?? EMPTY_TIMELINE_ITEMS;
  const persistentDates = useLiveQuery(
    () => queryJournalDates(owner),
    [owner],
  );
  const fallbackDates = useMemo(() => {
    const entries = [
      ...babyActivities.flatMap((record) => {
        const entry = activityJournalEntry(record);
        return entry ? [entry] : [];
      }),
      ...momActivities.flatMap((record) => {
        const entry = activityJournalEntry(record);
        return entry ? [entry] : [];
      }),
      ...timelineItems.flatMap((item) => {
        const entry = timelineJournalEntry(item);
        return entry ? [entry] : [];
      }),
    ];
    return [...new Set(entries.filter((entry) => entry.owner === owner).map((entry) => entry.localDate))].sort();
  }, [babyActivities, momActivities, owner, timelineItems]);
  return persistentDates ?? fallbackDates;
}

export function useReminderActivitySources(): {
  babyActivities: BabyActivity[];
  momActivities: MomActivity[];
} {
  const fallbackBaby = useActivityStore((state) => state.babyActivities) ?? EMPTY_BABY_ACTIVITIES;
  const fallbackMom = useActivityStore((state) => state.momActivities) ?? EMPTY_MOM_ACTIVITIES;
  const persistent = useLiveQuery(
    () => queryReminderSourceActivities(),
    [],
  );
  if (!persistent) return { babyActivities: fallbackBaby, momActivities: fallbackMom };
  return {
    babyActivities: persistent.filter((record): record is BabyActivity => record.owner === 'baby'),
    momActivities: persistent.filter((record): record is MomActivity => record.owner === 'mom'),
  };
}

export function useExpensesByMonth(localMonth: string): ExpenseRecord[] {
  const fallbackExpenses = useExpenseStore((state) => state.expenses) ?? EMPTY_EXPENSES;
  const persistent = useLiveQuery(
    () => queryExpensesByMonth(localMonth),
    [localMonth],
  );
  return persistent ?? fallbackExpenses.filter((record) => {
    const date = new Date(record.occurredAt);
    if (!Number.isFinite(date.getTime())) return false;
    const recordMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return recordMonth === localMonth;
  });
}
