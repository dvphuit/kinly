import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  FastForward,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Rewind,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface MomentVideoPlayerProps {
  src?: string;
  isActive: boolean;
  layoutId?: string;
  preload: 'metadata' | 'none';
  ariaLabel: string;
  onLoadedMetadata?: () => void;
  onError?: () => void;
}

type WebkitFullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

type SideTapZone = 'left' | 'right';
type SeekFeedback = 'rewind' | 'forward' | null;
type HoldGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  cancelled: boolean;
};

const CONTROL_HIDE_DELAY_MS = 2400;
const DOUBLE_TAP_DELAY_MS = 280;
const SEEK_FEEDBACK_DELAY_MS = 620;
const HOLD_SPEED_DELAY_MS = 420;
const HOLD_MOVE_TOLERANCE_PX = 14;
const HOLD_PLAYBACK_RATE = 2;
const TAP_CENTER_START = 0.34;
const TAP_CENTER_END = 0.66;

const BUFFERING_STYLE: CSSProperties = {
  position: 'absolute', zIndex: 4, left: '50%', top: '50%', width: 44, height: 44,
  transform: 'translate(-50%, -50%)', borderRadius: '50%', background: 'rgba(20,15,12,0.5)',
  display: 'grid', placeItems: 'center', pointerEvents: 'none',
};
const GESTURE_STYLE: CSSProperties = {
  position: 'absolute', zIndex: 4, top: '50%', minWidth: 72, height: 44, padding: '0 12px',
  transform: 'translateY(-50%)', borderRadius: 999, background: 'rgba(20,15,12,0.58)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, pointerEvents: 'none',
  font: '720 10px/1 var(--font-family-body)',
};
const SPEED_BOOST_STYLE: CSSProperties = {
  position: 'absolute', zIndex: 7, top: 'calc(18px + env(safe-area-inset-top, 0px))', left: '50%',
  minWidth: 68, height: 36, padding: '0 13px', transform: 'translateX(-50%)', borderRadius: 999,
  background: 'rgba(20,15,12,0.7)', color: '#fff', display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: 6, pointerEvents: 'none', font: '760 11px/1 var(--font-family-body)',
  backdropFilter: 'blur(10px)',
};
const BUFFER_TRACK_STYLE: CSSProperties = {
  height: 2, overflow: 'hidden', borderRadius: 999, background: 'rgba(255,255,255,0.2)',
};
const CONTROL_ROW_STYLE: CSSProperties = { minHeight: 44 };
const CONTROL_GROUP_STYLE: CSSProperties = { gap: 2 };
const CONTROL_BUTTON_STYLE: CSSProperties = { width: 44, height: 44 };

function formatMediaTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function MomentVideoPlayer({
  src,
  isActive,
  layoutId,
  preload,
  ariaLabel,
  onLoadedMetadata,
  onError,
}: MomentVideoPlayerProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const lastSideTapRef = useRef<{ zone: SideTapZone; at: number } | null>(null);
  const holdGestureRef = useRef<HoldGesture | null>(null);
  const playbackRateBeforeBoostRef = useRef(1);
  const speedBoostedRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedUntil, setBufferedUntil] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isSpeedBoosted, setIsSpeedBoosted] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<SeekFeedback>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const clearSeekFeedbackTimer = useCallback(() => {
    if (seekFeedbackTimerRef.current === null) return;
    window.clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = null;
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const restorePlaybackRate = useCallback(() => {
    const video = videoRef.current;
    if (speedBoostedRef.current && video) video.playbackRate = playbackRateBeforeBoostRef.current;
    speedBoostedRef.current = false;
  }, []);

  const stopSpeedBoost = useCallback(() => {
    clearHoldTimer();
    restorePlaybackRate();
    setIsSpeedBoosted(false);
  }, [clearHoldTimer, restorePlaybackRate]);

  const revealControls = useCallback((scheduleHide = isPlaying) => {
    clearHideTimer();
    setControlsVisible(true);
    if (!scheduleHide) return;
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      hideTimerRef.current = null;
    }, CONTROL_HIDE_DELAY_MS);
  }, [clearHideTimer, isPlaying]);

  const showSeekFeedback = useCallback((feedback: Exclude<SeekFeedback, null>) => {
    clearSeekFeedbackTimer();
    setSeekFeedback(feedback);
    seekFeedbackTimerRef.current = window.setTimeout(() => {
      setSeekFeedback(null);
      seekFeedbackTimerRef.current = null;
    }, SEEK_FEEDBACK_DELAY_MS);
  }, [clearSeekFeedbackTimer]);

  const syncTiming = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
    setCurrentTime(Number.isFinite(video.currentTime) && video.currentTime > 0 ? video.currentTime : 0);
  }, []);

  const syncBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0 || video.buffered.length === 0) {
      setBufferedUntil(0);
      return;
    }
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    setBufferedUntil(Number.isFinite(bufferedEnd) ? Math.max(0, Math.min(video.duration, bufferedEnd)) : 0);
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;
    revealControls(false);
    if (video.paused || video.ended) {
      if (video.ended && Number.isFinite(video.duration)) video.currentTime = 0;
      void video.play().catch(() => {
        setIsPlaying(false);
        setIsBuffering(false);
      });
      return;
    }
    video.pause();
  }, [isActive, revealControls]);

  const seekTo = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
    const nextTime = Math.max(0, Math.min(max || 0, value));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    revealControls();
  }, [duration, revealControls]);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    seekTo((Number.isFinite(video.currentTime) ? video.currentTime : 0) + seconds);
  }, [seekTo]);

  const handleVideoPointerDown = useCallback((event: ReactPointerEvent<HTMLVideoElement>) => {
    if (!isActive || event.button !== 0) return;
    clearHoldTimer();
    holdGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cancelled: false,
    };
    revealControls();

    const video = videoRef.current;
    if (!video || video.paused || video.ended) return;
    const pointerId = event.pointerId;
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      const currentVideo = videoRef.current;
      const gesture = holdGestureRef.current;
      if (!currentVideo || !gesture || gesture.pointerId !== pointerId || gesture.cancelled || currentVideo.paused || currentVideo.ended) return;
      playbackRateBeforeBoostRef.current = currentVideo.playbackRate;
      currentVideo.playbackRate = HOLD_PLAYBACK_RATE;
      speedBoostedRef.current = true;
      lastSideTapRef.current = null;
      setIsSpeedBoosted(true);
    }, HOLD_SPEED_DELAY_MS);
  }, [clearHoldTimer, isActive, revealControls]);

  const handleVideoPointerMove = useCallback((event: ReactPointerEvent<HTMLVideoElement>) => {
    const gesture = holdGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled || speedBoostedRef.current) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) <= HOLD_MOVE_TOLERANCE_PX) return;
    gesture.cancelled = true;
    clearHoldTimer();
  }, [clearHoldTimer]);

  const handleVideoPointerUp = useCallback((event: ReactPointerEvent<HTMLVideoElement>) => {
    if (!isActive) return;
    const gesture = holdGestureRef.current;
    const gestureMatches = gesture?.pointerId === event.pointerId;
    const wasCancelled = Boolean(gestureMatches && gesture.cancelled);
    const wasSpeedBoosted = speedBoostedRef.current;
    if (gestureMatches) holdGestureRef.current = null;
    stopSpeedBoost();

    if (wasCancelled || wasSpeedBoosted) {
      lastSideTapRef.current = null;
      return;
    }

    if (event.pointerType === 'mouse') {
      lastSideTapRef.current = null;
      togglePlayback();
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) {
      togglePlayback();
      return;
    }

    const tapPosition = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    if (tapPosition >= TAP_CENTER_START && tapPosition <= TAP_CENTER_END) {
      lastSideTapRef.current = null;
      togglePlayback();
      return;
    }

    const zone: SideTapZone = tapPosition < TAP_CENTER_START ? 'left' : 'right';
    const now = Date.now();
    const previousTap = lastSideTapRef.current;
    if (previousTap?.zone === zone && now - previousTap.at <= DOUBLE_TAP_DELAY_MS) {
      lastSideTapRef.current = null;
      const seconds = zone === 'left' ? -10 : 10;
      seekBy(seconds);
      showSeekFeedback(zone === 'left' ? 'rewind' : 'forward');
      return;
    }

    lastSideTapRef.current = { zone, at: now };
    revealControls();
  }, [isActive, revealControls, seekBy, showSeekFeedback, stopSpeedBoost, togglePlayback]);

  const handleVideoPointerCancel = useCallback((event: ReactPointerEvent<HTMLVideoElement>) => {
    if (holdGestureRef.current?.pointerId !== event.pointerId) return;
    holdGestureRef.current = null;
    lastSideTapRef.current = null;
    stopSpeedBoost();
  }, [stopSpeedBoost]);

  const toggleMuted = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    revealControls();
  }, [revealControls]);

  const toggleFullscreen = useCallback(async () => {
    const player = playerRef.current;
    const video = videoRef.current;
    if (!player || !video) return;
    revealControls(false);
    try {
      if (document.fullscreenElement === player) {
        await document.exitFullscreen?.();
        return;
      }
      if (player.requestFullscreen) {
        await player.requestFullscreen();
        return;
      }
      (video as WebkitFullscreenVideo).webkitEnterFullscreen?.();
    } catch {
      // Fullscreen can be rejected by the browser; keep playback usable.
    }
  }, [revealControls]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
      revealControls(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [revealControls]);

  useEffect(() => {
    stopSpeedBoost();
    clearHideTimer();
    clearSeekFeedbackTimer();
    holdGestureRef.current = null;
    lastSideTapRef.current = null;
    setDuration(0);
    setCurrentTime(0);
    setBufferedUntil(0);
    setIsPlaying(false);
    setIsMuted(false);
    setIsBuffering(false);
    setSeekFeedback(null);
    setControlsVisible(true);
  }, [clearHideTimer, clearSeekFeedbackTimer, src, stopSpeedBoost]);

  useEffect(() => {
    const video = videoRef.current;
    if (!isActive && video) {
      holdGestureRef.current = null;
      stopSpeedBoost();
      if (!video.paused) video.pause();
    }
  }, [isActive, stopSpeedBoost]);

  useEffect(() => () => {
    clearHideTimer();
    clearSeekFeedbackTimer();
    clearHoldTimer();
    restorePlaybackRate();
  }, [clearHideTimer, clearHoldTimer, clearSeekFeedbackTimer, restorePlaybackRate]);

  const playbackLabel = isPlaying ? 'Tạm dừng video' : 'Phát video';
  const bufferedPercent = duration > 0
    ? Math.max(0, Math.min(100, (Math.max(currentTime, bufferedUntil) / duration) * 100))
    : 0;

  return (
    <div
      ref={playerRef}
      className={`moment-video-player ${controlsVisible || !isPlaying ? 'controls-visible' : 'controls-hidden'}`}
      data-media-controls="true"
      onPointerMove={() => revealControls()}
      onPointerDown={() => revealControls()}
      onFocusCapture={() => revealControls(false)}
    >
      <video
        ref={videoRef}
        data-layout-id={isActive ? layoutId : undefined}
        data-native-transition-id={isActive ? layoutId : undefined}
        className="moment-media-preview-asset"
        src={src}
        playsInline
        preload={preload}
        aria-label={ariaLabel}
        style={{ borderRadius: 0, WebkitTouchCallout: 'none' }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handleVideoPointerDown}
        onPointerMove={handleVideoPointerMove}
        onPointerUp={handleVideoPointerUp}
        onPointerCancel={handleVideoPointerCancel}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') handleVideoPointerCancel(event);
        }}
        onLoadedMetadata={() => {
          syncTiming();
          syncBuffered();
          onLoadedMetadata?.();
        }}
        onDurationChange={() => {
          syncTiming();
          syncBuffered();
        }}
        onTimeUpdate={syncTiming}
        onProgress={syncBuffered}
        onPlay={() => {
          setIsPlaying(true);
          setIsBuffering((videoRef.current?.readyState ?? 0) < 3);
          revealControls(true);
        }}
        onPlaying={() => {
          setIsPlaying(true);
          setIsBuffering(false);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onWaiting={() => setIsBuffering(true)}
        onStalled={() => {
          if (isPlaying) setIsBuffering(true);
        }}
        onPause={() => {
          holdGestureRef.current = null;
          stopSpeedBoost();
          setIsPlaying(false);
          setIsBuffering(false);
          revealControls(false);
        }}
        onEnded={() => {
          holdGestureRef.current = null;
          stopSpeedBoost();
          setIsPlaying(false);
          setIsBuffering(false);
          syncTiming();
          revealControls(false);
        }}
        onVolumeChange={() => setIsMuted(Boolean(videoRef.current?.muted))}
        onError={() => {
          holdGestureRef.current = null;
          stopSpeedBoost();
          setIsBuffering(false);
          onError?.();
        }}
      />

      {isActive && (
        <>
          {isSpeedBoosted && (
            <div style={SPEED_BOOST_STYLE} role="status" aria-label="Đang phát nhanh 2 lần">
              <FastForward size={17} />
              <span>2×</span>
            </div>
          )}

          {isBuffering && (
            <div style={BUFFERING_STYLE} role="status" aria-label="Đang tải video">
              <LoaderCircle className="moment-video-buffering-icon" size={20} />
            </div>
          )}

          {seekFeedback && (
            <div
              className={`moment-video-gesture-feedback ${seekFeedback}`}
              style={{ ...GESTURE_STYLE, ...(seekFeedback === 'rewind' ? { left: '10%' } : { right: '10%' }) }}
              aria-hidden="true"
            >
              {seekFeedback === 'rewind' ? <Rewind size={20} /> : <FastForward size={20} />}
              <span>10 giây</span>
            </div>
          )}

          {!isPlaying && (
            <button
              type="button"
              className="moment-video-primary-play"
              aria-label={playbackLabel}
              onClick={togglePlayback}
            >
              <Play size={30} fill="currentColor" />
            </button>
          )}

          <div
            className="moment-video-controls"
            data-media-controls="true"
            style={isFullscreen ? { bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' } : undefined}
          >
            <div className="moment-video-scrubber-wrap" style={{ display: 'grid', gap: 2 }}>
              <input
                className="moment-video-scrubber"
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                disabled={duration <= 0}
                aria-label="Vị trí phát video"
                aria-valuetext={`${formatMediaTime(currentTime)} trên ${formatMediaTime(duration)}`}
                onChange={(event) => seekTo(Number(event.currentTarget.value))}
              />
              <div style={BUFFER_TRACK_STYLE} aria-hidden="true">
                <span
                  className="moment-video-buffered-range"
                  style={{ display: 'block', width: `${bufferedPercent}%`, height: '100%', background: 'rgba(255,255,255,0.5)' }}
                />
              </div>
            </div>

            <div className="moment-video-control-row" style={CONTROL_ROW_STYLE}>
              <div className="moment-video-control-group" style={CONTROL_GROUP_STYLE}>
                <button type="button" style={CONTROL_BUTTON_STYLE} aria-label={playbackLabel} onClick={togglePlayback}>
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <button type="button" style={CONTROL_BUTTON_STYLE} aria-label="Lùi 10 giây" onClick={() => seekBy(-10)}>
                  <Rewind size={19} />
                </button>
                <button type="button" style={CONTROL_BUTTON_STYLE} aria-label="Tới 10 giây" onClick={() => seekBy(10)}>
                  <FastForward size={19} />
                </button>
                <span className="moment-video-time" aria-live="off">
                  {formatMediaTime(currentTime)} <i>/</i> {formatMediaTime(duration)}
                </span>
              </div>

              <div className="moment-video-control-group" style={CONTROL_GROUP_STYLE}>
                <button type="button" style={CONTROL_BUTTON_STYLE} aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'} onClick={toggleMuted}>
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <button
                  type="button"
                  style={CONTROL_BUTTON_STYLE}
                  aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                  onClick={() => void toggleFullscreen()}
                >
                  {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
