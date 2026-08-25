import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    getGoogleLinkedAccount: vi.fn(() => account),
    getLastSyncedAt: vi.fn().mockResolvedValue(null),
    getSyncState: vi.fn(() => state),
    isGoogleConfigured: vi.fn(() => true),
    isGoogleLinked: vi.fn(() => true),
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
  it('shows a compact linked-account summary without a contradictory reconnect error', () => {
    render(
      <MemoryRouter>
        <GoogleSyncCard />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Google Drive' })).toBeInTheDocument();
    expect(screen.getByText('Đã liên kết')).toBeInTheDocument();
    expect(screen.getByText('parent@example.com')).toBeInTheDocument();
    expect(screen.getByText('Cần xác thực lại Google')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác thực lại & đồng bộ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đổi tài khoản Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tắt tự động đồng bộ' })).toHaveAttribute('aria-pressed', 'true');
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
});
