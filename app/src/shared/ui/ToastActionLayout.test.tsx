import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ToastMessage } from '@/shared/hooks/useToast';
import { ToastContainer } from '@/shared/ui/Toast';

describe('Toast action layout', () => {
  it('reserves a third grid column for the undo action', () => {
    const toasts: ToastMessage[] = [{
      id: 'saved-1',
      message: 'Đã lưu ghi nhận.',
      icon: '✓',
      action: {
        label: 'Hoàn tác',
        onAction: vi.fn(),
      },
    }];

    render(<ToastContainer toasts={toasts} />);

    expect(screen.getByRole('status')).toHaveStyle({
      gridTemplateColumns: '30px minmax(0, 1fr) auto',
    });
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
  });
});
