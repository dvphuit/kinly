import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes, type AppRoutesProps } from './AppRoutes';

vi.mock('@/features/home', () => ({
  HomeView: ({ onOpenQuickLog }: { onOpenQuickLog: () => void }) => (
    <div><span>Home marker</span><button onClick={onOpenQuickLog}>open quick log</button></div>
  ),
}));
vi.mock('@/features/timeline', () => ({
  TimelineView: ({ onOpenLightbox, onOpenAddEntry }: { onOpenLightbox: (src: string, isVideo?: boolean) => void; onOpenAddEntry: () => void }) => (
    <div><span>Timeline marker</span><button onClick={() => onOpenLightbox('/media.jpg', true)}>open lightbox</button><button onClick={onOpenAddEntry}>add timeline</button></div>
  ),
  loadTimelineStyles: async () => undefined,
}));
vi.mock('@/features/growth', () => ({
  GrowthView: ({
    onOpenAddMeasurement,
    onSuccessToast,
  }: {
    onOpenAddMeasurement: () => void;
    onSuccessToast: (message: string) => void;
  }) => (
    <div>
      <span>Growth marker</span>
      <button onClick={onOpenAddMeasurement}>open growth</button>
      <button onClick={() => onSuccessToast('growth saved')}>toast growth</button>
    </div>
  ),
  loadGrowthStyles: async () => undefined,
}));
vi.mock('@/features/expenses', () => ({
  ExpensesView: ({ onOpenAddExpense }: { onOpenAddExpense: () => void }) => (
    <div><span>Expenses marker</span><button onClick={onOpenAddExpense}>open expense</button></div>
  ),
  loadExpensesStyles: async () => undefined,
}));
vi.mock('@/features/profile', () => ({
  ProfileView: ({ onOpenEditProfile, onOpenNotifications }: { onOpenEditProfile: () => void; onOpenNotifications: () => void }) => (
    <div><span>Profile marker</span><button onClick={onOpenEditProfile}>edit profile</button><button onClick={onOpenNotifications}>profile reminders</button></div>
  ),
  GoogleDriveDataView: () => <div>Drive data marker</div>,
  loadProfileStyles: async () => undefined,
}));
vi.mock('@/features/sync', () => ({
  loadPasskeyVaultPrototypeView: async () => ({
    PasskeyVaultPrototypeView: () => <div>Passkey vault marker</div>,
  }),
}));

function createProps(overrides: Partial<AppRoutesProps> = {}): AppRoutesProps {
  return {
    onOpenQuickLog: vi.fn(),
    onOpenPumping: vi.fn(),
    onShowToast: vi.fn(),
    onOpenLightbox: vi.fn(),
    onOpenAddTimelineEntry: vi.fn(),
    onOpenAddGrowth: vi.fn(),
    onOpenAddExpense: vi.fn(),
    onOpenEditProfile: vi.fn(),
    onOpenNotifications: vi.fn(),
    ...overrides,
  };
}

function renderRoute(path: string, props = createProps()) {
  render(<MemoryRouter initialEntries={[path]}><AppRoutes {...props} /></MemoryRouter>);
  return props;
}

describe('AppRoutes', () => {
  it.each([
    ['/', 'Home marker'],
    ['/timeline', 'Timeline marker'],
    ['/growth', 'Growth marker'],
    ['/expenses', 'Expenses marker'],
    ['/profile', 'Profile marker'],
    ['/profile/google-drive', 'Drive data marker'],
    ['/experiments/passkey-vault', 'Passkey vault marker'],
    ['/unknown', 'Home marker'],
  ])('renders %s at the expected surface', async (path, marker) => {
    renderRoute(path);
    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  it('exposes passkey setup from Google Drive data management', async () => {
    const user = userEvent.setup();
    renderRoute('/profile/google-drive');

    const setupLink = await screen.findByRole('link', { name: 'Thiết lập Passkey' });
    expect(setupLink).toHaveAttribute('href', '/experiments/passkey-vault');

    await user.click(setupLink);
    expect(await screen.findByText('Passkey vault marker')).toBeInTheDocument();
  });

  it('wires home quick log', async () => {
    const user = userEvent.setup();
    const props = renderRoute('/');
    await user.click(await screen.findByRole('button', { name: 'open quick log' }));
    expect(props.onOpenQuickLog).toHaveBeenCalledTimes(1);
  });

  it('wires growth actions', async () => {
    const user = userEvent.setup();
    const props = renderRoute('/growth');
    await user.click(await screen.findByRole('button', { name: 'open growth' }));
    expect(props.onOpenAddGrowth).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'toast growth' }));
    expect(props.onShowToast).toHaveBeenCalledWith('growth saved', '✓');
  });
});
