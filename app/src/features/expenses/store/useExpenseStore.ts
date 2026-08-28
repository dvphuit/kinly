import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { indexedDbStorage } from '@/data/localDb';
import type { ExpenseRecord } from '@/types/expense';
import {
  clearExpenseRecords,
  deleteExpenseRecord,
  saveExpense,
} from '@/data/normalizedRepositories';
import { logDiagnostic } from '@/app/diagnostics/diagnosticLog';

const DEFAULT_MONTHLY_BUDGET = 5_000_000;

type ExpenseInput = Pick<ExpenseRecord, 'amount' | 'category' | 'occurredAt' | 'note'>;
type ExpensePatch = Partial<ExpenseInput>;

export interface ExpenseStoreState {
  expenses: ExpenseRecord[];
  monthlyBudget: number;
  setMonthlyBudget: (budget: number) => void;
  addExpense: (input: ExpenseInput) => ExpenseRecord;
  updateExpense: (id: string, patch: ExpensePatch) => void;
  deleteExpense: (id: string) => void;
  resetTrackingData: () => void;
}

function createExpenseId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function reportPersistenceFailure(operation: Promise<void>, action: string, id?: string): void {
  void operation.catch((error: unknown) => {
    logDiagnostic('database', 'error', `Không thể ${action} khoản chi`, { id, error });
  });
}

export const useExpenseStore = create<ExpenseStoreState>()(
  persist(
    (set) => ({
      expenses: [],
      monthlyBudget: DEFAULT_MONTHLY_BUDGET,
      setMonthlyBudget: (budget) => set({ monthlyBudget: Math.max(0, budget) }),
      addExpense: (input) => {
        const now = new Date().toISOString();
        const record: ExpenseRecord = {
          id: createExpenseId(),
          amount: input.amount,
          category: input.category,
          occurredAt: input.occurredAt,
          note: input.note,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ expenses: [record, ...state.expenses] }));
        reportPersistenceFailure(saveExpense(record), 'lưu', record.id);
        return record;
      },
      updateExpense: (id, patch) => {
        set((state) => ({
          expenses: state.expenses.map((record) => record.id === id
            ? { ...record, ...patch, id: record.id, createdAt: record.createdAt, updatedAt: new Date().toISOString() }
            : record),
        }));
        const updated = useExpenseStore.getState().expenses.find((record) => record.id === id);
        if (updated) reportPersistenceFailure(saveExpense(updated), 'cập nhật', id);
      },
      deleteExpense: (id) => {
        set((state) => ({ expenses: state.expenses.filter((record) => record.id !== id) }));
        reportPersistenceFailure(deleteExpenseRecord(id), 'xóa', id);
      },
      resetTrackingData: () => {
        set({ expenses: [], monthlyBudget: DEFAULT_MONTHLY_BUDGET });
        reportPersistenceFailure(clearExpenseRecords(), 'xóa toàn bộ');
      },
    }),
    {
      name: 'babygrowth_v4_expenses',
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) => ({ monthlyBudget: state.monthlyBudget }),
    },
  ),
);
