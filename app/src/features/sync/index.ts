export * from './appSnapshot';
export { SyncSnapshotIntegrityError } from './syncSnapshotEnvelope';
export type SyncSnapshot = import('./syncSnapshotEnvelope').SyncSnapshot;
export type SyncSnapshotIntegrityReason = import('./syncSnapshotEnvelope').SyncSnapshotIntegrityReason;

type GoogleDriveSyncModule = typeof import('./googleDriveSync');

export type SyncConflictReason = import('./googleDriveSync').SyncConflictReason;
export type SyncResult = import('./googleDriveSync').SyncResult;
export type SyncStatus = import('./googleDriveSync').SyncStatus;
export type SyncState = import('./googleDriveSync').SyncState;
export type DriveBackupSummary = import('./googleDriveSync').DriveBackupSummary;
export type DriveTimelineMediaFile = import('./googleDriveSync').DriveTimelineMediaFile;
export type PausedDriveOperations = import('./googleDriveSync').PausedDriveOperations;
export type GoogleAccountIdentity = import('./googleDriveSync').GoogleAccountIdentity;
export type GoogleAuthOptions = import('./googleDriveSync').GoogleAuthOptions;

/** Local persistence keys used by reset and diagnostics UI. Drive sync serializes semantic snapshots instead. */
export const SYNC_KEYS = [
  'babygrowth_v4_profile',
  'babygrowth_v4_growth',
  'babygrowth_v4_timeline',
  'babygrowth_v4_ui',
  'babygrowth_v4_activities',
  'babygrowth_v4_expenses',
  'babygrowth_v4_reminders',
] as const;

const GOOGLE_LINKED_CLIENT_KEY = 'babygrowth_v4_google_linked_client';
const GOOGLE_LINKED_ACCOUNT_KEY = 'babygrowth_v4_google_linked_account';

const UNLOADED_SYNC_STATE = {
  status: 'idle',
  lastSyncedAt: null,
  autoSyncEnabled: false,
  error: null,
  conflict: null,
} satisfies SyncState;

let loadedGoogleDriveSyncModule: GoogleDriveSyncModule | null = null;
let googleDriveSyncModulePromise: Promise<GoogleDriveSyncModule> | null = null;
let firebaseGoogleLinked = false;
let firebaseGoogleAccount: GoogleAccountIdentity | null = null;
let browserGoogleRestorePromise: Promise<boolean> | null = null;

function loadGoogleDriveSync(): Promise<GoogleDriveSyncModule> {
  if (loadedGoogleDriveSyncModule) return Promise.resolve(loadedGoogleDriveSyncModule);
  if (!googleDriveSyncModulePromise) {
    googleDriveSyncModulePromise = import('./googleDriveSync')
      .then((module) => {
        loadedGoogleDriveSyncModule = module;
        return module;
      })
      .catch((error) => {
        googleDriveSyncModulePromise = null;
        throw error;
      });
  }
  return googleDriveSyncModulePromise;
}

function getGoogleClientId(): string | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof clientId === 'string' && clientId.trim() ? clientId.trim() : null;
}

function parseStoredGoogleAccount(raw: string | null, clientId: string): GoogleAccountIdentity | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !('clientId' in value) || value.clientId !== clientId || !('account' in value)) {
      return null;
    }
    const account = value.account;
    if (typeof account !== 'object' || account === null || !('permissionId' in account) || typeof account.permissionId !== 'string' || !account.permissionId) {
      return null;
    }
    return {
      permissionId: account.permissionId,
      ...('emailAddress' in account && typeof account.emailAddress === 'string' ? { emailAddress: account.emailAddress } : {}),
      ...('displayName' in account && typeof account.displayName === 'string' ? { displayName: account.displayName } : {}),
      ...('photoLink' in account && typeof account.photoLink === 'string' ? { photoLink: account.photoLink } : {}),
    };
  } catch {
    return null;
  }
}

function rememberGoogleLink(account: GoogleAccountIdentity): void {
  const clientId = getGoogleClientId();
  if (!clientId || typeof window === 'undefined') return;
  window.localStorage.setItem(GOOGLE_LINKED_CLIENT_KEY, clientId);
  window.localStorage.setItem(GOOGLE_LINKED_ACCOUNT_KEY, JSON.stringify({ clientId, account }));
}

export function isGoogleConfigured(): boolean {
  if (import.meta.env.VITE_GOOGLE_DRIVE_BACKEND === 'firebase') {
    return Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_APP_ID);
  }
  return getGoogleClientId() !== null;
}

