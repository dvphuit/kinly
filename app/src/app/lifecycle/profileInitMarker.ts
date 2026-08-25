const INITIALIZED_MARKER = 'kinly_initialized';

/** Check if the user has completed onboarding at least once. */
export function hasInitializedProfile(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(INITIALIZED_MARKER) === '1';
  } catch {
    return false;
  }
}

/** Called once after first profile setup to skip onboarding prefetch on future visits. */
export function markProfileInitialized(): void {
  try {
    window.localStorage.setItem(INITIALIZED_MARKER, '1');
  } catch {
    // Non-critical — onboarding prefetch is harmless overhead on next cold start.
  }
}
