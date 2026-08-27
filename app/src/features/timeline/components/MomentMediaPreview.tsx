import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { animateElement, cancelElementAnimations, prefersReducedMotion } from '@/shared/lib/nativeAnimation';
import { useNativePresence } from '@/shared/hooks/useNativePresence';
import { TimelineMediaSyncBadge } from '@/features/timeline/components/TimelineMediaSyncBadge';
import { MomentVideoPlayer } from '@/features/timeline/components/MomentVideoPlayer';
import { useTimelineMediaUrl } from '@/features/timeline/hooks/useTimelineMediaUrl';
import type { TimelineMediaItem } from '@/features/timeline/domain/types';
import './moment-media-preview.css';

export type MomentMediaPreviewLoadingState =
  | { kind: 'indeterminate'; previewSrc: string | null }
  | { kind: 'determinate'; previewSrc: string | null; progress: number }
  | { kind: 'stream'; previewSrc: string | null }
  | { kind: 'error'; previewSrc: string | null; message: string };

export interface MomentMediaPreviewState {
  items: TimelineMediaItem[];
  initialIndex: number;
  title: string;
  layoutId: string;
  originSrc: string;
  getLayoutId?: (index: number, media: TimelineMediaItem) => string;
  loading?: MomentMediaPreviewLoadingState;
}

interface MomentMediaPreviewProps {
  preview: MomentMediaPreviewState | null;
  onClose: () => void;
  onMediaReady?: (media: TimelineMediaItem) => void;
  onMediaError?: (media: TimelineMediaItem) => void;
}

interface MomentMediaPreviewContentProps extends MomentMediaPreviewState {
  onClose: () => void;
  externalClosing: boolean;
  onMediaReady?: (media: TimelineMediaItem) => void;
  onMediaError?: (media: TimelineMediaItem) => void;
}

interface PointerGesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastAt: number;
  velocityX: number;
  velocityY: number;
  direction: 'horizontal' | 'vertical' | null;
}

const MEDIA_WINDOW_RADIUS = 1;
const TRACK_SETTLE_MS = 240;
const DISMISS_MS = 220;

