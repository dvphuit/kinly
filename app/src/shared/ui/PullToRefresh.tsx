import { useEffect, useRef } from 'react';
import './PullToRefresh.css';

const SOFT_THRESHOLD = 64;
const HARD_THRESHOLD = 120;
const MAX_PULL = 144;
const RESISTANCE = 0.5;
const SETTLE_MS = 220;
const REFRESH_HOLD_MS = 420;
const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type PullLevel = 'idle' | 'pull' | 'soft' | 'hard';

interface PullToRefreshProps {
  onSoftRefresh?: () => void | Promise<void>;
  onHardRefresh?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  children: React.ReactNode;
}

function getNearestScrollable(node: EventTarget | null, root: HTMLElement): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : null;
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

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onSoftRefresh, onHardRefresh, onRefresh, children }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleSoft = onSoftRefresh ?? onRefresh;
  const handleHard = onHardRefresh ?? onRefresh;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const indicator = root.querySelector<HTMLElement>('.ptr-indicator');
    const card = root.querySelector<HTMLElement>('.ptr-card');
    const ring = root.querySelector<SVGCircleElement>('.ptr-ring-progress');
    const orbit = root.querySelector<HTMLElement>('.ptr-orbit-motion');
    const label = root.querySelector<HTMLElement>('.ptr-label');
    const content = root.querySelector<HTMLElement>('.ptr-content');
    if (!indicator || !card || !ring || !orbit || !label || !content) return;

    let startY = 0;
    let pulling = false;
    let distance = 0;
    let refreshing = false;
    let settleFrame: number | undefined;
    let settleTimer: number | undefined;
    let refreshTimer: number | undefined;
    let disposed = false;

    const clearSettle = () => {
      if (settleFrame !== undefined) cancelAnimationFrame(settleFrame);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      settleFrame = undefined;
      settleTimer = undefined;
    };

    const applyPullVisuals = (value: number) => {
      const clamped = Math.max(0, Math.min(value, MAX_PULL));
      const level = getPullLevel(clamped);
      distance = clamped;
      content.style.transform = `translate3d(0, ${clamped}px, 0)`;

      const opacity = clamped <= 16 ? clamped / 16 : 1;
      indicator.style.opacity = String(refreshing ? 1 : Math.max(0, Math.min(1, opacity)));
      indicator.dataset.level = level;
      if (!refreshing) label.textContent = getPullLabel(level);

      let scale: number;
      if (clamped < 8) scale = 0.62;
      else if (clamped <= SOFT_THRESHOLD) {
        const p = clamped / SOFT_THRESHOLD;
        scale = 0.62 + p * 0.38 + (p > 0.9 ? (p - 0.9) * 0.4 : 0);
      } else if (clamped <= HARD_THRESHOLD) {
        const p = (clamped - SOFT_THRESHOLD) / (HARD_THRESHOLD - SOFT_THRESHOLD);
        scale = 1 + p * 0.06;
      } else {
        const p = (clamped - HARD_THRESHOLD) / (MAX_PULL - HARD_THRESHOLD);
        scale = 1.06 + p * 0.04;
      }
      card.style.transform = `scale(${Math.min(1.1, scale)})`;
      card.style.opacity = String(clamped < 4 ? 0 : 1);

      if (clamped < SOFT_THRESHOLD) {
        const progress = clamped / SOFT_THRESHOLD;
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
      } else {
        ring.style.strokeDashoffset = '0';
      }

      const softProgress = Math.min(1, clamped / SOFT_THRESHOLD);
      const hardProgress = Math.max(0, Math.min(1, (clamped - SOFT_THRESHOLD) / (HARD_THRESHOLD - SOFT_THRESHOLD)));
      const rotation = softProgress * 220 + hardProgress * 160;
      orbit.style.transform = `rotate(${rotation}deg)`;

      if (!refreshing) {
        root.classList.toggle('is-soft', level === 'soft');
        root.classList.toggle('is-hard', level === 'hard');
        root.classList.toggle('is-ready', level === 'soft' || level === 'hard');
      }
    };

    const settleTo = (target: number) => {
      clearSettle();
      root.classList.add('ptr-settling');
      settleFrame = requestAnimationFrame(() => {
        settleFrame = undefined;
        applyPullVisuals(target);
      });
      settleTimer = window.setTimeout(() => {
        root.classList.remove('ptr-settling');
        settleTimer = undefined;
      }, SETTLE_MS);
    };

    const reset = () => {
      root.removeEventListener('touchmove', onTouchMove);
      root.classList.remove('is-soft', 'is-hard', 'is-ready');
      indicator.dataset.level = 'idle';
      label.textContent = getPullLabel('idle');
      settleTo(0);
    };

    const finishRefresh = () => {
      refreshing = false;
      root.classList.remove('is-refreshing', 'is-hard-refreshing', 'is-soft-refreshing');
      reset();
    };

    const scheduleRefreshFinish = () => {
      if (disposed) return;
      refreshTimer = window.setTimeout(finishRefresh, REFRESH_HOLD_MS);
    };

    const beginRefresh = (level: 'soft' | 'hard') => {
      refreshing = true;
      label.textContent = level === 'hard' ? 'Đang tải lại ứng dụng…' : 'Đang làm mới…';
      root.classList.remove('is-soft', 'is-hard', 'is-ready', 'is-soft-refreshing', 'is-hard-refreshing');
      root.classList.add(`is-${level}`, 'is-refreshing', `is-${level}-refreshing`);
      settleTo(level === 'hard' ? HARD_THRESHOLD : SOFT_THRESHOLD);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshing || event.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      const scroller = getNearestScrollable(event.target, root);
      if (scroller && scroller.scrollTop > 0) return;
      clearSettle();
      root.classList.remove('ptr-settling');
      startY = event.touches[0].clientY;
      pulling = true;
      distance = 0;
      root.addEventListener('touchmove', onTouchMove, { passive: false });
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pulling || refreshing || event.touches.length !== 1) return;
      if (window.scrollY > 0) {
        pulling = false;
        reset();
        return;
      }
      const dy = event.touches[0].clientY - startY;
      if (dy <= 0) {
        pulling = false;
        reset();
        return;
      }
      event.preventDefault();
      applyPullVisuals(Math.min(dy * RESISTANCE, MAX_PULL));
    };

    const finish = () => {
      if (!pulling) return;
      pulling = false;
      root.removeEventListener('touchmove', onTouchMove);

      if (distance >= HARD_THRESHOLD) {
        beginRefresh('hard');
        if (!handleHard) {
          scheduleRefreshFinish();
          return;
        }
        try {
          const result = handleHard();
          if (result) void result.then(scheduleRefreshFinish, scheduleRefreshFinish);
        } catch {
          scheduleRefreshFinish();
        }
        return;
      }

      if (distance >= SOFT_THRESHOLD) {
        beginRefresh('soft');
        try {
          const result = handleSoft?.();
          if (result) void result.then(scheduleRefreshFinish, scheduleRefreshFinish);
          else scheduleRefreshFinish();
        } catch {
          scheduleRefreshFinish();
        }
        return;
      }

      reset();
    };

    const onTouchEnd = () => finish();
    const onTouchCancel = () => {
      pulling = false;
      reset();
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    root.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      disposed = true;
      clearSettle();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [handleHard, handleSoft]);

  return (
    <div className="ptr-root" ref={rootRef}>
      <div
        className="ptr-indicator"
        data-level="idle"
        style={{ height: MAX_PULL, opacity: 0 }}
        aria-hidden="true"
      >
        <div className="ptr-card" style={{ transform: 'scale(0.62)', opacity: 0 }}>
          <div className="ptr-orbit-motion" style={{ transform: 'rotate(0deg)' }}>
            <svg className="ptr-ring" viewBox="0 0 42 42" width="42" height="42" aria-hidden="true">
              <circle className="ptr-ring-bg" cx="21" cy="21" r={RING_RADIUS} fill="none" strokeWidth={1.8} />
              <circle
                className="ptr-ring-progress"
                cx="21"
                cy="21"
                r={RING_RADIUS}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                style={{ strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: RING_CIRCUMFERENCE }}
              />
            </svg>
          </div>
          <div className="ptr-sprout-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
              <path d="M12 19V9" />
              <path d="M12 13C7.8 13 5.5 10.6 5.5 7.2C9.5 7 12 9 12 13Z" />
              <path d="M12 12C16.1 12 18.5 9.7 18.5 6.4C14.5 6.2 12 8.2 12 12Z" />
            </svg>
          </div>
        </div>
        <span className="ptr-label">Kéo để làm mới</span>
      </div>
      <div className="ptr-content">
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
