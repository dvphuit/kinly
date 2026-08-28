import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');

describe('media compression runtime contract', () => {
  it('keeps image compression adaptive and fidelity-gated', () => {
    const worker = source('features/sync/imageCompression.worker.ts');
    const qualityPolicy = source('features/sync/mediaCompressionQuality.ts');

    expect(qualityPolicy).toContain('IMAGE_JPEG_QUALITY_CANDIDATES = [0.92, 0.88, 0.84, 0.8]');
    expect(qualityPolicy).toContain('IMAGE_MAX_MEAN_LUMA_ERROR = 4');
    expect(worker).toContain('measureCandidate');
    expect(worker).toContain('getImageData');
    expect(worker).toContain('selectSmallestAcceptableImageCandidate');
    expect(worker).toContain('selected?.blob ?? event.data.blob');
  });

  it('uses Mediabunny constant-quality AVC encoding for video', () => {
    const worker = source('features/sync/videoCompression.worker.ts');

    expect(worker).toContain("codec: 'avc'");
    expect(worker).toContain("quality: new Quality('high')");
    expect(worker).not.toContain("quality: new Quality('medium')");
  });
});
