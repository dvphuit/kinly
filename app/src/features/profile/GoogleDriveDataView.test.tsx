import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalMedia, getLocalMedia, setLocalMedia } from '@/data/localDb';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { GoogleDriveDataView } from './GoogleDriveDataView';

const drive = vi.hoisted(() => ({
  SYNC_KEYS: ['babygrowth_v2_timeline'],
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

let syncStateListener: (() => void) | null = null;

vi.mock('@/features/sync', () => drive);

describe('GoogleDriveDataView', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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
    drive.createTimelineVideoStreamUrlFromDrive.mockResolvedValue(null);
    drive.getLastSyncedAt.mockResolvedValue('2026-08-18T09:00:00.000Z');
    drive.deleteTimelineMediaFromDrive.mockResolvedValue(undefined);
    drive.downloadTimelineMediaFromDrive.mockResolvedValue(new Blob(['image-bytes'], { type: 'image/jpeg' }));
    drive.downloadTimelineMediaThumbnailFromDrive.mockResolvedValue(new Blob(['thumbnail-bytes'], { type: 'image/jpeg' }));
    drive.requestGoogleAccessToken.mockResolvedValue(undefined);
    drive.releaseTimelineVideoStreamUrlFromDrive.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([0]), {
      status: 206,
      headers: {
        'Content-Range': 'bytes 0-0/4096',
        'Content-Type': 'video/mp4',
      },
    })));
    class TestURL extends URL {
      static createObjectURL = vi.fn(() => 'blob:drive-preview');
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', TestURL);
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
    useTimelineStore.getState().addTimelineItem({
      title: 'Nụ cười đầu ngày',
      mediaItems: [{ id: 'media-1', driveFileId: 'drive-1', type: 'photo', name: 'baby.jpg' }],
    });
    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));

    expect(await screen.findByText('baby.jpg')).toBeInTheDocument();
    expect(drive.listTimelineMediaFromDrive).toHaveBeenCalledWith({ interactive: false });
    expect(screen.getByText('Đang dùng trong “Nụ cười đầu ngày”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh baby.jpg' }));
    const mediaPreview = await screen.findByRole('dialog', { name: 'Xem media baby.jpg' });
    expect(screen.getByRole('img', { name: 'baby.jpg, ảnh 1' })).toHaveAttribute('src', 'blob:drive-preview');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng preview' }));
    await waitFor(() => expect(mediaPreview).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Xóa baby.jpg khỏi Google Drive' }));
    expect(screen.getByRole('dialog', { name: 'Xóa media khỏi Drive?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa media' }));

    await waitFor(() => expect(drive.deleteTimelineMediaFromDrive).toHaveBeenCalledWith('drive-1', { interactive: true }));
    await waitFor(() => expect(screen.queryByText('baby.jpg')).not.toBeInTheDocument());
    expect(useTimelineStore.getState().timelineItems[0].mediaItems).toEqual([]);
  });

  it('renders the Drive file list without waiting for the backup check', async () => {
    let resolveBackup: ((backup: { found: boolean }) => void) | undefined;
    drive.checkDriveBackup.mockReturnValue(new Promise((resolve) => { resolveBackup = resolve; }));

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));

    expect(await screen.findByText('baby.jpg')).toBeInTheDocument();
    expect(screen.queryByText('Bản sao lưu đang hoạt động')).not.toBeInTheDocument();
    resolveBackup?.({ found: true });
    expect(await screen.findByText('Bản sao lưu đang hoạt động')).toBeInTheDocument();
  });

  it('loads private thumbnails with Drive authentication', async () => {
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-1', name: 'baby.jpg', mimeType: 'image/jpeg', size: 2048,
      thumbnailLink: 'https://lh3.googleusercontent.com/private-thumbnail',
    }]);

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));

    const preview = await screen.findByRole('button', { name: 'Xem ảnh baby.jpg' });
    await waitFor(() => expect(drive.downloadTimelineMediaThumbnailFromDrive).toHaveBeenCalledWith(
      'https://lh3.googleusercontent.com/private-thumbnail',
      expect.objectContaining({ interactive: false, signal: expect.any(AbortSignal) }),
    ));
    await waitFor(() => expect(preview.querySelector('img')).toHaveAttribute('src', 'blob:drive-preview'));
  });

  it('does not open media after leaving the Drive view while a download is pending', async () => {
    let resolveDownload: ((blob: Blob) => void) | undefined;
    drive.downloadTimelineMediaFromDrive.mockReturnValue(new Promise((resolve) => { resolveDownload = resolve; }));
    const onOpenLightbox = vi.fn();
    const view = render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={onOpenLightbox} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xem ảnh baby.jpg' }));

    view.unmount();
    resolveDownload?.(new Blob(['image-bytes'], { type: 'image/jpeg' }));
    await act(async () => Promise.resolve());

    expect(onOpenLightbox).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Xem media baby.jpg' })).not.toBeInTheDocument();
  });

  it('opens the local copy immediately when the Drive file is still on the device', async () => {
    await setLocalMedia('blob-local-copy', new Blob(['local-image'], { type: 'image/jpeg' }));
    useTimelineStore.getState().addTimelineItem({
      title: 'Ảnh có hai bản',
      mediaItems: [{
        id: 'media-local-copy',
        blobId: 'blob-local-copy',
        driveFileId: 'drive-1',
        type: 'photo',
        name: 'baby.jpg',
      }],
    });
    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    await screen.findByText(/Ảnh có hai bản/);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'Xem ảnh baby.jpg' }));
    expect(await screen.findByRole('dialog', { name: 'Xem media baby.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'baby.jpg, ảnh 1' })).toHaveAttribute('src', 'blob:drive-preview');
    expect(drive.downloadTimelineMediaFromDrive).not.toHaveBeenCalled();
  });

  it('opens the journal preview immediately with a blurred thumbnail and download progress', async () => {
    let resolveDownload: ((blob: Blob) => void) | undefined;
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-video', name: 'first-steps.mp4', mimeType: 'video/mp4', size: 4096,
      thumbnailLink: 'https://lh3.googleusercontent.com/video-thumbnail',
    }]);
    drive.downloadTimelineMediaFromDrive.mockImplementation((
      _fileId: string,
      options: { onProgress?: (progress: number) => void },
    ) => {
      options.onProgress?.(37);
      return new Promise((resolve) => { resolveDownload = resolve; });
    });

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));
    const tile = await screen.findByRole('button', { name: 'Xem video first-steps.mp4' });
    await waitFor(() => expect(tile.querySelector('img')).toHaveAttribute('src', 'blob:drive-preview'));

    fireEvent.click(tile);

    expect(screen.getByRole('dialog', { name: 'Xem media first-steps.mp4' })).toBeInTheDocument();
    expect(document.querySelector('.moment-media-preview-loading-thumbnail')).toHaveAttribute('src', 'blob:drive-preview');
    await waitFor(() => expect(
      screen.getByRole('progressbar', { name: 'Đang tải video từ Google Drive' }),
    ).toHaveAttribute('aria-valuenow', '37'));
    expect(screen.getByText('37%')).toBeInTheDocument();

    resolveDownload?.(new Blob(['video-bytes'], { type: 'video/mp4' }));

    await waitFor(() => expect(document.querySelector('.moment-media-preview-loading')).not.toBeInTheDocument());
    const video = document.querySelector('video.moment-media-preview-asset');
    expect(video).toHaveAttribute('src', 'blob:drive-preview');
    expect(video).not.toHaveAttribute('controls');
    expect(document.querySelector('.moment-video-controls')).toBeInTheDocument();
  });

  it('streams Drive video through the service worker without downloading the full blob', async () => {
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-video', name: 'first-steps.mp4', mimeType: 'video/mp4', size: 4096,
      thumbnailLink: 'https://lh3.googleusercontent.com/video-thumbnail',
    }]);
    const streamUrl = `${window.location.origin}/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab`;
    drive.createTimelineVideoStreamUrlFromDrive.mockResolvedValue(streamUrl);

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));
    const tile = await screen.findByRole('button', { name: 'Xem video first-steps.mp4' });
    await waitFor(() => expect(tile.querySelector('img')).toHaveAttribute('src', 'blob:drive-preview'));

    fireEvent.click(tile);

    const video = await waitFor(() => {
      const element = document.querySelector('video.moment-media-preview-asset');
      expect(element).toHaveAttribute('src', streamUrl);
      return element;
    });
    expect(document.querySelector('.moment-media-preview-loading-thumbnail')).toBeInTheDocument();
    expect(drive.downloadTimelineMediaFromDrive).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      streamUrl,
      expect.objectContaining({
        cache: 'no-store',
        headers: { Range: 'bytes=0-0' },
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.loadedMetadata(video!);
    await waitFor(() => expect(document.querySelector('.moment-media-preview-loading')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Đóng preview' }));
    await waitFor(() => expect(drive.releaseTimelineVideoStreamUrlFromDrive).toHaveBeenCalledWith(streamUrl));
  });

  it('falls back to an authenticated download when the stream URL returns the app shell', async () => {
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-video', name: 'first-steps.mp4', mimeType: 'video/mp4', size: 4096,
      thumbnailLink: 'https://lh3.googleusercontent.com/video-thumbnail',
    }]);
    const streamUrl = `${window.location.origin}/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab`;
    drive.createTimelineVideoStreamUrlFromDrive.mockResolvedValue(streamUrl);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<!doctype html><title>Kinly</title>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }));
    drive.downloadTimelineMediaFromDrive.mockResolvedValue(new Blob(['video-bytes'], { type: 'video/mp4' }));

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xem video first-steps.mp4' }));

    await waitFor(() => expect(document.querySelector('video.moment-media-preview-asset')).toHaveAttribute('src', 'blob:drive-preview'));
    expect(drive.downloadTimelineMediaFromDrive).toHaveBeenCalledWith(
      'drive-video',
      expect.objectContaining({ interactive: true, signal: expect.any(AbortSignal) }),
    );
    expect(drive.releaseTimelineVideoStreamUrlFromDrive).toHaveBeenCalledWith(streamUrl);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to an authenticated download when stream initialization fails', async () => {
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-video', name: 'first-steps.mp4', mimeType: 'video/mp4', size: 4096,
    }]);
    drive.createTimelineVideoStreamUrlFromDrive.mockRejectedValue(
      new Error('Không thể khởi tạo streaming video từ Google Drive.'),
    );
    drive.downloadTimelineMediaFromDrive.mockResolvedValue(new Blob(['video-bytes'], { type: 'video/mp4' }));

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xem video first-steps.mp4' }));

    await waitFor(() => expect(document.querySelector('video.moment-media-preview-asset')).toHaveAttribute('src', 'blob:drive-preview'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('starts the download fallback when stream initialization hangs past the grace period', async () => {
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-video', name: 'first-steps.mp4', mimeType: 'video/mp4', size: 4096,
    }]);
    drive.createTimelineVideoStreamUrlFromDrive.mockReturnValue(new Promise(() => undefined));
    drive.downloadTimelineMediaFromDrive.mockResolvedValue(new Blob(['video-bytes'], { type: 'video/mp4' }));

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));
    const tile = await screen.findByRole('button', { name: 'Xem video first-steps.mp4' });

    vi.useFakeTimers();
    fireEvent.click(tile);
    await act(async () => vi.advanceTimersByTimeAsync(1_499));
    expect(drive.downloadTimelineMediaFromDrive).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    vi.useRealTimers();

    await waitFor(() => expect(document.querySelector('video.moment-media-preview-asset')).toHaveAttribute('src', 'blob:drive-preview'));
    expect(drive.downloadTimelineMediaFromDrive).toHaveBeenCalledTimes(1);
  });

  it('keeps the preview open when the browser reports a stream playback error', async () => {
    drive.listTimelineMediaFromDrive.mockResolvedValue([{
      id: 'drive-video', name: 'first-steps.mp4', mimeType: 'video/mp4', size: 4096,
      thumbnailLink: 'https://lh3.googleusercontent.com/video-thumbnail',
    }]);
    const streamUrl = `${window.location.origin}/__kinly/drive-media/01234567-89ab-4cde-8fab-0123456789ab`;
    drive.createTimelineVideoStreamUrlFromDrive.mockResolvedValue(streamUrl);

    render(<MemoryRouter><GoogleDriveDataView onOpenLightbox={vi.fn()} onShowToast={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: /Google Drive/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xem video first-steps.mp4' }));
    const video = await waitFor(() => {
      const element = document.querySelector('video.moment-media-preview-asset');
      expect(element).toBeInTheDocument();
      return element;
    });

    fireEvent.error(video!);

    expect(screen.getByRole('dialog', { name: 'Xem media first-steps.mp4' })).toBeInTheDocument();
    expect(screen.getByText('Không thể phát video từ Google Drive. Hãy thử lại.')).toBeInTheDocument();
    expect(drive.releaseTimelineVideoStreamUrlFromDrive).toHaveBeenCalledWith(streamUrl);
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