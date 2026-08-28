import { describe, expect, it, vi } from 'vitest';
import { recoverFromPreloadError, type PreloadRecoveryRuntime } from './preloadErrorRecovery';

function createRuntime(overrides: Partial<PreloadRecoveryRuntime> = {}): PreloadRecoveryRuntime {
  return {
    isOnline: () => true,
    now: () => 100_000,
    readLastRecovery: () => null,
    rememberRecovery: () => true,
    reload: vi.fn(),
    ...overrides,
  };
}

describe('preload error recovery', () => {
  it('reloads once for an online stale chunk failure', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as Event;
    const reload = vi.fn();
    const rememberRecovery = vi.fn().mockReturnValue(true);
    const runtime = createRuntime({ reload, rememberRecovery });

    expect(recoverFromPreloadError(event, runtime)).toBe(true);
    expect(rememberRecovery).toHaveBeenCalledWith(100_000);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not loop reloads while the recovery cooldown is active', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as Event;
    const reload = vi.fn();
    const runtime = createRuntime({ readLastRecovery: () => 90_000, reload });

    expect(recoverFromPreloadError(event, runtime)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves offline failures to the app error boundary', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as Event;
    const reload = vi.fn();
    const runtime = createRuntime({ isOnline: () => false, reload });

    expect(recoverFromPreloadError(event, runtime)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when session recovery state cannot be persisted', () => {
    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as Event;
    const reload = vi.fn();
    const runtime = createRuntime({ rememberRecovery: () => false, reload });

    expect(recoverFromPreloadError(event, runtime)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
