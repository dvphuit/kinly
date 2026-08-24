import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GOOGLE_AUTH_REQUIRED_EVENT,
  isAutoSyncEnabled,
  isGoogleLinked,
  isGoogleSessionActive,
} from '@/features/sync';
import { hasGooglePasskeyGate } from '../googlePasskeyGate';

const GOOGLE_AUTH_REQUIRED_PATH = '/profile?googleAuth=required';

export function useGoogleDriveReauthLifecycle(enabled = true): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    const openGoogleAccountManagement = () => {
      if (!disposed) navigate(GOOGLE_AUTH_REQUIRED_PATH, { replace: true });
    };
    const onGoogleAuthRequired = () => openGoogleAccountManagement();

    window.addEventListener(GOOGLE_AUTH_REQUIRED_EVENT, onGoogleAuthRequired);

    void (async () => {
      if (!navigator.onLine || !isGoogleLinked() || isGoogleSessionActive()) return;
      if (!(await isAutoSyncEnabled())) return;
      const hasPasskey = await hasGooglePasskeyGate().catch(() => false);
      if (!hasPasskey) openGoogleAccountManagement();
    })();

    return () => {
      disposed = true;
      window.removeEventListener(GOOGLE_AUTH_REQUIRED_EVENT, onGoogleAuthRequired);
    };
  }, [enabled, navigate]);
}
