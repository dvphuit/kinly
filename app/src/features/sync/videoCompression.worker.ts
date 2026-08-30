import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from 'mediabunny';
import { getVideoCompressionProfile } from './mediaCompressionProfiles';
import type { CompressingMediaCompressionPreset } from './mediaCompressionSettings';

interface CompressionRequest {
  blob: Blob;
  preset: CompressingMediaCompressionPreset;
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
  try {
    const profile = getVideoCompressionProfile(event.data.preset);
    workerScope.postMessage({ type: 'progress', progress: 2 });
    const input = new Input({
      source: new BlobSource(event.data.blob),
      formats: ALL_FORMATS,
    });
    const primaryVideoTrack = await input.getPrimaryVideoTrack();
    if (!primaryVideoTrack) throw new Error('The media file does not contain a video track.');

    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    });
    const height = Math.min(profile.maxHeight, await primaryVideoTrack.getDisplayHeight());
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        height,
        frameRate: profile.frameRate,
        quality: new Quality(profile.quality),
      },
    });
    if (!conversion.isValid) {
      throw new Error('This browser cannot convert the video to a compatible MP4 file.');
    }

    conversion.onProgress = (progress) => {
      workerScope.postMessage({
        type: 'progress',
        progress: Math.max(2, Math.min(98, Math.round(progress * 96) + 2)),
      });
    };
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer) throw new Error('Video conversion completed without an output buffer.');
    workerScope.postMessage({ type: 'progress', progress: 99 });
    workerScope.postMessage({ type: 'result', blob: new Blob([buffer], { type: 'video/mp4' }) });
  } catch (error) {
    workerScope.postMessage({ type: 'error', error: errorMessage(error) });
  }
};
