import React from 'react';
import type { ToastMessage } from '@/shared/hooks/useToast';

interface ToastContainerProps {
  toasts: ToastMessage[];
}

const ACTION_STYLE: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  marginLeft: 'auto',
  padding: '0 8px',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontWeight: 800,
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  cursor: 'pointer',
};

const ACTION_TOAST_STYLE: React.CSSProperties = {
  gridTemplateColumns: '30px minmax(0, 1fr) auto',
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => (
  toasts.length > 0 ? (
    <div className="toast-container" id="toastContainer" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-item"
          role="status"
          style={toast.action ? ACTION_TOAST_STYLE : undefined}
        >
          <span className="toast-item-icon" aria-hidden="true">{toast.icon || '✓'}</span>
          <span className="toast-item-copy">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              aria-label={toast.action.label}
              style={ACTION_STYLE}
              onClick={toast.action.onAction}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  ) : null
);
