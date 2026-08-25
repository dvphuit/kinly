const thresholds = require('./lighthouse-thresholds.json');

const categoryAssertions = Object.fromEntries(
  Object.entries(thresholds.categories).map(([category, minScore]) => [
    `categories:${category}`,
    ['error', { minScore, aggregationMethod: 'median' }],
  ]),
);

const requiredAuditAssertions = Object.fromEntries(
  thresholds.requiredAudits.map((audit) => [
    audit,
    ['error', { minScore: 1, aggregationMethod: 'pessimistic' }],
  ]),
);

const warningAuditAssertions = Object.fromEntries(
  thresholds.warningAudits.map((audit) => [
    audit,
    ['warn', { minScore: 1, aggregationMethod: 'pessimistic' }],
  ]),
);

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node e2e/serve.mjs',
      startServerReadyPattern: 'BabyGrowth E2E server listening',
      url: ['http://127.0.0.1:4173/'],
      numberOfRuns: thresholds.expectedRuns,
      settings: {
        chromeFlags: '--no-sandbox --headless --disable-gpu --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        ...categoryAssertions,
        ...requiredAuditAssertions,
        ...warningAuditAssertions,
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
