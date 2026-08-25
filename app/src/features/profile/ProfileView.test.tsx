import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfileView } from './ProfileView';
import { resetChildStoresToDefaults, useProfileStore } from '@/features/profile';

vi.mock('./GoogleSyncCard', () => ({
  GoogleSyncCard: () => <div>Sao lưu dữ liệu</div>,
}));

vi.mock('./ResetTrackingDataSection', () => ({
  ResetTrackingDataSection: () => <div>Quản lý dữ liệu</div>,
}));

function renderProfile(overrides?: { onEdit?: () => void; onNotifications?: () => void }) {
  const onEdit = overrides?.onEdit ?? vi.fn();
  const onNotifications = overrides?.onNotifications ?? vi.fn();

  render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route
          path="/profile"
          element={(
            <ProfileView
              onOpenEditProfile={onEdit}
              onOpenNotifications={onNotifications}
            />
          )}
        />
        <Route path="/" element={<div>Trang chủ</div>} />
        <Route path="/growth" element={<div>Trang tăng trưởng</div>} />
      </Routes>
    </MemoryRouter>,
  );

  return { onEdit, onNotifications };
}

describe('ProfileView', () => {
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
      hospital: 'Bệnh viện Hạnh Phúc',
      birthWeight: '3.2 kg',
      birthHeight: '50 cm',
      headCircAtBirth: '34 cm',
      allergies: [],
      notes: 'Bé thích nghe nhạc trước khi ngủ.',
    });
  });

  it('keeps identity, birth details, and notes in one compact profile summary', () => {
    renderProfile();

    expect(screen.getByRole('heading', { level: 1, name: 'Thông tin của Bơ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Bơ' })).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Minh An')).toBeInTheDocument();
    expect(screen.getByText(/Bé gái/)).toBeInTheDocument();
    expect(screen.getByText('15/01/2026 · 08:30')).toBeInTheDocument();
    expect(screen.getByText('3.2 kg · 50 cm · 34 cm')).toBeInTheDocument();
    expect(screen.getByText('Chưa ghi nhận dị ứng')).toBeInTheDocument();
    expect(screen.getByText('Bé thích nghe nhạc trước khi ngủ.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hồ sơ cơ bản' })).not.toBeInTheDocument();
  });

  it('opens edit and reminder actions', () => {
    const { onEdit, onNotifications } = renderProfile();

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    fireEvent.click(screen.getByRole('button', { name: /Lịch nhắc chăm sóc bé/i }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onNotifications).toHaveBeenCalledTimes(1);
  });

  it('links the compact growth summary to the full growth page', () => {
    renderProfile();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết tăng trưởng' }));

    expect(screen.getByText('Trang tăng trưởng')).toBeInTheDocument();
  });
});
