import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoogleDriveReauthLifecycle } from './useGoogleDriveReauthLifecycle';

const navigate = vi.hoisted(() => vi.fn());
const sync = vi.hoisted(() => ({
  GOOGLE_AUTH_REQUIRED_EVENT: 'kinly:google-auth-required',
  isAutoSyncEnabled: vi.fn(),
  isGoogleLinked: vi.fn(),
  isGoogleSessionActive: vi.fn(),
}));
const passkey = vi.hoisted(() => ({
  hasGooglePasskeyGate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/features/sync', () => sync);
vi.mock('../googlePasskeyGate', () => passkey);

describe('useGoogleDriveReauthLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    sync.isGoogleLinked.mockReturnValue(true);
    sync.isGoogleSessionActive.mockReturnValue(false);
    sync.isAutoSyncEnabled.mockResolvedValue(true);
    passkey.hasGooglePasskeyGate.mockResolvedValue(true);
  });

  it('opens Google account management when auto-sync needs auth and no Passkey is configured', async () => {
    passkey.hasGooglePasskeyGate.mockResolvedValue(false);

    renderHook(() => useGoogleDriveReauthLifecycle(true));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/profile?googleAuth=required', { replace: true });
    });
  });

  it('stays on the current screen when the Passkey gate is available', async () => {
    renderHook(() => useGoogleDriveReauthLifecycle(true));

    await waitFor(() => expect(passkey.hasGooglePasskeyGate).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens account management when the restore flow reports that Google auth is required', async () => {
    renderHook(() => useGoogleDriveReauthLifecycle(true));
    await waitFor(() => expect(passkey.hasGooglePasskeyGate).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event(sync.GOOGLE_AUTH_REQUIRED_EVENT));
    });

    expect(navigate).toHaveBeenCalledWith('/profile?googleAuth=required', { replace: true });
  });

  it('does nothing when auto-sync is disabled', async () => {
    sync.isAutoSyncEnabled.mockResolvedValue(false);

    renderHook(() => useGoogleDriveReauthLifecycle(true));

    await waitFor(() => expect(sync.isAutoSyncEnabled).toHaveBeenCalledTimes(1));
    expect(passkey.hasGooglePasskeyGate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
