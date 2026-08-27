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

  it('keeps native actions available for links, video, fields, and Shift-click', () => {
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
    expect(dispatchContextMenu(image).defaultPrevented).toBe(true);
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

  it('supports touch down / move / release: down shows pressed, move beyond threshold cancels focus and suppresses click', () => {
    mockDisplayMode(true);
    const button = document.createElement('button');
    button.textContent = 'Tap';
    document.body.append(button);

    dispose = initializeNativeExperience();

    const clickSpy = vi.fn();
    button.addEventListener('click', clickSpy);

    dispatchPointer(button, 'pointerdown', 100, 100);
    expect(button.hasAttribute('data-pressed')).toBe(true);

    button.focus();
    expect(document.activeElement).toBe(button);

    dispatchPointer(button, 'pointermove', 115, 100);
    expect(button.hasAttribute('data-pressed')).toBe(false);
    expect(document.activeElement).not.toBe(button);

    dispatchPointer(button, 'pointerup', 115, 100);
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('supports touch down / release without move: keeps pressed until release and allows click', () => {
    mockDisplayMode(false);
    const button = document.createElement('button');
    button.textContent = 'Tap';
    document.body.append(button);

    dispose = initializeNativeExperience();

    const clickSpy = vi.fn();
    button.addEventListener('click', clickSpy);

    dispatchPointer(button, 'pointerdown', 50, 50);
    expect(button.hasAttribute('data-pressed')).toBe(true);

    dispatchPointer(button, 'pointermove', 52, 51);
    expect(button.hasAttribute('data-pressed')).toBe(true);

    dispatchPointer(button, 'pointerup', 52, 51);
    expect(button.hasAttribute('data-pressed')).toBe(false);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it('does not add pressed state for inputs and keeps native focus on down', () => {
    mockDisplayMode(true);
    const input = document.createElement('input');
    document.body.append(input);

    dispose = initializeNativeExperience();

    dispatchPointer(input, 'pointerdown', 10, 10);
    expect(input.hasAttribute('data-pressed')).toBe(false);
  });
});
