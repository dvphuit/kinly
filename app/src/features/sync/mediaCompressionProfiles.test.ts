import { describe, expect, it } from 'vitest';
import {
  getImageCompressionProfile,
  getVideoCompressionProfile,
} from './mediaCompressionProfiles';

describe('media compression profiles', () => {
  it('keeps the balanced image preset identical to the current adaptive compressor', () => {
    expect(getImageCompressionProfile('balanced')).toEqual({
      maxDimension: 2560,
      qualityCandidates: [0.92, 0.88, 0.84, 0.8],
      maxMeanLumaError: 4,
    });
  });

  it('scales image fidelity predictably between quality and compact modes', () => {
    const quality = getImageCompressionProfile('quality');
    const balanced = getImageCompressionProfile('balanced');
    const compact = getImageCompressionProfile('compact');

    expect(quality.maxDimension).toBeGreaterThan(balanced.maxDimension);
    expect(quality.maxMeanLumaError).toBeLessThan(balanced.maxMeanLumaError);
    expect(compact.maxDimension).toBeLessThan(balanced.maxDimension);
    expect(compact.maxMeanLumaError).toBeGreaterThan(balanced.maxMeanLumaError);
  });

  it('keeps balanced video at the current 1080p high-quality setting', () => {
    expect(getVideoCompressionProfile('balanced')).toEqual({
      maxHeight: 1080,
      frameRate: 30,
      quality: 'high',
    });
    expect(getVideoCompressionProfile('quality').quality).toBe('very-high');
    expect(getVideoCompressionProfile('compact')).toEqual({
      maxHeight: 720,
      frameRate: 30,
      quality: 'medium',
    });
  });
});
