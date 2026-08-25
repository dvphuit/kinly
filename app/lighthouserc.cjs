module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node e2e/serve.mjs',
      startServerReadyPattern: 'BabyGrowth E2E server listening',
      url: ['http://127.0.0.1:4173/'],
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --headless --disable-gpu --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 0.98 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'document-title': 'error',
        'html-has-lang': 'error',
        'errors-in-console': 'warn',
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
