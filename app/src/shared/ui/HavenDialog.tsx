import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNativePresence } from '@/shared/hooks/useNativePresence';

interface HavenDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  modal?: boolean;
  className?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function HavenDialog({ open, onClose, title, description, children, footer, modal = true, className = '' }: HavenDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const presence = useNativePresence(open, 180);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    if (modal) document.body.style.overflow = 'hidden';

    const frame = modal
      ? requestAnimationFrame(() => {
          const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
          (first ?? dialogRef.current)?.focus();
        })
      : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (!modal || event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      if (modal) {
        document.body.style.overflow = originalOverflow;
        if (previous?.isConnected) previous.focus();
      }
    };
  }, [modal, onClose, open]);

  if (!presence.mounted || typeof document === 'undefined') return null;
  const phaseClass = presence.phase === 'open' ? 'native-open' : 'native-closing';

  return createPortal(
    <div
      className={`haven-dialog-backdrop ${modal ? '' : 'non-modal'} ${phaseClass}`.trim()}
      aria-hidden={open ? undefined : true}
      onClick={(event) => {
        if (!open || !modal || event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`haven-dialog ${phaseClass} ${className}`.trim()}
        role="dialog"
        aria-modal={modal}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="haven-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            type="button"
            className="haven-dialog-close"
            aria-label="Đóng"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="haven-dialog-body">{children}</div>
        {footer && <div className="haven-dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
