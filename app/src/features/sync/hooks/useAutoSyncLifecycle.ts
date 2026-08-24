import { useEffect } from 'react';
import { scheduleIdleTask } from '@/shared/lib/idleTask';

const AUTO_SYNC_START_IDLE_TIMEOUT_MS = 3_000;
const AUTO_SYNC_START_FALLBACK_MS = 750;

export function useAutoSyncLifecycle(enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let stopAutoSync: (() => void) | undefined;

    const cancelStart = scheduleIdleTask(() => {
      void import('../appSnapshot')
        .then(({ waitForAppSnapshotRuntime }) => waitForAppSnapshotRuntime())
        .then(() => import('../googleDriveSync'))
        .then(({ startAutoSync }) => startAutoSync())
        .then((stop) => {
          if (disposed) {
            stop();
          } else {
            stopAutoSync = stop;
          }
        })
        .catch(() => {});
    }, {
      timeoutMs: AUTO_SYNC_START_IDLE_TIMEOUT_MS,
      fallbackDelayMs: AUTO_SYNC_START_FALLBACK_MS,
    });

    return () => {
      disposed = true;
      cancelStart();
      stopAutoSync?.();
    };
  }, [enabled]);
}
