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
});
