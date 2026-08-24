import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import * as googleDriveSync from '@/features/sync';
import { GoogleSyncCard } from './GoogleSyncCard';

vi.mock('@/features/sync', () => {
  const state = {
    status: 'auth-required',
    lastSyncedAt: null,
    autoSyncEnabled: true,
    error: 'Cần xác thực lại Google để tiếp tục tự động đồng bộ.',
    conflict: null,
  };
  const account = {
    permissionId: 'account-1',
    emailAddress: 'parent@example.com',
    displayName: 'Parent',
  };

  return {
    clearGooglePasskeyGate: vi.fn().mockResolvedValue(undefined),
    createGooglePasskeyGate: vi.fn().mockResolvedValue(undefined),
    getGoogleLinkedAccount: vi.fn(() => account),
    getLastSyncedAt: vi.fn().mockResolvedValue(null),
    getSyncState: vi.fn(() => state),
    hasGooglePasskeyGate: vi.fn().mockResolvedValue(false),
    isGoogleConfigured: vi.fn(() => true),
    isGoogleLinked: vi.fn(() => true),
    isGooglePasskeyGateSupported: vi.fn().mockResolvedValue(true),
    isGoogleSessionActive: vi.fn(() => false),
    requestGoogleAccessToken: vi.fn().mockResolvedValue(account),
    resolveSyncConflict: vi.fn(),
    setAutoSyncEnabled: vi.fn(),
    subscribeSyncState: vi.fn((listener: (nextState: typeof state) => void) => {
      listener(state);
      return () => undefined;
    }),
    syncWithGoogleDrive: vi.fn(),
  };
});

describe('GoogleSyncCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the linked account and re-authentication state without a contradictory reconnect error', () => {
    render(
      <MemoryRouter>
        <GoogleSyncCard />
      </MemoryRouter>,
    );

    expect(screen.getByText('Đã liên kết')).toBeInTheDocument();
    expect(screen.getByText('parent@example.com')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái: Cần xác thực lại Google')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác thực lại & đồng bộ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đổi tài khoản Google' })).toBeInTheDocument();
    expect(screen.queryByText('Cần xác thực lại Google để tiếp tục tự động đồng bộ.')).not.toBeInTheDocument();
  });

  it('opens the account chooser only after the user requests an account switch', async () => {
    render(
      <MemoryRouter>
        <GoogleSyncCard />
      </MemoryRouter>,
    );

    expect(googleDriveSync.requestGoogleAccessToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi tài khoản Google' }));

    await waitFor(() => {
      expect(googleDriveSync.requestGoogleAccessToken).toHaveBeenCalledWith({ selectAccount: true });
    });
  });

  it('offers Passkey setup for a linked Google account', async () => {
    render(
      <MemoryRouter>
        <GoogleSyncCard />
      </MemoryRouter>,
    );

    const setupButton = await screen.findByRole('button', { name: 'Thiết lập Passkey' });
    fireEvent.click(setupButton);

    await waitFor(() => {
      expect(googleDriveSync.createGooglePasskeyGate).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('button', { name: 'Tắt Passkey' })).toBeInTheDocument();
  });

  it('shows a focused Google authentication action after automatic fallback navigation', () => {
    render(
      <MemoryRouter initialEntries={['/profile?googleAuth=required']}>
        <GoogleSyncCard />
      </MemoryRouter>,
    );

    expect(screen.getByText('Google Drive đang chờ xác thực')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác thực Google & tiếp tục' })).toBeInTheDocument();
  });
});
