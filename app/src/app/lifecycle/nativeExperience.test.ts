import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeNativeExperience } from './nativeExperience';

function mockDisplayMode(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

function dispatchContextMenu(target: Element, shiftKey = false): MouseEvent {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey });
  target.dispatchEvent(event);
  return event;
}

function dispatchPointer(target: Element, type: string, x: number, y: number): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'touch',
    button: 0,
  });
  target.dispatchEvent(event);
  return event;
}

describe('native experience', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('suppresses the browser context menu on app chrome in standalone mode', () => {
    mockDisplayMode(true);
    const surface = document.createElement('div');
    document.body.append(surface);

    dispose = initializeNativeExperience();

    expect(document.documentElement).toHaveClass('is-standalone');
    expect(dispatchContextMenu(surface).defaultPrevented).toBe(true);
  });

  it('keeps native actions available for links, media, fields, and Shift-click', () => {
    mockDisplayMode(true);
    const surface = document.createElement('div');
    const link = document.createElement('a');
    link.href = 'https://example.com';
    const image = document.createElement('img');
    const input = document.createElement('input');
    surface.append(link, image, input);
    document.body.append(surface);

    dispose = initializeNativeExperience();

    expect(dispatchContextMenu(link).defaultPrevented).toBe(false);
    expect(dispatchContextMenu(image).defaultPrevented).toBe(false);
    expect(dispatchContextMenu(input).defaultPrevented).toBe(false);
    expect(dispatchContextMenu(surface, true).defaultPrevented).toBe(false);
  });

  it('leaves normal browser context menus untouched outside standalone mode', () => {
    mockDisplayMode(false);
    const surface = document.createElement('div');
    document.body.append(surface);

    dispose = initializeNativeExperience();

    expect(document.documentElement).not.toHaveClass('is-standalone');
    expect(dispatchContextMenu(surface).defaultPrevented).toBe(false);
  });

  it('animates semantic and explicitly marked actions in standalone mode', () => {
    mockDisplayMode(true);
    const button = document.createElement('button');
    const buttonLabel = document.createElement('span');
    const markedAction = document.createElement('div');
    button.append(buttonLabel);
    markedAction.setAttribute('data-native-pressable', '');
    document.body.append(button, markedAction);

    dispose = initializeNativeExperience();
    const onClick = vi.fn();
    button.addEventListener('click', onClick);

    dispatchPointer(buttonLabel, 'pointerdown', 20, 20);
    expect(button.hasAttribute('data-native-pressed')).toBe(true);
    expect(buttonLabel.hasAttribute('data-native-pressed')).toBe(false);
    dispatchPointer(buttonLabel, 'pointerup', 20, 20);
    expect(button.hasAttribute('data-native-pressed')).toBe(false);
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttonLabel.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(false);
    expect(onClick).toHaveBeenCalledOnce();

    dispatchPointer(markedAction, 'pointerdown', 30, 30);
    expect(markedAction.hasAttribute('data-native-pressed')).toBe(true);
  });

  it('does not animate generic surfaces, fields, or disabled actions', () => {
    mockDisplayMode(true);
    const surface = document.createElement('div');
    const input = document.createElement('input');
    const disabledButton = document.createElement('button');
    const ariaDisabledAction = document.createElement('div');
    disabledButton.disabled = true;
    ariaDisabledAction.setAttribute('role', 'button');
    ariaDisabledAction.setAttribute('aria-disabled', 'true');
    document.body.append(surface, input, disabledButton, ariaDisabledAction);

    dispose = initializeNativeExperience();

    dispatchPointer(surface, 'pointerdown', 10, 10);
    dispatchPointer(input, 'pointerdown', 10, 10);
    dispatchPointer(disabledButton, 'pointerdown', 10, 10);
    dispatchPointer(ariaDisabledAction, 'pointerdown', 10, 10);
    expect(surface.hasAttribute('data-native-pressed')).toBe(false);
    expect(input.hasAttribute('data-native-pressed')).toBe(false);
    expect(disabledButton.hasAttribute('data-native-pressed')).toBe(false);
    expect(ariaDisabledAction.hasAttribute('data-native-pressed')).toBe(false);
  });

  it('does not install press handling outside standalone mode', () => {
    mockDisplayMode(false);
    const browserButton = document.createElement('button');
    document.body.append(browserButton);

    dispose = initializeNativeExperience();

    dispatchPointer(browserButton, 'pointerdown', 10, 10);
    expect(browserButton.hasAttribute('data-native-pressed')).toBe(false);
  });

  it('cancels press feedback and the following click when a scroll takes over', () => {
    mockDisplayMode(true);
    const button = document.createElement('button');
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    document.body.append(button);

    dispose = initializeNativeExperience();

    dispatchPointer(button, 'pointerdown', 100, 100);
    button.focus();
    dispatchPointer(button, 'pointermove', 111, 100);
    expect(button.hasAttribute('data-native-pressed')).toBe(false);
    expect(document.activeElement).not.toBe(button);

    dispatchPointer(button, 'pointerup', 111, 100);
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('clears press feedback and focus when the pointer is cancelled', () => {
    mockDisplayMode(true);
    const action = document.createElement('div');
    action.setAttribute('role', 'button');
    action.tabIndex = 0;
    document.body.append(action);

    dispose = initializeNativeExperience();

    dispatchPointer(action, 'pointerdown', 40, 40);
    action.focus();
    dispatchPointer(action, 'pointercancel', 40, 40);
    expect(action.hasAttribute('data-native-pressed')).toBe(false);
    expect(document.activeElement).not.toBe(action);
  });
});
