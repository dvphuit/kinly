import { useEffect } from 'react';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';

const MAX_MOUNT_RETRY_FRAMES = 6;

export function timelineEntryElementId(itemId: string): string {
  return `timeline-entry-${itemId}`;
}

export function useRecentlyAddedTimelineAnimation(): void {
  const recentlyAddedId = useTimelineStore((state) => state.recentlyAddedTimelineItemId);
  const clearRecentlyAdded = useTimelineStore((state) => state.clearRecentlyAddedTimelineItem);

  useEffect(() => {
    if (!recentlyAddedId) return undefined;

    let frameId: number | null = null;
    let retriesRemaining = MAX_MOUNT_RETRY_FRAMES;

    const clearCurrentItem = () => clearRecentlyAdded(recentlyAddedId);
    const animateWhenMounted = () => {
      const element = document.getElementById(timelineEntryElementId(recentlyAddedId));
      if (!element) {
        retriesRemaining -= 1;
        if (retriesRemaining > 0) frameId = window.requestAnimationFrame(animateWhenMounted);
        else clearCurrentItem();
        return;
      }

      const prefersReducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion || typeof element.animate !== 'function') {
        clearCurrentItem();
        return;
      }

      const animation = element.animate(
        [
          { opacity: 0, transform: 'translateY(-12px) scale(0.985)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { duration: 480, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
      void animation.finished.then(clearCurrentItem, clearCurrentItem);
    };

    frameId = window.requestAnimationFrame(animateWhenMounted);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [clearRecentlyAdded, recentlyAddedId]);
}
