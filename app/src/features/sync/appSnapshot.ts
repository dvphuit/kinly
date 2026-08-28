import {
  parseAppSnapshot,
  type AppSnapshot,
} from './appSnapshotSchema';

export {
  APP_SNAPSHOT_GENERATION,
  isAppSnapshot,
  isBabyActivity,
  isExpenseRecord,
  isMomActivity,
  isReminderOccurrenceState,
  isTimelineItem,
  parseAppSnapshot,
} from './appSnapshotSchema';
export type { AppSnapshot } from './appSnapshotSchema';

export interface AppSnapshotRuntime {
  exportSnapshot: (now: Date) => Promise<AppSnapshot>;
  applySnapshot: (snapshot: AppSnapshot) => Promise<void>;
  subscribeChanges: (listener: () => void) => () => void;
}

interface RuntimeWaiter {
  resolve: () => void;
  reject: (reason: Error) => void;
}

let appSnapshotRuntime: AppSnapshotRuntime | null = null;
let appSnapshotRuntimeInitializationError: Error | null = null;
const appSnapshotRuntimeWaiters = new Set<RuntimeWaiter>();

export function configureAppSnapshotRuntime(runtime: AppSnapshotRuntime): void {
  appSnapshotRuntime = runtime;
  appSnapshotRuntimeInitializationError = null;
  appSnapshotRuntimeWaiters.forEach((waiter) => waiter.resolve());
  appSnapshotRuntimeWaiters.clear();
}

/**
 * Reports a startup failure without taking the rendered application down.
 * Future sync startup attempts observe the same failure instead of waiting forever.
 */
export function failAppSnapshotRuntimeInitialization(error: unknown): void {
  if (appSnapshotRuntime) return;
  const failure = error instanceof Error ? error : new Error(String(error));
  appSnapshotRuntimeInitializationError = failure;
  appSnapshotRuntimeWaiters.forEach((waiter) => waiter.reject(failure));
  appSnapshotRuntimeWaiters.clear();
}

/** Waits for app composition to install the semantic snapshot adapter. */
export function waitForAppSnapshotRuntime(): Promise<void> {
  if (appSnapshotRuntime) return Promise.resolve();
  if (appSnapshotRuntimeInitializationError) {
    return Promise.reject(appSnapshotRuntimeInitializationError);
  }

  return new Promise<void>((resolve, reject) => {
    appSnapshotRuntimeWaiters.add({ resolve, reject });
  });
}

function requireAppSnapshotRuntime(): AppSnapshotRuntime {
  if (!appSnapshotRuntime) {
    throw new Error('App snapshot runtime has not been configured.');
  }
  return appSnapshotRuntime;
}

export function exportAppSnapshot(now = new Date()): Promise<AppSnapshot> {
  return requireAppSnapshotRuntime().exportSnapshot(now);
}

export function applyAppSnapshot(snapshot: AppSnapshot): Promise<void> {
  return requireAppSnapshotRuntime().applySnapshot(parseAppSnapshot(snapshot));
}

export function subscribeAppSnapshotChanges(listener: () => void): () => void {
  return requireAppSnapshotRuntime().subscribeChanges(listener);
}