/** A successful Google grant remembered for the currently configured OAuth client. */
export function isGoogleLinked(): boolean {
  if (firebaseGoogleLinked) return true;
  const clientId = getGoogleClientId();
  if (!clientId || typeof window === 'undefined') return false;
  return window.localStorage.getItem(GOOGLE_LINKED_CLIENT_KEY) === clientId;
}

/** Last account identity confirmed by Google Drive for the configured OAuth client. No access token is persisted. */
export function getGoogleLinkedAccount(): GoogleAccountIdentity | null {
  if (firebaseGoogleAccount) return firebaseGoogleAccount;
  const clientId = getGoogleClientId();
  if (!clientId || typeof window === 'undefined') return null;
  return parseStoredGoogleAccount(window.localStorage.getItem(GOOGLE_LINKED_ACCOUNT_KEY), clientId);
}

/** A live, unexpired access-token session in the current JavaScript runtime. */
export function isGoogleSessionActive(): boolean {
  return loadedGoogleDriveSyncModule?.isGoogleConnected() ?? false;
}

/**
 * Backward-compatible runtime-session alias. Durable link state is intentionally
 * exposed separately through isGoogleLinked() so callers cannot treat a remembered
 * grant as a usable access token.
 */
export function isGoogleConnected(): boolean {
  return isGoogleSessionActive();
}

export function getSyncState(): SyncState {
  return loadedGoogleDriveSyncModule?.getSyncState() ?? UNLOADED_SYNC_STATE;
}

export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  if (loadedGoogleDriveSyncModule) return loadedGoogleDriveSyncModule.subscribeSyncState(listener);

  let active = true;
  let unsubscribe: (() => void) | undefined;
  listener(UNLOADED_SYNC_STATE);
  void loadGoogleDriveSync()
    .then((module) => {
      if (!active) return;
      unsubscribe = module.subscribeSyncState(listener);
    })
    .catch(() => {});

  return () => {
    active = false;
    unsubscribe?.();
  };
}

export async function startGoogleOAuth(options: GoogleAuthOptions = {}): Promise<void> {
  if (import.meta.env.VITE_GOOGLE_DRIVE_BACKEND !== 'firebase') {
    await requestGoogleAccessToken(options);
    return;
  }
  const { firebaseApiFetch } = await import('@/shared/firebase/firebaseClient');
  const query = options.selectAccount ? '?selectAccount=true' : '';
  const response = await firebaseApiFetch(`/api/google/oauth/start${query}`);
  const payload = await response.json().catch(() => null) as { authorizationUrl?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload?.authorizationUrl) {
    throw new Error(payload?.error?.message || 'Không thể bắt đầu kết nối Google Drive.');
  }
  window.location.assign(payload.authorizationUrl);
}

export async function requestGoogleAccessToken(options: GoogleAuthOptions = {}): Promise<GoogleAccountIdentity> {
  if (import.meta.env.VITE_GOOGLE_DRIVE_BACKEND === 'firebase') {
    throw new Error('Hãy kết nối Google Drive qua Firebase OAuth backend.');
  }
  const module = await loadGoogleDriveSync();
  const account = await module.requestGoogleAccessToken(options);
  rememberGoogleLink(account);
  return account;
}

