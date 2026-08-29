import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');

describe('media compression runtime contract', () => {
  it('routes the persisted per-kind preset into the compression workers', () => {
    const orchestrator = source('features/sync/mediaCompression.ts');

    expect(orchestrator).toContain('getMediaCompressionSettings()[options.kind]');
    expect(orchestrator).toContain('{ blob, preset }');
    expect(orchestrator).toContain("new Worker(new URL('./imageCompression.worker.ts', import.meta.url)");
    expect(orchestrator).toContain("new Worker(new URL('./videoCompression.worker.ts', import.meta.url)");
    expect(orchestrator).not.toMatch(/runCompressionWorker\(\s*new URL/);
  });

  it('keeps image compression adaptive and driven by the selected profile', () => {
    const worker = source('features/sync/imageCompression.worker.ts');
    const profiles = source('features/sync/mediaCompressionProfiles.ts');

    expect(profiles).toContain('qualityCandidates: [0.92, 0.88, 0.84, 0.8]');
    expect(profiles).toContain('maxMeanLumaError: 4');
    expect(worker).toContain('getImageCompressionProfile(event.data.preset)');
    expect(worker).toContain('profile.qualityCandidates');
    expect(worker).toContain('profile.maxMeanLumaError');
    expect(worker).toContain('measureCandidate');
    expect(worker).toContain('getImageData');
  });

  it('keeps video in MP4 AVC while applying the selected profile', () => {
    const worker = source('features/sync/videoCompression.worker.ts');
    const profiles = source('features/sync/mediaCompressionProfiles.ts');

    expect(worker).toContain("codec: 'avc'");
    expect(worker).toContain('getVideoCompressionProfile(event.data.preset)');
    expect(worker).toContain('quality: new Quality(profile.quality)');
    expect(profiles).toContain("quality: 'high'");
    expect(profiles).toContain("quality: 'medium'");
    expect(profiles).toContain('maxHeight: 720');
  });
});
