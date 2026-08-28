import { describe, expect, it } from 'vitest';
import { selectSmallestAcceptableImageCandidate } from './mediaCompressionQuality';

const MAX_MEAN_LUMA_ERROR = 4;

function candidate(size: number, quality: number, meanLumaError: number) {
  return {
    blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }),
    quality,
    meanLumaError,
  };
}

describe('adaptive image quality selection', () => {
  it('chooses the smallest candidate that stays inside the fidelity threshold', () => {
    const selected = selectSmallestAcceptableImageCandidate([
      candidate(8_000, 0.92, 1.2),
      candidate(6_500, 0.88, 2.3),
      candidate(5_200, 0.84, 3.8),
      candidate(4_100, 0.8, MAX_MEAN_LUMA_ERROR + 0.1),
    ], MAX_MEAN_LUMA_ERROR);

    expect(selected?.quality).toBe(0.84);
    expect(selected?.blob.size).toBe(5_200);
  });

  it('returns null rather than accepting a candidate outside the fidelity threshold', () => {
    expect(selectSmallestAcceptableImageCandidate([
      candidate(4_000, 0.8, MAX_MEAN_LUMA_ERROR + 1),
    ], MAX_MEAN_LUMA_ERROR)).toBeNull();
  });

  it('rejects invalid fidelity measurements', () => {
    expect(selectSmallestAcceptableImageCandidate([
      candidate(3_000, 0.8, Number.NaN),
      candidate(4_000, 0.84, Number.POSITIVE_INFINITY),
    ], MAX_MEAN_LUMA_ERROR)).toBeNull();
  });
});
