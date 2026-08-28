import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ResetTrackingDataSection } from './ResetTrackingDataSection';
import { resetTrackingData } from '@/app/lifecycle/trackingDataReset';

vi.mock('@/app/lifecycle/trackingDataReset', () => ({
  resetTrackingData: vi.fn(),
}));

const mockedResetTrackingData = vi.mocked(resetTrackingData);

function LocationMarker() {
  return <span>Vị trí hiện tại: {useLocation().pathname}</span>;
}

function renderSection() {
  const onShowToast = vi.fn();
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <LocationMarker />
      <Routes>
        <Route path="/profile" element={<ResetTrackingDataSection onShowToast={onShowToast} />} />
        <Route path="/" element={<span>Trang chủ</span>} />
      </Routes>
    </MemoryRouter>,
  );
  return onShowToast;
}

async function openConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Đặt lại dữ liệu theo dõi' }));
}

describe('ResetTrackingDataSection', () => {
  beforeEach(() => {
    mockedResetTrackingData.mockReset();
  });

  it('explains which tracking data is deleted, what is preserved, and that the Drive backup is replaced', async () => {
    const user = userEvent.setup();
    renderSection();

    await openConfirmation(user);

    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveClass('sheet-action', 'sheet-action-secondary');
    expect(screen.getByRole('button', { name: 'Xác nhận đặt lại' })).toHaveClass(
      'sheet-action', 'sheet-action-primary',
    );
    expect(screen.getByText(/cữ bú, giấc ngủ, tã, số đo, hoạt động, nhật ký, chi phí và nhắc nhở/i)).toBeInTheDocument();
    expect(screen.getByText(/Hồ sơ của Bé và Mẹ cùng thông tin lúc sinh vẫn được giữ lại/i)).toBeInTheDocument();
    expect(screen.getByText(/bản sao lưu hiện có trên Google Drive sẽ được thay thế/i)).toBeInTheDocument();
  });

  it('closes the confirmation without resetting when cancelled', async () => {
    const user = userEvent.setup();
    renderSection();

    await openConfirmation(user);
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Xác nhận đặt lại' })).not.toBeInTheDocument();
    });
    expect(mockedResetTrackingData).not.toHaveBeenCalled();
  });

  it('resets once and disables both confirmation actions while pending', async () => {
    const user = userEvent.setup();
    let resolveReset: (value: { status: 'synced' }) => void;
    mockedResetTrackingData.mockReturnValueOnce(new Promise((resolve) => {
      resolveReset = resolve;
    }));
    renderSection();

    await openConfirmation(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));

    expect(mockedResetTrackingData).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đang đặt lại dữ liệu…' })).toBeDisabled();

    resolveReset!({ status: 'synced' });
    await waitFor(() => {
      expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    });
  });

  it('returns Home and shows a success toast after a synced reset', async () => {
    const user = userEvent.setup();
    mockedResetTrackingData.mockResolvedValueOnce({ status: 'synced' });
    const onShowToast = renderSection();

    await openConfirmation(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));

    await waitFor(() => {
      expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    });
    expect(onShowToast).toHaveBeenCalledWith('Đã đặt lại dữ liệu và đồng bộ Google Drive.', '✓');
  });

  it('returns Home and shows the Drive error after a local-only reset', async () => {
    const user = userEvent.setup();
    mockedResetTrackingData.mockResolvedValueOnce({ status: 'local-only', error: 'Drive đang ngoại tuyến' });
    const onShowToast = renderSection();

    await openConfirmation(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));

    await waitFor(() => {
      expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    });
    expect(onShowToast).toHaveBeenCalledWith('Đã đặt lại dữ liệu cục bộ. Cần đồng bộ lại Google Drive: Drive đang ngoại tuyến', '⚠️');
  });

  it('keeps the confirmation open and announces a rejected reset error', async () => {
    const user = userEvent.setup();
    mockedResetTrackingData.mockRejectedValueOnce(new Error('Không thể xóa dữ liệu trên thiết bị'));
    renderSection();

    await openConfirmation(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xóa dữ liệu trên thiết bị');
    expect(screen.getByRole('button', { name: 'Xác nhận đặt lại' })).toBeInTheDocument();
  });

  it('cannot be dismissed with Escape while pending and remains usable after rejection', async () => {
    const user = userEvent.setup();
    let rejectReset: (error: Error) => void;
    mockedResetTrackingData.mockReturnValueOnce(new Promise((_, reject) => {
      rejectReset = reject;
    }));
    renderSection();

    await openConfirmation(user);
    await user.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    rejectReset!(new Error('Không thể xóa dữ liệu trên thiết bị'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xóa dữ liệu trên thiết bị');
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(screen.getByRole('dialog', { name: 'Xác nhận đặt lại dữ liệu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận đặt lại' })).toBeEnabled();
  });
});
