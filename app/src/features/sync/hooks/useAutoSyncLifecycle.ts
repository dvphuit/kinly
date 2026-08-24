import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { scheduleIdleTask } from '@/shared/lib/idleTask';

const AUTO_SYNC_START_IDLE_TIMEOUT_MS = 3_000;
const AUTO_SYNC_START_FALLBACK_MS = 750;
const GOOGLE_AUTH_REQUIRED_EVENT = 'kinly:google-auth-required';
const GOOGLE_AUTH_REQUIRED_PATH = '/profile?googleAuth=required';

export function useAutoSyncLifecycle(enabled = true): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let stopAutoSync: (() => void) | undefined;

    const openGoogleAccountManagement = () => {
      if (!disposed) navigate(GOOGLE_AUTH_REQUIRED_PATH, { replace: true });
    };
    const onGoogleAuthRequired = () => openGoogleAccountManagement();

    window.addEventListener(GOOGLE_AUTH_REQUIRED_EVENT, onGoogleAuthRequired);

    void Promise.all([import('../index'), import('../googlePasskeyGate')])
      .then(async ([sync, passkeyGate]) => {
        if (disposed || !navigator.onLine || !sync.isGoogleLinked() || sync.isGoogleSessionActive()) return;
        const hasPasskey = await passkeyGate.hasGooglePasskeyGate().catch(() => false);
        if (!hasPasskey) openGoogleAccountManagement();
      })
      .catch(() => {});

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
      window.removeEventListener(GOOGLE_AUTH_REQUIRED_EVENT, onGoogleAuthRequired);
      cancelStart();
      stopAutoSync?.();
    };
  }, [enabled, navigate]);
}
