import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/store/useUIStore';
import { QuickLogModal } from './QuickLogModal';

describe('QuickLogModal', () => {
  beforeEach(() => {
    useUIStore.setState({ profileMode: 'baby' });
  });

  it('uses themed action colors and routes the selected action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSelectAction = vi.fn();

    render(
      <QuickLogModal
        isOpen
        onClose={onClose}
        onSelectAction={onSelectAction}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Ghi nhanh cho Bé' }))
      .toHaveClass('bottom-sheet', 'quick-log-bottom-sheet');

    const growthAction = screen.getByRole('button', { name: 'Cân đo' });
    expect(growthAction).toHaveClass('tone-meadow');
    expect(growthAction.querySelector('.haven-icon-scale path')).toHaveAttribute('stroke', 'currentColor');

    await user.click(growthAction);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectAction).toHaveBeenCalledWith('growth');
  });
});
