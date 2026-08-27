import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MomentVideoPlayer } from '@/features/timeline/components/MomentVideoPlayer';

function renderPlayer() {
  render(
    <MomentVideoPlayer
      src="https://example.com/video.mp4"
      isActive
      layoutId="video-player-test"
      preload="metadata"
      ariaLabel="Video test"
    />,
  );
  return screen.getByLabelText('Video test') as HTMLVideoElement;
}

describe('MomentVideoPlayer', () => {
  it('shows buffering feedback while playback is waiting and hides it when playable', () => {
    const video = renderPlayer();
    Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });

    fireEvent.play(video);
    expect(screen.getByRole('status', { name: 'Đang tải video' })).toBeInTheDocument();

    fireEvent.canPlay(video);
    expect(screen.queryByRole('status', { name: 'Đang tải video' })).not.toBeInTheDocument();

    fireEvent.waiting(video);
    expect(screen.getByRole('status', { name: 'Đang tải video' })).toBeInTheDocument();

    fireEvent.playing(video);
    expect(screen.queryByRole('status', { name: 'Đang tải video' })).not.toBeInTheDocument();
  });

  it('tracks played and buffered ranges for the custom progress bar', () => {
    const video = renderPlayer();
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 25 });
    Object.defineProperty(video, 'buffered', {
      configurable: true,
      value: {
        length: 1,
        start: () => 0,
        end: () => 60,
      },
    });

    fireEvent.loadedMetadata(video);
    fireEvent.progress(video);
    fireEvent.timeUpdate(video);

    expect(screen.getByRole('slider', { name: 'Vị trí phát video' })).toHaveValue('25');
    expect(document.querySelector('.moment-video-buffered-range')).toHaveStyle({ width: '60%' });
  });

  it('uses touch zones for center play and double-tap 10-second seeking', () => {
    const video = renderPlayer();
    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 50 });
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    Object.defineProperty(video, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(video, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 300,
        bottom: 200,
        width: 300,
        height: 200,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerUp(video, { pointerType: 'touch', clientX: 20 });
    expect(video.currentTime).toBe(50);
    fireEvent.pointerUp(video, { pointerType: 'touch', clientX: 20 });
    expect(video.currentTime).toBe(40);
    expect(document.querySelector('.moment-video-gesture-feedback.rewind')).toBeInTheDocument();

    fireEvent.pointerUp(video, { pointerType: 'touch', clientX: 280 });
    fireEvent.pointerUp(video, { pointerType: 'touch', clientX: 280 });
    expect(video.currentTime).toBe(50);
    expect(document.querySelector('.moment-video-gesture-feedback.forward')).toBeInTheDocument();

    fireEvent.pointerUp(video, { pointerType: 'touch', clientX: 150 });
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('temporarily boosts playback to 2x while holding and restores the previous rate on release', () => {
    vi.useFakeTimers();
    try {
      const video = renderPlayer();
      const play = vi.fn().mockResolvedValue(undefined);
      const pause = vi.fn();
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      Object.defineProperty(video, 'ended', { configurable: true, value: false });
      Object.defineProperty(video, 'play', { configurable: true, value: play });
      Object.defineProperty(video, 'pause', { configurable: true, value: pause });
      video.playbackRate = 1.25;

      fireEvent.pointerDown(video, {
        pointerType: 'touch', pointerId: 7, button: 0, clientX: 150, clientY: 100,
      });
      act(() => vi.advanceTimersByTime(419));
      expect(video.playbackRate).toBe(1.25);
      expect(screen.queryByRole('status', { name: 'Đang phát nhanh 2 lần' })).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1));
      expect(video.playbackRate).toBe(2);
      expect(screen.getByRole('status', { name: 'Đang phát nhanh 2 lần' })).toHaveTextContent('2×');

      fireEvent.pointerUp(video, {
        pointerType: 'touch', pointerId: 7, button: 0, clientX: 150, clientY: 100,
      });
      expect(video.playbackRate).toBe(1.25);
      expect(screen.queryByRole('status', { name: 'Đang phát nhanh 2 lần' })).not.toBeInTheDocument();
      expect(play).not.toHaveBeenCalled();
      expect(pause).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels hold-to-speed when the pointer moves before the hold threshold', () => {
    vi.useFakeTimers();
    try {
      const video = renderPlayer();
      const pause = vi.fn();
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      Object.defineProperty(video, 'ended', { configurable: true, value: false });
      Object.defineProperty(video, 'pause', { configurable: true, value: pause });

      fireEvent.pointerDown(video, {
        pointerType: 'touch', pointerId: 8, button: 0, clientX: 150, clientY: 100,
      });
      fireEvent.pointerMove(video, {
        pointerType: 'touch', pointerId: 8, button: 0, clientX: 170, clientY: 100,
      });
      act(() => vi.advanceTimersByTime(500));

      expect(video.playbackRate).toBe(1);
      expect(screen.queryByRole('status', { name: 'Đang phát nhanh 2 lần' })).not.toBeInTheDocument();

      fireEvent.pointerUp(video, {
        pointerType: 'touch', pointerId: 8, button: 0, clientX: 170, clientY: 100,
      });
      expect(pause).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
