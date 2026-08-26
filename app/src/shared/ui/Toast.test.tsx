import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastContainer } from './Toast';

describe('ToastContainer', () => {
  it('renders confirmations as a polite floating status', () => {
    render(<ToastContainer toasts={[{
      id: 'moment-saved',
      message: 'Đã lưu khoảnh khắc “Bước chân đầu tiên”.',
      icon: '✓',
    }]} />);

    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu khoảnh khắc “Bước chân đầu tiên”.');
    expect(document.querySelector('#toastContainer')).toHaveAttribute('aria-live', 'polite');
    expect(document.querySelector('.toast-item-icon')).toHaveTextContent('✓');
  });
});
