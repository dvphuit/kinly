import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppModalController } from '@/app/hooks/useAppModals';
import { initializeChildProfile, resetChildStoresToDefaults, useProfileStore } from '@/features/profile';
import { AppContent } from './App';

const addToast = vi.fn();
const useAutoSyncLifecycleMock = vi.fn();
const useReminderLifecycleMock = vi.fn();

const modalController: AppModalController = {
  isAnyModalOpen: false,
  isNotificationOpen: false,
  isQuickLogOpen: false,
  isAddGrowthOpen: false,
  isAddPumpingOpen: false,
  isAddExpenseOpen: false,
  isAddPostOpen: false,
  isEditProfileOpen: false,
  activityLogMode: null,
  lightboxSrc: null,
  lightboxIsVideo: false,
  openNotifications: vi.fn(),
  closeNotifications: vi.fn(),
  openQuickLog: vi.fn(),
  closeQuickLog: vi.fn(),
  openAddGrowth: vi.fn(),
  closeAddGrowth: vi.fn(),
  openAddPumping: vi.fn(),
  closeAddPumping: vi.fn(),
  openAddExpense: vi.fn(),
  closeAddExpense: vi.fn(),
  closeAddPost: vi.fn(),
  openEditProfile: vi.fn(),
  closeEditProfile: vi.fn(),
  closeActivityLog: vi.fn(),
  openLightbox: vi.fn(),
  closeLightbox: vi.fn(),
  handleQuickAction: vi.fn(),
};

vi.mock('@/shared/hooks/useToast', () => ({ useToast: () => ({ toasts: [], addToast, dismissToast: vi.fn() }) }));
vi.mock('@/features/sync/hooks/useAutoSyncLifecycle', () => ({ useAutoSyncLifecycle: () => useAutoSyncLifecycleMock() }));
vi.mock('@/features/reminders/hooks/useReminderLifecycle', () => ({ useReminderLifecycle: (options: unknown) => useReminderLifecycleMock(options) }));
vi.mock('@/app/hooks/useAppModals', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/app/hooks/useAppModals')>();
  return { ...original, useAppModals: () => modalController };
});
vi.mock('./AppRoutes', () => ({ AppRoutes: () => <div>App Routes marker</div> }));
vi.mock('./AppModals', () => ({ AppModals: () => <div>App Modals marker</div> }));
vi.mock('@/app/components/Header', () => ({ Header: () => <div>Header marker</div> }));
vi.mock('@/shared/ui/BottomNav', () => ({ BottomNav: () => <div>Bottom Nav marker</div> }));
vi.mock('@/shared/ui/Toast', () => ({ ToastContainer: () => <div>Toast marker</div> }));
vi.mock('@/shared/ui/Lightbox', () => ({ Lightbox: () => <div>Lightbox marker</div> }));
vi.mock('@/shared/ui/PWAInstallPrompt', () => ({ PWAInstallPrompt: () => <div>PWA Prompt marker</div> }));
vi.mock('@/shared/ui/AppVersionBadge', () => ({ AppVersionBadge: () => <div>Version marker</div> }));
vi.mock('@/PWABadge', () => ({ default: () => <div>PWA Badge marker</div> }));

describe('AppContent', () => {
  it('renders onboarding view when baby profile is not initialized', async () => {
    resetChildStoresToDefaults();
    render(<AppContent />);

    expect(await screen.findByRole('heading', { name: /Đăng nhập Google Drive/i })).toBeInTheDocument();
    expect(screen.queryByText('Header marker')).not.toBeInTheDocument();
  });

  it('waits for profile hydration before deciding whether onboarding is required', async () => {
    initializeChildProfile({ childName: 'Bé Bơ', birthDate: '2025-11-20' });
    let finishHydration: (() => void) | undefined;
    const hasHydrated = vi.spyOn(useProfileStore.persist, 'hasHydrated').mockReturnValue(false);
    const onFinishHydration = vi.spyOn(useProfileStore.persist, 'onFinishHydration').mockImplementation((listener) => {
      finishHydration = () => listener(useProfileStore.getState());
      return () => undefined;
    });

    render(<AppContent />);

    expect(screen.getByRole('status')).toHaveTextContent('Đang khôi phục hồ sơ');
    expect(screen.queryByRole('heading', { name: /Đăng nhập Google Drive/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Header marker')).not.toBeInTheDocument();

    act(() => finishHydration?.());

    await waitFor(() => expect(screen.getByText('Header marker')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /Đăng nhập Google Drive/i })).not.toBeInTheDocument();

    hasHydrated.mockRestore();
    onFinishHydration.mockRestore();
  });

  it('composes the routed shell and mounts sync/reminder lifecycles when initialized', async () => {
    initializeChildProfile({ childName: 'Bé Bơ', birthDate: '2025-11-20' });
    render(<AppContent />);

    expect(await screen.findByText('Header marker')).toBeInTheDocument();
    expect(screen.getByText('App Routes marker')).toBeInTheDocument();
    expect(screen.getByText('App Modals marker')).toBeInTheDocument();
    expect(screen.getByText('Bottom Nav marker')).toBeInTheDocument();
    expect(screen.getByText('Lightbox marker')).toBeInTheDocument();
    expect(screen.getByText('PWA Prompt marker')).toBeInTheDocument();
    expect(screen.getByText('Version marker')).toBeInTheDocument();
    expect(screen.getByText('PWA Badge marker')).toBeInTheDocument();
    expect(useAutoSyncLifecycleMock).toHaveBeenCalled();
    expect(useReminderLifecycleMock).toHaveBeenCalled();
  });

  it('keeps the initialized shell out of the uninitialized profile path', () => {
    resetChildStoresToDefaults();
    render(<AppContent />);

    expect(screen.queryByText('Header marker')).not.toBeInTheDocument();
    expect(screen.queryByText('App Routes marker')).not.toBeInTheDocument();
  });
});