function MomentMediaSlideAsset({
  media,
  title,
  index,
  isActive,
  isInitial,
  originSrc,
  layoutId,
  contentRef,
  loading,
  onMediaReady,
  onMediaError,
}: {
  media: TimelineMediaItem;
  title: string;
  index: number;
  isActive: boolean;
  isInitial: boolean;
  originSrc?: string;
  layoutId?: string;
  contentRef?: Ref<HTMLDivElement>;
  loading?: MomentMediaPreviewLoadingState;
  onMediaReady?: (media: TimelineMediaItem) => void;
  onMediaError?: (media: TimelineMediaItem) => void;
}) {
  const resolvedUrl = useTimelineMediaUrl(media);
  const src = resolvedUrl || media.url || (isInitial && originSrc) || '';
  const isVideo = media.type === 'video';
  const loadingLabel = `Đang tải ${isVideo ? 'video' : 'ảnh'} từ Google Drive`;
  const renderMedia = !loading || loading.kind === 'stream';
  const indeterminate = loading?.kind !== 'determinate';

  return (
    <div ref={contentRef} className={`moment-media-preview-slide-content ${loading ? 'is-loading' : ''}`}>
      {renderMedia && (isVideo ? (
        <MomentVideoPlayer
          src={src || undefined}
          isActive={isActive}
          layoutId={layoutId}
          preload={isActive ? 'metadata' : 'none'}
          ariaLabel={`${title}, video ${index + 1}`}
          onLoadedMetadata={() => onMediaReady?.(media)}
          onError={() => onMediaError?.(media)}
        />
      ) : (
        <img
          data-layout-id={isActive ? layoutId : undefined}
          data-native-transition-id={isActive ? layoutId : undefined}
          className="moment-media-preview-asset"
          src={src || undefined}
          alt={`${title}, ảnh ${index + 1}`}
          draggable={false}
          loading={isActive ? 'eager' : 'lazy'}
          decoding="async"
          style={{ borderRadius: 0 }}
        />
      ))}
      {loading && (
        <>
          {loading.previewSrc && (
            <img
              className="moment-media-preview-asset moment-media-preview-loading-thumbnail"
              src={loading.previewSrc}
              alt=""
              draggable={false}
            />
          )}
          <div className="moment-media-preview-loading" role="status" aria-live="polite">
            <div className="moment-media-preview-loading-card">
              {loading.kind === 'error' ? (
                <>
                  <span>Không thể mở video</span>
                  <strong role="alert">{loading.message}</strong>
                </>
              ) : (
                <>
                  <span>{loadingLabel}</span>
                  <div
                    className={`moment-media-preview-progress ${indeterminate ? 'is-indeterminate' : ''}`}
                    role="progressbar"
                    aria-label={loadingLabel}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={loading.kind === 'determinate' ? loading.progress : undefined}
                  >
                    <i style={loading.kind === 'determinate' ? { width: `${loading.progress}%` } : undefined} />
                  </div>
                  <strong>{loading.kind === 'determinate' ? `${loading.progress}%` : 'Đang kết nối…'}</strong>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MomentMediaSlideItem({
  media,
  title,
  index,
  isActive,
  isInitial,
  shouldMount,
  originSrc,
  layoutId,
  activeContentRef,
  loading,
  onMediaReady,
  onMediaError,
}: {
  media: TimelineMediaItem;
  title: string;
  index: number;
  isActive: boolean;
  isInitial: boolean;
  shouldMount: boolean;
  originSrc?: string;
  layoutId?: string;
  activeContentRef: Ref<HTMLDivElement>;
  loading?: MomentMediaPreviewLoadingState;
  onMediaReady?: (media: TimelineMediaItem) => void;
  onMediaError?: (media: TimelineMediaItem) => void;
}) {
  return (
    <div
      className={`moment-media-preview-slide ${isActive ? 'is-active' : ''}`}
      data-media-mounted={shouldMount ? 'true' : 'false'}
    >
      {shouldMount && (
        <MomentMediaSlideAsset
          media={media}
          title={title}
          index={index}
          isActive={isActive}
          isInitial={isInitial}
          originSrc={originSrc}
          layoutId={layoutId}
          contentRef={isActive ? activeContentRef : undefined}
          loading={isActive ? loading : undefined}
          onMediaReady={isActive ? onMediaReady : undefined}
          onMediaError={isActive ? onMediaError : undefined}
        />
      )}
    </div>
  );
}

function MomentMediaPreviewContent({
  items,
  initialIndex,
  title,
  layoutId,
  originSrc,
  getLayoutId,
  onClose,
  externalClosing,
  loading,
  onMediaReady,
  onMediaError,
}: MomentMediaPreviewContentProps) {
  const safeInitialIndex = Math.max(0, Math.min(items.length - 1, initialIndex));
  const [activeIndex, setActiveIndex] = useState(safeInitialIndex);
  const [localClosing, setLocalClosing] = useState(false);
  const activeIndexRef = useRef(safeInitialIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const activeContentRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<PointerGesture | null>(null);
  const trackXRef = useRef(0);
  const closingRef = useRef(false);

  const stageWidth = useCallback(
    () => stageRef.current?.clientWidth || window.innerWidth || 320,
    [],
  );

  const setTrackX = useCallback((value: number, animated: boolean) => {
    trackXRef.current = value;
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animated && !prefersReducedMotion()
      ? `transform ${TRACK_SETTLE_MS}ms cubic-bezier(0.2, 0.75, 0.3, 1)`
      : 'none';
    track.style.transform = `translate3d(${value}px, 0, 0)`;
  }, []);

  const setVerticalVisuals = useCallback((offsetY: number, animated: boolean) => {
    const content = activeContentRef.current;
    const backdrop = backdropRef.current;
    const transition = animated && !prefersReducedMotion()
      ? 'transform 220ms cubic-bezier(0.2, 0.75, 0.3, 1)'
      : 'none';
    const opacityTransition = animated && !prefersReducedMotion() ? 'opacity 180ms ease-out' : 'none';
    const progress = Math.min(1, Math.max(0, offsetY) / 240);
    const scale = 1 - progress * 0.12;
    if (content) {
      content.style.transition = transition;
      content.style.transform = `translate3d(0, ${Math.max(0, offsetY)}px, 0) scale(${scale})`;
    }
    if (backdrop) {
      backdrop.style.transition = opacityTransition;
      backdrop.style.opacity = String(1 - progress * 0.75);
    }
  }, []);

  const goTo = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(items.length - 1, index));
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    setTrackX(-nextIndex * stageWidth(), true);
    requestAnimationFrame(() => setVerticalVisuals(0, false));
  }, [items.length, setTrackX, setVerticalVisuals, stageWidth]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLocalClosing(true);
    void animateElement(
      rootRef.current,
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 180, easing: 'ease-out', fill: 'both' },
    ).then(onClose);
  }, [onClose]);

  const dismissDown = useCallback((offsetY: number) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLocalClosing(true);
    const distance = Math.max(window.innerHeight, stageRef.current?.clientHeight ?? 0) + 120;
    void Promise.all([
      animateElement(
        activeContentRef.current,
        [
          { transform: `translate3d(0, ${Math.max(0, offsetY)}px, 0) scale(0.94)` },
          { transform: `translate3d(0, ${distance}px, 0) scale(0.88)` },
        ],
        { duration: DISMISS_MS, easing: 'cubic-bezier(0.32, 0, 0.67, 0)', fill: 'both' },
      ),
      animateElement(
        backdropRef.current,
        [{ opacity: backdropRef.current?.style.opacity || '1' }, { opacity: 0 }],
        { duration: DISMISS_MS, easing: 'ease-out', fill: 'both' },
      ),
    ]).then(onClose);
  }, [onClose]);

  useLayoutEffect(() => {
    setTrackX(-safeInitialIndex * stageWidth(), false);
    const handleResize = () => setTrackX(-activeIndexRef.current * stageWidth(), false);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [safeInitialIndex, setTrackX, stageWidth]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const interactiveControl = target?.closest('button, input, video, [data-media-controls]');
      if (event.key === 'Escape') requestClose();
      if (interactiveControl) return;
      if (event.key === 'ArrowRight' && activeIndexRef.current < items.length - 1) goTo(activeIndexRef.current + 1);
      if (event.key === 'ArrowLeft' && activeIndexRef.current > 0) goTo(activeIndexRef.current - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [goTo, items.length, requestClose]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (closingRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, video, [data-media-controls]')) return;
    cancelElementAnimations(activeContentRef.current);
    cancelElementAnimations(backdropRef.current);
    if (trackRef.current) trackRef.current.style.transition = 'none';
    if (activeContentRef.current) activeContentRef.current.style.transition = 'none';
    if (backdropRef.current) backdropRef.current.style.transition = 'none';
    const now = performance.now();
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastAt: now,
      velocityX: 0,
      velocityY: 0,
      direction: null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastAt);
    gesture.velocityX = ((event.clientX - gesture.lastX) / elapsed) * 1000;
    gesture.velocityY = ((event.clientY - gesture.lastY) / elapsed) * 1000;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    gesture.lastAt = now;

    const offsetX = event.clientX - gesture.startX;
    const offsetY = event.clientY - gesture.startY;
    if (!gesture.direction && (Math.abs(offsetX) > 6 || Math.abs(offsetY) > 6)) {
      if (Math.abs(offsetX) >= Math.abs(offsetY)) gesture.direction = 'horizontal';
      else if (offsetY > 0) gesture.direction = 'vertical';
    }

    if (gesture.direction === 'horizontal') {
      let resistedOffset = offsetX;
      if ((activeIndexRef.current === 0 && offsetX > 0)
        || (activeIndexRef.current === items.length - 1 && offsetX < 0)) {
        resistedOffset *= 0.35;
      }
      setTrackX(-activeIndexRef.current * stageWidth() + resistedOffset, false);
    } else if (gesture.direction === 'vertical') {
      setVerticalVisuals(Math.max(0, offsetY), false);
    }
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const offsetX = event.clientX - gesture.startX;
    const offsetY = event.clientY - gesture.startY;
    if (!cancelled && gesture.direction === 'vertical'
      && (offsetY > 80 || gesture.velocityY > 350)) {
      dismissDown(offsetY);
      return;
    }

    if (!cancelled && gesture.direction === 'horizontal') {
      const width = stageWidth();
      const swipeThreshold = Math.min(width * 0.18, 60);
      let targetIndex = activeIndexRef.current;
      if ((offsetX < -swipeThreshold || gesture.velocityX < -220) && targetIndex < items.length - 1) targetIndex += 1;
      else if ((offsetX > swipeThreshold || gesture.velocityX > 220) && targetIndex > 0) targetIndex -= 1;
      activeIndexRef.current = targetIndex;
      setActiveIndex(targetIndex);
      setTrackX(-targetIndex * width, true);
    } else {
      setTrackX(-activeIndexRef.current * stageWidth(), true);
    }
    setVerticalVisuals(0, true);
  };

  const activeMedia = items[activeIndex] ?? items[0];
  const closing = localClosing || externalClosing;

  return (
    <div
      ref={rootRef}
      className={`moment-media-preview-page ${closing ? 'native-closing' : 'native-open'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Xem media ${title}`}
      aria-hidden={externalClosing ? true : undefined}
    >
      <button
        ref={backdropRef}
        type="button"
        className="moment-media-preview-backdrop"
        aria-label="Đóng xem media"
        onClick={requestClose}
      />
      <section className="moment-media-preview-frame">
        <header className="moment-media-preview-header">
          <div>
            <strong>{title}</strong>
            <span>{activeIndex + 1} / {items.length}</span>
          </div>
          <button type="button" aria-label="Đóng preview" onClick={requestClose}>
            <X size={19} />
          </button>
        </header>

        <div
          className="moment-media-preview-stage"
          ref={stageRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishPointer(event)}
          onPointerCancel={(event) => finishPointer(event, true)}
        >
          <div ref={trackRef} className="moment-media-preview-track">
            {items.map((media, index) => {
              const isActive = index === activeIndex;
              const shouldMount = Math.abs(index - activeIndex) <= MEDIA_WINDOW_RADIUS;
              return (
                <MomentMediaSlideItem
                  key={media.id ?? media.blobId ?? index}
                  media={media}
                  title={title}
                  index={index}
                  isActive={isActive}
                  isInitial={index === safeInitialIndex}
                  shouldMount={shouldMount}
                  originSrc={originSrc}
                  layoutId={index === safeInitialIndex ? layoutId : getLayoutId?.(index, media)}
                  activeContentRef={activeContentRef}
                  loading={loading}
                  onMediaReady={onMediaReady}
                  onMediaError={onMediaError}
                />
              );
            })}
          </div>

          {items.length > 1 && (
            <>
              {activeIndex > 0 && (
                <button
                  type="button"
                  className="moment-media-preview-nav prev"
                  aria-label="Media trước"
                  onClick={(event) => {
                    event.stopPropagation();
                    goTo(activeIndexRef.current - 1);
                  }}
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              {activeIndex < items.length - 1 && (
                <button
                  type="button"
                  className="moment-media-preview-nav next"
                  aria-label="Media kế tiếp"
                  onClick={(event) => {
                    event.stopPropagation();
                    goTo(activeIndexRef.current + 1);
                  }}
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </>
          )}
        </div>

        <footer className="moment-media-preview-footer">
          <TimelineMediaSyncBadge media={activeMedia} className="in-preview" />
          <div className="moment-media-preview-indicator" aria-label={`Media ${activeIndex + 1} trên ${items.length}`}>
            {items.length <= 9 ? items.map((media, index) => (
              <button
                type="button"
                key={media.id ?? media.blobId ?? media.driveFileId ?? `${media.url}-${index}`}
                className={index === activeIndex ? 'is-active' : ''}
                aria-label={`Xem media ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => goTo(index)}
              />
            )) : <span>{activeIndex + 1} / {items.length}</span>}
          </div>
        </footer>
      </section>
    </div>
  );
}

export function MomentMediaPreview({ preview, onClose, onMediaReady, onMediaError }: MomentMediaPreviewProps) {
  const lastPreviewRef = useRef<MomentMediaPreviewState | null>(preview);
  if (preview) lastPreviewRef.current = preview;
  const presence = useNativePresence(Boolean(preview), DISMISS_MS);
  const renderedPreview = preview ?? lastPreviewRef.current;

  if (typeof document === 'undefined' || !presence.mounted || !renderedPreview || renderedPreview.items.length === 0) return null;

  return createPortal(
    <MomentMediaPreviewContent
      key={renderedPreview.layoutId}
      {...renderedPreview}
      externalClosing={presence.phase === 'closing'}
      onClose={onClose}
      onMediaReady={onMediaReady}
      onMediaError={onMediaError}
    />,
    document.body,
  );
}
