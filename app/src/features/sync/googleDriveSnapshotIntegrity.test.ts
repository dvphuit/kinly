import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAppSnapshot } from './appSnapshot';
import { fingerprintAppSnapshot } from './syncSnapshotSerialization';

vi.mock('@/data/localDb', () => ({
  getLocalRecord: vi.fn().mockResolvedValue(null),
  setLocalRecord: vi.fn().mockResolvedValue(undefined),
}));

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installGoogleTokenClient(): void {
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: { callback: (response: { access_token: string; expires_in: number }) => void }) => ({
            requestAccessToken: vi.fn(() => config.callback({ access_token: 'token', expires_in: 3600 })),
          })),
        },
      },
    },
  });
}

function appSnapshot() {
  return parseAppSnapshot({
    generation: 2,
    exportedAt: '2026-08-22T04:00:00.000Z',
    profile: {
      familyData: {
        isInitialized: true,
        childName: 'Bé Bơ',
        childFullName: 'Bé Bơ',
        birthDate: '2026-08-01',
        gender: 'girl',
        bloodType: 'O+',
        childAvatar: '/assets/avatars/baby_avatar.jpg',
        momName: 'Mẹ',
        momAvatar: '/assets/avatars/mom_avatar.jpg',
      },
      profileMode: 'baby',
    },
    activities: { baby: [], mom: [], medicationCatalog: [] },
    growth: { currentStage: 'stage_0_1', stages: {}, completedHabitIds: [] },
    timeline: { items: [] },
    expenses: { records: [], monthlyBudget: 5_000_000 },
    reminders: { items: [], occurrenceStates: {}, systemNotificationsEnabled: false },
  });
}

describe('Google Drive snapshot integrity boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    window.localStorage.clear();
    installGoogleTokenClient();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reports a tampered backup as an integrity failure without treating Google auth as failed', async () => {
    const data = appSnapshot();
    const remote = {
      schemaVersion: 2,
      updatedAt: '2026-08-22T04:01:00.000Z',
      deviceId: 'device-remote',
      fingerprint: fingerprintAppSnapshot(data),
      data: structuredClone(data),
    };
    remote.data.profile.familyData.childName = 'Tampered';

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        user: {
          permissionId: 'account-1',
          emailAddress: 'parent@example.com',
          displayName: 'Parent',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'remote-1', name: 'babygrowth-sync-v2.json' }] }))
      .mockResolvedValueOnce(jsonResponse(remote));
    vi.stubGlobal('fetch', fetchMock);

    const sync = await import('./googleDriveSync');
    await sync.requestGoogleAccessToken();

    await expect(sync.checkDriveBackup()).rejects.toMatchObject({
      name: 'SyncSnapshotIntegrityError',
      reason: 'fingerprint-mismatch',
    });
    expect(sync.isGoogleConnected()).toBe(true);
  });
});
