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
const USE_PASSKEY_GOOGLE_AUTH = import.meta.env.VITE_GOOGLE_PASSKEY_AUTH === 'true';

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
let passkeyRestorePromise: Promise<boolean> | null = null;

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

function hasFirebaseWebConfig(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_APP_ID);
}

function usesServerGoogleOAuth(): boolean {
  return import.meta.env.VITE_GOOGLE_DRIVE_BACKEND === 'firebase' || USE_PASSKEY_GOOGLE_AUTH;
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

function errorMessageFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return null;
  const error = payload.error;
  if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') return null;
  return error.message;
}

function errorCodeFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return null;
  const error = payload.error;
  if (typeof error !== 'object' || error === null || !('code' in error) || typeof error.code !== 'string') return null;
  return error.code;
}

function readRefreshTokenClaim(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('refreshToken' in payload) || typeof payload.refreshToken !== 'string') return null;
  return payload.refreshToken.trim() || null;
}

function clearGoogleOAuthCallbackQuery(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('google');
  url.searchParams.delete('google_error');
  const query = url.searchParams.toString();
  window.history.replaceState(window.history.state, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
}

export function isPasskeyGoogleAuthEnabled(): boolean {
  return USE_PASSKEY_GOOGLE_AUTH;
}

export function isGoogleConfigured(): boolean {
  if (usesServerGoogleOAuth()) {
    return getGoogleClientId() !== null && hasFirebaseWebConfig();
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
  if (!usesServerGoogleOAuth()) {
    await requestGoogleAccessToken(options);
    return;
  }
  const { firebaseApiFetch } = await import('@/shared/firebase/firebaseClient');
  const query = options.selectAccount ? '?selectAccount=true' : '';
  const response = await firebaseApiFetch(`/api/google/oauth/start${query}`);
  const payload: unknown = await response.json().catch(() => null);
  const authorizationUrl = typeof payload === 'object' && payload !== null && 'authorizationUrl' in payload && typeof payload.authorizationUrl === 'string'
    ? payload.authorizationUrl
    : null;
  if (!response.ok || !authorizationUrl) {
    throw new Error(errorMessageFromPayload(payload) || 'Không thể bắt đầu kết nối Google Drive.');
  }
  window.location.assign(authorizationUrl);
}

export async function requestGoogleAccessToken(options: GoogleAuthOptions = {}): Promise<GoogleAccountIdentity> {
  if (usesServerGoogleOAuth()) {
    throw new Error('Hãy kết nối Google Drive qua luồng OAuth bảo vệ bằng Passkey.');
  }
  const module = await loadGoogleDriveSync();
  const account = await module.requestGoogleAccessToken(options);
  rememberGoogleLink(account);
  return account;
}

async function restorePasskeyGoogleSession(): Promise<boolean> {
  if (isGoogleSessionActive()) return true;
  const [{ firebaseApiFetch }, vault, module] = await Promise.all([
    import('@/shared/firebase/firebaseClient'),
    import('./passkeyTokenVault'),
    loadGoogleDriveSync(),
  ]);

  let refreshToken: string | null = null;
  const callbackConnected = typeof window !== 'undefined'
    && new URL(window.location.href).searchParams.get('google') === 'connected';

  if (callbackConnected) {
    const claimResponse = await firebaseApiFetch('/api/google/local-token/claim', { method: 'POST' });
    const claimPayload: unknown = await claimResponse.json().catch(() => null);
    refreshToken = readRefreshTokenClaim(claimPayload);

    if (!claimResponse.ok || !refreshToken) {
      const alreadyLocal = await vault.hasGoogleRefreshTokenInPasskeyVault();
      const claimCode = errorCodeFromPayload(claimPayload);
      if (!alreadyLocal || (claimResponse.status !== 404 && claimResponse.status !== 409 && claimCode !== 'GOOGLE_LOCAL_TOKEN_NOT_AVAILABLE')) {
        throw new Error(errorMessageFromPayload(claimPayload) || 'Không thể nhận refresh token Google để lưu bằng Passkey.');
      }
      clearGoogleOAuthCallbackQuery();
      refreshToken = await vault.unlockGoogleRefreshTokenFromPasskeyVault();
    } else {
      await vault.storeGoogleRefreshTokenInPasskeyVault(refreshToken);
      const commitResponse = await firebaseApiFetch('/api/google/local-token/commit', { method: 'POST' });
      const commitPayload: unknown = commitResponse.status === 204 ? null : await commitResponse.json().catch(() => null);
      if (!commitResponse.ok) {
        throw new Error(errorMessageFromPayload(commitPayload) || 'Refresh token đã được mã hóa local nhưng chưa xóa được bản tạm trên server.');
      }
      clearGoogleOAuthCallbackQuery();
    }
  } else {
    if (!(await vault.hasGoogleRefreshTokenInPasskeyVault())) return false;
    refreshToken = await vault.unlockGoogleRefreshTokenFromPasskeyVault();
  }

  const account = await module.restoreGoogleSessionFromPasskeyRefreshToken(refreshToken);
  rememberGoogleLink(account);
  return true;
}

async function restoreFirebaseGoogleSession(): Promise<boolean> {
  const { firebaseApiFetch } = await import('@/shared/firebase/firebaseClient');
  const response = await firebaseApiFetch('/api/google/status');
  if (response.status === 401) {
    firebaseGoogleLinked = false;
    firebaseGoogleAccount = null;
    return false;
  }
  if (!response.ok) throw new Error('Không thể đọc trạng thái Google Drive.');
  const status: unknown = await response.json();
  if (typeof status !== 'object' || status === null) throw new Error('Trạng thái Google Drive không hợp lệ.');
  const linked = 'linked' in status && status.linked === true;
  const needsReauth = 'needsReauth' in status && status.needsReauth === true;
  const permissionId = 'permissionId' in status && typeof status.permissionId === 'string' ? status.permissionId : null;
  const email = 'email' in status && typeof status.email === 'string' ? status.email : null;
  const displayName = 'displayName' in status && typeof status.displayName === 'string' ? status.displayName : null;
  firebaseGoogleLinked = linked;
  firebaseGoogleAccount = linked && permissionId
    ? {
      permissionId,
      ...(email ? { emailAddress: email } : {}),
      ...(displayName ? { displayName } : {}),
    }
    : null;
  publishFirebaseRestoreState(needsReauth);
  return firebaseGoogleLinked && !needsReauth;
}

export async function restoreGoogleSession(): Promise<boolean> {
  if (USE_PASSKEY_GOOGLE_AUTH) {
    if (isGoogleSessionActive()) return true;
    if (!passkeyRestorePromise) {
      passkeyRestorePromise = restorePasskeyGoogleSession().finally(() => {
        passkeyRestorePromise = null;
      });
    }
    return passkeyRestorePromise;
  }
  if (import.meta.env.VITE_GOOGLE_DRIVE_BACKEND !== 'firebase') return isGoogleSessionActive();
  return restoreFirebaseGoogleSession();
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
