import type { QualityLevel } from 'mediabunny';
import type { CompressingMediaCompressionPreset } from './mediaCompressionSettings';

export interface ImageCompressionProfile {
  maxDimension: number;
  qualityCandidates: readonly number[];
  maxMeanLumaError: number;
}

export interface VideoCompressionProfile {
  maxHeight: number;
  frameRate: number;
  quality: QualityLevel;
}

interface MediaCompressionProfile {
  photo: ImageCompressionProfile;
  video: VideoCompressionProfile;
}

export const MEDIA_COMPRESSION_PROFILES = {
  quality: {
    photo: {
      maxDimension: 3840,
      qualityCandidates: [0.96, 0.94, 0.92, 0.9],
      maxMeanLumaError: 2.5,
    },
    video: {
      maxHeight: 1080,
      frameRate: 30,
      quality: 'very-high',
    },
  },
  balanced: {
    photo: {
      maxDimension: 2560,
      qualityCandidates: [0.92, 0.88, 0.84, 0.8],
      maxMeanLumaError: 4,
    },
    video: {
      maxHeight: 1080,
      frameRate: 30,
      quality: 'high',
    },
  },
  compact: {
    photo: {
      maxDimension: 2048,
      qualityCandidates: [0.86, 0.82, 0.78, 0.74],
      maxMeanLumaError: 6,
    },
    video: {
      maxHeight: 720,
      frameRate: 30,
      quality: 'medium',
    },
  },
  saver: {
    photo: {
      maxDimension: 1280,
      qualityCandidates: [0.8, 0.74, 0.68, 0.62],
      maxMeanLumaError: 9,
    },
    video: {
      maxHeight: 480,
      frameRate: 24,
      quality: 'low',
    },
  },
} as const satisfies Record<CompressingMediaCompressionPreset, MediaCompressionProfile>;

export function getImageCompressionProfile(preset: CompressingMediaCompressionPreset): ImageCompressionProfile {
  return MEDIA_COMPRESSION_PROFILES[preset].photo;
}

export function getVideoCompressionProfile(preset: CompressingMediaCompressionPreset): VideoCompressionProfile {
  return MEDIA_COMPRESSION_PROFILES[preset].video;
}
