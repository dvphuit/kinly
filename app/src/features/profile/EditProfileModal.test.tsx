import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditProfileModal } from './EditProfileModal';
import { resetChildStoresToDefaults } from './profileLifecycle';
import { useProfileStore } from './store/useProfileStore';

describe('EditProfileModal', () => {
  beforeEach(() => {
    resetChildStoresToDefaults();
    useProfileStore.getState().updateFamilyData({
      isInitialized: true,
      childName: 'Bơ',
      childFullName: 'Nguyễn Minh An',
      birthDate: '2026-01-15',
      birthTime: '08:30',
      gender: 'girl',
      bloodType: 'O+',
      childAvatar: '/assets/avatars/baby_avatar.jpg',
      birthWeight: '3.2 kg',
      birthHeight: '50 cm',
      hospital: 'Bệnh viện Hạnh Phúc',
      insuranceCode: 'DN4012984920',
      notes: 'Bé thích nghe nhạc.',
    });
  });

  it('uses the shared themed tracker-sheet composition', () => {
    render(<EditProfileModal isOpen onClose={() => {}} />);

    const dialog = screen.getByRole('dialog', { name: 'Chỉnh sửa hồ sơ bé' });
    expect(dialog).toHaveClass('kinly-themed-sheet', 'edit-profile-bottom-sheet');
    expect(screen.getByText('HỒ SƠ CỦA BÉ')).toBeInTheDocument();
    expect(screen.getByText('Ảnh đại diện')).toBeInTheDocument();
    expect(screen.getByText('Thông tin cơ bản')).toBeInTheDocument();
    expect(screen.getByText('Ngày sinh')).toBeInTheDocument();
    expect(screen.getByText('Thông tin lúc sinh')).toBeInTheDocument();
    expect(screen.getByText('Y tế & ghi chú')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(saveButton).toHaveClass('sheet-primary-action');
    expect(saveButton.parentElement).toHaveClass('sheet-footer');
  });

  it('keeps profile saving behavior while using the shared footer action', () => {
    const onClose = vi.fn();
    const onSuccessToast = vi.fn();
    render(
      <EditProfileModal
        isOpen
        onClose={onClose}
        onSuccessToast={onSuccessToast}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Bơ'), { target: { value: 'Bơ Nhỏ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(useProfileStore.getState().familyData.childName).toBe('Bơ Nhỏ');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccessToast).toHaveBeenCalledWith('Đã cập nhật thông tin cho Bơ Nhỏ thành công!');
  });

  it('does not invent optional birth or medical data when the stored profile is empty', () => {
    useProfileStore.getState().updateFamilyData({
      birthTime: '',
      birthWeight: '',
      birthHeight: '',
      hospital: '',
      insuranceCode: '',
    });

    render(<EditProfileModal isOpen onClose={() => {}} />);

    expect(screen.getByPlaceholderText('VD: 3.3 kg')).toHaveValue('');
    expect(screen.getByPlaceholderText('VD: 50.0 cm')).toHaveValue('');
    expect(screen.getByPlaceholderText('VD: BV Phụ sản...')).toHaveValue('');
    expect(screen.getByPlaceholderText('VD: DN4012984920')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(useProfileStore.getState().familyData).toMatchObject({
      birthTime: '',
      birthWeight: '',
      birthHeight: '',
      hospital: '',
      insuranceCode: '',
    });
  });
});
