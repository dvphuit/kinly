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
  initialFocusSelector?: string;
  touchOptimized?: boolean;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const TOUCH_TARGETS = 'button, input:not([type="hidden"]):not([type="range"]):not([type="file"]), textarea, [role="radio"], [role="checkbox"], [role="combobox"]';
const MIN_TOUCH_TARGET = 44;
const KEYBOARD_THRESHOLD = 80;

function ensureTouchTarget(element: HTMLElement) {
  const computed = window.getComputedStyle(element);
  const minHeight = Number.parseFloat(computed.minHeight);
  const height = Number.parseFloat(computed.height);
  const hasEnoughHeight = (Number.isFinite(minHeight) && minHeight >= MIN_TOUCH_TARGET)
    || (Number.isFinite(height) && height >= MIN_TOUCH_TARGET);
  if (!hasEnoughHeight) element.style.minHeight = `${MIN_TOUCH_TARGET}px`;
}

function optimizeNumericKeypads(root: HTMLElement) {
  root.querySelectorAll<HTMLInputElement>('input[type="number"]:not([inputmode])').forEach((input) => {
    const step = input.getAttribute('step') ?? '';
    input.inputMode = step === 'any' || step.includes('.') ? 'decimal' : 'numeric';
  });
}

export function HavenDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  modal = true,
  className = '',
  initialFocusSelector,
  touchOptimized = false,
}: HavenDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
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
          const preferred = initialFocusSelector
            ? dialogRef.current?.querySelector<HTMLElement>(initialFocusSelector)
            : null;
          const fallback = initialFocusSelector
            ? dialogRef.current
            : dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? dialogRef.current;
          (preferred ?? fallback)?.focus();
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
  }, [initialFocusSelector, modal, onClose, open]);

  useEffect(() => {
    if (!open || !touchOptimized || !dialogRef.current) return;
    const dialog = dialogRef.current;
    optimizeNumericKeypads(dialog);
    dialog.querySelectorAll<HTMLElement>(TOUCH_TARGETS).forEach(ensureTouchTarget);
    const closeButton = dialog.querySelector<HTMLElement>('.haven-dialog-close');
    if (closeButton) {
      closeButton.style.minWidth = `${MIN_TOUCH_TARGET}px`;
      closeButton.style.minHeight = `${MIN_TOUCH_TARGET}px`;
    }
  }, [open, touchOptimized]);

  useEffect(() => {
    if (!open || !touchOptimized) return;
    const viewport = window.visualViewport;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!viewport || !backdrop || !dialog) return;

    let scrollFrame: number | null = null;
    const clearViewportFit = () => {
      backdrop.style.removeProperty('top');
      backdrop.style.removeProperty('bottom');
      backdrop.style.removeProperty('left');
      backdrop.style.removeProperty('right');
      backdrop.style.removeProperty('width');
      backdrop.style.removeProperty('height');
      dialog.style.removeProperty('max-height');
    };
    const syncViewport = () => {
      const keyboardInset = Math.max(0, window.innerHeight - viewport.height);
      if (keyboardInset < KEYBOARD_THRESHOLD) {
        clearViewportFit();
        return;
      }
      backdrop.style.top = `${viewport.offsetTop}px`;
      backdrop.style.bottom = 'auto';
      backdrop.style.left = `${viewport.offsetLeft}px`;
      backdrop.style.right = 'auto';
      backdrop.style.width = `${viewport.width}px`;
      backdrop.style.height = `${viewport.height}px`;
      dialog.style.maxHeight = `${Math.max(280, viewport.height - 16)}px`;

      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && dialog.contains(active)) {
          active.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }
      });
    };

    syncViewport();
    viewport.addEventListener('resize', syncViewport);
    viewport.addEventListener('scroll', syncViewport);
    return () => {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      viewport.removeEventListener('resize', syncViewport);
      viewport.removeEventListener('scroll', syncViewport);
      clearViewportFit();
    };
  }, [open, touchOptimized]);

  if (!presence.mounted || typeof document === 'undefined') return null;
  const phaseClass = presence.phase === 'open' ? 'native-open' : 'native-closing';
  const touchAnimationStyle = touchOptimized
    ? {
        animationDuration: presence.phase === 'open' ? '220ms' : '180ms',
        animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }
    : undefined;

  return createPortal(
    <div
      ref={backdropRef}
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
        style={touchAnimationStyle}
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
        <div
          ref={bodyRef}
          className="haven-dialog-body"
          style={touchOptimized ? { overscrollBehaviorY: 'contain', scrollPaddingBottom: 96 } : undefined}
        >
          {children}
        </div>
        {footer && <div className="haven-dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
