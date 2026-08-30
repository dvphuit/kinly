import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetChildStoresToDefaults } from '@/features/profile';
import type { TimelineMediaItem } from '@/features/timeline/domain/types';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { useUIStore } from '@/store/useUIStore';
import type { TimelineMediaReadProgress } from './components/timelineMediaFiles';

const mediaFiles = vi.hoisted(() => ({
  readTimelineMediaFiles: vi.fn(),
  removeTimelineMediaFiles: vi.fn(async () => undefined),
}));

vi.mock('@/features/timeline/components/timelineMediaFiles', () => ({
  detectTimelineMediaType: () => 'photo',
  readTimelineMediaFiles: mediaFiles.readTimelineMediaFiles,
  removeTimelineMediaFiles: mediaFiles.removeTimelineMediaFiles,
}));

import { AddPostModal } from './AddPostModal';

describe('TimelineEntryEditor media processing status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTimelineStore.getState().resetTrackingData();
    resetChildStoresToDefaults();
    useUIStore.setState({ profileMode: 'baby' });
  });

  it('shows per-file progress and prevents saving until all selected media is ready', async () => {
    let reportProgress: ((progress: TimelineMediaReadProgress) => void) | undefined;
    let finishReading: ((items: TimelineMediaItem[]) => void) | undefined;
    mediaFiles.readTimelineMediaFiles.mockImplementation((
      _files: Iterable<File> | null | undefined,
      options: { onProgress?: (progress: TimelineMediaReadProgress) => void },
    ) => {
      reportProgress = options.onProgress;
      reportProgress?.({
        phase: 'preparing', completedFiles: 0, totalFiles: 2, fileNumber: 1,
        fileName: 'first.jpg', mediaType: 'photo',
      });
      return new Promise<TimelineMediaItem[]>((resolve) => {
        finishReading = resolve;
      });
    });

    render(<AddPostModal isOpen onClose={vi.fn()} onSuccessToast={vi.fn()} />);
    const galleryInput = screen.getByLabelText('Chọn từ thư viện');
    fireEvent.change(galleryInput, {
      target: {
        files: [
          new File(['one'], 'first.jpg', { type: 'image/jpeg' }),
          new File(['two'], 'second.mp4', { type: 'video/mp4' }),
        ],
      },
    });

    expect(await screen.findByText('Đang chuẩn bị ảnh · 1/2')).toBeInTheDocument();
    expect(screen.getByText('first.jpg · 13%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đang chuẩn bị ảnh/video' })).toBeDisabled();
    expect(galleryInput).toBeDisabled();

    act(() => {
      reportProgress?.({
        phase: 'saving', completedFiles: 1, totalFiles: 2, fileNumber: 2,
        fileName: 'second.mp4', mediaType: 'video',
      });
    });
    expect(screen.getByText('Đang lưu video trên thiết bị · 2/2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '88');

    act(() => {
      finishReading?.([
        { id: 'photo-ready', type: 'photo', url: 'https://example.com/first.jpg' },
        { id: 'video-ready', type: 'video', url: 'https://example.com/second.mp4' },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lưu ghi nhận' })).toBeEnabled();
      expect(screen.getByText('2 mục · có thể thêm tiếp')).toBeInTheDocument();
    });
    expect(galleryInput).toBeEnabled();
  });
});
