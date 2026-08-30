export const MEDIA_COMPRESSING_PRESETS = ['quality', 'balanced', 'compact', 'saver'] as const;
export const MEDIA_COMPRESSION_PRESETS = ['original', 'quality', 'balanced', 'compact', 'saver'] as const;

export type MediaCompressionPreset = (typeof MEDIA_COMPRESSION_PRESETS)[number];
export type CompressingMediaCompressionPreset = (typeof MEDIA_COMPRESSING_PRESETS)[number];
export type MediaCompressionKind = 'photo' | 'video';

export const MEDIA_INPUT_SIZE_LIMIT_RANGES_MB = {
  photo: { min: 1, max: 100 },
  video: { min: 8, max: 256 },
} as const satisfies Record<MediaCompressionKind, { min: number; max: number }>;

export interface MediaCompressionSettings {
  photo: MediaCompressionPreset;
  video: MediaCompressionPreset;
  maxInputSizeMb: Record<MediaCompressionKind, number>;
}

export const MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY = 'kinly_media_compression_settings_v1';

export const DEFAULT_MEDIA_COMPRESSION_SETTINGS: MediaCompressionSettings = {
  photo: 'balanced',
  video: 'balanced',
  maxInputSizeMb: { photo: 25, video: 256 },
};

function defaultMediaCompressionSettings(): MediaCompressionSettings {
  return {
    ...DEFAULT_MEDIA_COMPRESSION_SETTINGS,
    maxInputSizeMb: { ...DEFAULT_MEDIA_COMPRESSION_SETTINGS.maxInputSizeMb },
  };
}

function isMediaCompressionPreset(value: unknown): value is MediaCompressionPreset {
  return typeof value === 'string'
    && MEDIA_COMPRESSION_PRESETS.some((preset) => preset === value);
}

export function parseMediaCompressionSettings(value: unknown): MediaCompressionSettings {
  if (typeof value !== 'object' || value === null) return defaultMediaCompressionSettings();

  const photo = 'photo' in value ? value.photo : undefined;
  const video = 'video' in value ? value.video : undefined;
  const storedLimits = 'maxInputSizeMb' in value ? value.maxInputSizeMb : undefined;
  const photoLimit = typeof storedLimits === 'object' && storedLimits !== null && 'photo' in storedLimits
    ? storedLimits.photo
    : undefined;
  const videoLimit = typeof storedLimits === 'object' && storedLimits !== null && 'video' in storedLimits
    ? storedLimits.video
    : undefined;
  return {
    photo: isMediaCompressionPreset(photo) ? photo : DEFAULT_MEDIA_COMPRESSION_SETTINGS.photo,
    video: isMediaCompressionPreset(video) ? video : DEFAULT_MEDIA_COMPRESSION_SETTINGS.video,
    maxInputSizeMb: {
      photo: isValidMediaInputSizeLimitMb('photo', photoLimit)
        ? photoLimit
        : DEFAULT_MEDIA_COMPRESSION_SETTINGS.maxInputSizeMb.photo,
      video: isValidMediaInputSizeLimitMb('video', videoLimit)
        ? videoLimit
        : DEFAULT_MEDIA_COMPRESSION_SETTINGS.maxInputSizeMb.video,
    },
  };
}

function isValidMediaInputSizeLimitMb(
  kind: MediaCompressionKind,
  value: unknown,
): value is number {
  const range = MEDIA_INPUT_SIZE_LIMIT_RANGES_MB[kind];
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= range.min
    && value <= range.max;
}

export function normalizeMediaInputSizeLimitMb(kind: MediaCompressionKind, value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MEDIA_COMPRESSION_SETTINGS.maxInputSizeMb[kind];
  const range = MEDIA_INPUT_SIZE_LIMIT_RANGES_MB[kind];
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

export function getMediaCompressionSettings(): MediaCompressionSettings {
  if (typeof window === 'undefined') return defaultMediaCompressionSettings();
  try {
    const raw = window.localStorage.getItem(MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultMediaCompressionSettings();
    return parseMediaCompressionSettings(JSON.parse(raw));
  } catch {
    return defaultMediaCompressionSettings();
  }
}

function persistMediaCompressionSettings(settings: MediaCompressionSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Keep the in-memory selection usable when browser storage is unavailable.
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

  persistMediaCompressionSettings(next);
  return next;
}

export function setMediaInputSizeLimitMb(
  kind: MediaCompressionKind,
  value: number,
): MediaCompressionSettings {
  const current = getMediaCompressionSettings();
  const next: MediaCompressionSettings = {
    ...current,
    maxInputSizeMb: {
      ...current.maxInputSizeMb,
      [kind]: normalizeMediaInputSizeLimitMb(kind, value),
    },
  };
  persistMediaCompressionSettings(next);
  return next;
}
