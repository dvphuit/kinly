export const MEDIA_COMPRESSION_PRESETS = ['quality', 'balanced', 'compact'] as const;

export type MediaCompressionPreset = (typeof MEDIA_COMPRESSION_PRESETS)[number];
export type MediaCompressionKind = 'photo' | 'video';

export interface MediaCompressionSettings {
  photo: MediaCompressionPreset;
  video: MediaCompressionPreset;
}

export const MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY = 'kinly_media_compression_settings_v1';

export const DEFAULT_MEDIA_COMPRESSION_SETTINGS: MediaCompressionSettings = {
  photo: 'balanced',
  video: 'balanced',
};

function isMediaCompressionPreset(value: unknown): value is MediaCompressionPreset {
  return typeof value === 'string'
    && MEDIA_COMPRESSION_PRESETS.some((preset) => preset === value);
}

export function parseMediaCompressionSettings(value: unknown): MediaCompressionSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_MEDIA_COMPRESSION_SETTINGS };

  const photo = 'photo' in value ? value.photo : undefined;
  const video = 'video' in value ? value.video : undefined;
  return {
    photo: isMediaCompressionPreset(photo) ? photo : DEFAULT_MEDIA_COMPRESSION_SETTINGS.photo,
    video: isMediaCompressionPreset(video) ? video : DEFAULT_MEDIA_COMPRESSION_SETTINGS.video,
  };
}

export function getMediaCompressionSettings(): MediaCompressionSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_MEDIA_COMPRESSION_SETTINGS };
  try {
    const raw = window.localStorage.getItem(MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MEDIA_COMPRESSION_SETTINGS };
    return parseMediaCompressionSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MEDIA_COMPRESSION_SETTINGS };
  }
}

export function setMediaCompressionPreset(
  kind: MediaCompressionKind,
  preset: MediaCompressionPreset,
): MediaCompressionSettings {
  const current = getMediaCompressionSettings();
  const next: MediaCompressionSettings = kind === 'photo'
    ? { ...current, photo: preset }
    : { ...current, video: preset };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the in-memory selection usable when browser storage is unavailable.
    }
  }
  return next;
}
