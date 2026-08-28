import { useActivityStore } from '@/features/activities';
import { useExpenseStore } from '@/features/expenses';
import { exportGrowthFacts, hydrateGrowthFacts, useGrowthStore } from '@/features/growth';
import { useProfileStore } from '@/features/profile';
import { useReminderStore } from '@/features/reminders';
import {
  APP_SNAPSHOT_GENERATION,
  type AppSnapshot,
  type AppSnapshotRuntime,
} from '@/features/sync';
import { useTimelineStore } from '@/features/timeline';
import { useUIStore } from '@/store/useUIStore';
import { hasIndexedDb } from '@/data/appDatabase';
import {
  readAllExpenses,
  readAllJournalData,
  readAllReminderOccurrences,
  replaceExpenses,
  replaceJournalData,
  replaceReminderOccurrences,
} from '@/data/normalizedRepositories';
import { waitForTrackedLocalWrites } from '@/data/localWriteTracker';

const NORMALIZED_WRITE_KEYS = [
  'babygrowth_v4_activities',
  'babygrowth_v4_timeline',
  'babygrowth_v4_expenses',
  'babygrowth_v4_reminders',
] as const;

export function createAppSnapshotRuntime(): AppSnapshotRuntime {
  return {
    exportSnapshot: async (now) => {
      const profile = useProfileStore.getState();
      const growth = useGrowthStore.getState();
      const activities = useActivityStore.getState();
      const expenses = useExpenseStore.getState();
      const timeline = useTimelineStore.getState();
      const reminders = useReminderStore.getState();
      const ui = useUIStore.getState();

      await waitForTrackedLocalWrites(NORMALIZED_WRITE_KEYS);
      const normalizedJournal = hasIndexedDb() ? await readAllJournalData() : null;
      const normalizedExpenses = hasIndexedDb() ? await readAllExpenses() : null;
      const normalizedReminderOccurrences = hasIndexedDb() ? await readAllReminderOccurrences() : null;
      const allActivities = normalizedJournal?.activities
        ?? [...activities.babyActivities, ...activities.momActivities];
      const allTimelineItems = normalizedJournal?.timelineItems ?? timeline.timelineItems;
      const allExpenses = normalizedExpenses ?? expenses.expenses;
      const allReminderOccurrences = normalizedReminderOccurrences ?? reminders.occurrenceStates;

      const snapshot: AppSnapshot = {
        generation: APP_SNAPSHOT_GENERATION,
        exportedAt: now.toISOString(),
        profile: {
          familyData: structuredClone(profile.familyData),
          profileMode: ui.profileMode,
        },
        activities: {
          baby: structuredClone(allActivities.filter((record) => record.owner === 'baby')),
          mom: structuredClone(allActivities.filter((record) => record.owner === 'mom')),
          medicationCatalog: structuredClone(activities.medicationCatalog),
        },
        growth: exportGrowthFacts(growth),
        timeline: {
          items: structuredClone(allTimelineItems),
        },
        expenses: {
          records: structuredClone(allExpenses),
          monthlyBudget: expenses.monthlyBudget,
        },
        reminders: {
          items: structuredClone(reminders.reminders),
          occurrenceStates: structuredClone(allReminderOccurrences),
          systemNotificationsEnabled: reminders.systemNotificationsEnabled,
        },
      };

      return snapshot;
    },
    applySnapshot: async (snapshot) => {
      await Promise.all([
        replaceJournalData({
          activities: [...snapshot.activities.baby, ...snapshot.activities.mom],
          timelineItems: snapshot.timeline.items,
        }),
        replaceExpenses(snapshot.expenses.records),
        replaceReminderOccurrences(snapshot.reminders.occurrenceStates),
      ]);
      useProfileStore.setState({ familyData: structuredClone(snapshot.profile.familyData) });
      useGrowthStore.setState(hydrateGrowthFacts(snapshot.growth));
      useUIStore.setState({ profileMode: snapshot.profile.profileMode });
      useActivityStore.setState({
        babyActivities: structuredClone(snapshot.activities.baby),
        momActivities: structuredClone(snapshot.activities.mom),
        medicationCatalog: structuredClone(snapshot.activities.medicationCatalog),
      });
      useExpenseStore.setState({
        expenses: structuredClone(snapshot.expenses.records),
        monthlyBudget: snapshot.expenses.monthlyBudget,
      });
      useTimelineStore.setState({ timelineItems: structuredClone(snapshot.timeline.items) });
      useReminderStore.setState({
        reminders: structuredClone(snapshot.reminders.items),
        occurrenceStates: structuredClone(snapshot.reminders.occurrenceStates),
        systemNotificationsEnabled: snapshot.reminders.systemNotificationsEnabled,
      });
    },
    subscribeChanges: (listener) => {
      const unsubscribe = [
        useProfileStore.subscribe(listener),
        useGrowthStore.subscribe(listener),
        useUIStore.subscribe(listener),
        useActivityStore.subscribe(listener),
        useExpenseStore.subscribe(listener),
        useTimelineStore.subscribe(listener),
        useReminderStore.subscribe(listener),
      ];
      return () => unsubscribe.forEach((stop) => stop());
    },
  };
}
