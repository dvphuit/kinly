import { useCallback, useEffect, useRef } from 'react';
import { getDueOccurrences, getReminderOccurrences } from '@/features/reminders/domain/reminderScheduler';
import { showReminderNotification } from '@/features/reminders/services/notificationService';
import { useReminderStore } from '@/features/reminders/store/useReminderStore';
import { useReminderActivitySources } from '@/data/useNormalizedData';
import { useReminderOccurrenceStates } from '@/features/reminders/hooks/useReminderOccurrenceStates';

interface ReminderLifecycleOptions {
  onQuickLog?: (action: string) => void;
  onOpenNotifications?: () => void;
}

export function useReminderLifecycle({ onQuickLog, onOpenNotifications }: ReminderLifecycleOptions = {}) {
  const reminders = useReminderStore((state) => state.reminders);
  const occurrenceStates = useReminderOccurrenceStates();
  const systemNotificationsEnabled = useReminderStore((state) => state.systemNotificationsEnabled);
  const { babyActivities, momActivities } = useReminderActivitySources();
  const runningRef = useRef(false);

  const checkDue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const due = getDueOccurrences({ reminders, babyActivities, momActivities, occurrenceStates, now: new Date() });
      if (!systemNotificationsEnabled) return;

      for (const occurrence of due) {
        if (occurrence.state?.surfacedAt) continue;
        const shown = await showReminderNotification(occurrence);
        if (shown) useReminderStore.getState().markSurfaced(occurrence);
      }
    } finally {
      runningRef.current = false;
    }
  }, [babyActivities, momActivities, occurrenceStates, reminders, systemNotificationsEnabled]);

  useEffect(() => {
    void checkDue();
    const onFocus = () => void checkDue();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkDue();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => void checkDue(), 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [checkDue]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const action = url.searchParams.get('reminderAction');
    const occurrenceId = url.searchParams.get('occurrenceId');
    if (!action) return;

    if (action === 'open') {
      onOpenNotifications?.();
    } else if (occurrenceId) {
      const occurrences = getReminderOccurrences({ reminders, babyActivities, momActivities, occurrenceStates, now: new Date() });
      const occurrence = occurrences.find((item) => item.occurrenceId === occurrenceId);
      if (occurrence) {
        if (action === 'complete') useReminderStore.getState().completeOccurrence(occurrence);
        else if (action === 'snooze') useReminderStore.getState().snoozeOccurrence(occurrence, 10);
        else if (action === 'quick-log' && occurrence.reminder.quickLogAction) onQuickLog?.(occurrence.reminder.quickLogAction);
      }
    }

    url.searchParams.delete('reminderAction');
    url.searchParams.delete('reminderId');
    url.searchParams.delete('occurrenceId');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [babyActivities, momActivities, occurrenceStates, onOpenNotifications, onQuickLog, reminders]);
}
