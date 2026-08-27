import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MomentMediaPreview } from '@/features/timeline/components/MomentMediaPreview';
import type { TimelineMediaItem } from '@/features/timeline/domain/types';

describe('MomentMediaPreview', () => {
  it('renders a blurred thumbnail with determinate Drive progress', () => {
    render(
      <MomentMediaPreview
        preview={{
          items: [{ id: 'drive-photo', type: 'photo' }],
          initialIndex: 0,
          title: 'Ảnh từ Drive',
          layoutId: 'drive-photo-preview',
          originSrc: 'blob:thumbnail',
          loading: { kind: 'determinate', previewSrc: 'blob:thumbnail', progress: 42 },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(document.querySelector('.moment-media-preview-loading-thumbnail')).toHaveAttribute('src', 'blob:thumbnail');
    expect(screen.getByRole('progressbar', { name: 'Đang tải ảnh từ Google Drive' })).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('starts a stream behind the blurred thumbnail and reports when video becomes playable', () => {
    const media: TimelineMediaItem = {
      id: 'drive-video',
      type: 'video',
      url: 'https://kinly.test/__kinly/drive-media/stream-session-id-123',
    };
    const onMediaReady = vi.fn();
    render(
      <MomentMediaPreview
        preview={{
          items: [media],
          initialIndex: 0,
          title: 'Video từ Drive',
          layoutId: 'drive-video-preview',
          originSrc: 'blob:thumbnail',
          loading: { kind: 'stream', previewSrc: 'blob:thumbnail' },
        }}
        onClose={vi.fn()}
        onMediaReady={onMediaReady}
      />,
    );

    const video = document.querySelector('video[controls]');
    expect(video).toHaveAttribute('src', media.url);
    expect(document.querySelector('.moment-media-preview-loading-thumbnail')).toHaveAttribute('src', 'blob:thumbnail');
    fireEvent.loadedMetadata(video!);
    expect(onMediaReady).toHaveBeenCalledWith(media);
  });

  it('opens the tapped media with the active shared-layout identity', () => {
    const items: TimelineMediaItem[] = [
      { id: 'photo-1', type: 'photo', url: 'https://example.com/one.jpg' },
      { id: 'photo-2', type: 'photo', url: 'https://example.com/two.jpg' },
      { id: 'photo-3', type: 'photo', url: 'https://example.com/three.jpg' },
    ];

    render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 1,
          title: 'Khoảnh khắc',
          layoutId: 'moment-test-photo-2',
          originSrc: items[1].url ?? '',
          getLayoutId: (index, media) => `moment-test-${media.id ?? index}`,
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Khoảnh khắc, ảnh 2' })).toHaveAttribute(
      'src',
      'https://example.com/two.jpg',
    );
    expect(screen.getByRole('img', { name: 'Khoảnh khắc, ảnh 2' })).toHaveAttribute(
      'data-layout-id',
      'moment-test-photo-2',
    );
  });

  it('updates the active shared-layout identity while navigating', async () => {
    const onClose = vi.fn();
    const items: TimelineMediaItem[] = [
      { id: 'photo-1', type: 'photo', url: 'https://example.com/one.jpg' },
      { id: 'photo-2', type: 'photo', url: 'https://example.com/two.jpg' },
      { id: 'video-3', type: 'video', url: 'https://example.com/three.mp4' },
    ];

    render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 0,
          title: 'Khoảnh khắc',
          layoutId: 'moment-test-photo-1',
          originSrc: items[0].url ?? '',
          getLayoutId: (index, media) => `moment-test-${media.id ?? index}`,
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Khoảnh khắc, ảnh 1' })).toHaveAttribute(
      'data-layout-id',
      'moment-test-photo-1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Media kế tiếp' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Khoảnh khắc, ảnh 2' })).toHaveAttribute(
      'src',
      'https://example.com/two.jpg',
    );
    expect(screen.getByRole('img', { name: 'Khoảnh khắc, ảnh 2' })).toHaveAttribute(
      'data-layout-id',
      'moment-test-photo-2',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xem media 3' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    const videoElement = document.querySelector('video');
    expect(videoElement).toBeInTheDocument();
    expect(videoElement).toHaveAttribute('src', 'https://example.com/three.mp4');
    expect(videoElement).toHaveAttribute('data-layout-id', 'moment-test-video-3');

    fireEvent.click(screen.getByRole('button', { name: 'Media trước' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('settles at the latest page after rapid navigation', () => {
    const items: TimelineMediaItem[] = [
      { id: 'photo-1', type: 'photo', url: 'https://example.com/one.jpg' },
      { id: 'photo-2', type: 'photo', url: 'https://example.com/two.jpg' },
      { id: 'photo-3', type: 'photo', url: 'https://example.com/three.jpg' },
    ];

    render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 0,
          title: 'Khoảnh khắc',
          layoutId: 'moment-test-photo-1',
          originSrc: items[0].url ?? '',
        }}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Media kế tiếp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Media kế tiếp' }));

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('renders media beyond the visible thumbnail set', () => {
    const items: TimelineMediaItem[] = [
      { id: 'photo-1', type: 'photo', url: 'https://example.com/one.jpg' },
      { id: 'photo-2', type: 'photo', url: 'https://example.com/two.jpg' },
      { id: 'photo-3', type: 'photo', url: 'https://example.com/three.jpg' },
      { id: 'photo-4', type: 'photo', url: 'https://example.com/four.jpg' },
      { id: 'photo-5', type: 'photo', url: 'https://example.com/five.jpg' },
      { id: 'photo-6', type: 'photo', url: 'https://example.com/six.jpg' },
      { id: 'photo-7', type: 'photo', url: 'https://example.com/seven.jpg' },
    ];
    const visibleItems = items.slice(0, 4);

    render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 3,
          title: 'Khoảnh khắc 7 ảnh',
          layoutId: 'moment-timeline-entry1-photo-4',
          originSrc: items[3].url ?? '',
          getLayoutId: (index) => {
            const targetIndex = Math.min(index, visibleItems.length - 1);
            const targetMedia = visibleItems[targetIndex] ?? items[0];
            return `moment-timeline-entry1-${targetMedia.id ?? targetIndex}`;
          },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('4 / 7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Media kế tiếp' }));
    expect(screen.getByText('5 / 7')).toBeInTheDocument();

    const activeImg = screen.getByRole('img', { name: 'Khoảnh khắc 7 ảnh, ảnh 5' });
    expect(activeImg).toBeInTheDocument();
    expect(activeImg).toHaveAttribute('src', 'https://example.com/five.jpg');
  });

  it('mounts only the active and adjacent assets in a large album', () => {
    const items: TimelineMediaItem[] = Array.from({ length: 20 }, (_, index) => ({
      id: `photo-${index + 1}`,
      type: 'photo' as const,
      url: `https://example.com/${index + 1}.jpg`,
    }));

    render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 10,
          title: 'Album lớn',
          layoutId: 'moment-large-photo-11',
          originSrc: items[10].url ?? '',
          getLayoutId: (index, media) => `moment-large-${media.id ?? index}`,
        }}
        onClose={vi.fn()}
      />,
    );

    expect(document.querySelectorAll('.moment-media-preview-slide')).toHaveLength(20);
    expect(document.querySelectorAll('[data-media-mounted="true"]')).toHaveLength(3);
    expect(document.querySelectorAll('.moment-media-preview-asset')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Album lớn, ảnh 11' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Album lớn, ảnh 1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Media kế tiếp' }));

    expect(document.querySelectorAll('[data-media-mounted="true"]')).toHaveLength(3);
    expect(document.querySelectorAll('.moment-media-preview-asset')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Album lớn, ảnh 12' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Album lớn, ảnh 10' })).not.toBeInTheDocument();
  });

  it('limits video preload to active metadata and disables adjacent preload', () => {
    const items: TimelineMediaItem[] = [
      { id: 'video-1', type: 'video', url: 'https://example.com/one.mp4' },
      { id: 'video-2', type: 'video', url: 'https://example.com/two.mp4' },
      { id: 'video-3', type: 'video', url: 'https://example.com/three.mp4' },
    ];

    render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 1,
          title: 'Album video',
          layoutId: 'moment-video-2',
          originSrc: items[1].url ?? '',
        }}
        onClose={vi.fn()}
      />,
    );

    const videos = Array.from(document.querySelectorAll('video'));
    expect(videos).toHaveLength(3);
    const activeVideo = videos.find((video) => video.getAttribute('src') === 'https://example.com/two.mp4');
    const adjacentVideos = videos.filter((video) => video !== activeVideo);

    expect(activeVideo).toHaveAttribute('preload', 'metadata');
    expect(activeVideo).toHaveAttribute('controls');
    adjacentVideos.forEach((video) => {
      expect(video).toHaveAttribute('preload', 'none');
      expect(video).not.toHaveAttribute('controls');
    });
  });

  it('closes preview after the close button animation finishes', async () => {
    const onClose = vi.fn();
    const items: TimelineMediaItem[] = [
      { id: 'photo-1', type: 'photo', url: 'https://example.com/one.jpg' },
    ];

    render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 0,
          title: 'Khoảnh khắc',
          layoutId: 'moment-test-photo-1',
          originSrc: items[0].url ?? '',
        }}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đóng preview' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('closes preview when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    const items: TimelineMediaItem[] = [
      { id: 'photo-1', type: 'photo', url: 'https://example.com/one.jpg' },
    ];

    render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 0,
          title: 'Khoảnh khắc',
          layoutId: 'moment-test-photo-1',
          originSrc: items[0].url ?? '',
        }}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đóng xem media' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('unmounts cleanly and restores document.body overflow when preview becomes null', async () => {
    const onClose = vi.fn();
    const items: TimelineMediaItem[] = [
      { id: 'photo-1', type: 'photo', url: 'https://example.com/one.jpg' },
    ];

    const { rerender } = render(
      <MomentMediaPreview
        preview={{
          items,
          initialIndex: 0,
          title: 'Khoảnh khắc',
          layoutId: 'moment-test-photo-1',
          originSrc: items[0].url ?? '',
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Xem media Khoảnh khắc' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<MomentMediaPreview preview={null} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Xem media Khoảnh khắc' })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.body.style.overflow).toBe('');
    });
  });
});
