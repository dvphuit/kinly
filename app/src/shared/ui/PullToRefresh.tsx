import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import './PullToRefresh.css';

const SOFT_THRESHOLD = 64;
const HARD_THRESHOLD = 120;
const MAX_PULL = 144;
const RESISTANCE = 0.5;
const SETTLE_MS = 220;

interface PullToRefreshProps {
  onSoftRefresh: () => void;
  onHardRefresh: () => void;
  children: React.ReactNode;
}

type PullLevel = 'idle' | 'pull' | 'soft' | 'hard';

function getNearestScrollable(node: EventTarget | null, root: HTMLElement): HTMLElement | null {
  let el = node as HTMLElement | null;
  while (el && el !== root && el !== document.body) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function getPullLevel(value: number): PullLevel {
  if (value >= HARD_THRESHOLD) return 'hard';
  if (value >= SOFT_THRESHOLD) return 'soft';
  if (value > 0) return 'pull';
  return 'idle';
}

function getPullLabel(level: PullLevel): string {
  if (level === 'hard') return 'Thả để tải lại ứng dụng';
  if (level === 'soft') return 'Thả để làm mới';
  return 'Kéo để làm mới';
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onSoftRefresh, onHardRefresh, children }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const distance = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  const applyPullVisuals = (value: number) => {
    const clamped = Math.max(0, Math.min(value, MAX_PULL));
    const level = getPullLevel(clamped);
    distance.current = clamped;

    if (contentRef.current) contentRef.current.style.transform = `translate3d(0, ${clamped}px, 0)`;
    if (indicatorRef.current) {
      const opacity = clamped <= 12
        ? (clamped / 12) * 0.45
        : 0.45 + ((Math.min(clamped, SOFT_THRESHOLD) - 12) / (SOFT_THRESHOLD - 12)) * 0.55;
      indicatorRef.current.style.opacity = String(refreshing ? 1 : Math.max(0, Math.min(1, opacity)));
      indicatorRef.current.dataset.level = level;
    }
    if (labelRef.current) labelRef.current.textContent = getPullLabel(level);
    if (iconRef.current) {
      const softProgress = Math.min(1, clamped / SOFT_THRESHOLD);
      const hardProgress = Math.max(0, Math.min(1, (clamped - SOFT_THRESHOLD) / (HARD_THRESHOLD - SOFT_THRESHOLD)));
      const rotation = (softProgress * 270) + (hardProgress * 180);
      const scale = 0.82 + (softProgress * 0.18) + (hardProgress * 0.08);
      iconRef.current.style.transform = `rotate(${rotation}deg) scale(${scale})`;
    }
  };

  const settleTo = (target: number) => {
    const root = rootRef.current;
    if (!root) {
      applyPullVisuals(target);
      return;
    }
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    root.classList.add('ptr-settling');
    requestAnimationFrame(() => applyPullVisuals(target));
    settleTimerRef.current = window.setTimeout(() => {
      root.classList.remove('ptr-settling');
      settleTimerRef.current = null;
    }, SETTLE_MS);
  };

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reset = () => settleTo(0);

    const onTouchStart = (event: TouchEvent) => {
      if (refreshing || event.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      const scroller = getNearestScrollable(event.target, root);
      if (scroller && scroller.scrollTop > 0) return;
      root.classList.remove('ptr-settling');
      startY.current = event.touches[0].clientY;
      pulling.current = true;
      distance.current = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pulling.current || refreshing || event.touches.length !== 1) return;
      if (window.scrollY > 0) {
        pulling.current = false;
        reset();
        return;
      }

      const dy = event.touches[0].clientY - startY.current;
      if (dy <= 0) {
        pulling.current = false;
        reset();
        return;
      }

      applyPullVisuals(Math.min(dy * RESISTANCE, MAX_PULL));
    };

    const finish = () => {
      if (!pulling.current) return;
      pulling.current = false;

      if (distance.current >= HARD_THRESHOLD) {
        setRefreshing(true);
        if (labelRef.current) labelRef.current.textContent = 'Đang tải lại ứng dụng…';
        settleTo(HARD_THRESHOLD);
        onHardRefresh();
        return;
      }

      if (distance.current >= SOFT_THRESHOLD) {
        setRefreshing(true);
        if (labelRef.current) labelRef.current.textContent = 'Đang làm mới…';
        settleTo(SOFT_THRESHOLD);
        onSoftRefresh();
        setRefreshing(false);
        settleTo(0);
        return;
      }

      reset();
    };

    const onTouchEnd = () => finish();
    const onTouchCancel = () => {
      pulling.current = false;
      reset();
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    root.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [onHardRefresh, onSoftRefresh, refreshing]);

  return (
    <div className={`ptr-root ${refreshing ? 'is-refreshing' : ''}`} ref={rootRef}>
      <div
        ref={indicatorRef}
        className="ptr-indicator"
        data-level="idle"
        style={{ height: MAX_PULL, opacity: refreshing ? 1 : 0 }}
        aria-hidden="true"
      >
        <div className="ptr-feedback">
          <div ref={iconRef} className="ptr-pull-icon">
            <Loader2 className="ptr-spinner" size={26} strokeWidth={2.5} />
          </div>
          <span ref={labelRef} className="ptr-label">Kéo để làm mới</span>
        </div>
      </div>
      <div ref={contentRef} className="ptr-content">
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
