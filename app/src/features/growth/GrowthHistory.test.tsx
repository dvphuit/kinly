import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GrowthHistory } from './GrowthHistory';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import type { GrowthHistoryRecord } from '@/features/growth/domain/types';

describe('GrowthHistory', () => {
  beforeEach(() => {
    useGrowthStore.getState().resetToDefaults();
  });

  it('renders empty state when there are no user measurements', () => {
    const onOpenAddMeasurement = vi.fn();
    render(<GrowthHistory onOpenAddMeasurement={onOpenAddMeasurement} />);

    expect(screen.getByText('Chưa có dữ liệu đo lường')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Ghi lần cân đo đầu tiên' });
    fireEvent.click(btn);
    expect(onOpenAddMeasurement).toHaveBeenCalledTimes(1);
  });

  it('opens a preview sheet, edits the measurement, and deletes after confirmation', async () => {
    const user = userEvent.setup();
    const testRecord: GrowthHistoryRecord = {
      id: 'gh-test-del-1',
      date: '2026-08-15',
      ageText: '8 tháng 25 ngày',
      labelIndex: 4,
      weight: 8.8,
      height: 72.0,
      headCirc: 44.5,
      percentileLabel: '',
      status: 'optimal',
      note: 'Khám định kỳ',
    };

    const state = useGrowthStore.getState();
    const stage = state.stages[state.currentStage];
    stage.growthHistory = [testRecord];
    stage.growthChart.weight.child[4] = testRecord.weight;
    stage.growthChart.height.child[4] = testRecord.height;
    stage.growthChart.headCirc.child[4] = testRecord.headCirc;

    const onSuccessToast = vi.fn();
    render(
      <GrowthHistory
        onOpenAddMeasurement={vi.fn()}
        onSuccessToast={onSuccessToast}
      />,
    );

    expect(screen.getByText('8 tháng 25 ngày')).toBeInTheDocument();
    expect(screen.getByText('8.8 kg')).toBeInTheDocument();
    expect(screen.getByText('72 cm')).toBeInTheDocument();
    expect(screen.getByText('Khám định kỳ')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xem số đo 8 tháng 25 ngày' }));
    const preview = screen.getByRole('dialog', { name: 'Chi tiết cân đo' });
    expect(within(preview).getByText(/Thứ Bảy, 15 tháng 8, 2026/i)).toBeInTheDocument();
    expect(within(preview).getAllByText('8.8 kg').length).toBeGreaterThanOrEqual(1);
    expect(within(preview).getByText('Khám định kỳ')).toBeInTheDocument();

    const editButton = within(preview).getByRole('button', { name: 'Chỉnh sửa' });
    expect(editButton).toHaveClass('sheet-action', 'sheet-action-primary');
    const deleteButton = within(preview).getByRole('button', { name: 'Xóa' });
    expect(deleteButton).toHaveClass('sheet-action', 'sheet-action-danger');
    await user.click(editButton);
    expect(onSuccessToast).not.toHaveBeenCalled();
    const editor = screen.getByRole('dialog', { name: 'Chỉnh sửa số đo' });
    const weightInput = within(editor).getByRole('spinbutton', { name: 'Cân nặng (kg)' });
    fireEvent.change(weightInput, { target: { value: '9.1' } });
    await user.click(within(editor).getByRole('button', { name: /Cột mốc tháng: Mốc 8m/i }));
    await user.click(screen.getByRole('option', { name: 'Mốc 10m' }));
    const saveButton = within(editor).getByRole('button', { name: 'Lưu thay đổi' });
    expect(saveButton).toHaveClass('sheet-action', 'sheet-action-primary');
    expect(within(editor).getByRole('button', { name: 'Hủy' })).toHaveClass('sheet-action', 'sheet-action-secondary');
    await user.click(saveButton);

    const updatedPreview = screen.getByRole('dialog', { name: 'Chi tiết cân đo' });
    expect(within(updatedPreview).getByText('9.1 kg')).toBeInTheDocument();
    const updatedStage = useGrowthStore.getState().currentStageData();
    expect(updatedStage.growthHistory[0]).toMatchObject({ weight: 9.1, labelIndex: 5 });
    expect(updatedStage.growthChart.weight.child[4]).toBeNull();
    expect(updatedStage.growthChart.weight.child[5]).toBe(9.1);
    expect(onSuccessToast).toHaveBeenCalledWith(expect.stringContaining('Đã cập nhật số đo'));

    const previewDeleteButton = within(updatedPreview).getByRole('button', { name: 'Xóa' });
    expect(previewDeleteButton).toHaveClass('sheet-action', 'sheet-action-danger');
    fireEvent.click(previewDeleteButton);
    expect(within(updatedPreview).getByRole('button', { name: 'Xóa bản ghi' })).toHaveClass(
      'sheet-action', 'sheet-action-danger', 'is-confirming',
    );
    expect(within(updatedPreview).getByRole('button', { name: 'Giữ lại' })).toHaveClass(
      'sheet-action', 'sheet-action-secondary',
    );
    fireEvent.click(within(updatedPreview).getByRole('button', { name: 'Xóa bản ghi' }));

    expect(screen.queryByText('8 tháng 25 ngày')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Chi tiết cân đo' })).not.toBeInTheDocument();
    expect(onSuccessToast).toHaveBeenCalledWith('Đã xóa bản ghi cân đo');
  });
});
