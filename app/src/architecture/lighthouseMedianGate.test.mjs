import { describe, expect, it } from 'vitest';
import { evaluateReports, median } from '../../scripts/assert-lighthouse-median.mjs';

function report({
  performance,
  accessibility = 1,
  bestPractices = 1,
  seo = 1,
  benchmarkIndex = 2200,
  documentTitle = 1,
  htmlHasLang = 1,
  errorsInConsole = 1,
}) {
  return {
    lighthouseVersion: '13.0.1',
    environment: { benchmarkIndex },
    categories: {
      performance: { score: performance },
      accessibility: { score: accessibility },
      'best-practices': { score: bestPractices },
      seo: { score: seo },
    },
    audits: {
      'document-title': { score: documentTitle },
      'html-has-lang': { score: htmlHasLang },
      'errors-in-console': { score: errorsInConsole },
    },
  };
}

describe('Lighthouse independent-runner median gate', () => {
  it('calculates the numeric median without selecting the best run', () => {
    expect(median([0.69, 0.96, 0.97, 0.98, 1])).toBe(0.97);
  });

  it('passes when a minority of independent runners are noisy', () => {
    const result = evaluateReports([
      report({ performance: 0.69, benchmarkIndex: 1500 }),
      report({ performance: 0.72, benchmarkIndex: 1600 }),
      report({ performance: 0.96, benchmarkIndex: 2200 }),
      report({ performance: 0.98, benchmarkIndex: 2400 }),
      report({ performance: 1, benchmarkIndex: 2600 }),
    ]);

    expect(result.passed).toBe(true);
    expect(result.categoryResults.performance.median).toBe(0.96);
  });

  it('fails when the majority of runners see a performance regression', () => {
    const result = evaluateReports([
      report({ performance: 0.69 }),
      report({ performance: 0.72 }),
      report({ performance: 0.94 }),
      report({ performance: 0.98 }),
      report({ performance: 1 }),
    ]);

    expect(result.passed).toBe(false);
    expect(result.categoryResults.performance.median).toBe(0.94);
    expect(result.failures).toContain('Median performance score 0.94 is below 0.95.');
  });

  it('requires deterministic document audits to pass on every runner', () => {
    const result = evaluateReports([
      report({ performance: 1 }),
      report({ performance: 1 }),
      report({ performance: 1, documentTitle: 0 }),
      report({ performance: 1 }),
      report({ performance: 1 }),
    ]);

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Required audit document-title did not pass on every runner.');
  });

  it('fails closed when an expected runner report is missing', () => {
    const result = evaluateReports([
      report({ performance: 1 }),
      report({ performance: 1 }),
      report({ performance: 1 }),
      report({ performance: 1 }),
    ]);

    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Expected 5 Lighthouse reports, found 4.');
  });
});
