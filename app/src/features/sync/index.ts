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

const UNLOADED_SYNC_STATE = {
  status: 'idle',
  lastSyncedAt: null,
  autoSyncEnabled: false,
  error: null,
  conflict: null,
} satisfies SyncState;

let loadedGoogleDriveSyncModule: GoogleDriveSyncModule | null = null;
let googleDriveSyncModulePromise: Promise<GoogleDriveSyncModule> | null = null;

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

function rememberGoogleLink(): void {
  const clientId = getGoogleClientId();
  if (!clientId || typeof window === 'undefined') return;
  window.localStorage.setItem(GOOGLE_LINKED_CLIENT_KEY, clientId);
}

export function isGoogleConfigured(): boolean {
  return getGoogleClientId() !== null;
}

/** A successful Google grant remembered for the currently configured OAuth client. */
export function isGoogleLinked(): boolean {
  const clientId = getGoogleClientId();
  if (!clientId || typeof window === 'undefined') return false;
  return window.localStorage.getItem(GOOGLE_LINKED_CLIENT_KEY) === clientId;
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

export async function requestGoogleAccessToken(): Promise<void> {
  const module = await loadGoogleDriveSync();
  await module.requestGoogleAccessToken();
  rememberGoogleLink();
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

export async function startAutoSync(): Promise<() => void> {
  const module = await loadGoogleDriveSync();
  return module.startAutoSync();
}
