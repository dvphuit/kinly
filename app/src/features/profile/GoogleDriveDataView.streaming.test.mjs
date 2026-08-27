import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = await readFile(new URL('./GoogleDriveDataView.tsx', import.meta.url), 'utf8');

describe('Drive video startup policy', () => {
  it('does not probe validated cross-origin broker streams before mounting video', () => {
    expect(source).toContain("if (new URL(streamUrl, window.location.origin).origin !== window.location.origin) return true;");
    expect(source).toContain("headers: { Range: 'bytes=0-0' }");
  });

  it('gives streaming enough time before starting the full-download fallback', () => {
    expect(source).toContain('const VIDEO_STREAM_FALLBACK_DELAY_MS = 1_500;');
    expect(source).toContain('}, VIDEO_STREAM_FALLBACK_DELAY_MS);');
  });
});
