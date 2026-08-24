import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppVersionBadge } from '@/shared/ui/AppVersionBadge';
import { BottomNav } from '@/shared/ui/BottomNav';
import { Header } from '@/app/components/Header';
import { Lightbox } from '@/shared/ui/Lightbox';
import { PullToRefresh } from '@/shared/ui/PullToRefresh';
import { PWAInstallPrompt } from '@/shared/ui/PWAInstallPrompt';
import { ToastContainer } from '@/shared/ui/Toast';
import { useAppModals } from '@/app/hooks/useAppModals';
import { useAutoSyncLifecycle } from '@/features/sync/hooks/useAutoSyncLifecycle';
import { useReminderLifecycle } from '@/features/reminders/hooks/useReminderLifecycle';
import { useThemeColor } from '@/app/hooks/useThemeColor';
import { useToast } from '@/shared/hooks/useToast';
import PWABadge from '@/PWABadge';
import { installGlobalDiagnosticLogging, logDiagnostic } from '@/app/diagnostics/diagnosticLog';
import { useProfileStore } from '@/features/profile/store/useProfileStore';
import { useUIStore } from '@/store/useUIStore';
import { AppModals } from './AppModals';
import { AppRoutes } from './AppRoutes';
import { preloadAppRoute } from './routePreload';

const OnboardingView = lazy(async () => {
  const stylesReady = import('@/app/onboarding/onboarding.css');
  const module = await import('@/app/onboarding/OnboardingView');
  await stylesReady;
  return { default: module.OnboardingView };
});

function reloadApp(): void {
  window.location.reload();
}

function preloadProfileRoute(): void {
  preloadAppRoute('/profile');
}

export const AppContent: React.FC = () => {
  const location = useLocation();
  const isProfilePage = location.pathname.startsWith('/profile');
  const familyData = useProfileStore((state) => state.familyData);
  const profileMode = useUIStore((state) => state.profileMode);
  const [profileHydrated, setProfileHydrated] = useState(() => useProfileStore.persist.hasHydrated());
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
  useAutoSyncLifecycle(isInitialized);

  const { toasts, addToast } = useToast();
  const modals = useAppModals();
  const isFullScreenOverlayOpen = Boolean(modals.activityLogMode || modals.isAddPostOpen || modals.lightboxSrc);
  const { handleQuickAction } = modals;
  const openAddTimelineEntry = useCallback(
    () => handleQuickAction('diary'),
    [handleQuickAction],
  );

  useThemeColor({ pathname: location.pathname, isModalOpen: isFullScreenOverlayOpen, profileMode });
  useReminderLifecycle({ onQuickLog: handleQuickAction, onOpenNotifications: modals.openNotifications });

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
          <OnboardingView onComplete={() => addToast('Chào mừng Ba Mẹ đến với Kinly! Hồ sơ của Bé đã sẵn sàng.')} />
        </Suspense>
        <PWABadge />
      </div>
    );
  }

  return (
    <div className="app-container" id="appContainer">
      <ToastContainer toasts={toasts} />
      {!isProfilePage && (
        <Header
          onOpenNotifications={modals.openNotifications}
          onProfileIntent={preloadProfileRoute}
        />
      )}
      <main id="appMainContent" className="view-content-wrapper">
        <PullToRefresh onRefresh={reloadApp}>
          <AppRoutes
            onOpenQuickLog={modals.openQuickLog}
            onOpenPumping={modals.openAddPumping}
            onShowToast={addToast}
            onOpenLightbox={modals.openLightbox}
            onOpenAddTimelineEntry={openAddTimelineEntry}
            onOpenAddGrowth={modals.openAddGrowth}
            onOpenAddExpense={modals.openAddExpense}
            onOpenEditProfile={modals.openEditProfile}
            onOpenNotifications={modals.openNotifications}
          />
          <PWAInstallPrompt />
          <div className="bottom-safe-spacer" />
        </PullToRefresh>
      </main>
      <AppVersionBadge />
      <BottomNav onOpenQuickLog={modals.openQuickLog} onRouteIntent={preloadAppRoute} />
      <Lightbox mediaSrc={modals.lightboxSrc} isVideo={modals.lightboxIsVideo} onClose={modals.closeLightbox} />
      <AppModals modals={modals} onSuccessToast={addToast} />
      <PWABadge />
    </div>
  );
};

export default AppContent;
