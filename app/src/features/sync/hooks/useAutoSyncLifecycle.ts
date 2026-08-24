import { useEffect } from 'react';
import { scheduleIdleTask } from '@/shared/lib/idleTask';

const AUTO_SYNC_START_IDLE_TIMEOUT_MS = 3_000;
const AUTO_SYNC_START_FALLBACK_MS = 750;

export function useAutoSyncLifecycle(enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let autoSyncEnabled = false;
    let stopAutoSync: (() => void) | undefined;
    let unsubscribeSyncState: (() => void) | undefined;
    let startAutoSyncPromise: Promise<void> | null = null;

    const cancelStart = scheduleIdleTask(() => {
      void import('../appSnapshot')
        .then(({ waitForAppSnapshotRuntime }) => waitForAppSnapshotRuntime())
        .then(() => import('../index'))
        .then(async (sync) => {
          if (disposed) return;

          updateAutoSyncEnabled(await sync.isAutoSyncEnabled());
          if (disposed) return;

          unsubscribeSyncState = sync.subscribeSyncState((state) => {
            updateAutoSyncEnabled(state.autoSyncEnabled);
          });
        })
        .catch(() => {});
    }, {
      timeoutMs: AUTO_SYNC_START_IDLE_TIMEOUT_MS,
      fallbackDelayMs: AUTO_SYNC_START_FALLBACK_MS,
    });

    function stopStartedAutoSync() {
      stopAutoSync?.();
      stopAutoSync = undefined;
    }

    function ensureAutoSyncStarted() {
      if (disposed || !autoSyncEnabled || stopAutoSync || startAutoSyncPromise) return;

      startAutoSyncPromise = import('../googleDriveSync')
        .then(({ startAutoSync }) => startAutoSync())
        .then((stop) => {
          if (disposed || !autoSyncEnabled) {
            stop();
          } else {
            stopAutoSync = stop;
          }
        })
        .catch(() => {})
        .finally(() => {
          startAutoSyncPromise = null;
        });
    }

    function updateAutoSyncEnabled(nextEnabled: boolean) {
      autoSyncEnabled = nextEnabled;
      if (nextEnabled) {
        ensureAutoSyncStarted();
      } else {
        stopStartedAutoSync();
      }
    }

    return () => {
      disposed = true;
      autoSyncEnabled = false;
      cancelStart();
      unsubscribeSyncState?.();
      stopStartedAutoSync();
    };
  }, [enabled]);
}
