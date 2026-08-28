import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { indexedDbStorage } from '@/data/localDb';
import type { Reminder, ReminderOccurrence, ReminderOccurrenceState } from '@/types/reminder';
import {
  clearReminderOccurrences,
  deleteReminderOccurrences,
  saveReminderOccurrence,
} from '@/data/normalizedRepositories';
import { logDiagnostic } from '@/app/diagnostics/diagnosticLog';

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reminder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function reportPersistenceFailure(operation: Promise<void>, action: string, id?: string): void {
  void operation.catch((error: unknown) => {
    logDiagnostic('database', 'error', `Không thể ${action} trạng thái reminder`, { id, error });
  });
}

export interface ReminderStoreState {
  reminders: Reminder[];
  occurrenceStates: Record<string, ReminderOccurrenceState>;
  systemNotificationsEnabled: boolean;
  createReminder: (input: Omit<Reminder, 'id' | 'createdAt' | 'updatedAt'> & { enabled?: boolean }) => Reminder;
  updateReminder: (id: string, patch: Partial<Omit<Reminder, 'id' | 'createdAt'>>) => void;
  deleteReminder: (id: string) => void;
  completeOccurrence: (occurrence: ReminderOccurrence) => void;
  snoozeOccurrence: (occurrence: ReminderOccurrence, minutes: number) => void;
  markSurfaced: (occurrence: ReminderOccurrence) => void;
  setSystemNotificationsEnabled: (enabled: boolean) => void;
  resetTrackingData: () => void;
}

export const useReminderStore = create<ReminderStoreState>()(
  persist(
    (set) => ({
      reminders: [], occurrenceStates: {}, systemNotificationsEnabled: false,
      createReminder: (input) => {
        const now = new Date().toISOString();
        const reminder: Reminder = { ...input, id: createId(), enabled: input.enabled === true, repeat: input.repeat ?? 'none', createdAt: now, updatedAt: now };
        set((state) => ({ reminders: [...state.reminders, reminder] }));
        return reminder;
      },
      updateReminder: (id, patch) => set((state) => ({ reminders: state.reminders.map((reminder) => reminder.id === id ? { ...reminder, ...patch, id: reminder.id, createdAt: reminder.createdAt, updatedAt: new Date().toISOString() } : reminder) })),
      deleteReminder: (id) => {
        set((state) => ({
          reminders: state.reminders.filter((reminder) => reminder.id !== id),
          occurrenceStates: Object.fromEntries(
            Object.entries(state.occurrenceStates).filter(([, occurrence]) => occurrence.reminderId !== id),
          ),
        }));
        reportPersistenceFailure(deleteReminderOccurrences(id), 'xóa', id);
      },
      completeOccurrence: (occurrence) => {
        const completedAt = new Date().toISOString();
        const state: ReminderOccurrenceState = { occurrenceId: occurrence.occurrenceId, reminderId: occurrence.reminderId, dueAt: occurrence.originalDueAt, surfacedAt: occurrence.state?.surfacedAt, snoozedUntil: occurrence.state?.snoozedUntil, completedAt };
        set((current) => ({ occurrenceStates: { ...current.occurrenceStates, [occurrence.occurrenceId]: state } }));
        reportPersistenceFailure(saveReminderOccurrence(state), 'lưu', state.occurrenceId);
      },
      snoozeOccurrence: (occurrence, minutes) => {
        const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
        const snoozedUntil = new Date(Date.now() + safeMinutes * 60_000).toISOString();
        const state: ReminderOccurrenceState = { occurrenceId: occurrence.occurrenceId, reminderId: occurrence.reminderId, dueAt: occurrence.originalDueAt, snoozedUntil };
        set((current) => ({ occurrenceStates: { ...current.occurrenceStates, [occurrence.occurrenceId]: state } }));
        reportPersistenceFailure(saveReminderOccurrence(state), 'lưu', state.occurrenceId);
      },
      markSurfaced: (occurrence) => {
        if (occurrence.state?.surfacedAt) return;
        const state: ReminderOccurrenceState = { occurrenceId: occurrence.occurrenceId, reminderId: occurrence.reminderId, dueAt: occurrence.originalDueAt, snoozedUntil: occurrence.state?.snoozedUntil, completedAt: occurrence.state?.completedAt, surfacedAt: new Date().toISOString() };
        set((current) => ({ occurrenceStates: { ...current.occurrenceStates, [occurrence.occurrenceId]: state } }));
        reportPersistenceFailure(saveReminderOccurrence(state), 'lưu', state.occurrenceId);
      },
      setSystemNotificationsEnabled: (enabled) => set({ systemNotificationsEnabled: enabled }),
      resetTrackingData: () => {
        set({ reminders: [], occurrenceStates: {}, systemNotificationsEnabled: false });
        reportPersistenceFailure(clearReminderOccurrences(), 'xóa toàn bộ');
      },
    }),
    { name: 'babygrowth_v4_reminders', storage: createJSONStorage(() => indexedDbStorage), partialize: (state) => ({ reminders: state.reminders, systemNotificationsEnabled: state.systemNotificationsEnabled }) },
  ),
);
