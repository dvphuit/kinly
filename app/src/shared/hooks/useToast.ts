/**
 * Toast notification hook.
 * Extracted from App.tsx to be reusable across the app.
 */
import { useCallback, useState } from 'react';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  icon: string;
  action?: ToastAction;
}

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export type AddToast = (message: string, icon?: string, options?: ToastOptions) => void;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast: AddToast = useCallback((message, icon = '🌿', options) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const action = options?.actionLabel && options.onAction
      ? {
          label: options.actionLabel,
          onAction: () => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
            options.onAction?.();
          },
        }
      : undefined;
    const newToast: ToastMessage = { id, message, icon, action };
    setToasts((prev) => [...prev, newToast]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, options?.durationMs ?? (action ? 5000 : 2800));
  }, []);

  return { toasts, addToast, dismissToast };
}
