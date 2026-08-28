import type { StateStorage } from 'zustand/middleware';
import {
  appDatabase,
  ensureNormalizedDataMigration,
  hasIndexedDb,
} from '@/data/appDatabase';
import { runTrackedLocalWrite, waitForTrackedLocalWrites } from '@/data/localWriteTracker';

export { runTrackedLocalWrite } from '@/data/localWriteTracker';


type LocalRecordChangeListener = (key: string) => void;
const localRecordChangeListeners = new Set<LocalRecordChangeListener>();

const memoryFallback = new Map<string, string>();
const memoryMediaFallback = new Map<string, Blob>();

export interface LocalMediaRecord {
  id: string;
  blob: Blob;
  size: number;
  mimeType: string;
}

function localStorageValue(key: string): string | null {
  return typeof window !== 'undefined' && window.localStorage
    ? window.localStorage.getItem(key)
    : null;
}

async function readValue(key: string): Promise<string | null> {
  if (!hasIndexedDb()) return memoryFallback.get(key) ?? localStorageValue(key);
  await ensureNormalizedDataMigration();
  return (await appDatabase.zustand.get(key)) ?? null;
}

async function writeValue(key: string, value: string): Promise<void> {
  await runTrackedLocalWrite(key, async () => {
    if (!hasIndexedDb()) {
      memoryFallback.set(key, value);
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, value);
      return;
    }
    await ensureNormalizedDataMigration();
    await appDatabase.zustand.put(value, key);
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key);
  });
}

async function removeValue(key: string): Promise<void> {
  await runTrackedLocalWrite(key, async () => {
    memoryFallback.delete(key);
    if (!hasIndexedDb()) {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key);
      return;
    }
    await ensureNormalizedDataMigration();
    await appDatabase.zustand.delete(key);
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key);
  });
}

export async function waitForLocalRecordWrites(keys: readonly string[]): Promise<void> {
  await waitForTrackedLocalWrites(keys);
}

export function subscribeLocalRecordChanges(listener: LocalRecordChangeListener): () => void {
  localRecordChangeListeners.add(listener);
  return () => localRecordChangeListeners.delete(listener);
}

function notifyLocalRecordChanged(key: string): void {
  localRecordChangeListeners.forEach((listener) => listener(key));
}

export const indexedDbStorage: StateStorage = {
  getItem: async (name) => readValue(name),
  setItem: async (name, value) => {
    await writeValue(name, value);
    notifyLocalRecordChanged(name);
  },
  removeItem: async (name) => {
    await removeValue(name);
  },
};

export async function getLocalRecord(key: string): Promise<string | null> {
  return readValue(key);
}

export async function setLocalRecord(key: string, value: string): Promise<void> {
  await writeValue(key, value);
  notifyLocalRecordChanged(key);
}

export async function removeLocalRecord(key: string): Promise<void> {
  await removeValue(key);
}

export async function getAllLocalRecords(keys: string[]): Promise<Record<string, string>> {
  const records = await Promise.all(keys.map(async (key) => [key, await readValue(key)] as const));
  return Object.fromEntries(records.filter((entry): entry is [string, string] => entry[1] !== null));
}

export async function setLocalMedia(id: string, blob: Blob): Promise<void> {
  if (!hasIndexedDb()) {
    memoryMediaFallback.set(id, blob);
    return;
  }
  await ensureNormalizedDataMigration();
  await appDatabase.media.put(blob, id);
}

export async function getLocalMedia(id: string): Promise<Blob | null> {
  if (!hasIndexedDb()) return memoryMediaFallback.get(id) ?? null;
  await ensureNormalizedDataMigration();
  return (await appDatabase.media.get(id)) ?? null;
}

export async function listLocalMedia(): Promise<LocalMediaRecord[]> {
  if (!hasIndexedDb()) {
    return [...memoryMediaFallback.entries()].map(([id, blob]) => ({ id, blob, size: blob.size, mimeType: blob.type }));
  }

  await ensureNormalizedDataMigration();
  const records: LocalMediaRecord[] = [];
  await appDatabase.media.each((blob, cursor) => {
    if (typeof cursor.primaryKey !== 'string') return;
    records.push({ id: cursor.primaryKey, blob, size: blob.size, mimeType: blob.type });
  });
  return records;
}

export async function removeLocalMedia(id: string): Promise<void> {
  memoryMediaFallback.delete(id);
  if (!hasIndexedDb()) return;
  await ensureNormalizedDataMigration();
  await appDatabase.media.delete(id);
}

export async function clearLocalMedia(): Promise<void> {
  memoryMediaFallback.clear();
  if (!hasIndexedDb()) return;
  await ensureNormalizedDataMigration();
  await appDatabase.media.clear();
}
