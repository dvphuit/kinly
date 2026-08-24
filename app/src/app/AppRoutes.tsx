import { lazy, memo, Suspense, type ComponentProps } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { HomeView } from '@/features/home';
import type { AddToast } from '@/app/hooks/useAppModals';
import {
  getLoadedExpensesFeature,
  getLoadedGrowthFeature,
  getLoadedTimelineFeature,
  loadExpensesFeature,
  loadGrowthFeature,
  loadProfileFeature,
  loadTimelineFeature,
} from './routePreload';

const LazyTimelineView = lazy(async () => ({ default: (await loadTimelineFeature()).TimelineView }));
const LazyGrowthView = lazy(async () => ({ default: (await loadGrowthFeature()).GrowthView }));
const LazyExpensesView = lazy(async () => ({ default: (await loadExpensesFeature()).ExpensesView }));
const ProfileView = lazy(async () => ({ default: (await loadProfileFeature()).ProfileView }));
const GoogleDriveDataView = lazy(async () => ({ default: (await loadProfileFeature()).GoogleDriveDataView }));

const TimelineView = (props: ComponentProps<typeof LazyTimelineView>) => {
  const feature = getLoadedTimelineFeature();
  if (feature) {
    const ReadyTimelineView = feature.TimelineView;
    return <ReadyTimelineView {...props} />;
  }
  return <LazyTimelineView {...props} />;
};

const GrowthView = (props: ComponentProps<typeof LazyGrowthView>) => {
  const feature = getLoadedGrowthFeature();
  if (feature) {
    const ReadyGrowthView = feature.GrowthView;
    return <ReadyGrowthView {...props} />;
  }
  return <LazyGrowthView {...props} />;
};

const ExpensesView = (props: ComponentProps<typeof LazyExpensesView>) => {
  const feature = getLoadedExpensesFeature();
  if (feature) {
    const ReadyExpensesView = feature.ExpensesView;
    return <ReadyExpensesView {...props} />;
  }
  return <LazyExpensesView {...props} />;
};

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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
});
