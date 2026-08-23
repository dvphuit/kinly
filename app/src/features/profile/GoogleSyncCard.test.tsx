import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { GoogleSyncCard } from './GoogleSyncCard';

vi.mock('@/features/sync', () => {
  const state = {
    status: 'auth-required',
    lastSyncedAt: null,
    autoSyncEnabled: true,
    error: 'Bấm kết nối Google để bật lại auto-sync.',
    conflict: null,
  };

  return {
    getLastSyncedAt: vi.fn().mockResolvedValue(null),
    getSyncState: vi.fn(() => state),
    isGoogleConfigured: vi.fn(() => true),
    isGoogleConnected: vi.fn(() => true),
    isGoogleSessionActive: vi.fn(() => false),
    requestGoogleAccessToken: vi.fn(),
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
  it('shows re-authentication without a contradictory reconnect error for a linked account', () => {
    render(
      <MemoryRouter>
        <GoogleSyncCard />
      </MemoryRouter>,
    );

    expect(screen.getByText('Đã liên kết')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái: Cần xác thực lại Google')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác thực lại & đồng bộ' })).toBeInTheDocument();
    expect(screen.queryByText('Bấm kết nối Google để bật lại auto-sync.')).not.toBeInTheDocument();
  });
});