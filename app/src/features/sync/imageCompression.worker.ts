const MAX_IMAGE_DIMENSION = 2560;
const JPEG_QUALITY = 0.85;

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

workerScope.onmessage = async (event) => {
  let bitmap: ImageBitmap | null = null;
  try {
    workerScope.postMessage({ type: 'progress', progress: 10 });
    bitmap = await createImageBitmap(event.data.blob);
    workerScope.postMessage({ type: 'progress', progress: 35 });

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Unable to create image compression canvas.');

    context.drawImage(bitmap, 0, 0, width, height);
    workerScope.postMessage({ type: 'progress', progress: 70 });
    const compressed = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    workerScope.postMessage({ type: 'progress', progress: 95 });
    workerScope.postMessage({ type: 'result', blob: compressed });
  } catch (error) {
    workerScope.postMessage({ type: 'error', error: errorMessage(error) });
  } finally {
    bitmap?.close();
  }
};
