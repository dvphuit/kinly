import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { animateElement, cancelElementAnimations } from '@/shared/lib/nativeAnimation';
import { useNativePresence } from '@/shared/hooks/useNativePresence';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

interface DragState {
  pointerId: number;
  startY: number;
  lastY: number;
  lastAt: number;
  offsetY: number;
  velocityY: number;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const DRAG_DISMISS_DISTANCE = 80;
const DRAG_DISMISS_VELOCITY = 450;

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  dismissible = true,
  className = '',
  children,
  footer,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragDismissedRef = useRef(false);
  const titleId = useId();
  const presence = useNativePresence(isOpen, 180);

  useEffect(() => {
    if (!isOpen) return;
    dragDismissedRef.current = false;
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
      sheetRef.current.style.opacity = '';
    }
    if (backdropRef.current) backdropRef.current.style.opacity = '';

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    return () => {
      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const frameId = requestAnimationFrame(() => {
      const focusable = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable ?? sheetRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        sheetRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeIsFocusable = focusable.includes(active as HTMLElement);

      if (event.shiftKey && (active === first || !activeIsFocusable)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !activeIsFocusable)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dismissible, isOpen, onClose]);

  const applyDrag = (offsetY: number) => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet) return;

    const resisted = offsetY <= 0 ? offsetY * 0.04 : offsetY;
    sheet.style.transform = `translate3d(0, ${resisted}px, 0)`;
    if (backdrop) backdrop.style.opacity = String(Math.max(0.35, 1 - Math.max(0, offsetY) / 360));
  };

  const settleDrag = () => {
    const current = dragRef.current?.offsetY ?? 0;
    dragRef.current = null;
    void Promise.all([
      animateElement(
        sheetRef.current,
        [{ transform: `translate3d(0, ${current}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)', fill: 'both' },
      ),
      animateElement(
        backdropRef.current,
        [{ opacity: backdropRef.current?.style.opacity || '1' }, { opacity: 1 }],
        { duration: 180, easing: 'ease-out', fill: 'both' },
      ),
    ]);
  };

  const dismissFromDrag = () => {
    const current = Math.max(0, dragRef.current?.offsetY ?? 0);
    dragRef.current = null;
    dragDismissedRef.current = true;
    const distance = Math.max(window.innerHeight, sheetRef.current?.clientHeight ?? 0) + 80;

    void Promise.all([
      animateElement(
        sheetRef.current,
        [{ transform: `translate3d(0, ${current}px, 0)` }, { transform: `translate3d(0, ${distance}px, 0)` }],
        { duration: 180, easing: 'cubic-bezier(0.32, 0, 0.67, 0)', fill: 'both' },
      ),
      animateElement(
        backdropRef.current,
        [{ opacity: backdropRef.current?.style.opacity || '1' }, { opacity: 0 }],
        { duration: 160, easing: 'ease-out', fill: 'both' },
      ),
    ]).then(onClose);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dismissible || !isOpen || (contentRef.current?.scrollTop ?? 0) > 0) return;
    cancelElementAnimations(sheetRef.current);
    cancelElementAnimations(backdropRef.current);
    const now = performance.now();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: now,
      offsetY: 0,
      velocityY: 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastAt);
    const nextOffset = Math.max(0, event.clientY - drag.startY);
    drag.velocityY = ((event.clientY - drag.lastY) / elapsed) * 1000;
    drag.lastY = event.clientY;
    drag.lastAt = now;
    drag.offsetY = nextOffset;
    applyDrag(nextOffset);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const shouldDismiss = drag.offsetY > DRAG_DISMISS_DISTANCE
      || (drag.velocityY > DRAG_DISMISS_VELOCITY && drag.offsetY > 20);
    if (shouldDismiss) dismissFromDrag();
    else settleDrag();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    settleDrag();
  };

  if (!presence.mounted || typeof document === 'undefined') return null;
  const phaseClass = presence.phase === 'open' ? 'native-open' : 'native-closing';
  const dragDismissedClass = dragDismissedRef.current && !isOpen ? 'native-drag-dismissed' : '';
  const sheetPhaseClass = `${phaseClass} ${dragDismissedClass}`.trim();

  return createPortal(
    <div
      ref={backdropRef}
      className={`modal-backdrop ${isOpen ? 'open' : 'closing'} ${phaseClass} ${dragDismissedClass}`.trim()}
      aria-hidden={isOpen ? undefined : true}
      onClick={(event) => {
        if (isOpen && dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Hộp thoại'}
        tabIndex={-1}
        className={`bottom-sheet ${sheetPhaseClass} ${className}`.trim()}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="sheet-drag-handle-area"
          tabIndex={-1}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerCancel}
          style={{ touchAction: 'none', cursor: dismissible ? 'grab' : 'default' }}
        >
          <div
            className="sheet-handle-bar"
            data-native-pressable={dismissible ? '' : undefined}
            tabIndex={-1}
            title={dismissible ? 'Kéo xuống hoặc chạm để đóng' : undefined}
            onClick={() => {
              if (dismissible) onClose();
            }}
          />

          {title && (
            <div className="sheet-header-row">
              <h3 className="sheet-title" id={titleId}>{title}</h3>
              <button
                type="button"
                className="sheet-close-btn"
                onClick={() => {
                  if (dismissible) onClose();
                }}
                title="Đóng"
                aria-label="Đóng"
                disabled={!dismissible}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        <div ref={contentRef} className="sheet-content-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
