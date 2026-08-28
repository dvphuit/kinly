/// <reference types="node" />

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function installIndexedDb(): void {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('Blob', NodeBlob);
}

describe('Dexie local database adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    installIndexedDb();
  });

  it('tracks all writes in a persistence scope until they settle', async () => {
    const { runTrackedLocalWrite, waitForTrackedLocalWrites } = await import('@/data/localWriteTracker');
    let finishFirst: (() => void) | undefined;
    let finishSecond: (() => void) | undefined;
    const first = runTrackedLocalWrite('scope', () => new Promise<void>((resolve) => { finishFirst = resolve; }));
    const second = runTrackedLocalWrite('scope', () => new Promise<void>((resolve) => { finishSecond = resolve; }));

    let barrierSettled = false;
    const barrier = waitForTrackedLocalWrites(['scope']).then(() => { barrierSettled = true; });
    await Promise.resolve();
    expect(barrierSettled).toBe(false);

    finishSecond?.();
    await second;
    await Promise.resolve();
    expect(barrierSettled).toBe(false);

    finishFirst?.();
    await first;
    await barrier;
    expect(barrierSettled).toBe(true);
  });

  it('stores, reads, and removes Zustand records through Dexie', async () => {
    const { indexedDbStorage, waitForLocalRecordWrites } = await import('@/data/localDb');

    await indexedDbStorage.setItem('key', 'value');
    await waitForLocalRecordWrites(['key']);
    await expect(indexedDbStorage.getItem('key')).resolves.toBe('value');

    await indexedDbStorage.removeItem('key');
    await waitForLocalRecordWrites(['key']);
    await expect(indexedDbStorage.getItem('key')).resolves.toBeNull();
  });

  it('does not resurrect a removed record from legacy localStorage', async () => {
    window.localStorage.setItem('key', 'stale-value');
    const { indexedDbStorage } = await import('@/data/localDb');

    await indexedDbStorage.removeItem('key');
    vi.stubGlobal('indexedDB', undefined);

    await expect(indexedDbStorage.getItem('key')).resolves.toBeNull();
  });

  it('stores and removes media blobs without serializing them', async () => {
    const { clearLocalMedia, getLocalMedia, listLocalMedia, removeLocalMedia, setLocalMedia } = await import('@/data/localDb');
    const photo = new Blob(['photo-bytes'], { type: 'image/jpeg' });
    const video = new Blob(['video-bytes'], { type: 'video/mp4' });

    await setLocalMedia('photo-1', photo);
    await setLocalMedia('video-1', video);
    expect(await getLocalMedia('photo-1')).toEqual(photo);
    expect(await listLocalMedia()).toEqual([
      { id: 'photo-1', blob: photo, size: photo.size, mimeType: 'image/jpeg' },
      { id: 'video-1', blob: video, size: video.size, mimeType: 'video/mp4' },
    ]);

    await removeLocalMedia('photo-1');
    expect(await getLocalMedia('photo-1')).toBeNull();
    expect(await listLocalMedia()).toEqual([
      { id: 'video-1', blob: video, size: video.size, mimeType: 'video/mp4' },
    ]);

    await clearLocalMedia();
    expect(await getLocalMedia('video-1')).toBeNull();
  });
});
