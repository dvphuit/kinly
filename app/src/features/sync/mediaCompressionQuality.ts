export interface ImageCompressionCandidate {
  blob: Blob;
  quality: number;
  meanLumaError: number;
}

export function selectSmallestAcceptableImageCandidate(
  candidates: readonly ImageCompressionCandidate[],
  maxMeanLumaError: number,
): ImageCompressionCandidate | null {
  let selected: ImageCompressionCandidate | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.meanLumaError) || candidate.meanLumaError > maxMeanLumaError) continue;
    if (!selected || candidate.blob.size < selected.blob.size) selected = candidate;
  }
  return selected;
}
