import { lazy, memo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { HomeView } from '@/features/home';
import type { AddToast } from '@/app/hooks/useAppModals';
import { loadExpensesFeature, loadGrowthFeature, loadProfileFeature, loadTimelineFeature } from './routePreload';

const TimelineView = lazy(async () => ({ default: (await loadTimelineFeature()).TimelineView }));
const GrowthView = lazy(async () => ({ default: (await loadGrowthFeature()).GrowthView }));
const ExpensesView = lazy(async () => ({ default: (await loadExpensesFeature()).ExpensesView }));
const ProfileView = lazy(async () => ({ default: (await loadProfileFeature()).ProfileView }));
const GoogleDriveDataView = lazy(async () => ({ default: (await loadProfileFeature()).GoogleDriveDataView }));
const PasskeyVaultPrototypeView = lazy(async () => {
  const sync = await import('@/features/sync');
  const passkey = await sync.loadPasskeyVaultPrototypeView();
  return { default: passkey.PasskeyVaultPrototypeView };
});

const RouteLoadingFallback = () => <div className="route-loading-state" role="status" aria-live="polite">Đang mở trang…</div>;

export interface AppRoutesProps {
  onOpenQuickLog: () => void;
  onOpenPumping: () => void;
  onShowToast: AddToast;
  onOpenLightbox: (src: string, isVideo?: boolean) => void;
  onOpenAddTimelineEntry: () => void;
  onOpenAddGrowth: () => void;
  onOpenAddExpense: () => void;
  onOpenEditProfile: () => void;
  onOpenNotifications: () => void;
}

export const AppRoutes = memo(function AppRoutes({
  onOpenQuickLog,
  onOpenPumping,
  onShowToast,
  onOpenLightbox,
  onOpenAddTimelineEntry,
  onOpenAddGrowth,
  onOpenAddExpense,
  onOpenEditProfile,
  onOpenNotifications,
}: AppRoutesProps) {
  const location = useLocation();
  const showPasskeySetup = location.pathname === '/profile/google-drive';

  return (
    <div className="app-route-surface" key={location.pathname}>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<HomeView onOpenQuickLog={onOpenQuickLog} onOpenPumping={onOpenPumping} />} />
          <Route path="/timeline" element={<TimelineView onOpenLightbox={onOpenLightbox} onOpenAddEntry={onOpenAddTimelineEntry} />} />
          <Route
            path="/growth"
            element={(
              <GrowthView
                onOpenAddMeasurement={onOpenAddGrowth}
                onSuccessToast={(message) => onShowToast(message, '✓')}
              />
            )}
          />
          <Route path="/expenses" element={<ExpensesView onOpenAddExpense={onOpenAddExpense} onShowToast={onShowToast} />} />
          <Route path="/profile" element={<ProfileView onOpenEditProfile={onOpenEditProfile} onOpenNotifications={onOpenNotifications} onShowToast={onShowToast} />} />
          <Route path="/profile/google-drive" element={<GoogleDriveDataView onOpenLightbox={onOpenLightbox} onShowToast={onShowToast} />} />
          <Route path="/profile/google-drive/passkey" element={<PasskeyVaultPrototypeView />} />
          <Route path="/experiments/passkey-vault" element={<Navigate to="/profile/google-drive/passkey" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {showPasskeySetup && createPortal(
        <Link
          to="/profile/google-drive/passkey"
          aria-label="Google Drive bằng Passkey"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 'calc(18px + env(safe-area-inset-bottom))',
            zIndex: 1301,
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 16px',
            borderRadius: 16,
            color: 'var(--color-text-light)',
            background: 'var(--color-primary-dark)',
            boxShadow: 'var(--shadow-card)',
            fontSize: 13,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          Google Drive bằng Passkey
        </Link>,
        document.body,
      )}
    </div>
  );
});
