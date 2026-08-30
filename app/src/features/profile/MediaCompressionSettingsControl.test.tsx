import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getMediaCompressionSettings } from '@/features/sync/mediaCompressionSettings';
import { MediaCompressionSettingsControl } from './MediaCompressionSettingsControl';

describe('MediaCompressionSettingsControl', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts balanced and persists photo and video choices independently', () => {
    render(<MediaCompressionSettingsControl />);

    expect(screen.getByText('Cân bằng')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cấu hình nén media' }));

    const dialog = screen.getByRole('dialog', { name: 'Nén ảnh & video' });
    const photoGroup = within(dialog).getByRole('radiogroup', { name: 'Mức nén ảnh' });
    const videoGroup = within(dialog).getByRole('radiogroup', { name: 'Mức nén video' });

    expect(within(photoGroup).getByRole('radio', { name: 'Cân bằng' })).toHaveAttribute('aria-checked', 'true');
    expect(within(videoGroup).getByRole('radio', { name: 'Cân bằng' })).toHaveAttribute('aria-checked', 'true');
    expect(within(photoGroup).getAllByRole('radio')).toHaveLength(5);
    expect(within(videoGroup).getAllByRole('radio')).toHaveLength(5);

    fireEvent.click(within(photoGroup).getByRole('radio', { name: 'Bản gốc' }));
    fireEvent.click(within(videoGroup).getByRole('radio', { name: 'Nhẹ nhất' }));

    expect(getMediaCompressionSettings()).toMatchObject({ photo: 'original', video: 'saver' });
    expect(screen.getByText('Ảnh Bản gốc · Video Nhẹ nhất')).toBeInTheDocument();
    expect(within(photoGroup).getByRole('radio', { name: 'Bản gốc' })).toHaveAttribute('aria-checked', 'true');
    expect(within(videoGroup).getByRole('radio', { name: 'Nhẹ nhất' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Không nén · upload đúng file gốc/)).toBeInTheDocument();
    expect(screen.getByText(/480p\/24/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Dung lượng ảnh tối đa (MB)' }), {
      target: { value: '12' },
    });
    fireEvent.blur(within(dialog).getByRole('spinbutton', { name: 'Dung lượng ảnh tối đa (MB)' }));
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Dung lượng video tối đa (MB)' }), {
      target: { value: '225' },
    });
    fireEvent.blur(within(dialog).getByRole('spinbutton', { name: 'Dung lượng video tối đa (MB)' }));

    expect(getMediaCompressionSettings().maxInputSizeMb).toEqual({ photo: 12, video: 225 });
  });

  it('explains that local originals are preserved', () => {
    render(<MediaCompressionSettingsControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Cấu hình nén media' }));

    expect(screen.getByText(/Bản trên thiết bị luôn được giữ nguyên/)).toBeInTheDocument();
    expect(screen.getByText(/giảm được ít nhất 10%/)).toBeInTheDocument();
  });
});
