import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForAppSnapshotRuntime } from '../appSnapshot';
import { startAutoSync } from '@/features/sync/googleDriveSync';
import { useAutoSyncLifecycle } from './useAutoSyncLifecycle';

const navigate = vi.hoisted(() => vi.fn());
const syncSession = vi.hoisted(() => ({
  isGoogleLinked: vi.fn(),
  isGoogleSessionActive: vi.fn(),
  isGoogleOAuthBrokerConfigured: vi.fn(),
}));
const passkeyGate = vi.hoisted(() => ({ hasGooglePasskeyGate: vi.fn() }));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../appSnapshot', () => ({ waitForAppSnapshotRuntime: vi.fn() }));
vi.mock('@/features/sync/googleDriveSync', () => ({ startAutoSync: vi.fn() }));
vi.mock('../index', () => syncSession);
vi.mock('../googlePasskeyGate', () => passkeyGate);

const waitForAppSnapshotRuntimeMock = vi.mocked(waitForAppSnapshotRuntime);
const startAutoSyncMock = vi.mocked(startAutoSync);
let idleCallbacks: IdleRequestCallback[] = [];
let nextIdleId = 1;
const cancelIdleCallbackMock = vi.fn();

function runNextIdleCallback(): void {
  const callback = idleCallbacks.shift();
  if (!callback) throw new Error('No idle callback was scheduled');
  act(() => callback({ didTimeout: false, timeRemaining: () => 10 }));
}

describe('useAutoSyncLifecycle', () => {
  beforeEach(() => {
    navigate.mockReset();
    syncSession.isGoogleLinked.mockReset();
    syncSession.isGoogleLinked.mockReturnValue(false);
    syncSession.isGoogleSessionActive.mockReset();
    syncSession.isGoogleSessionActive.mockReturnValue(false);
    syncSession.isGoogleOAuthBrokerConfigured.mockReset();
    syncSession.isGoogleOAuthBrokerConfigured.mockReturnValue(false);
    passkeyGate.hasGooglePasskeyGate.mockReset();
    passkeyGate.hasGooglePasskeyGate.mockResolvedValue(true);
    waitForAppSnapshotRuntimeMock.mockReset();
    waitForAppSnapshotRuntimeMock.mockResolvedValue();
    startAutoSyncMock.mockReset();
    cancelIdleCallbackMock.mockReset();
    idleCallbacks = [];
    nextIdleId = 1;
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return nextIdleId++;
    }));
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallbackMock);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('does not start auto-sync before the profile is initialized', () => {
    const { unmount } = renderHook(() => useAutoSyncLifecycle(false));
    expect(idleCallbacks).toHaveLength(0);
    expect(startAutoSyncMock).not.toHaveBeenCalled();
    unmount();
  });

  it('starts auto-sync during idle time and stops it on unmount', async () => {
    const stop = vi.fn();
    startAutoSyncMock.mockResolvedValue(stop);
    const { unmount } = renderHook(() => useAutoSyncLifecycle(true));
    runNextIdleCallback();
    await waitFor(() => expect(startAutoSyncMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('starts auto-sync when the profile becomes initialized', async () => {
    const stop = vi.fn();
    startAutoSyncMock.mockResolvedValue(stop);
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useAutoSyncLifecycle(enabled),
      { initialProps: { enabled: false } },
    );
    rerender({ enabled: true });
    expect(idleCallbacks).toHaveLength(1);
    runNextIdleCallback();
    await waitFor(() => expect(startAutoSyncMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('waits for snapshot runtime readiness before starting auto-sync', async () => {
    let resolveRuntime!: () => void;
    waitForAppSnapshotRuntimeMock.mockReturnValue(new Promise<void>((resolve) => { resolveRuntime = resolve; }));
    startAutoSyncMock.mockResolvedValue(vi.fn());
    const { unmount } = renderHook(() => useAutoSyncLifecycle());
    runNextIdleCallback();
    await waitFor(() => expect(waitForAppSnapshotRuntimeMock).toHaveBeenCalledTimes(1));
    expect(startAutoSyncMock).not.toHaveBeenCalled();
    await act(async () => resolveRuntime());
    await waitFor(() => expect(startAutoSyncMock).toHaveBeenCalledTimes(1));
    unmount();
  });

  it('cancels startup when unmounted before the idle callback', () => {
    startAutoSyncMock.mockResolvedValue(vi.fn());
    const { unmount } = renderHook(() => useAutoSyncLifecycle());
    unmount();
    runNextIdleCallback();
    expect(cancelIdleCallbackMock).toHaveBeenCalledTimes(1);
    expect(startAutoSyncMock).not.toHaveBeenCalled();
  });

  it('stops a late auto-sync start if unmounted before startup resolves', async () => {
    const stop = vi.fn();
    let resolveStart!: (stopFn: () => void) => void;
    startAutoSyncMock.mockReturnValue(new Promise((resolve) => { resolveStart = resolve; }));
    const { unmount } = renderHook(() => useAutoSyncLifecycle());
    runNextIdleCallback();
    await waitFor(() => expect(startAutoSyncMock).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => resolveStart(stop));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not surface a rejected startup promise from the shell hook', async () => {
    startAutoSyncMock.mockRejectedValue(new Error('sync unavailable'));
    const { unmount } = renderHook(() => useAutoSyncLifecycle());
    runNextIdleCallback();
    await waitFor(() => expect(startAutoSyncMock).toHaveBeenCalledTimes(1));
    unmount();
  });

  it('opens Google account management when a linked account has no broker or Passkey gate', async () => {
    syncSession.isGoogleLinked.mockReturnValue(true);
    passkeyGate.hasGooglePasskeyGate.mockResolvedValue(false);
    const { unmount } = renderHook(() => useAutoSyncLifecycle(true));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/profile?googleAuth=required', { replace: true }));
    unmount();
  });

  it('lets the configured OAuth broker restore before any Passkey fallback navigation', async () => {
    syncSession.isGoogleLinked.mockReturnValue(true);
    syncSession.isGoogleOAuthBrokerConfigured.mockReturnValue(true);
    passkeyGate.hasGooglePasskeyGate.mockResolvedValue(false);
    const { unmount } = renderHook(() => useAutoSyncLifecycle(true));
    await waitFor(() => expect(syncSession.isGoogleOAuthBrokerConfigured).toHaveBeenCalledTimes(1));
    expect(passkeyGate.hasGooglePasskeyGate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    unmount();
  });

  it('keeps the current route when a Passkey gate can handle reauthentication', async () => {
    syncSession.isGoogleLinked.mockReturnValue(true);
    passkeyGate.hasGooglePasskeyGate.mockResolvedValue(true);
    const { unmount } = renderHook(() => useAutoSyncLifecycle(true));
    await waitFor(() => expect(passkeyGate.hasGooglePasskeyGate).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
    unmount();
  });

  it('routes to Google account management when the restore path reports auth is required', () => {
    const { unmount } = renderHook(() => useAutoSyncLifecycle(true));
    act(() => window.dispatchEvent(new Event('kinly:google-auth-required')));
    expect(navigate).toHaveBeenCalledWith('/profile?googleAuth=required', { replace: true });
    unmount();
  });
});
