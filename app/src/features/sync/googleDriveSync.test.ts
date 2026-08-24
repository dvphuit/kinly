import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppSnapshotRuntime } from '@/app/lifecycle/appSnapshotRuntime';
import { useActivityStore } from '@/features/activities/store/useActivityStore';
import { initializeChildProfile, resetChildStoresToDefaults } from '@/features/profile';
import { useExpenseStore } from '@/features/expenses/store/useExpenseStore';
import { useReminderStore } from '@/features/reminders/store/useReminderStore';
import { configureAppSnapshotRuntime } from '@/features/sync/appSnapshot';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { useUIStore } from '@/store/useUIStore';

const localDb = vi.hoisted(() => ({
  getLocalRecord: vi.fn(),
  setLocalRecord: vi.fn(),
}));
const timelineMediaDriveSync = vi.hoisted(() => ({
  syncTimelineMediaToDrive: vi.fn(),
}));

vi.mock('@/data/localDb', () => localDb);
vi.mock('@/features/sync/timelineMediaDriveSync', () => timelineMediaDriveSync);

const DEFAULT_ACCOUNT = {
  permissionId: 'account-1',
  emailAddress: 'parent@example.com',
  displayName: 'Parent',
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function accountResponse(account = DEFAULT_ACCOUNT): Response {
  return jsonResponse({ user: account });
}

function binaryResponse(value: string, contentType: string): Response {
  return new Response(value, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

function installGoogleTokenClient(token = 'token', expiresIn = 3600): ReturnType<typeof vi.fn> {
  const requestAccessToken = vi.fn();
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: { callback: (response: { access_token: string; expires_in: number }) => void }) => {
            requestAccessToken.mockImplementation(() => config.callback({ access_token: token, expires_in: expiresIn }));
            return { requestAccessToken };
          }),
        },
      },
    },
  });
  return requestAccessToken;
}

