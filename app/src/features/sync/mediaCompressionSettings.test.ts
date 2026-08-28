import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_COMPRESSION_SETTINGS,
  MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY,
  getMediaCompressionSettings,
  parseMediaCompressionSettings,
  setMediaCompressionPreset,
} from './mediaCompressionSettings';

describe('media compression settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the existing balanced compression behavior as the default', () => {
    expect(getMediaCompressionSettings()).toEqual(DEFAULT_MEDIA_COMPRESSION_SETTINGS);
    expect(DEFAULT_MEDIA_COMPRESSION_SETTINGS).toEqual({ photo: 'balanced', video: 'balanced' });
  });

  it('persists photo and video presets independently on this device', () => {
    expect(setMediaCompressionPreset('photo', 'compact')).toEqual({ photo: 'compact', video: 'balanced' });
    expect(setMediaCompressionPreset('video', 'quality')).toEqual({ photo: 'compact', video: 'quality' });
    expect(getMediaCompressionSettings()).toEqual({ photo: 'compact', video: 'quality' });
  });

  it('repairs malformed stored values at the local-storage boundary', () => {
    window.localStorage.setItem(MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY, JSON.stringify({
      photo: 'quality',
      video: 'unsupported',
    }));

    expect(getMediaCompressionSettings()).toEqual({ photo: 'quality', video: 'balanced' });
    expect(parseMediaCompressionSettings(null)).toEqual(DEFAULT_MEDIA_COMPRESSION_SETTINGS);
  });

  it('falls back safely when stored JSON cannot be parsed', () => {
    window.localStorage.setItem(MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY, '{broken');
    expect(getMediaCompressionSettings()).toEqual(DEFAULT_MEDIA_COMPRESSION_SETTINGS);
  });
});
