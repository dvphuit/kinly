import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { queryActiveReminderOccurrences } from '@/data/normalizedRepositories';
import { useReminderStore } from '@/features/reminders/store/useReminderStore';
import type { ReminderOccurrenceState } from '@/types/reminder';

const EMPTY_STATES: Record<string, ReminderOccurrenceState> = {};

export function useReminderOccurrenceStates(): Record<string, ReminderOccurrenceState> {
  const fallback = useReminderStore((state) => state.occurrenceStates) ?? EMPTY_STATES;
  const persistent = useLiveQuery(
    () => queryActiveReminderOccurrences(),
    [],
  );

  useEffect(() => {
    if (persistent) useReminderStore.setState({ occurrenceStates: persistent });
  }, [persistent]);

  return persistent ?? fallback;
}
