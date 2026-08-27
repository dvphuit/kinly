import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  FastForward,
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

const CONTROL_HIDE_DELAY_MS = 2400;
const DOUBLE_TAP_DELAY_MS = 280;
const SEEK_FEEDBACK_DELAY_MS = 620;
const TAP_CENTER_START = 0.34;
const TAP_CENTER_END = 0.66;

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
  const lastSideTapRef = useRef<{ zone: SideTapZone; at: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedUntil, setBufferedUntil] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
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

  const handleVideoPointerUp = useCallback((event: ReactPointerEvent<HTMLVideoElement>) => {
    if (!isActive) return;
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
  }, [isActive, revealControls, seekBy, showSeekFeedback, togglePlayback]);

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
    clearHideTimer();
    clearSeekFeedbackTimer();
    lastSideTapRef.current = null;
    setDuration(0);
    setCurrentTime(0);
    setBufferedUntil(0);
    setIsPlaying(false);
    setIsMuted(false);
    setIsBuffering(false);
    setSeekFeedback(null);
    setControlsVisible(true);
  }, [clearHideTimer, clearSeekFeedbackTimer, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!isActive && video && !video.paused) video.pause();
  }, [isActive]);

  useEffect(() => () => {
    clearHideTimer();
    clearSeekFeedbackTimer();
  }, [clearHideTimer, clearSeekFeedbackTimer]);

  const playbackLabel = isPlaying ? 'Tạm dừng video' : 'Phát video';
  const playedPercent = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const bufferedPercent = duration > 0 ? Math.max(playedPercent, Math.min(100, (bufferedUntil / duration) * 100)) : 0;
  const scrubberStyle = {
    '--moment-video-played': `${playedPercent}%`,
    '--moment-video-buffered': `${bufferedPercent}%`,
  } as CSSProperties;

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
        style={{ borderRadius: 0 }}
        onPointerUp={handleVideoPointerUp}
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
          setIsPlaying(false);
          setIsBuffering(false);
          revealControls(false);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setIsBuffering(false);
          syncTiming();
          revealControls(false);
        }}
        onVolumeChange={() => setIsMuted(Boolean(videoRef.current?.muted))}
        onError={() => {
          setIsBuffering(false);
          onError?.();
        }}
      />

      {isActive && (
        <>
          {isBuffering && (
            <div className="moment-video-buffering" role="status" aria-label="Đang tải video" />
          )}

          {seekFeedback && (
            <div
              className={`moment-video-gesture-feedback ${seekFeedback}`}
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

          <div className="moment-video-controls" data-media-controls="true">
            <div className="moment-video-scrubber-wrap" style={scrubberStyle}>
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
            </div>

            <div className="moment-video-control-row">
              <div className="moment-video-control-group">
                <button type="button" aria-label={playbackLabel} onClick={togglePlayback}>
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <button type="button" aria-label="Lùi 10 giây" onClick={() => seekBy(-10)}>
                  <Rewind size={19} />
                </button>
                <button type="button" aria-label="Tới 10 giây" onClick={() => seekBy(10)}>
                  <FastForward size={19} />
                </button>
                <span className="moment-video-time" aria-live="off">
                  {formatMediaTime(currentTime)} <i>/</i> {formatMediaTime(duration)}
                </span>
              </div>

              <div className="moment-video-control-group">
                <button type="button" aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'} onClick={toggleMuted}>
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <button
                  type="button"
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
