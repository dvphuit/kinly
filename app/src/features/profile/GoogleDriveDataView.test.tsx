import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalMedia, getLocalMedia, setLocalMedia } from '@/data/localDb';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { GoogleDriveDataView } from './GoogleDriveDataView';

const drive = vi.hoisted(() => ({
  SYNC_KEYS: ['babygrowth_v2_timeline'],
  checkDriveBackup: vi.fn(),
  deleteTimelineMediaFromDrive: vi.fn(),
  downloadTimelineMediaFromDrive: vi.fn(),
  getLastSyncedAt: vi.fn(),
  isGoogleLinked: vi.fn(),
  isGoogleSessionActive: vi.fn(),
  listTimelineMediaFromDrive: vi.fn(),
  requestGoogleAccessToken: vi.fn(),
  subscribeSyncState: vi.fn(),
}));

let syncStateListener: (() => void) | null = null;

vi.mock('@/features/sync', () => drive);

describe('GoogleDriveDataView', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    syncStateListener = null;
    drive.subscribeSyncState.mockImplementation((listener: () => void) => {
      syncStateListener = listener;
      return () => { syncStateListener = null; };
    });
    window.localStorage.clear();
    await clearLocalMedia();
    drive.isGoogleLinked.mockReturnValue(true);
    drive.isGoogleSessionActive.mockReturnValue(true);
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-1', name: 'baby.jpg', mimeType: 'image/jpeg', size: 2048,
      createdTime: '2026-08-18T08:00:00.000Z', modifiedTime: '2026-08-18T09:00:00.000Z',
    }]);
    drive.checkDriveBackup.mockResolvedValue({ found: true, updatedAt: '2026-08-18T09:00:00.000Z' });
    drive.getLastSyncedAt.mockResolvedValue('2026-08-18T09:00:00.000Z');
    drive.deleteTimelineMediaFromDrive.mockResolvedValue(undefined);
    drive.downloadTimelineMediaFromDrive.mockResolvedValue(new Blob(['image-bytes'], { type: 'image/jpeg' }));
    drive.requestGoogleAccessToken.mockResolvedValue(undefined);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:drive-preview'), revokeObjectURL: vi.fn() });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ usage: 8192, quota: 1024 * 1024 }) },
    });
    useTimelineStore.getState().resetTrackingData();
  });

  it('separates device and Google Drive into two segments', async () => {
    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);

    const deviceTab = screen.getByRole('tab', { name: /Thiết bị/i });
    const driveTab = screen.getByRole('tab', { name: /Google Drive/i });
    expect(deviceTab).toHaveAttribute('aria-selected', 'true');
    expect(driveTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('heading', { name: 'Dữ liệu local' })).toBeInTheDocument();
    expect(screen.queryByText('Bản sao lưu đang hoạt động')).not.toBeInTheDocument();

    fireEvent.click(driveTab);

    expect(driveTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('heading', { name: 'Dữ liệu local' })).not.toBeInTheDocument();
    expect(await screen.findByText('Bản sao lưu đang hoạt động')).toBeInTheDocument();
  });

  it('does not open Google auth when a linked account has no active session', async () => {
    drive.isGoogleSessionActive.mockReturnValue(false);

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));

    expect(screen.getByRole('tab', { name: /Google Drive.*Đã liên kết/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Xác thực Google Drive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xác thực để xem dữ liệu/i })).toBeInTheDocument();
    expect(drive.requestGoogleAccessToken).not.toHaveBeenCalled();
    expect(drive.listTimelineMediaFromDrive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Xác thực để xem dữ liệu/i }));

    await waitFor(() => expect(drive.requestGoogleAccessToken).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(drive.listTimelineMediaFromDrive).toHaveBeenCalledWith({ interactive: false }));
    expect(await screen.findByText('baby.jpg')).toBeInTheDocument();
  });

  it('updates to linked re-authentication state when the Google session expires while open', async () => {
    let sessionActive = true;
    drive.isGoogleSessionActive.mockImplementation(() => sessionActive);

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));

    expect(await screen.findByText('baby.jpg')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Google Drive.*Đã xác thực/i })).toBeInTheDocument();

    sessionActive = false;
    act(() => syncStateListener?.());

    await waitFor(() => expect(screen.getByRole('tab', { name: /Google Drive.*Đã liên kết/i })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Xác thực Google Drive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xác thực để xem dữ liệu/i })).toBeInTheDocument();
    expect(drive.requestGoogleAccessToken).not.toHaveBeenCalled();
  });

  it('lists, previews, and deletes private Drive media', async () => {
    const onOpenLightbox = vi.fn();
    useTimelineStore.getState().addTimelineItem({
      title: 'Nụ cười đầu ngày',
      mediaItems: [{ id: 'media-1', driveFileId: 'drive-1', type: 'photo', name: 'baby.jpg' }],
    });
    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={onOpenLightbox} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));

    expect(await screen.findByText('baby.jpg')).toBeInTheDocument();
    expect(drive.listTimelineMediaFromDrive).toHaveBeenCalledWith({ interactive: false });
    expect(screen.getByText('Đang dùng trong “Nụ cười đầu ngày”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh baby.jpg' }));
    await waitFor(() => expect(onOpenLightbox).toHaveBeenCalledWith('blob:drive-preview', false));

    fireEvent.click(screen.getByRole('button', { name: 'Xóa baby.jpg khỏi Google Drive' }));
    expect(screen.getByRole('dialog', { name: 'Xóa media khỏi Drive?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa media' }));

    await waitFor(() => expect(drive.deleteTimelineMediaFromDrive).toHaveBeenCalledWith('drive-1', { interactive: true }));
    await waitFor(() => expect(screen.queryByText('baby.jpg')).not.toBeInTheDocument());
    expect(useTimelineStore.getState().timelineItems[0].mediaItems).toEqual([]);
  });

  it('uses a play affordance for video cards without a media-type label', async () => {
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-video', name: 'first-steps.mp4', mimeType: 'video/mp4', size: 4096,
      createdTime: '2026-08-18T08:00:00.000Z', modifiedTime: '2026-08-18T09:00:00.000Z',
    }]);

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));

    const preview = await screen.findByRole('button', { name: 'Xem video first-steps.mp4' });
    expect(preview.querySelector('.drive-media-play')).toBeInTheDocument();
    const card = preview.closest('article');
    expect(card).not.toHaveTextContent('Video');
    expect(card).toHaveTextContent('4.0 KB');
  });

  it('opens diagnostic logs in a bottom sheet and copies production logs', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);

    await waitFor(() => expect(drive.listTimelineMediaFromDrive).toHaveBeenCalledWith({ interactive: false }));
    expect(screen.queryByRole('dialog', { name: 'Logs chẩn đoán' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mở logs chẩn đoán' }));

    expect(screen.getByRole('dialog', { name: 'Logs chẩn đoán' })).toBeInTheDocument();
    expect(screen.getByText('Drive management refresh completed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Drive management refresh completed')));
    expect(writeText.mock.calls[0][0]).not.toContain('Bearer');
  });

  it('shows local media and deletes only the device copy when it is backed up', async () => {
    const photo = new Blob(['local-photo'], { type: 'image/jpeg' });
    await setLocalMedia('blob-backed-up', photo);
    useTimelineStore.getState().addTimelineItem({
      title: 'Khoảnh khắc đã lưu',
      mediaItems: [{ id: 'media-local', blobId: 'blob-backed-up', driveFileId: 'drive-1', type: 'photo', name: 'local-baby.jpg' }],
    });

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);

    expect(await screen.findByText('local-baby.jpg')).toBeInTheDocument();
    expect(screen.getByText('Đã backup')).toBeInTheDocument();
    expect(screen.getByText('8.0 KB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bản local local-baby.jpg' }));
    expect(screen.getByRole('dialog', { name: 'Xóa bản trên thiết bị?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa media' }));

    await waitFor(() => expect(screen.queryByText('local-baby.jpg')).not.toBeInTheDocument());
    expect(await getLocalMedia('blob-backed-up')).toBeNull();
    expect(useTimelineStore.getState().timelineItems[0].mediaItems?.[0]).toMatchObject({
      blobId: 'blob-backed-up',
      driveFileId: 'drive-1',
    });
  });

  it('keeps local-only media during bulk cleanup and removes it from the timeline only after explicit confirmation', async () => {
    await setLocalMedia('blob-backed-up', new Blob(['backed-up'], { type: 'image/jpeg' }));
    await setLocalMedia('blob-only', new Blob(['only-local'], { type: 'image/jpeg' }));
    useTimelineStore.getState().addTimelineItem({
      title: 'Hai khoảnh khắc',
      mediaItems: [
        { id: 'media-backed-up', blobId: 'blob-backed-up', driveFileId: 'drive-1', type: 'photo', name: 'backed.jpg' },
        { id: 'media-only', blobId: 'blob-only', type: 'photo', name: 'only.jpg' },
      ],
    });

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);

    await screen.findByText('backed.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Dọn 1 đã backup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dọn bản local' }));
    await waitFor(() => expect(screen.queryByText('backed.jpg')).not.toBeInTheDocument());
    expect(await getLocalMedia('blob-backed-up')).toBeNull();
    expect(await getLocalMedia('blob-only')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa bản local only.jpg' }));
    expect(screen.getByRole('dialog', { name: 'Media này chưa được backup' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa media' }));

    await waitFor(() => expect(screen.queryByText('only.jpg')).not.toBeInTheDocument());
    expect(await getLocalMedia('blob-only')).toBeNull();
    expect(useTimelineStore.getState().timelineItems[0].mediaItems).toEqual([
      expect.objectContaining({ blobId: 'blob-backed-up', driveFileId: 'drive-1' }),
    ]);
  });
});
