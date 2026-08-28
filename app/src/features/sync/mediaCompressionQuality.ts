export const IMAGE_JPEG_QUALITY_CANDIDATES = [0.92, 0.88, 0.84, 0.8] as const;
export const IMAGE_QUALITY_SAMPLE_MAX_DIMENSION = 256;
export const IMAGE_MAX_MEAN_LUMA_ERROR = 4;

export interface ImageCompressionCandidate {
  blob: Blob;
  quality: number;
  meanLumaError: number;
}

export function selectSmallestAcceptableImageCandidate(
  candidates: readonly ImageCompressionCandidate[],
  maxMeanLumaError = IMAGE_MAX_MEAN_LUMA_ERROR,
): ImageCompressionCandidate | null {
  let selected: ImageCompressionCandidate | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.meanLumaError) || candidate.meanLumaError > maxMeanLumaError) continue;
    if (!selected || candidate.blob.size < selected.blob.size) selected = candidate;
  }
  return selected;
}
