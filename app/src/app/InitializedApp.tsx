import { memo, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppVersionBadge } from '@/shared/ui/AppVersionBadge';
import { BottomNav } from '@/shared/ui/BottomNav';
import { Header } from '@/app/components/Header';
import { Lightbox } from '@/shared/ui/Lightbox';
import { PullToRefresh } from '@/shared/ui/PullToRefresh';
import { PWAInstallPrompt } from '@/shared/ui/PWAInstallPrompt';
import { ToastContainer } from '@/shared/ui/Toast';
import { useAppModals, type AddToast } from '@/app/hooks/useAppModals';
import { logDiagnostic } from '@/app/diagnostics/diagnosticLog';
import { useAutoSyncLifecycle } from '@/features/sync/hooks/useAutoSyncLifecycle';
import { useReminderLifecycle } from '@/features/reminders/hooks/useReminderLifecycle';
import { useThemeColor } from '@/app/hooks/useThemeColor';
import type { ToastMessage } from '@/shared/hooks/useToast';
import PWABadge from '@/PWABadge';
import { useUIStore } from '@/store/useUIStore';
import { AppModals } from './AppModals';
import { AppRoutes } from './AppRoutes';
import { preloadAppRoute } from './routePreload';

function reloadApp(): void {
  window.location.reload();
}

function preloadProfileRoute(): void {
  void preloadAppRoute('/profile');
}

interface InitializedAppProps {
  toasts: ToastMessage[];
  addToast: AddToast;
}

export const InitializedApp: React.FC<InitializedAppProps> = ({ toasts, addToast }) => {
  const location = useLocation();
  const isProfilePage = location.pathname.startsWith('/profile');
  const profileMode = useUIStore((state) => state.profileMode);
  const [routeRefreshKey, setRouteRefreshKey] = useState(0);

  useAutoSyncLifecycle(true);

  const modals = useAppModals();
  const isFullScreenOverlayOpen = Boolean(modals.activityLogMode || modals.isAddPostOpen || modals.lightboxSrc);
  const { handleQuickAction } = modals;
  const openAddTimelineEntry = useCallback(
    () => handleQuickAction('diary'),
    [handleQuickAction],
  );
  const softRefreshCurrentRoute = useCallback(() => {
    setRouteRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => {
    logDiagnostic('navigation', 'info', 'Route changed', { path: location.pathname });
  }, [location.pathname]);
  useThemeColor({ pathname: location.pathname, isModalOpen: isFullScreenOverlayOpen, profileMode });

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
        <PullToRefresh onSoftRefresh={softRefreshCurrentRoute} onHardRefresh={reloadApp}>
          <AppRoutes
            key={routeRefreshKey}
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
      <ReminderLifecycleManager onQuickLog={handleQuickAction} onOpenNotifications={modals.openNotifications} />
      <PWABadge />
    </div>
  );
};

const ReminderLifecycleManager = memo(function ReminderLifecycleManager({
  onQuickLog,
  onOpenNotifications,
}: {
  onQuickLog: (actionType: string) => void;
  onOpenNotifications: () => void;
}) {
  useReminderLifecycle({ onQuickLog, onOpenNotifications });
  return null;
});
