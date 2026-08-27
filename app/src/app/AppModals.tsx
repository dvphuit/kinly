import { lazy, Suspense, useEffect, useState } from 'react';
import type { ActivityLogMode } from '@/features/activities';
import type { AddToast, AppModalController } from '@/app/hooks/useAppModals';
import {
  loadExpensesFeature,
  loadGrowthFeature,
  loadProfileFeature,
  loadTimelineFeature,
} from '@/app/routePreload';

const loadQuickLogModal = () => import('@/features/activities');
const loadActivityLogModal = () => import('@/features/activities');
const loadAddGrowthModal = loadGrowthFeature;
const loadAddPumpingModal = () => import('@/features/activities');
const loadAddExpenseModal = loadExpensesFeature;
const loadAddPostModal = loadTimelineFeature;

const QuickLogModal = lazy(async () => ({ default: (await loadQuickLogModal()).QuickLogModal }));
const ActivityLogModal = lazy(async () => ({ default: (await loadActivityLogModal()).ActivityLogModal }));
const AddGrowthModal = lazy(async () => ({ default: (await loadAddGrowthModal()).AddGrowthModal }));
const AddPumpingModal = lazy(async () => ({ default: (await loadAddPumpingModal()).AddPumpingModal }));
const AddExpenseModal = lazy(async () => ({ default: (await loadAddExpenseModal()).AddExpenseModal }));
const AddPostModal = lazy(async () => ({ default: (await loadAddPostModal()).AddPostModal }));
const EditProfileModal = lazy(async () => ({ default: (await loadProfileFeature()).EditProfileModal }));
const NotificationModal = lazy(async () => ({ default: (await import('@/features/reminders')).NotificationModal }));

const MODAL_EXIT_RETENTION_MS = 280;
const MODAL_PREFETCH_FALLBACK_MS = 220;

const LazyModalFallback = () => (
  <div className="lazy-modal-loading" role="status" aria-live="polite">Đang mở…</div>
);

function useRetained(open: boolean, retentionMs = MODAL_EXIT_RETENTION_MS): boolean {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;

    const timeoutId = window.setTimeout(() => setMounted(false), retentionMs);
    return () => window.clearTimeout(timeoutId);
  }, [mounted, open, retentionMs]);

  return open || mounted;
}

function prefetchQuickLogDestinations(): void {
  void Promise.all([
    loadAddGrowthModal(),
    loadAddExpenseModal(),
    loadAddPostModal(),
  ]);
}

function scheduleQuickLogPrefetch(): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(prefetchQuickLogDestinations, { timeout: 800 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(prefetchQuickLogDestinations, MODAL_PREFETCH_FALLBACK_MS);
  return () => window.clearTimeout(timeoutId);
}

export interface AppModalsProps {
  modals: AppModalController;
  onSuccessToast: AddToast;
}

export function AppModals({ modals, onSuccessToast }: AppModalsProps) {
  const quickLogMounted = useRetained(modals.isQuickLogOpen);
  const activityMounted = useRetained(Boolean(modals.activityLogMode));
  const growthMounted = useRetained(modals.isAddGrowthOpen);
  const pumpingMounted = useRetained(modals.isAddPumpingOpen);
  const expenseMounted = useRetained(modals.isAddExpenseOpen);
  const postMounted = useRetained(modals.isAddPostOpen);
  const profileMounted = useRetained(modals.isEditProfileOpen);
  const notificationMounted = useRetained(modals.isNotificationOpen);
  const [lastActivityMode, setLastActivityMode] = useState<ActivityLogMode>(modals.activityLogMode ?? 'feeding');

  useEffect(() => {
    if (modals.activityLogMode) setLastActivityMode(modals.activityLogMode);
  }, [modals.activityLogMode]);

  useEffect(() => {
    if (!modals.isQuickLogOpen) return;
    return scheduleQuickLogPrefetch();
  }, [modals.isQuickLogOpen]);

  return (
    <Suspense fallback={<LazyModalFallback />}>
      {quickLogMounted && (
          <QuickLogModal isOpen={modals.isQuickLogOpen} onClose={modals.closeQuickLog} onSelectAction={modals.handleQuickAction} />
      )}
      {activityMounted && (
          <ActivityLogModal
            isOpen={Boolean(modals.activityLogMode)}
            mode={modals.activityLogMode ?? lastActivityMode}
            onClose={modals.closeActivityLog}
            onSaved={(message) => onSuccessToast(message, '✓')}
            onUndoableSaved={(message, undo) => onSuccessToast(message, '✓', {
              actionLabel: 'Hoàn tác',
              onAction: undo,
              durationMs: 5000,
            })}
          />
      )}
      {growthMounted && (
          <AddGrowthModal isOpen={modals.isAddGrowthOpen} onClose={modals.closeAddGrowth} onSuccessToast={onSuccessToast} />
      )}
      {pumpingMounted && (
          <AddPumpingModal isOpen={modals.isAddPumpingOpen} onClose={modals.closeAddPumping} onSuccessToast={onSuccessToast} />
      )}
      {expenseMounted && (
          <AddExpenseModal isOpen={modals.isAddExpenseOpen} onClose={modals.closeAddExpense} onSuccessToast={onSuccessToast} />
      )}
      {postMounted && (
          <AddPostModal isOpen={modals.isAddPostOpen} onClose={modals.closeAddPost} onSuccessToast={onSuccessToast} />
      )}
      {profileMounted && (
        <EditProfileModal isOpen={modals.isEditProfileOpen} onClose={modals.closeEditProfile} onSuccessToast={onSuccessToast} />
      )}
      {notificationMounted && (
        <NotificationModal isOpen={modals.isNotificationOpen} onClose={modals.closeNotifications} onQuickLog={modals.handleQuickAction} />
      )}
    </Suspense>
  );
}
