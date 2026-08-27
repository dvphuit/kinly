import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const lighthouseConfig = require(join(process.cwd(), 'lighthouserc.cjs'));
const assertions = lighthouseConfig.ci.assert.assertions;

describe('Lighthouse CI stability contract', () => {
  it('keeps stable startup regressions merge-blocking across repeated samples', () => {
    expect(lighthouseConfig.ci.collect.numberOfRuns).toBe(3);
    expect(assertions['first-contentful-paint']).toEqual([
      'error',
      { maxNumericValue: 1500, aggregationMethod: 'pessimistic' },
    ]);
    expect(assertions['largest-contentful-paint']).toEqual([
      'error',
      { maxNumericValue: 2000, aggregationMethod: 'pessimistic' },
    ]);
    expect(assertions['cumulative-layout-shift']).toEqual([
      'error',
      { maxNumericValue: 0.05, aggregationMethod: 'pessimistic' },
    ]);
    expect(assertions['total-byte-weight']).toEqual([
      'error',
      { maxNumericValue: 350000, aggregationMethod: 'pessimistic' },
    ]);
  });

  it('keeps CPU-contention-sensitive Lighthouse signals diagnostic', () => {
    expect(assertions['categories:performance']).toEqual([
      'warn',
      { minScore: 0.95, aggregationMethod: 'median' },
    ]);
    expect(assertions['total-blocking-time']).toEqual([
      'warn',
      { maxNumericValue: 300, aggregationMethod: 'median' },
    ]);
  });

  it('still fails closed on document quality audits', () => {
    expect(assertions['categories:accessibility'][0]).toBe('error');
    expect(assertions['categories:best-practices'][0]).toBe('error');
    expect(assertions['categories:seo'][0]).toBe('error');
    expect(assertions['document-title'][0]).toBe('error');
    expect(assertions['html-has-lang'][0]).toBe('error');
  });
});
