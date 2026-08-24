import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForAppSnapshotRuntime } from '../appSnapshot';
import { startAutoSync } from '@/features/sync/googleDriveSync';
import { useAutoSyncLifecycle } from './useAutoSyncLifecycle';

type AutoSyncStateListener = (state: { autoSyncEnabled: boolean }) => void;

const syncSession = vi.hoisted(() => ({
  isAutoSyncEnabled: vi.fn(),
  subscribeSyncState: vi.fn(),
}));

vi.mock('../appSnapshot', () => ({ waitForAppSnapshotRuntime: vi.fn() }));
vi.mock('../index', () => syncSession);
vi.mock('@/features/sync/googleDriveSync', () => ({ startAutoSync: vi.fn() }));

const waitForAppSnapshotRuntimeMock = vi.mocked(waitForAppSnapshotRuntime);
const startAutoSyncMock = vi.mocked(startAutoSync);
let idleCallbacks: IdleRequestCallback[] = [];
let nextIdleId = 1;
let currentAutoSyncEnabled = true;
let syncStateListener: AutoSyncStateListener | null = null;
const cancelIdleCallbackMock = vi.fn();
const unsubscribeSyncStateMock = vi.fn();

function runNextIdleCallback(): void {
  const callback = idleCallbacks.shift();
  if (!callback) throw new Error('No idle callback was scheduled');
  act(() => {
    callback({ didTimeout: false, timeRemaining: () => 10 });
  });
}

describe('useAutoSyncLifecycle', () => {
  beforeEach(() => {
    waitForAppSnapshotRuntimeMock.mockReset();
    waitForAppSnapshotRuntimeMock.mockResolvedValue();
    startAutoSyncMock.mockReset();
    syncSession.isAutoSyncEnabled.mockReset();
    syncSession.isAutoSyncEnabled.mockImplementation(async () => currentAutoSyncEnabled);
    syncSession.subscribeSyncState.mockReset();
    syncSession.subscribeSyncState.mockImplementation((listener: AutoSyncStateListener) => {
      syncStateListener = listener;
      listener({ autoSyncEnabled: currentAutoSyncEnabled });
      return unsubscribeSyncStateMock;
    });
    cancelIdleCallbackMock.mockReset();
    unsubscribeSyncStateMock.mockReset();
    idleCallbacks = [];
    nextIdleId = 1;
    currentAutoSyncEnabled = true;
    syncStateListener = null;
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return nextIdleId++;
    }));
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallbackMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
    expect(startAutoSyncMock).not.toHaveBeenCalled();

    runNextIdleCallback();
    await waitFor(() => expect(startAutoSyncMock).toHaveBeenCalledTimes(1));

    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(unsubscribeSyncStateMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the auto-sync service stopped until auto-sync is enabled', async () => {
    currentAutoSyncEnabled = false;
    const stop = vi.fn();
    startAutoSyncMock.mockResolvedValue(stop);

    const { unmount } = renderHook(() => useAutoSyncLifecycle(true));
    runNextIdleCallback();

    await waitFor(() => expect(syncSession.subscribeSyncState).toHaveBeenCalledTimes(1));
    expect(syncSession.isAutoSyncEnabled).toHaveBeenCalledTimes(1);
    expect(startAutoSyncMock).not.toHaveBeenCalled();

    await act(async () => {
      currentAutoSyncEnabled = true;
      syncStateListener?.({ autoSyncEnabled: true });
    });
    await waitFor(() => expect(startAutoSyncMock).toHaveBeenCalledTimes(1));

    act(() => {
      currentAutoSyncEnabled = false;
      syncStateListener?.({ autoSyncEnabled: false });
    });
    expect(stop).toHaveBeenCalledTimes(1);

    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(unsubscribeSyncStateMock).toHaveBeenCalledTimes(1);
  });

  it('starts auto-sync when the profile becomes initialized', async () => {
    const stop = vi.fn();
    startAutoSyncMock.mockResolvedValue(stop);
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useAutoSyncLifecycle(enabled),
      { initialProps: { enabled: false } },
    );

    expect(idleCallbacks).toHaveLength(0);
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

    await act(async () => {
      resolveRuntime();
    });
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

    await act(async () => {
      resolveStart(stop);
    });

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not surface a rejected startup promise from the shell hook', async () => {
    startAutoSyncMock.mockRejectedValue(new Error('sync unavailable'));
    const { unmount } = renderHook(() => useAutoSyncLifecycle());

    runNextIdleCallback();
    await waitFor(() => expect(startAutoSyncMock).toHaveBeenCalledTimes(1));
    unmount();
  });
});
