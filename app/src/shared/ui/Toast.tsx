import React from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  icon?: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => (
  toasts.length > 0 ? (
    <div className="toast-container" id="toastContainer" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-item" role="status">
          <span className="toast-item-icon" aria-hidden="true">{toast.icon || '✓'}</span>
          <span className="toast-item-copy">{toast.message}</span>
        </div>
      ))}
    </div>
  ) : null
);
