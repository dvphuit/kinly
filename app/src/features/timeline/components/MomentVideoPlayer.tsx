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

const CONTROL_HIDE_DELAY_MS = 2400;

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
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
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

  const syncTiming = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
    setCurrentTime(Number.isFinite(video.currentTime) && video.currentTime > 0 ? video.currentTime : 0);
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;
    revealControls(false);
    if (video.paused || video.ended) {
      if (video.ended && Number.isFinite(video.duration)) video.currentTime = 0;
      void video.play().catch(() => setIsPlaying(false));
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
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setIsMuted(false);
    setControlsVisible(true);
  }, [clearHideTimer, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!isActive && video && !video.paused) video.pause();
  }, [isActive]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  const playbackLabel = isPlaying ? 'Tạm dừng video' : 'Phát video';

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
        onClick={togglePlayback}
        onLoadedMetadata={() => {
          syncTiming();
          onLoadedMetadata?.();
        }}
        onDurationChange={syncTiming}
        onTimeUpdate={syncTiming}
        onPlay={() => {
          setIsPlaying(true);
          revealControls(true);
        }}
        onPause={() => {
          setIsPlaying(false);
          revealControls(false);
        }}
        onEnded={() => {
          setIsPlaying(false);
          syncTiming();
          revealControls(false);
        }}
        onVolumeChange={() => setIsMuted(Boolean(videoRef.current?.muted))}
        onError={onError}
      />

      {isActive && (
        <>
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
