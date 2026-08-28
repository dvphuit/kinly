import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { indexedDbStorage } from '@/data/localDb';
import {
  clearActivityRecords,
  deleteActivityRecord,
  saveActivity,
} from '@/data/normalizedRepositories';
import { logDiagnostic } from '@/app/diagnostics/diagnosticLog';
import type { ActivityRecord, BabyActivity, MomActivity } from '@/features/activities/domain/types';
import {
  createDefaultMedicationCatalog,
  mergeMedicationCatalog,
  normalizeMedicationName,
  type MedicationCatalogItem,
  type MedicationKind,
} from '@/features/activities/domain/medicationCatalog';

type WithoutGeneratedFields<T> = T extends unknown ? Omit<T, 'id' | 'createdAt'> : never;
export type NewBabyActivity = WithoutGeneratedFields<BabyActivity>;
export type NewMomActivity = WithoutGeneratedFields<MomActivity>;

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function reportPersistenceFailure(operation: Promise<void>, action: string, id?: string): void {
  void operation.catch((error: unknown) => {
    logDiagnostic('database', 'error', `Không thể ${action} hoạt động`, { id, error });
  });
}

export interface ActivityStoreState {
  babyActivities: BabyActivity[];
  momActivities: MomActivity[];
  medicationCatalog: MedicationCatalogItem[];
  addBabyActivity: (input: NewBabyActivity) => BabyActivity;
  addMomActivity: (input: NewMomActivity) => MomActivity;
  upsertMedication: (input: { name: string; dose?: string; kind?: MedicationKind; infoUrl?: string }) => MedicationCatalogItem;
  deleteMedication: (id: string) => void;
  updateActivity: (id: string, patch: Partial<ActivityRecord>) => void;
  deleteActivity: (id: string) => void;
  resetTrackingData: () => void;
}

export const useActivityStore = create<ActivityStoreState>()(
  persist(
    (set, get) => ({
      babyActivities: [],
      momActivities: [],
      medicationCatalog: createDefaultMedicationCatalog(),

      addBabyActivity: (input) => {
        const record = { ...input, id: createId(), createdAt: nowIso() } as BabyActivity;
        set((state) => ({ babyActivities: [record, ...state.babyActivities] }));
        reportPersistenceFailure(saveActivity(record), 'lưu', record.id);
        return record;
      },

      addMomActivity: (input) => {
        const record = { ...input, id: createId(), createdAt: nowIso() } as MomActivity;
        set((state) => ({ momActivities: [record, ...state.momActivities] }));
        reportPersistenceFailure(saveActivity(record), 'lưu', record.id);
        return record;
      },

      upsertMedication: ({ name, dose, kind = 'medicine', infoUrl }) => {
        const trimmedName = name.trim().replace(/\s+/g, ' ');
        const trimmedDose = dose?.trim() || undefined;
        const trimmedInfoUrl = infoUrl?.trim() || undefined;
        const existing = get().medicationCatalog.find(
          (item) => normalizeMedicationName(item.name) === normalizeMedicationName(trimmedName),
        );
        const saved: MedicationCatalogItem = existing
          ? {
              ...existing,
              lastDose: trimmedDose ?? existing.lastDose,
              infoUrl: trimmedInfoUrl ?? existing.infoUrl,
            }
          : {
              id: createId().replace('activity-', 'medication-'),
              name: trimmedName,
              detail: 'Đã thêm',
              kind,
              builtIn: false,
              infoUrl: trimmedInfoUrl,
              lastDose: trimmedDose,
            };
        set((state) => ({
          medicationCatalog: existing
            ? state.medicationCatalog.map((item) => item.id === existing.id ? saved : item)
            : [...state.medicationCatalog, saved],
        }));
        return saved;
      },

      deleteMedication: (id) => set((state) => ({
        medicationCatalog: state.medicationCatalog.filter((item) => item.id !== id || item.builtIn),
      })),

      updateActivity: (id, patch) => {
        set((state) => ({
          babyActivities: state.babyActivities.map((record) =>
            record.id === id ? ({ ...record, ...patch, id: record.id, owner: 'baby' } as BabyActivity) : record
          ),
          momActivities: state.momActivities.map((record) =>
            record.id === id ? ({ ...record, ...patch, id: record.id, owner: 'mom' } as MomActivity) : record
          ),
        }));
        const updated = [...get().babyActivities, ...get().momActivities].find((record) => record.id === id);
        if (updated) reportPersistenceFailure(saveActivity(updated), 'cập nhật', id);
      },

      deleteActivity: (id) => {
        set((state) => ({
          babyActivities: state.babyActivities.filter((record) => record.id !== id),
          momActivities: state.momActivities.filter((record) => record.id !== id),
        }));
        reportPersistenceFailure(deleteActivityRecord(id), 'xóa', id);
      },

      resetTrackingData: () => {
        set({
          babyActivities: [],
          momActivities: [],
          medicationCatalog: createDefaultMedicationCatalog(),
        });
        reportPersistenceFailure(clearActivityRecords(), 'xóa toàn bộ');
      },
    }),
    {
      name: 'babygrowth_v4_activities',
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) => ({
        medicationCatalog: state.medicationCatalog,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ActivityStoreState>;
        return {
          ...currentState,
          ...persisted,
          medicationCatalog: mergeMedicationCatalog(persisted.medicationCatalog),
        };
      },
    }
  )
);
