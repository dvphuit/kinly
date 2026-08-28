/**
 * Toast notification hook.
 * Extracted from App.tsx to be reusable across the app.
 */
import { useState, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  icon: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, icon = '🌿') => {
    const id = 't_' + Date.now();
    const newToast: ToastMessage = { id, message, icon };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
