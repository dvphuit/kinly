import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');

describe('startup critical path', () => {
  it('renders production UI before scheduling the cross-domain snapshot runtime', () => {
    const main = source('main.tsx');
    const renderIndex = main.indexOf('renderApp();');
    const scheduleIndex = main.indexOf('scheduleSnapshotRuntimeConfiguration();');

    expect(renderIndex).toBeGreaterThan(-1);
    expect(scheduleIndex).toBeGreaterThan(renderIndex);
    expect(main).not.toContain('const snapshotRuntimeReady = configureSnapshotRuntime();');
    expect(main).toContain("window.addEventListener('pointerdown', start");
    expect(main).toContain("window.addEventListener('keydown', start");
    expect(main).toContain('window.setTimeout(start, SNAPSHOT_RUNTIME_FALLBACK_MS)');
    expect(main).toContain('void configureSnapshotRuntime().catch(reportSnapshotRuntimeFailure);');
  });

  it('keeps cross-domain store loading behind interaction or delayed fallback', () => {
    const main = source('main.tsx');

    expect(main).toContain('const SNAPSHOT_RUNTIME_FALLBACK_MS = 8_000;');
    expect(main).toContain("markStartup('entry-evaluated');");
    expect(main).toContain("markStartup('render-requested');");
    expect(main).toContain("markStartup('snapshot-runtime-start');");
    expect(main).toContain("markStartup('snapshot-runtime-ready');");
    expect(main).toContain("markStartup('snapshot-runtime-failed');");
  });

  it('keeps service-worker registration off the startup critical path', () => {
    const app = source('app/App.tsx');

    expect(app).not.toContain("import PWABadge from '@/PWABadge'");
    expect(app).toContain("const PWABadge = lazy(() => import('@/PWABadge'));");
    expect(app).toContain('const PWA_REGISTRATION_DELAY_MS = 10_000;');
    expect(app).toContain('window.setTimeout(() => setShouldRegister(true), PWA_REGISTRATION_DELAY_MS)');
  });

  it('keeps development store hydration out of the production entry module', () => {
    const main = source('main.tsx');
    const bootstrap = source('data/bootstrapMockData.ts');
    const storeImports = [
      '@/features/activities/store/useActivityStore',
      '@/features/growth/store/useGrowthStore',
      '@/features/profile/store/useProfileStore',
      '@/features/expenses/store/useExpenseStore',
      '@/features/reminders/store/useReminderStore',
      '@/features/timeline/store/useTimelineStore',
    ];

    storeImports.forEach((specifier) => expect(main).not.toContain(specifier));
    expect(main).toContain('if (import.meta.env.DEV)');
    expect(main).toContain("await import('./data/bootstrapMockData')");
    expect(bootstrap).toContain('persist.rehydrate()');
  });

  it('keeps the snapshot public entry free of static Google Drive transport edges', () => {
    const main = source('main.tsx');
    const runtime = source('app/lifecycle/appSnapshotRuntime.ts');
    const syncIndex = source('features/sync/index.ts');

    expect(main).toContain("import('@/features/sync')");
    expect(main).not.toContain('googleDriveSync');
    expect(runtime).toContain("from '@/features/sync'");
    expect(runtime).not.toContain('googleDriveSync');
    expect(syncIndex).not.toContain("export * from './googleDriveSync'");
    expect(syncIndex).not.toContain("from './googleDriveSync'");
    expect(syncIndex).toContain("import('./googleDriveSync')");
  });

  it('keeps auto-sync behind both idle scheduling and snapshot runtime readiness', () => {
    const lifecycle = source('features/sync/hooks/useAutoSyncLifecycle.ts');

    expect(lifecycle).toContain('scheduleIdleTask');
    expect(lifecycle).toContain('waitForAppSnapshotRuntime()');
    expect(lifecycle.indexOf('waitForAppSnapshotRuntime()')).toBeLessThan(lifecycle.indexOf("import('../googleDriveSync')"));
  });
});
