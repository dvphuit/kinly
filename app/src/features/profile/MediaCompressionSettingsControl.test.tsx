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

    fireEvent.click(within(photoGroup).getByRole('radio', { name: 'Tiết kiệm' }));
    fireEvent.click(within(videoGroup).getByRole('radio', { name: 'Chất lượng' }));

    expect(getMediaCompressionSettings()).toEqual({ photo: 'compact', video: 'quality' });
    expect(screen.getByText('Ảnh Tiết kiệm · Video Chất lượng')).toBeInTheDocument();
    expect(within(photoGroup).getByRole('radio', { name: 'Tiết kiệm' })).toHaveAttribute('aria-checked', 'true');
    expect(within(videoGroup).getByRole('radio', { name: 'Chất lượng' })).toHaveAttribute('aria-checked', 'true');
  });

  it('explains that local originals are preserved', () => {
    render(<MediaCompressionSettingsControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Cấu hình nén media' }));

    expect(screen.getByText(/Bản trên thiết bị luôn được giữ nguyên/)).toBeInTheDocument();
    expect(screen.getByText(/giảm được ít nhất 10%/)).toBeInTheDocument();
  });
});
