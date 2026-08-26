const STANDALONE_CLASS = 'is-standalone';

const NATIVE_CONTEXT_MENU_TARGETS = [
  'a[href]',
  'video',
  'audio',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[data-native-selectable]',
  '[data-native-context-menu="allow"]',
].join(',');

function isLegacyIOSStandalone(): boolean {
  return 'standalone' in window.navigator && window.navigator.standalone === true;
}

export function isStandaloneDisplayMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || isLegacyIOSStandalone();
}

function hasSelectedText(): boolean {
  return Boolean(window.getSelection()?.toString().trim());
}

function allowsNativeContextMenu(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(NATIVE_CONTEXT_MENU_TARGETS));
}

const PRESS_MOVE_THRESHOLD = 10;

let pressTarget: HTMLElement | null = null;
let pressStartX = 0;
let pressStartY = 0;
let pressMoved = false;

function setupPressHandling(): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = (event.target as Element).closest(
      'button, a[href], [role="button"], [data-pressable]',
    ) as HTMLElement | null;
    if (!target) return;
    if (target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
    if ((target as HTMLButtonElement).disabled || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return;
    pressTarget = target;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    pressMoved = false;
    target.setAttribute('data-pressed', '');
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pressTarget) return;
    const dx = event.clientX - pressStartX;
    const dy = event.clientY - pressStartY;
    if (Math.hypot(dx, dy) > PRESS_MOVE_THRESHOLD) {
      pressMoved = true;
      pressTarget.removeAttribute('data-pressed');
      if (document.activeElement === pressTarget) {
        (pressTarget as HTMLElement).blur();
      }
    }
  };

  const clearPress = (cancelClick: boolean): void => {
    if (!pressTarget) return;
    const target = pressTarget;
    const moved = pressMoved;
    pressTarget = null;
    pressMoved = false;
    target.removeAttribute('data-pressed');
    if (moved && cancelClick) {
      const suppressClick = (e: MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
      };
      target.addEventListener('click', suppressClick, { capture: true, once: true });
      setTimeout(() => target.removeEventListener('click', suppressClick, { capture: true } as unknown as EventListenerOptions), 0);
    }
  };

  const onPointerUp = (): void => clearPress(true);
  const onPointerCancel = (): void => clearPress(false);

  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp, { passive: true });
  document.addEventListener('pointercancel', onPointerCancel, { passive: true });
  document.addEventListener('pointerleave', onPointerCancel, { passive: true } as AddEventListenerOptions);

  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('pointerleave', onPointerCancel as EventListener);
    pressTarget?.removeAttribute('data-pressed');
    pressTarget = null;
    pressMoved = false;
  };
}

export function initializeNativeExperience(): () => void {
  const isStandalone = isStandaloneDisplayMode();
  document.documentElement.classList.toggle(STANDALONE_CLASS, isStandalone);

  const disposers: Array<() => void> = [];
  disposers.push(setupPressHandling());

  if (!isStandalone) {
    return () => {
      disposers.forEach((fn) => fn());
      document.documentElement.classList.remove(STANDALONE_CLASS);
    };
  }

  const handleContextMenu = (event: MouseEvent): void => {
    if (event.shiftKey || allowsNativeContextMenu(event.target) || hasSelectedText()) return;
    event.preventDefault();
  };

  document.addEventListener('contextmenu', handleContextMenu);

  return () => {
    disposers.forEach((fn) => fn());
    document.removeEventListener('contextmenu', handleContextMenu);
    document.documentElement.classList.remove(STANDALONE_CLASS);
  };
}
