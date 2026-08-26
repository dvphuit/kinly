import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetChildStoresToDefaults } from '@/features/profile';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { useUIStore } from '@/store/useUIStore';
import { AddPostModal } from './AddPostModal';

describe('AddPostModal', () => {
  beforeEach(() => {
    useTimelineStore.getState().resetTrackingData();
    resetChildStoresToDefaults();
    useUIStore.setState({ profileMode: 'mom' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a video moment for the active profile with the shared activity dialog', async () => {
    const onClose = vi.fn();
    const onSuccessToast = vi.fn();
    render(<AddPostModal isOpen onClose={onClose} onSuccessToast={onSuccessToast} />);

    expect(screen.getByRole('dialog', { name: 'Khoảnh khắc' })).toHaveClass(
      'journal-activity-dialog', 'tone-moment',
    );
    expect(screen.getByRole('button', { name: 'Lưu ghi nhận' })).toHaveAttribute(
      'form', 'timeline-edit-form',
    );

    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Mẹ và một phút bình yên' } });
    fireEvent.change(screen.getByLabelText('Câu chuyện'), { target: { value: 'Một đoạn video ngắn trước giờ ngủ.' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Của mẹ' }));
    fireEvent.change(screen.getByLabelText('URL ảnh hoặc video'), {
      target: { value: 'https://example.com/moment.mp4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm media từ URL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(useTimelineStore.getState().timelineItems[0]).toMatchObject({
      owner: 'mom', tag: 'Của mẹ', tagType: 'mom',
      title: 'Mẹ và một phút bình yên', content: 'Một đoạn video ngắn trước giờ ngủ.',
      mediaUrl: 'https://example.com/moment.mp4', mediaType: 'video',
    });
    await waitFor(() => {
      expect(onSuccessToast).toHaveBeenCalledWith('Đã lưu khoảnh khắc “Mẹ và một phút bình yên”.', '✓');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('stores multiple photos and videos in one moment', () => {
    render(<AddPostModal isOpen onClose={vi.fn()} onSuccessToast={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Một buổi chiều nhiều khoảnh khắc' } });
    fireEvent.change(screen.getByLabelText('URL ảnh hoặc video'), {
      target: { value: 'https://example.com/photo.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm media từ URL' }));
    fireEvent.change(screen.getByLabelText('URL ảnh hoặc video'), {
      target: { value: 'https://example.com/video.mp4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm media từ URL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(useTimelineStore.getState().timelineItems[0]).toMatchObject({
      mediaUrl: 'https://example.com/photo.jpg',
      mediaType: 'photo',
      mediaItems: [
        { url: 'https://example.com/photo.jpg', type: 'photo' },
        { url: 'https://example.com/video.mp4', type: 'video' },
      ],
    });
  });

  it('offers gallery and rear-camera media inputs', () => {
    render(<AddPostModal isOpen onClose={vi.fn()} onSuccessToast={vi.fn()} />);

    expect(screen.getByLabelText('Chọn từ thư viện')).toHaveAttribute('multiple');
    expect(screen.getByLabelText('Chọn từ thư viện')).toHaveAttribute('accept', 'image/*,video/*');
    expect(screen.getByLabelText('Chụp ảnh')).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Chụp ảnh')).toHaveAttribute('accept', 'image/*');
  });

  it('shows a local gallery preview in development StrictMode', async () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:gallery-preview')
      .mockReturnValue('blob:gallery-extra');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    render(
      <StrictMode>
        <AddPostModal isOpen onClose={vi.fn()} onSuccessToast={vi.fn()} />
      </StrictMode>,
    );

    const file = new File(['photo-bytes'], 'gallery-photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Chọn từ thư viện'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Media 1' })).toHaveAttribute(
        'src', 'blob:gallery-preview',
      );
    });
    expect(screen.getByRole('img', { name: 'Media 1' })).toHaveStyle({ objectPosition: '50% 38%' });
    expect(screen.queryByDisplayValue('gallery-photo.jpg')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bỏ media 1' })).toBeInTheDocument();
  });

  it('keeps appending gallery files across multiple selections without a count cap', async () => {
    let previewIndex = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:gallery-${previewIndex += 1}`),
      revokeObjectURL: vi.fn(),
    });
    render(<AddPostModal isOpen onClose={vi.fn()} onSuccessToast={vi.fn()} />);

    const galleryInput = screen.getByLabelText('Chọn từ thư viện');
    fireEvent.change(galleryInput, {
      target: {
        files: [
          new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
          new File(['two'], 'two.mp4', { type: 'video/mp4' }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByText('2 mục · có thể thêm tiếp')).toBeInTheDocument());

    fireEvent.change(galleryInput, {
      target: {
        files: [
          new File(['three'], 'three.jpg', { type: 'image/jpeg' }),
          new File(['four'], 'four.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    await waitFor(() => expect(screen.getByText('4 mục · có thể thêm tiếp')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /Bỏ media/ })).toHaveLength(4);
    ['one.jpg', 'two.mp4', 'three.jpg', 'four.jpg'].forEach((name) => {
      expect(screen.queryByDisplayValue(name)).not.toBeInTheDocument();
    });
  });
});
