import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityLogModal } from './ActivityLogModal';
import { AddPumpingModal } from './AddPumpingModal';
import { QuickLogModal } from './QuickLogModal';
import { createDefaultMedicationCatalog } from '@/features/activities/domain/medicationCatalog';
import { useActivityStore } from '@/features/activities/store/useActivityStore';
import { useUIStore } from '@/store/useUIStore';

describe('Quick Log UI regressions', () => {
  beforeEach(() => {
    useUIStore.setState({ profileMode: 'baby' });
    useActivityStore.setState({
      babyActivities: [],
      momActivities: [],
      medicationCatalog: createDefaultMedicationCatalog(),
    });
  });

  it('keeps the Quick Log close control and actions free of inline size mutation', () => {
    render(<QuickLogModal isOpen onClose={vi.fn()} onSelectAction={vi.fn()} />);

    const close = screen.getByRole('button', { name: 'Đóng' });
    const firstAction = screen.getByRole('button', { name: 'Cữ bú' });
    expect(close.style.minWidth).toBe('');
    expect(close.style.minHeight).toBe('');
    expect(firstAction.style.minHeight).toBe('');
  });

  it('keeps pumping keypad hints without stretching sheet controls', () => {
    render(<AddPumpingModal isOpen onClose={vi.fn()} onSuccessToast={vi.fn()} />);

    const amount = screen.getByLabelText('Lượng sữa hút được (ml)');
    const close = screen.getByRole('button', { name: 'Đóng' });
    const side = screen.getByRole('button', { name: '2 bên' });

    expect(amount).toHaveAttribute('inputmode', 'numeric');
    expect(amount).toHaveAttribute('enterkeyhint', 'done');
    expect(amount.style.minHeight).toBe('');
    expect(close.style.minWidth).toBe('');
    expect(close.style.minHeight).toBe('');
    expect(side.style.minHeight).toBe('');
  });

  it('does not stretch compact activity editor controls with inline touch sizing', () => {
    render(
      <ActivityLogModal
        isOpen
        mode="feeding"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const amount = screen.getByLabelText('Lượng sữa (ml)');
    const milkSource = screen.getByRole('radio', { name: /Sữa mẹ/i });
    const close = screen.getByRole('button', { name: 'Đóng' });

    expect(amount.style.minHeight).toBe('');
    expect(milkSource.style.minHeight).toBe('');
    expect(close.style.minWidth).toBe('');
    expect(close.style.minHeight).toBe('');
  });
});
