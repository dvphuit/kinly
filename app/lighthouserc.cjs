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
        'categories:performance': ['warn', { minScore: 0.85 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
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
