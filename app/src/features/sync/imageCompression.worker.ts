import {
  IMAGE_JPEG_QUALITY_CANDIDATES,
  IMAGE_QUALITY_SAMPLE_MAX_DIMENSION,
  selectSmallestAcceptableImageCandidate,
  type ImageCompressionCandidate,
} from './mediaCompressionQuality';

const MAX_IMAGE_DIMENSION = 2560;

interface CompressionRequest {
  blob: Blob;
}

type CompressionResponse =
  | { type: 'progress'; progress: number }
  | { type: 'result'; blob: Blob }
  | { type: 'error'; error: string };

interface CompressionWorkerScope {
  onmessage: ((event: MessageEvent<CompressionRequest>) => void) | null;
  postMessage: (message: CompressionResponse) => void;
}

const workerScope = globalThis as unknown as CompressionWorkerScope;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function scaledDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function meanAbsoluteLumaError(reference: Uint8ClampedArray, candidate: Uint8ClampedArray): number {
  if (reference.length !== candidate.length || reference.length === 0) return Number.POSITIVE_INFINITY;
  let totalError = 0;
  let pixelCount = 0;
  for (let index = 0; index < reference.length; index += 4) {
    const referenceLuma = reference[index] * 0.2126 + reference[index + 1] * 0.7152 + reference[index + 2] * 0.0722;
    const candidateLuma = candidate[index] * 0.2126 + candidate[index + 1] * 0.7152 + candidate[index + 2] * 0.0722;
    totalError += Math.abs(referenceLuma - candidateLuma);
    pixelCount += 1;
  }
  return totalError / pixelCount;
}

function createSampleReference(bitmap: ImageBitmap): { width: number; height: number; pixels: Uint8ClampedArray } {
  const dimensions = scaledDimensions(bitmap.width, bitmap.height, IMAGE_QUALITY_SAMPLE_MAX_DIMENSION);
  const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) throw new Error('Unable to create image quality canvas.');
  context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
  return {
    ...dimensions,
    pixels: context.getImageData(0, 0, dimensions.width, dimensions.height).data,
  };
}

async function measureCandidate(
  blob: Blob,
  reference: ReturnType<typeof createSampleReference>,
): Promise<number> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(reference.width, reference.height);
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw new Error('Unable to create image comparison canvas.');
    context.drawImage(bitmap, 0, 0, reference.width, reference.height);
    const candidatePixels = context.getImageData(0, 0, reference.width, reference.height).data;
    return meanAbsoluteLumaError(reference.pixels, candidatePixels);
  } finally {
    bitmap.close();
  }
}

workerScope.onmessage = async (event) => {
  let bitmap: ImageBitmap | null = null;
  try {
    workerScope.postMessage({ type: 'progress', progress: 5 });
    bitmap = await createImageBitmap(event.data.blob);
    workerScope.postMessage({ type: 'progress', progress: 15 });

    const dimensions = scaledDimensions(bitmap.width, bitmap.height, MAX_IMAGE_DIMENSION);
    const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Unable to create image compression canvas.');
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

    const reference = createSampleReference(bitmap);
    const candidates: ImageCompressionCandidate[] = [];
    for (let index = 0; index < IMAGE_JPEG_QUALITY_CANDIDATES.length; index += 1) {
      const quality = IMAGE_JPEG_QUALITY_CANDIDATES[index];
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      const meanLumaError = await measureCandidate(blob, reference);
      candidates.push({ blob, quality, meanLumaError });
      workerScope.postMessage({
        type: 'progress',
        progress: 25 + Math.round(((index + 1) / IMAGE_JPEG_QUALITY_CANDIDATES.length) * 65),
      });
    }

    const selected = selectSmallestAcceptableImageCandidate(candidates);
    workerScope.postMessage({ type: 'progress', progress: 95 });
    workerScope.postMessage({ type: 'result', blob: selected?.blob ?? event.data.blob });
  } catch (error) {
    workerScope.postMessage({ type: 'error', error: errorMessage(error) });
  } finally {
    bitmap?.close();
  }
};
