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

export function initializeNativeExperience(): () => void {
  const isStandalone = isStandaloneDisplayMode();
  document.documentElement.classList.toggle(STANDALONE_CLASS, isStandalone);

  if (!isStandalone) {
    return () => document.documentElement.classList.remove(STANDALONE_CLASS);
  }

  const handleContextMenu = (event: MouseEvent): void => {
    if (event.shiftKey || allowsNativeContextMenu(event.target) || hasSelectedText()) return;
    event.preventDefault();
  };

  document.addEventListener('contextmenu', handleContextMenu);

  return () => {
    document.removeEventListener('contextmenu', handleContextMenu);
    document.documentElement.classList.remove(STANDALONE_CLASS);
  };
}
