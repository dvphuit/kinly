import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

function builtWorkerAsset(prefix: 'imageCompression' | 'videoCompression'): string {
  const assetsDirectory = resolve(process.cwd(), '../dist/assets');
  const fileName = readdirSync(assetsDirectory)
    .find((candidate) => candidate.startsWith(`${prefix}.worker-`) && candidate.endsWith('.js'));
  if (!fileName) throw new Error(`Production build is missing the ${prefix} JavaScript worker.`);
  return `/assets/${fileName}`;
}

test('production build executes photo and video compression workers', async ({ page }) => {
  const imageWorkerUrl = builtWorkerAsset('imageCompression');
  const videoWorkerUrl = builtWorkerAsset('videoCompression');
  await page.goto('/');

  const result = await page.evaluate(async ({ imageWorkerUrl, videoWorkerUrl }) => {
    interface WorkerResult {
      blob: Blob;
      progress: number[];
    }

    const runWorker = (workerUrl: string, blob: Blob): Promise<WorkerResult> => new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl, { type: 'module' });
      const progress: number[] = [];
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error(`${workerUrl} timed out.`));
      }, 20_000);
      const finish = (callback: () => void) => {
        window.clearTimeout(timeout);
        worker.terminate();
        callback();
      };

      worker.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data;
        if (typeof message !== 'object' || message === null || !('type' in message)) {
          finish(() => reject(new Error(`${workerUrl} returned an invalid response.`)));
          return;
        }
        if (message.type === 'progress' && 'progress' in message && typeof message.progress === 'number') {
          progress.push(message.progress);
          return;
        }
        if (message.type === 'error' && 'error' in message && typeof message.error === 'string') {
          finish(() => reject(new Error(message.error)));
          return;
        }
        if (message.type === 'result' && 'blob' in message && message.blob instanceof Blob) {
          finish(() => resolve({ blob: message.blob, progress }));
          return;
        }
        finish(() => reject(new Error(`${workerUrl} returned an invalid response.`)));
      };
      worker.onerror = (event) => finish(() => reject(new Error(event.message)));
      worker.postMessage({ blob, preset: 'compact' });
    });

    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = 1_200;
    imageCanvas.height = 900;
    const imageContext = imageCanvas.getContext('2d');
    if (!imageContext) throw new Error('Could not create the image test canvas.');
    const pixels = imageContext.createImageData(imageCanvas.width, imageCanvas.height);
    let seed = 123_456_789;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      pixels.data[index] = seed & 255;
      pixels.data[index + 1] = (seed >>> 8) & 255;
      pixels.data[index + 2] = (seed >>> 16) & 255;
      pixels.data[index + 3] = 255;
    }
    imageContext.putImageData(pixels, 0, 0);
    const imageInput = await new Promise<Blob | null>((resolveBlob) => {
      imageCanvas.toBlob(resolveBlob, 'image/jpeg', 1);
    });
    if (!imageInput) throw new Error('Could not create the image test input.');

    const videoCanvas = document.createElement('canvas');
    videoCanvas.width = 320;
    videoCanvas.height = 240;
    const videoContext = videoCanvas.getContext('2d');
    if (!videoContext) throw new Error('Could not create the video test canvas.');
    const stream = videoCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const videoChunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) videoChunks.push(event.data);
    };
    const recordingComplete = new Promise<void>((resolveRecording) => {
      recorder.onstop = () => resolveRecording();
    });
    recorder.start();
    for (let frame = 0; frame < 24; frame += 1) {
      videoContext.fillStyle = `hsl(${frame * 15} 70% 50%)`;
      videoContext.fillRect(0, 0, videoCanvas.width, videoCanvas.height);
      videoContext.fillStyle = '#fff';
      videoContext.fillRect(frame * 10, 80, 80, 80);
      await new Promise<void>((nextFrame) => window.setTimeout(nextFrame, 20));
    }
    recorder.stop();
    await recordingComplete;
    stream.getTracks().forEach((track) => track.stop());
    const videoInput = new Blob(videoChunks, { type: recorder.mimeType });

    const image = await runWorker(imageWorkerUrl, imageInput);
    const video = await runWorker(videoWorkerUrl, videoInput);
    return {
      imageInputSize: imageInput.size,
      imageOutputSize: image.blob.size,
      imageOutputType: image.blob.type,
      imageProgress: image.progress,
      videoInputSize: videoInput.size,
      videoOutputSize: video.blob.size,
      videoOutputType: video.blob.type,
      videoProgress: video.progress,
    };
  }, { imageWorkerUrl, videoWorkerUrl });

  expect(result.imageInputSize).toBeGreaterThan(0);
  expect(result.imageOutputSize).toBeLessThan(result.imageInputSize);
  expect(result.imageOutputType).toBe('image/jpeg');
  expect(result.imageProgress.at(-1)).toBe(95);
  expect(result.videoInputSize).toBeGreaterThan(0);
  expect(result.videoOutputSize).toBeGreaterThan(0);
  expect(result.videoOutputType).toBe('video/mp4');
  expect(result.videoProgress.at(-1)).toBe(99);
});
