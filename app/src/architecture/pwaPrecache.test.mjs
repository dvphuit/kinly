import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');
const appFile = (path) => readFileSync(join(ROOT, path), 'utf8');

describe('PWA precache boundary', () => {
  it('keeps WHO chart assets on demand while preserving offline reuse after first visit', () => {
    const viteConfig = appFile('vite.config.ts');
    const serviceWorker = source('sw.ts');

    expect(viteConfig).toContain("'**/WHOChart-*.js'");
    expect(viteConfig).toContain("'**/WHOChart-*.css'");
    expect(serviceWorker).toContain("url.pathname.startsWith('/assets/WHOChart-')");
    expect(serviceWorker).toContain("request.destination === 'script' || request.destination === 'style'");
    expect(serviceWorker).toContain("cacheName: 'babygrowth-runtime-who-chart'");
  });
});
