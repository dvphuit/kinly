import { describe, expect, it, vi } from 'vitest';
import type { AppSnapshotRuntime } from './appSnapshot';

function unusedRuntime(): AppSnapshotRuntime {
  return {
    exportSnapshot: () => { throw new Error('not used'); },
    applySnapshot: () => Promise.resolve(),
    subscribeChanges: () => () => undefined,
  };
}

describe('app snapshot runtime readiness', () => {
  it('releases pending sync startup when app composition configures the runtime', async () => {
    vi.resetModules();
    const snapshot = await import('./appSnapshot');
    let settled = false;
    const waiting = snapshot.waitForAppSnapshotRuntime().then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);

    snapshot.configureAppSnapshotRuntime(unusedRuntime());
    await waiting;
    expect(settled).toBe(true);
  });

  it('rejects pending and future waiters when runtime initialization fails', async () => {
    vi.resetModules();
    const snapshot = await import('./appSnapshot');
    const failure = new Error('snapshot runtime failed');
    const waiting = snapshot.waitForAppSnapshotRuntime();

    snapshot.failAppSnapshotRuntimeInitialization(failure);

    await expect(waiting).rejects.toBe(failure);
    await expect(snapshot.waitForAppSnapshotRuntime()).rejects.toBe(failure);
  });
});
