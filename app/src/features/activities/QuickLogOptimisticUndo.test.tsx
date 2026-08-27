import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityLogModal } from './ActivityLogModal';
import { AddPumpingModal } from './AddPumpingModal';
import { createDefaultMedicationCatalog } from '@/features/activities/domain/medicationCatalog';
import { useActivityStore } from '@/features/activities/store/useActivityStore';
import { useToast, type ToastOptions } from '@/shared/hooks/useToast';
import { ToastContainer } from '@/shared/ui/Toast';

function UndoToastHarness({ onUndo }: { onUndo: () => void }) {
  const { toasts, addToast } = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() => addToast('Đã lưu ghi nhận.', '✓', {
          actionLabel: 'Hoàn tác',
          onAction: onUndo,
        })}
      >
        Show saved toast
      </button>
      <ToastContainer toasts={toasts} />
    </>
  );
}

describe('Quick Log optimistic save and undo', () => {
  beforeEach(() => {
    useActivityStore.setState({
      babyActivities: [],
      momActivities: [],
      medicationCatalog: createDefaultMedicationCatalog(),
    });
  });

  it('creates an activity synchronously, closes the editor, and exposes an undo for that exact record', () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <ActivityLogModal
        isOpen
        mode="feeding"
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi nhận' }));

    expect(useActivityStore.getState().babyActivities).toHaveLength(1);
    expect(useActivityStore.getState().babyActivities[0]).toMatchObject({
      type: 'feeding',
      amountMl: 90,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);

    const [message, undo] = onSaved.mock.calls[0] as [string, (() => void) | undefined];
    expect(message).toBe('Đã lưu cữ bú.');
    expect(undo).toEqual(expect.any(Function));

    undo?.();
    expect(useActivityStore.getState().babyActivities).toHaveLength(0);
  });

  it('gives the dedicated pumping flow the same immediate save and undo behavior', () => {
    const onClose = vi.fn();
    const onSuccessToast = vi.fn();

    render(
      <AddPumpingModal
        isOpen
        onClose={onClose}
        onSuccessToast={onSuccessToast}
      />,
    );

    fireEvent.change(screen.getByLabelText('Lượng sữa hút được (ml)'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu Cữ Hút Sữa' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useActivityStore.getState().momActivities).toHaveLength(1);
    expect(useActivityStore.getState().momActivities[0]).toMatchObject({
      type: 'pumping',
      amountMl: 120,
    });

    const [message, icon, options] = onSuccessToast.mock.calls[0] as [string, string, ToastOptions];
    expect(message).toContain('+120ml');
    expect(icon).toBe('✓');
    expect(options.actionLabel).toBe('Hoàn tác');
    expect(options.durationMs).toBe(5000);

    options.onAction?.();
    expect(useActivityStore.getState().momActivities).toHaveLength(0);
  });

  it('renders the undo action as a touch-sized toast control and dismisses it after use', () => {
    const onUndo = vi.fn();
    render(<UndoToastHarness onUndo={onUndo} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show saved toast' }));
    const undoButton = screen.getByRole('button', { name: 'Hoàn tác' });
    expect(undoButton).toHaveStyle({ minWidth: '44px', minHeight: '44px' });

    fireEvent.click(undoButton);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Đã lưu ghi nhận.')).not.toBeInTheDocument();
  });
});