async function restoreBrowserGoogleSession(): Promise<boolean> {
  if (isGoogleSessionActive()) return true;
  if (!isGoogleLinked() || typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;

  const rememberedAccount = getGoogleLinkedAccount();
  const module = await loadGoogleDriveSync();
  try {
    const account = await module.requestGoogleAccessTokenSilently(
      rememberedAccount?.emailAddress ? { loginHint: rememberedAccount.emailAddress } : {},
    );
    rememberGoogleLink(account);
    return true;
  } catch {
    return false;
  }
}

export async function restoreGoogleSession(): Promise<boolean> {
  if (import.meta.env.VITE_GOOGLE_DRIVE_BACKEND !== 'firebase') {
    if (isGoogleSessionActive()) return true;
    if (!browserGoogleRestorePromise) {
      browserGoogleRestorePromise = restoreBrowserGoogleSession().finally(() => {
        browserGoogleRestorePromise = null;
      });
    }
    return browserGoogleRestorePromise;
  }
  const { firebaseApiFetch } = await import('@/shared/firebase/firebaseClient');
  const response = await firebaseApiFetch('/api/google/status');
  if (response.status === 401) {
    firebaseGoogleLinked = false;
    firebaseGoogleAccount = null;
    return false;
  }
  if (!response.ok) throw new Error('Không thể đọc trạng thái Google Drive.');
  const status = await response.json() as {
    linked?: boolean;
    needsReauth?: boolean;
    email?: string | null;
    displayName?: string | null;
    permissionId?: string | null;
  };
  firebaseGoogleLinked = status.linked === true;
  firebaseGoogleAccount = status.linked && status.permissionId
    ? {
      permissionId: status.permissionId,
      ...(status.email ? { emailAddress: status.email } : {}),
      ...(status.displayName ? { displayName: status.displayName } : {}),
    }
    : null;
  publishFirebaseRestoreState(status.needsReauth === true);
  return firebaseGoogleLinked && status.needsReauth !== true;
}

export async function uploadTimelineMediaToDrive(
  mediaId: string,
  blob: Blob,
  options: { name?: string; interactive?: boolean; onProgress?: (progress: number) => void } = {},
): Promise<string> {
  const module = await loadGoogleDriveSync();
  return module.uploadTimelineMediaToDrive(mediaId, blob, options);
}

export async function listTimelineMediaFromDrive(
  options: { interactive?: boolean } = {},
): Promise<DriveTimelineMediaFile[]> {
  const module = await loadGoogleDriveSync();
  return module.listTimelineMediaFromDrive(options);
}

export async function downloadTimelineMediaFromDrive(
  fileId: string,
  options: { interactive?: boolean } = {},
): Promise<Blob> {
  const module = await loadGoogleDriveSync();
  return module.downloadTimelineMediaFromDrive(fileId, options);
}

export async function deleteTimelineMediaFromDrive(
  fileId: string,
  options: { interactive?: boolean } = {},
): Promise<void> {
  const module = await loadGoogleDriveSync();
  return module.deleteTimelineMediaFromDrive(fileId, options);
}

export async function runWithAutoSyncPaused<T>(
  operation: (drive: PausedDriveOperations) => Promise<T>,
): Promise<T> {
  const module = await loadGoogleDriveSync();
  return module.runWithAutoSyncPaused(operation);
}

export async function applyRemoteSnapshot(snapshot: SyncSnapshot): Promise<void> {
  const module = await loadGoogleDriveSync();
  return module.applyRemoteSnapshot(snapshot);
}

export async function overwriteDriveBackupWithLocalData(
  options: { interactive?: boolean } = {},
): Promise<SyncSnapshot> {
  const module = await loadGoogleDriveSync();
  return module.overwriteDriveBackupWithLocalData(options);
}

export async function syncWithGoogleDrive(
  options: { interactive?: boolean } = {},
): Promise<SyncResult> {
  const module = await loadGoogleDriveSync();
  return module.syncWithGoogleDrive(options);
}

export async function resolveSyncConflict(
  choice: 'local' | 'remote',
  remoteSnapshot: SyncSnapshot,
): Promise<'uploaded' | 'downloaded'> {
  const module = await loadGoogleDriveSync();
  return module.resolveSyncConflict(choice, remoteSnapshot);
}

export async function checkDriveBackup(): Promise<DriveBackupSummary> {
  const module = await loadGoogleDriveSync();
  return module.checkDriveBackup();
}

export async function restoreDriveBackup(snapshot: SyncSnapshot, remoteFileId: string): Promise<void> {
  const module = await loadGoogleDriveSync();
  return module.restoreDriveBackup(snapshot, remoteFileId);
}

export async function getLastSyncedAt(): Promise<string | null> {
  const module = await loadGoogleDriveSync();
  return module.getLastSyncedAt();
}

export async function isAutoSyncEnabled(): Promise<boolean> {
  const module = await loadGoogleDriveSync();
  return module.isAutoSyncEnabled();
}

export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
  const module = await loadGoogleDriveSync();
  return module.setAutoSyncEnabled(enabled);
}

function publishFirebaseRestoreState(needsReauth: boolean): void {
  if (!loadedGoogleDriveSyncModule) return;
  loadedGoogleDriveSyncModule.publishRestoredGoogleState?.(firebaseGoogleAccount, needsReauth);
}

export async function startAutoSync(): Promise<() => void> {
  const module = await loadGoogleDriveSync();
  return module.startAutoSync();
}

export function loadPasskeyVaultPrototypeView() {
  return import('./PasskeyVaultPrototypeView');
}
