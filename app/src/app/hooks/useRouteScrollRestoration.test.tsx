import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRouteScrollPositions,
  useRouteScrollRestoration,
} from './useRouteScrollRestoration';

describe('useRouteScrollRestoration', () => {
  let documentHeight = 3_000;

  beforeEach(() => {
    vi.useFakeTimers();
    clearRouteScrollPositions();
    documentHeight = 3_000;
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      get: () => documentHeight,
    });
    Object.defineProperty(document.body, 'scrollHeight', {
      configurable: true,
      get: () => documentHeight,
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true });
    vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number, y?: number) => {
      const top = typeof options === 'number' ? y ?? 0 : options?.top ?? 0;
      Object.defineProperty(window, 'scrollY', { configurable: true, value: top, writable: true });
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => (
      window.setTimeout(() => callback(0), 0)
    ));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('restores each route to its last scroll position', () => {
    const { rerender } = renderHook(
      ({ pathname }) => useRouteScrollRestoration(pathname),
      { initialProps: { pathname: '/timeline' } },
    );
    act(() => vi.runOnlyPendingTimers());

    window.scrollY = 640;
    window.dispatchEvent(new Event('scroll'));
    rerender({ pathname: '/' });
    expect(window.scrollY).toBe(0);

    window.scrollY = 120;
    window.dispatchEvent(new Event('scroll'));
    rerender({ pathname: '/timeline' });
    expect(window.scrollY).toBe(640);
  });
});
