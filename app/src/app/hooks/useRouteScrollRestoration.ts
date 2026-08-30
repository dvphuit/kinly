import { useEffect, useLayoutEffect } from 'react';

const ROUTE_SCROLL_RESTORE_TIMEOUT_MS = 2_000;
const routeScrollPositions = new Map<string, number>();

function documentScrollLimit(): number {
  const documentHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
  );
  return Math.max(0, documentHeight - window.innerHeight);
}

export function clearRouteScrollPositions(): void {
  routeScrollPositions.clear();
}

export function useRouteScrollRestoration(pathname: string): void {
  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return undefined;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const savePosition = () => {
      routeScrollPositions.set(pathname, Math.max(0, window.scrollY));
    };
    window.addEventListener('scroll', savePosition, { passive: true });
    return () => window.removeEventListener('scroll', savePosition);
  }, [pathname]);

  useLayoutEffect(() => {
    const target = routeScrollPositions.get(pathname) ?? 0;
    let active = true;
    let frameId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let timeoutId: number | null = null;

    const stopWatching = () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      window.removeEventListener('pointerdown', stopWatching);
      window.removeEventListener('touchstart', stopWatching);
      window.removeEventListener('wheel', stopWatching);
      window.removeEventListener('keydown', stopWatching);
    };
    const restore = () => {
      if (!active) return;
      const scrollLimit = documentScrollLimit();
      window.scrollTo({ top: Math.min(target, scrollLimit), behavior: 'auto' });
      if (scrollLimit >= target) stopWatching();
    };

    restore();
    if (target > documentScrollLimit() && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(restore);
      resizeObserver.observe(document.body);
      timeoutId = window.setTimeout(stopWatching, ROUTE_SCROLL_RESTORE_TIMEOUT_MS);
      window.addEventListener('pointerdown', stopWatching, { passive: true });
      window.addEventListener('touchstart', stopWatching, { passive: true });
      window.addEventListener('wheel', stopWatching, { passive: true });
      window.addEventListener('keydown', stopWatching);
    }
    if (typeof window.requestAnimationFrame === 'function') {
      frameId = window.requestAnimationFrame(restore);
    }

    return () => {
      active = false;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      stopWatching();
    };
  }, [pathname]);
}
