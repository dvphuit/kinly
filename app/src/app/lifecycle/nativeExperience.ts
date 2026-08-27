const STANDALONE_CLASS = 'is-standalone';

const NATIVE_CONTEXT_MENU_TARGETS = [
  'a[href]',
  'img',
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

const NATIVE_PRESS_TARGETS = [
  'button:not([disabled])',
  'a[href]',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="link"]:not([aria-disabled="true"])',
  '[data-native-pressable]:not([aria-disabled="true"])',
].join(',');

const PRESS_MOVE_THRESHOLD = 10;

interface ActivePress {
  pointerId: number;
  startX: number;
  startY: number;
  target: HTMLElement;
  moved: boolean;
}

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

function findPressTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const pressTarget = target.closest(NATIVE_PRESS_TARGETS);
  if (!(pressTarget instanceof HTMLElement)) return null;
  if (pressTarget.hasAttribute('disabled') || pressTarget.getAttribute('aria-disabled') === 'true') {
    return null;
  }
  return pressTarget;
}

function releaseFocusWithin(target: HTMLElement): void {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && target.contains(activeElement)) activeElement.blur();
}

function setupNativePressHandling(): () => void {
  let activePress: ActivePress | null = null;
  let suppressedClickTarget: HTMLElement | null = null;
  let suppressedClickTimeout: number | null = null;

  const clearSuppressedClick = (): void => {
    if (suppressedClickTimeout !== null) window.clearTimeout(suppressedClickTimeout);
    suppressedClickTimeout = null;
    suppressedClickTarget = null;
  };

  const clearActivePress = (): ActivePress | null => {
    const press = activePress;
    activePress = null;
    press?.target.removeAttribute('data-native-pressed');
    return press;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = findPressTarget(event.target);
    if (!target) return;

    clearActivePress();
    activePress = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target,
      moved: false,
    };
    target.setAttribute('data-native-pressed', '');
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!activePress || activePress.pointerId !== event.pointerId || activePress.moved) return;
    const distance = Math.hypot(
      event.clientX - activePress.startX,
      event.clientY - activePress.startY,
    );
    if (distance <= PRESS_MOVE_THRESHOLD) return;

    activePress.moved = true;
    activePress.target.removeAttribute('data-native-pressed');
    releaseFocusWithin(activePress.target);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!activePress || activePress.pointerId !== event.pointerId) return;
    const press = clearActivePress();
    if (!press?.moved) return;

    clearSuppressedClick();
    suppressedClickTarget = press.target;
    suppressedClickTimeout = window.setTimeout(clearSuppressedClick, 0);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (!activePress || activePress.pointerId !== event.pointerId) return;
    releaseFocusWithin(activePress.target);
    clearActivePress();
  };

  const onClick = (event: MouseEvent): void => {
    if (!suppressedClickTarget || !(event.target instanceof Node)) return;
    if (!suppressedClickTarget.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearSuppressedClick();
  };

  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp, { passive: true });
  document.addEventListener('pointercancel', onPointerCancel, { passive: true });
  document.addEventListener('click', onClick, { capture: true });

  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('click', onClick, { capture: true });
    clearActivePress();
    clearSuppressedClick();
  };
}

export function initializeNativeExperience(): () => void {
  const isStandalone = isStandaloneDisplayMode();
  document.documentElement.classList.toggle(STANDALONE_CLASS, isStandalone);

  if (!isStandalone) {
    return () => document.documentElement.classList.remove(STANDALONE_CLASS);
  }

  const disposePressHandling = setupNativePressHandling();

  const handleContextMenu = (event: MouseEvent): void => {
    if (event.shiftKey || allowsNativeContextMenu(event.target) || hasSelectedText()) return;
    event.preventDefault();
  };

  document.addEventListener('contextmenu', handleContextMenu);

  return () => {
    disposePressHandling();
    document.removeEventListener('contextmenu', handleContextMenu);
    document.documentElement.classList.remove(STANDALONE_CLASS);
  };
}
