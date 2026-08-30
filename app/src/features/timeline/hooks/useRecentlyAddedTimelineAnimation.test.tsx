import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import {
  timelineEntryElementId,
  useRecentlyAddedTimelineAnimation,
} from './useRecentlyAddedTimelineAnimation';

function AnimationHarness({ itemId }: { itemId: string }) {
  useRecentlyAddedTimelineAnimation();
  return <div id={timelineEntryElementId(itemId)}>Khoảnh khắc mới</div>;
}

describe('useRecentlyAddedTimelineAnimation', () => {
  const originalAnimate = HTMLElement.prototype.animate;

  beforeEach(() => {
    useTimelineStore.setState({ recentlyAddedTimelineItemId: null });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  });

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: originalAnimate,
      writable: true,
    });
    vi.unstubAllGlobals();
  });

  it('animates the exact moment that was just added and then clears the marker', async () => {
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
      writable: true,
    });
    useTimelineStore.setState({ recentlyAddedTimelineItemId: 'new-moment' });

    render(<AnimationHarness itemId="new-moment" />);

    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: 'translateY(-12px) scale(0.985)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 480, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    await waitFor(() => expect(useTimelineStore.getState().recentlyAddedTimelineItemId).toBeNull());
  });

  it('does not animate when reduced motion is requested', async () => {
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
      writable: true,
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    useTimelineStore.setState({ recentlyAddedTimelineItemId: 'new-moment' });

    render(<AnimationHarness itemId="new-moment" />);

    expect(animate).not.toHaveBeenCalled();
    await waitFor(() => expect(useTimelineStore.getState().recentlyAddedTimelineItemId).toBeNull());
  });
});
