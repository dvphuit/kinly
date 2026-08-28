import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalMedia,
  setLocalMedia,
  waitForLocalRecordWrites,
} from '@/data/localDb';
import { replaceTimelineItems } from '@/data/normalizedRepositories';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { GoogleDriveDataView } from './GoogleDriveDataView';

const drive = vi.hoisted(() => ({
  SYNC_KEYS: ['babygrowth_v4_timeline'],
  checkDriveBackup: vi.fn(),
  createTimelineVideoStreamUrlFromDrive: vi.fn(),
  deleteTimelineMediaFromDrive: vi.fn(),
  downloadTimelineMediaFromDrive: vi.fn(),
  downloadTimelineMediaThumbnailFromDrive: vi.fn(),
  getLastSyncedAt: vi.fn(),
  isGoogleLinked: vi.fn(),
  isGoogleSessionActive: vi.fn(),
  listTimelineMediaFromDrive: vi.fn(),
  requestGoogleAccessToken: vi.fn(),
  releaseTimelineVideoStreamUrlFromDrive: vi.fn(),
  subscribeSyncState: vi.fn(),
}));

vi.mock('@/features/sync', () => drive);

describe('GoogleDriveDataView backup status', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearLocalMedia();
    drive.isGoogleLinked.mockReturnValue(false);
    drive.isGoogleSessionActive.mockReturnValue(false);
    drive.subscribeSyncState.mockImplementation(() => () => undefined);

    class TestURL extends URL {
      static createObjectURL = vi.fn(() => 'blob:local-preview');
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', TestURL);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ usage: 8192, quota: 1024 * 1024 }) },
    });

    useTimelineStore.getState().resetTrackingData();
    await waitForLocalRecordWrites(['babygrowth_v4_timeline']);
  });

  it('changes a local media tile from device-only to backed up after Drive sync metadata is persisted', async () => {
    await setLocalMedia('blob-sync-status', new Blob(['local-photo'], { type: 'image/jpeg' }));
    useTimelineStore.getState().addTimelineItem({
      title: 'Khoảnh khắc đang đồng bộ',
      mediaItems: [{
        id: 'media-sync-status',
        blobId: 'blob-sync-status',
        type: 'photo',
        name: 'sync-photo.jpg',
      }],
    });
    await waitForLocalRecordWrites(['babygrowth_v4_timeline']);

    render(
      <MemoryRouter>
        <GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('sync-photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('Chỉ trên máy')).toBeInTheDocument();

    const syncedTimelineItems = useTimelineStore.getState().timelineItems.map((item) => ({
      ...item,
      mediaItems: item.mediaItems?.map((media) => (
        media.blobId === 'blob-sync-status'
          ? { ...media, driveFileId: 'drive-file-1' }
          : media
      )),
    }));

    await act(async () => {
      await replaceTimelineItems(syncedTimelineItems);
      useTimelineStore.setState({ timelineItems: syncedTimelineItems });
    });

    await waitFor(() => expect(screen.getByText('Đã backup')).toBeInTheDocument());
    expect(screen.queryByText('Chỉ trên máy')).not.toBeInTheDocument();
  });
});
