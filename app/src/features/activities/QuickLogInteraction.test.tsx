import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityLogModal } from './ActivityLogModal';
import { AddPumpingModal } from './AddPumpingModal';
import { QuickLogModal } from './QuickLogModal';
import { createDefaultMedicationCatalog } from '@/features/activities/domain/medicationCatalog';
import { useActivityStore } from '@/features/activities/store/useActivityStore';
import { useUIStore } from '@/store/useUIStore';

describe('Quick Log interaction polish', () => {
  beforeEach(() => {
    useUIStore.setState({ profileMode: 'baby' });
    useActivityStore.setState({
      babyActivities: [],
      momActivities: [],
      medicationCatalog: createDefaultMedicationCatalog(),
    });
  });

  it('focuses the first Quick Log action instead of the close button', async () => {
    render(<QuickLogModal isOpen onClose={vi.fn()} onSelectAction={vi.fn()} />);

    const firstAction = screen.getByRole('button', { name: 'Cữ bú' });
    await waitFor(() => expect(firstAction).toHaveFocus());

    const close = screen.getByRole('button', { name: 'Đóng' });
    expect(close).toHaveStyle({ minWidth: '44px', minHeight: '44px' });
  });

  it('focuses the pumping amount, uses the numeric keypad, and keeps sheet controls touch-sized', async () => {
    render(<AddPumpingModal isOpen onClose={vi.fn()} onSuccessToast={vi.fn()} />);

    const amount = screen.getByLabelText('Lượng sữa hút được (ml)');
    await waitFor(() => expect(amount).toHaveFocus());
    expect(amount).toHaveAttribute('inputmode', 'numeric');
    expect(amount).toHaveAttribute('enterkeyhint', 'done');

    const close = screen.getByRole('button', { name: 'Đóng' });
    expect(close).toHaveStyle({ minWidth: '44px', minHeight: '44px' });
  });

  it('focuses the main feeding input and preserves its mobile numeric keypad', async () => {
    render(
      <ActivityLogModal
        isOpen
        mode="feeding"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const amount = screen.getByLabelText('Lượng sữa (ml)');
    await waitFor(() => expect(amount).toHaveFocus());
    expect(amount).toHaveAttribute('inputmode', 'numeric');

    const close = screen.getByRole('button', { name: 'Đóng' });
    expect(close).toHaveStyle({ minWidth: '44px', minHeight: '44px' });
  });

  it('upgrades legacy Quick Log number fields to the numeric mobile keypad', async () => {
    render(
      <ActivityLogModal
        isOpen
        mode="mom-sleep"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const duration = screen.getByRole('spinbutton', { name: 'Thời lượng (phút)' });
    await waitFor(() => expect(duration).toHaveFocus());
    expect(duration).toHaveAttribute('inputmode', 'numeric');
  });
});
