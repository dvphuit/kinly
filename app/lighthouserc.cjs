module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node e2e/serve.mjs',
      startServerReadyPattern: 'BabyGrowth E2E server listening',
      url: ['http://127.0.0.1:4173/'],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --headless --disable-gpu --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.95, aggregationMethod: 'median' }],
        'first-contentful-paint': ['error', { maxNumericValue: 1500, aggregationMethod: 'pessimistic' }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000, aggregationMethod: 'pessimistic' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05, aggregationMethod: 'pessimistic' }],
        'total-byte-weight': ['error', { maxNumericValue: 350000, aggregationMethod: 'pessimistic' }],
        'total-blocking-time': ['warn', { maxNumericValue: 300, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 0.98, aggregationMethod: 'pessimistic' }],
        'categories:best-practices': ['error', { minScore: 0.95, aggregationMethod: 'pessimistic' }],
        'categories:seo': ['error', { minScore: 0.95, aggregationMethod: 'pessimistic' }],
        'document-title': ['error', { minScore: 1, aggregationMethod: 'pessimistic' }],
        'html-has-lang': ['error', { minScore: 1, aggregationMethod: 'pessimistic' }],
        'errors-in-console': ['warn', { minScore: 1, aggregationMethod: 'pessimistic' }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
