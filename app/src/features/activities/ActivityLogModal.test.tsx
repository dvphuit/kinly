import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityLogModal } from './ActivityLogModal';
import { useActivityStore } from '@/features/activities/store/useActivityStore';
import { createDefaultMedicationCatalog } from '@/features/activities/domain/medicationCatalog';

describe('ActivityLogModal', () => {
  beforeEach(() => {
    useActivityStore.setState({
      babyActivities: [],
      momActivities: [],
      medicationCatalog: createDefaultMedicationCatalog(),
    });
  });

  it('renders feeding mode with milk amount input and feeding source chips with sub-modes', () => {
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    render(
      <ActivityLogModal
        isOpen
        mode="feeding"
        onClose={handleClose}
        onSaved={handleSaved}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Cữ bú' })).toHaveClass(
      'journal-entry-sheet', 'tone-apricot',
    );
    expect(screen.getByLabelText('Lượng sữa (ml)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Thời lượng bú/i)).not.toBeInTheDocument();

    // Check feeding source chips
    expect(screen.getByRole('radio', { name: /Sữa mẹ/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Công thức/i })).toBeInTheDocument();

    // Default Sữa mẹ is selected, sub-modes should be visible
    expect(screen.getByRole('radio', { name: /Sữa mẹ/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Bú trực tiếp' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Qua bình' })).toBeInTheDocument();

    // Select Bú bình for breast milk
    fireEvent.click(screen.getByRole('radio', { name: 'Qua bình' }));
    expect(screen.getByRole('radio', { name: 'Qua bình' })).toHaveAttribute('aria-checked', 'true');

    // Select 150ml preset
    fireEvent.click(screen.getByRole('button', { name: '150 ml' }));

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(handleSaved).toHaveBeenCalledWith('Đã lưu cữ bú.');
    expect(handleClose).toHaveBeenCalled();

    const activities = useActivityStore.getState().babyActivities;
    expect(activities).toHaveLength(1);
    const feeding = activities[0];
    expect(feeding).toMatchObject({
      type: 'feeding',
      amountMl: 150,
      method: 'breast_bottle',
    });
    if (feeding.type === 'feeding') {
      expect(feeding.durationMinutes).toBeUndefined();
    }
  });

  it('allows selecting Sữa công thức for feeding', () => {
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    render(
      <ActivityLogModal
        isOpen
        mode="feeding"
        onClose={handleClose}
        onSaved={handleSaved}
      />
    );

    // Select Công thức
    fireEvent.click(screen.getByRole('radio', { name: /Công thức/i }));
    expect(screen.getByRole('radio', { name: /Công thức/i })).toHaveAttribute('aria-checked', 'true');

    // Sub-modes should not be visible for formula
    expect(screen.queryByRole('radio', { name: 'Bú trực tiếp' })).not.toBeInTheDocument();

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(handleSaved).toHaveBeenCalledWith('Đã lưu cữ bú.');
    const activities = useActivityStore.getState().babyActivities;
    expect(activities[0]).toMatchObject({
      type: 'feeding',
      method: 'formula',
    });
  });

  it('renders diaper mode with chip selection and saves chosen diaper kind', () => {
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    render(
      <ActivityLogModal
        isOpen
        mode="diaper"
        onClose={handleClose}
        onSaved={handleSaved}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Thay tã' })).toHaveClass('journal-entry-sheet', 'tone-sage');
    expect(screen.getByRole('radio', { name: /Tã ướt/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Tã bẩn/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Cả hai/i })).toBeInTheDocument();

    // Default is 'wet'
    expect(screen.getByRole('radio', { name: /Tã ướt/i })).toHaveAttribute('aria-checked', 'true');

    // Click 'Tã bẩn'
    fireEvent.click(screen.getByRole('radio', { name: /Tã bẩn/i }));
    expect(screen.getByRole('radio', { name: /Tã bẩn/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Tã ướt/i })).toHaveAttribute('aria-checked', 'false');

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(handleSaved).toHaveBeenCalledWith('Đã lưu lần thay tã.');
    expect(handleClose).toHaveBeenCalled();

    const activities = useActivityStore.getState().babyActivities;
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: 'diaper',
      diaperKind: 'dirty',
    });
  });

  it('offers medication presets and remembers the last dose for later use', () => {
    const first = render(
      <ActivityLogModal isOpen mode="medicine" onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    expect(screen.getByRole('radio', { name: 'D3' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'D3K2' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'BioGaia' })).toBeInTheDocument();

    const linkedPresets = [
      ['D3', 'https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-d/'],
      ['D3K2', 'https://ods.od.nih.gov/factsheets/VitaminK-Consumer/'],
      ['BioGaia', 'https://www.biogaia.com/products/protectis-baby-drops'],
    ] as const;
    linkedPresets.forEach(([name, href]) => {
      fireEvent.click(screen.getByRole('radio', { name }));
      expect(screen.getByRole('link', { name: /Xem thêm/i })).toHaveAttribute('href', href);
      expect(screen.getByRole('link', { name: /Xem thêm/i })).toHaveAttribute('target', '_blank');
      expect(screen.getByRole('link', { name: /Xem thêm/i })).toHaveAttribute('rel', 'noopener noreferrer');
    });

    fireEvent.click(screen.getByRole('radio', { name: 'D3K2' }));
    expect(screen.getByText('Vitamin D3 + K2')).toBeInTheDocument();
    const dosePicker = screen.getByRole('group', { name: 'Liều đã dùng' });
    expect(within(dosePicker).queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(within(dosePicker).getByRole('button', { name: 'Tăng lượng' }));
    expect(dosePicker).toHaveTextContent('1 giọt');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(useActivityStore.getState().babyActivities[0]).toMatchObject({
      type: 'medicine', name: 'D3K2', dose: '1 giọt',
    });
    first.unmount();

    render(<ActivityLogModal isOpen mode="medicine" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'D3K2' }));
    expect(screen.getByRole('group', { name: 'Liều đã dùng' })).toHaveTextContent('1 giọt');
  });

  it('uses medication-specific units for one-tap dose entry', () => {
    render(<ActivityLogModal isOpen mode="medicine" onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Paracetamol' }));
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Tăng lượng' }));
    }
    expect(screen.getByRole('group', { name: 'Liều đã dùng' })).toHaveTextContent('2,5 ml');
    fireEvent.click(screen.getByRole('button', { name: 'Giảm lượng' }));
    expect(screen.getByRole('group', { name: 'Liều đã dùng' })).toHaveTextContent('2 ml');
    fireEvent.click(screen.getByRole('button', { name: 'Tăng lượng' }));

    fireEvent.click(screen.getByRole('radio', { name: 'Oresol' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng lượng' }));
    expect(screen.getByRole('group', { name: 'Liều đã dùng' })).toHaveTextContent('1 gói');
  });

  it('adds a custom medication to the reusable picker', () => {
    const first = render(
      <ActivityLogModal isOpen mode="medicine" onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Thêm loại/i }));
    fireEvent.change(screen.getByLabelText('Tên loại mới'), { target: { value: 'Men vi sinh riêng' } });
    fireEvent.change(screen.getByLabelText(/Link tham khảo/i), {
      target: { value: 'example.com/men-vi-sinh' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào danh sách' }));
    expect(screen.getByRole('radio', { name: 'Men vi sinh riêng' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Đã thêm')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem thêm/i })).toHaveAttribute(
      'href', 'https://example.com/men-vi-sinh',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Giọt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng lượng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));
    first.unmount();

    render(<ActivityLogModal isOpen mode="medicine" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Men vi sinh riêng' }));
    expect(screen.getByRole('group', { name: 'Liều đã dùng' })).toHaveTextContent('2 giọt');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa Men vi sinh riêng khỏi danh sách' }));
    expect(screen.queryByRole('radio', { name: 'Men vi sinh riêng' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Liều đã dùng' })).toHaveTextContent('Chưa chọn');
  });

  it.each([
    ['baby-sleep', 'Giấc ngủ của bé', 'tone-lavender'],
    ['baby-note', 'Ghi chú sức khỏe', 'tone-neutral'],
    ['mom-sleep', 'Giấc ngủ của mẹ', 'tone-lavender'],
    ['mom-mood', 'Tâm trạng của mẹ', 'tone-rose'],
    ['temperature', 'Nhiệt độ', 'tone-coral'],
  ] as const)('uses the shared activity editor dialog for %s', (mode, title, tone) => {
    render(<ActivityLogModal isOpen mode={mode} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: title })).toHaveClass('journal-entry-sheet', tone);
    expect(screen.getByRole('button', { name: 'Lưu ghi nhận' })).toHaveAttribute('form', 'timeline-edit-form');
  });

  it('validates and creates a health note through the shared editor', () => {
    const onSaved = vi.fn();
    render(<ActivityLogModal isOpen mode="baby-note" onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));
    expect(screen.getByText('Nhập nội dung ghi chú.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: 'Bé hơi nghẹt mũi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(useActivityStore.getState().babyActivities[0]).toMatchObject({
      type: 'health_note', note: 'Bé hơi nghẹt mũi',
    });
    expect(onSaved).toHaveBeenCalledWith('Đã lưu ghi chú.');
  });

  it('creates mom activities through the same editor flow', () => {
    render(<ActivityLogModal isOpen mode="mom-mood" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(useActivityStore.getState().momActivities[0]).toMatchObject({
      owner: 'mom', type: 'mood', mood: 'good',
    });
  });
});
