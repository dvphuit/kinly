const PRELOAD_RECOVERY_KEY = 'kinly:preload-error-recovery-at';
const PRELOAD_RECOVERY_COOLDOWN_MS = 30_000;

export interface PreloadRecoveryRuntime {
  isOnline: () => boolean;
  now: () => number;
  readLastRecovery: () => number | null;
  rememberRecovery: (timestamp: number) => boolean;
  reload: () => void;
}

export function recoverFromPreloadError(event: Event, runtime: PreloadRecoveryRuntime): boolean {
  if (!runtime.isOnline()) return false;

  const now = runtime.now();
  const lastRecovery = runtime.readLastRecovery();
  if (lastRecovery !== null && now - lastRecovery < PRELOAD_RECOVERY_COOLDOWN_MS) return false;
  if (!runtime.rememberRecovery(now)) return false;

  event.preventDefault();
  runtime.reload();
  return true;
}

function readLastRecovery(): number | null {
  try {
    const stored = window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY);
    if (!stored) return null;
    const value = Number(stored);
    return Number.isFinite(value) ? value : null;
  }
  catch {
    return null;
  }
}

function rememberRecovery(timestamp: number): boolean {
  try {
    window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, String(timestamp));
    return true;
  }
  catch {
    return false;
  }
}

export function installPreloadErrorRecovery(): () => void {
  const runtime: PreloadRecoveryRuntime = {
    isOnline: () => navigator.onLine,
    now: () => Date.now(),
    readLastRecovery,
    rememberRecovery,
    reload: () => window.location.reload(),
  };
  const handlePreloadError = (event: Event) => {
    recoverFromPreloadError(event, runtime);
  };

  window.addEventListener('vite:preloadError', handlePreloadError);
  return () => window.removeEventListener('vite:preloadError', handlePreloadError);
}
