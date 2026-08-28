import { useCallback, useEffect, useRef, useState } from 'react';

interface UseProgressiveListOptions {
  totalCount: number;
  initialCount: number;
  batchSize: number;
  resetKey: string;
  rootMargin?: string;
}

export function useProgressiveList({
  totalCount,
  initialCount,
  batchSize,
  resetKey,
  rootMargin = '720px 0px',
}: UseProgressiveListOptions) {
  const safeInitialCount = Math.max(1, Math.floor(initialCount));
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const [visibleCount, setVisibleCount] = useState(() => Math.min(totalCount, safeInitialCount));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const autoLoadAvailable = typeof IntersectionObserver !== 'undefined';
  const hasMore = visibleCount < totalCount;

  const revealMore = useCallback(() => {
    setVisibleCount((current) => Math.min(totalCount, current + safeBatchSize));
  }, [safeBatchSize, totalCount]);

  useEffect(() => {
    setVisibleCount(Math.min(totalCount, safeInitialCount));
    // totalCount is read only for the initial clamp at reset time; subsequent totalCount growth is handled by the next effect to preserve scroll position
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, safeInitialCount]);
  useEffect(() => {
    setVisibleCount((current) => Math.min(totalCount, Math.max(current, Math.min(totalCount, safeInitialCount))));
  }, [safeInitialCount, totalCount]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!autoLoadAvailable || !hasMore || !sentinel) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) revealMore();
    }, { rootMargin, threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [autoLoadAvailable, hasMore, revealMore, rootMargin]);

  return {
    autoLoadAvailable,
    hasMore,
    revealMore,
    sentinelRef,
    visibleCount,
  };
}
