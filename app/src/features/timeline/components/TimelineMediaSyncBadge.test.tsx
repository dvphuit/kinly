import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  publishTimelineMediaSyncProgress,
  resetTimelineMediaSyncProgress,
} from '@/features/sync/timelineMediaSyncProgress';
import { TimelineMediaSyncBadge } from './TimelineMediaSyncBadge';

describe('TimelineMediaSyncBadge', () => {
  beforeEach(() => resetTimelineMediaSyncProgress());

  it('shows local, live upload progress and synced Drive states', () => {
    const { rerender } = render(
      <TimelineMediaSyncBadge media={{ id: 'media-1', blobId: 'media-1', type: 'photo' }} />,
    );
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Ảnh đã lưu trên thiết bị, đang chờ sao lưu lên Google Drive',
    );
    expect(screen.getByRole('status')).toHaveClass('status-local');
    expect(screen.getByRole('status').querySelector('svg')).toBeInTheDocument();

    act(() => publishTimelineMediaSyncProgress('media-1', { status: 'uploading', progress: 63 }));
    expect(screen.getByRole('status')).toHaveAccessibleName('Đang tải ảnh lên Google Drive: 63%');
    expect(screen.getByRole('status')).toHaveClass('status-uploading', 'is-expanded');
    expect(screen.getByRole('status')).toHaveTextContent('Tải lên 63%');

    rerender(
      <TimelineMediaSyncBadge media={{ id: 'media-1', blobId: 'media-1', driveFileId: 'drive-1', type: 'photo' }} />,
    );
    expect(screen.getByRole('status')).toHaveAccessibleName('Ảnh đã sao lưu trên Google Drive');
    expect(screen.getByRole('status')).toHaveClass('status-synced');
  });

  it('identifies video compression and errors with media-specific status text', () => {
    render(
      <TimelineMediaSyncBadge media={{ id: 'video-1', blobId: 'video-1', type: 'video' }} />,
    );

    act(() => publishTimelineMediaSyncProgress('video-1', { status: 'compressing', progress: 28 }));
    expect(screen.getByRole('status')).toHaveAccessibleName('Đang tối ưu video: 28%');
    expect(screen.getByRole('status')).toHaveTextContent('Tối ưu 28%');

    act(() => publishTimelineMediaSyncProgress('video-1', {
      status: 'error',
      error: 'Mất kết nối',
    }));
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Không thể sao lưu video: Mất kết nối',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Lỗi sao lưu');
  });
});
