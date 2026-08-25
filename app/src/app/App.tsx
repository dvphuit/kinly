import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ToastContainer } from '@/shared/ui/Toast';
import { useThemeColor } from '@/app/hooks/useThemeColor';
import { useToast } from '@/shared/hooks/useToast';
import PWABadge from '@/PWABadge';
import { installGlobalDiagnosticLogging, logDiagnostic } from '@/app/diagnostics/diagnosticLog';
import { hasInitializedProfile, markProfileInitialized } from '@/app/lifecycle/profileInitMarker';
import { useProfileStore } from '@/features/profile/store/useProfileStore';
import { useUIStore } from '@/store/useUIStore';

const loadOnboarding = () => (async () => {
  const stylesReady = import('@/app/onboarding/onboarding.css');
  const module = await import('@/app/onboarding/OnboardingView');
  await stylesReady;
  return { default: module.OnboardingView };
})();

const loadInitializedApp = () => import('./InitializedApp');

const OnboardingView = lazy(loadOnboarding);
const InitializedApp = lazy(async () => ({ default: (await loadInitializedApp()).InitializedApp }));

if (typeof window !== 'undefined') {
  if (hasInitializedProfile()) void loadInitializedApp();
  else void loadOnboarding();
}

export const AppContent: React.FC = () => {
  const location = useLocation();
  const familyData = useProfileStore((state) => state.familyData);
  const profileMode = useUIStore((state) => state.profileMode);
  const [profileHydrated, setProfileHydrated] = useState(() => useProfileStore.persist.hasHydrated());
  const { toasts, addToast } = useToast();
  const isInitialized = profileHydrated && Boolean(familyData?.isInitialized && familyData?.childName);

  useEffect(() => {
    if (useProfileStore.persist.hasHydrated()) {
      setProfileHydrated(true);
      return undefined;
    }
    return useProfileStore.persist.onFinishHydration(() => setProfileHydrated(true));
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => {
    logDiagnostic('app', 'info', 'App started', {
      version: import.meta.env.VITE_APP_VERSION,
      build: import.meta.env.VITE_BUILD_SHA,
      online: navigator.onLine,
    });
    return installGlobalDiagnosticLogging();
  }, []);
  useEffect(() => {
    logDiagnostic('navigation', 'info', 'Route changed', { path: location.pathname });
  }, [location.pathname]);

  useThemeColor({ pathname: location.pathname, isModalOpen: false, profileMode });

  if (!profileHydrated) {
    return (
      <div className="app-container" id="appContainer">
        <ToastContainer toasts={toasts} />
        <div className="route-loading-state" role="status">Đang khôi phục hồ sơ…</div>
        <PWABadge />
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="app-container" id="appContainer">
        <ToastContainer toasts={toasts} />
        <Suspense fallback={<div className="route-loading-state" role="status">Đang chuẩn bị hồ sơ…</div>}>
          <OnboardingView onComplete={() => { markProfileInitialized(); addToast('Chào mừng Ba Mẹ đến với Kinly! Hồ sơ của Bé đã sẵn sàng.'); }} />
        </Suspense>
        <PWABadge />
      </div>
    );
  }

  return (
    <Suspense
      fallback={(
        <div className="app-container" id="appContainer">
          <ToastContainer toasts={toasts} />
          <div className="route-loading-state" role="status">Đang mở ứng dụng…</div>
          <PWABadge />
        </div>
      )}
    >
      <InitializedApp toasts={toasts} addToast={addToast} />
    </Suspense>
  );
};

export default AppContent;