describe('generation-2 Google Drive sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    window.localStorage.clear();
    localDb.getLocalRecord.mockResolvedValue(null);
    localDb.setLocalRecord.mockResolvedValue(undefined);
    timelineMediaDriveSync.syncTimelineMediaToDrive.mockResolvedValue(0);
    configureAppSnapshotRuntime(createAppSnapshotRuntime());
    resetChildStoresToDefaults();
    useActivityStore.getState().resetTrackingData();
    useExpenseStore.getState().resetTrackingData();
    useReminderStore.getState().resetTrackingData();
    useTimelineStore.setState({ timelineItems: [] });
    useUIStore.setState({ profileMode: 'baby' });
    installGoogleTokenClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('creates semantic sync snapshots without Zustand persistence records', async () => {
    initializeChildProfile({ childName: 'Bé Bơ', birthDate: '2026-08-01' });
    const sync = await import('@/features/sync/googleDriveSync');

    const snapshot = sync.createSyncSnapshot();

    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.data.generation).toBe(2);
    expect(snapshot.data.profile.familyData.childName).toBe('Bé Bơ');
    expect(snapshot).not.toHaveProperty('records');
    expect(JSON.stringify(snapshot)).not.toContain('babygrowth_v2_chat');
  });

  it('patches the existing Drive backup with the current semantic snapshot', async () => {
    initializeChildProfile({ childName: 'Bé Bơ', birthDate: '2026-08-01' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(accountResponse())
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'remote-1', name: 'babygrowth-sync-v2.json' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'remote-1', name: 'babygrowth-sync-v2.json' }));
    vi.stubGlobal('fetch', fetchMock);
    const sync = await import('@/features/sync/googleDriveSync');
    await sync.requestGoogleAccessToken();

    const snapshot = await sync.overwriteDriveBackupWithLocalData();

    expect(snapshot.data.profile.familyData.childName).toBe('Bé Bơ');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/upload/drive/v3/files/remote-1?uploadType=multipart'),
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(localDb.setLocalRecord).toHaveBeenCalledWith(
      'babygrowth_v4_sync_meta',
      expect.stringContaining('lastSyncedFingerprint'),
    );
  });

  it('ignores schema-1 backups instead of failing Google login', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(accountResponse())
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'legacy', name: 'babygrowth-sync.json' }] }))
      .mockResolvedValueOnce(jsonResponse({ schemaVersion: 1, records: { babygrowth_v2_baby: '{}' } }));
    vi.stubGlobal('fetch', fetchMock);
    const sync = await import('@/features/sync/googleDriveSync');
    await sync.requestGoogleAccessToken();

    await expect(sync.checkDriveBackup()).resolves.toEqual({ found: false });
    expect(fetchMock.mock.calls[1][0]).toContain('babygrowth-sync-v2.json');
    expect(fetchMock.mock.calls[2][0]).toContain('babygrowth-sync.json');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('adopts a generation-2 backup that still uses the legacy filename', async () => {
    initializeChildProfile({ childName: 'Bé Bơ', birthDate: '2026-08-01' });
    const sync = await import('@/features/sync/googleDriveSync');
    const legacyNamedSnapshot = sync.createSyncSnapshot();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(accountResponse())
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'legacy-v2', name: 'babygrowth-sync.json' }] }))
      .mockResolvedValueOnce(jsonResponse(legacyNamedSnapshot))
      .mockResolvedValueOnce(jsonResponse({ id: 'legacy-v2', name: 'babygrowth-sync-v2.json' }));
    vi.stubGlobal('fetch', fetchMock);
    await sync.requestGoogleAccessToken();

    const snapshot = await sync.overwriteDriveBackupWithLocalData();

    expect(snapshot.data.profile.familyData.childName).toBe('Bé Bơ');
    expect(fetchMock.mock.calls[4][0]).toContain('/upload/drive/v3/files/legacy-v2?uploadType=multipart');
    expect(fetchMock.mock.calls[4][1]).toMatchObject({ method: 'PATCH' });
    const uploadBody = fetchMock.mock.calls[4][1]?.body;
    expect(uploadBody).toBeInstanceOf(Blob);
    if (!(uploadBody instanceof Blob)) throw new Error('Expected Drive snapshot upload to use a Blob body.');
    expect(await uploadBody.text()).toContain('babygrowth-sync-v2.json');
  });

  it('uploads private timeline media without Base64 conversion', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(accountResponse())
      .mockResolvedValueOnce(jsonResponse({ id: 'drive-media-1', name: 'baby.jpg' }));
    vi.stubGlobal('fetch', fetchMock);
    const sync = await import('@/features/sync/googleDriveSync');
    await sync.requestGoogleAccessToken();
    const media = new Blob(['image-bytes'], { type: 'image/jpeg' });

    await expect(sync.uploadTimelineMediaToDrive('media-1', media, { name: 'baby.jpg' })).resolves.toBe('drive-media-1');

    const [, init] = fetchMock.mock.calls[1];
    expect(fetchMock.mock.calls[1][0]).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(init).toMatchObject({ method: 'POST' });
    expect(init.body).toBeInstanceOf(Blob);
  });

  it('downloads private timeline media with the current Google token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(accountResponse())
      .mockResolvedValueOnce(binaryResponse('image-bytes', 'image/jpeg'));
    vi.stubGlobal('fetch', fetchMock);
    const sync = await import('@/features/sync/googleDriveSync');
    await sync.requestGoogleAccessToken();

    const downloaded = await sync.downloadTimelineMediaFromDrive('drive-media-1');
    expect(downloaded.type).toBe('image/jpeg');
    expect(await downloaded.text()).toBe('image-bytes');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/drive/v3/files/drive-media-1?alt=media'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } }),
    );
  });

  it('requests a Google token silently with the remembered account hint', async () => {
    const requestAccessToken = installGoogleTokenClient('silent-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(accountResponse()));
    const sync = await import('@/features/sync/googleDriveSync');

    const account = await sync.requestGoogleAccessTokenSilently({ loginHint: 'parent@example.com' });

    expect(account).toMatchObject(DEFAULT_ACCOUNT);
    expect(requestAccessToken).toHaveBeenCalledWith({
      prompt: 'none',
      login_hint: 'parent@example.com',
    });
    expect(sync.isGoogleConnected()).toBe(true);
  });

  it('expires the runtime session proactively and publishes re-authentication state', async () => {
    vi.useFakeTimers();
    installGoogleTokenClient('short-token', 61);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(accountResponse()));
    const sync = await import('@/features/sync/googleDriveSync');

    await sync.requestGoogleAccessToken();
    expect(sync.isGoogleConnected()).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(sync.isGoogleConnected()).toBe(false);
    expect(sync.getSyncState()).toMatchObject({
      status: 'auth-required',
      error: 'Phiên Google đã hết hạn. Hãy xác thực lại để tiếp tục đồng bộ.',
    });
  });

  it('does not publish re-authentication state when background auto-sync has no remembered Google link', async () => {
    vi.useFakeTimers();
    localDb.getLocalRecord.mockResolvedValue(JSON.stringify({
      lastSyncedFingerprint: 'fingerprint-1',
      remoteFileId: 'remote-1',
      lastSyncedAt: '2026-08-23T02:00:00.000Z',
      autoSyncEnabled: true,
      googleAccountId: 'account-1',
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const sync = await import('@/features/sync/googleDriveSync');

    const stop = await sync.startAutoSync();
    await vi.advanceTimersByTimeAsync(2_000);
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sync.getSyncState()).toMatchObject({
      status: 'idle',
      autoSyncEnabled: true,
      error: null,
    });
    stop();
  });

  it('resets account-scoped sync baseline when the user selects another Google account', async () => {
    const requestAccessToken = installGoogleTokenClient('account-b-token');
    localDb.getLocalRecord.mockResolvedValue(JSON.stringify({
      lastSyncedFingerprint: 'account-a-fingerprint',
      remoteFileId: 'account-a-file',
      lastSyncedAt: '2026-08-22T12:00:00.000Z',
      autoSyncEnabled: true,
      googleAccountId: 'account-a',
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(accountResponse({
      permissionId: 'account-b',
      emailAddress: 'other@example.com',
      displayName: 'Other Parent',
    })));
    const sync = await import('@/features/sync/googleDriveSync');

    const account = await sync.requestGoogleAccessToken({ selectAccount: true });

    expect(account).toMatchObject({ permissionId: 'account-b', emailAddress: 'other@example.com' });
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: 'select_account' });
    expect(localDb.setLocalRecord).toHaveBeenCalledWith(
      'babygrowth_v4_sync_meta',
      expect.stringContaining('"googleAccountId":"account-b"'),
    );
    const writtenMeta = localDb.setLocalRecord.mock.calls.at(-1)?.[1];
    expect(typeof writtenMeta).toBe('string');
    expect(JSON.parse(String(writtenMeta))).toMatchObject({
      googleAccountId: 'account-b',
      lastSyncedFingerprint: null,
      remoteFileId: null,
      lastSyncedAt: null,
      autoSyncEnabled: true,
    });
  });
});
