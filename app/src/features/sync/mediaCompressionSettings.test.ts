import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_COMPRESSION_SETTINGS,
  MEDIA_COMPRESSION_PRESETS,
  MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY,
  getMediaCompressionSettings,
  parseMediaCompressionSettings,
  setMediaInputSizeLimitMb,
  setMediaCompressionPreset,
} from './mediaCompressionSettings';

describe('media compression settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the existing balanced compression behavior as the default', () => {
    expect(getMediaCompressionSettings()).toEqual(DEFAULT_MEDIA_COMPRESSION_SETTINGS);
    expect(DEFAULT_MEDIA_COMPRESSION_SETTINGS).toEqual({
      photo: 'balanced',
      video: 'balanced',
      maxInputSizeMb: { photo: 25, video: 256 },
    });
  });

  it('offers five ordered choices from original media to the smallest upload', () => {
    expect(MEDIA_COMPRESSION_PRESETS).toEqual([
      'original',
      'quality',
      'balanced',
      'compact',
      'saver',
    ]);
  });

  it('persists photo and video presets independently on this device', () => {
    expect(setMediaCompressionPreset('photo', 'original')).toMatchObject({ photo: 'original', video: 'balanced' });
    expect(setMediaCompressionPreset('video', 'saver')).toMatchObject({ photo: 'original', video: 'saver' });
    expect(getMediaCompressionSettings()).toMatchObject({ photo: 'original', video: 'saver' });
  });

  it('persists separate maximum input sizes for photos and videos', () => {
    expect(setMediaInputSizeLimitMb('photo', 12).maxInputSizeMb).toEqual({ photo: 12, video: 256 });
    expect(setMediaInputSizeLimitMb('video', 225).maxInputSizeMb).toEqual({ photo: 12, video: 225 });
    expect(getMediaCompressionSettings().maxInputSizeMb).toEqual({ photo: 12, video: 225 });
  });

  it('repairs malformed stored values at the local-storage boundary', () => {
    window.localStorage.setItem(MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY, JSON.stringify({
      photo: 'quality',
      video: 'unsupported',
    }));

    expect(getMediaCompressionSettings()).toMatchObject({ photo: 'quality', video: 'balanced' });
    expect(getMediaCompressionSettings().maxInputSizeMb).toEqual({ photo: 25, video: 256 });
    expect(parseMediaCompressionSettings(null)).toEqual(DEFAULT_MEDIA_COMPRESSION_SETTINGS);
  });

  it('repairs invalid input limits at the local-storage boundary', () => {
    expect(parseMediaCompressionSettings({
      photo: 'balanced',
      video: 'balanced',
      maxInputSizeMb: { photo: 0, video: 999 },
    }).maxInputSizeMb).toEqual({ photo: 25, video: 256 });
  });

  it('falls back safely when stored JSON cannot be parsed', () => {
    window.localStorage.setItem(MEDIA_COMPRESSION_SETTINGS_STORAGE_KEY, '{broken');
    expect(getMediaCompressionSettings()).toEqual(DEFAULT_MEDIA_COMPRESSION_SETTINGS);
  });
});
