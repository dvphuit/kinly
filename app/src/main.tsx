import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './app/App';
import { AppRouteError } from '@/app/AppRouteError';
import { initializeNativeExperience } from '@/app/lifecycle/nativeExperience';
import { installPreloadErrorRecovery } from '@/app/lifecycle/preloadErrorRecovery';
import './index.css';

initializeNativeExperience();
installPreloadErrorRecovery();

document.documentElement.classList.toggle(
  'has-vt',
  typeof document.startViewTransition === 'function',
);

const SNAPSHOT_RUNTIME_FALLBACK_MS = 8_000;

function markStartup(name: string): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  performance.mark(`kinly:startup:${name}`);
}

markStartup('entry-evaluated');

async function configureSnapshotRuntime(): Promise<void> {
  markStartup('snapshot-runtime-start');
  const [{ createAppSnapshotRuntime }, { configureAppSnapshotRuntime }] = await Promise.all([
    import('@/app/lifecycle/appSnapshotRuntime'),
    import('@/features/sync'),
  ]);
  configureAppSnapshotRuntime(createAppSnapshotRuntime());
  markStartup('snapshot-runtime-ready');
}

function hasResetRequest(): boolean {
  return new URLSearchParams(window.location.search).has('reset');
}

async function handleResetRequest(): Promise<boolean> {
  const resetModule = await import('@/app/lifecycle/resetRequest');
  return resetModule.handleResetRequest();
}

function renderApp(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root application element.');
  const router = createBrowserRouter([{ path: '*', element: <App />, errorElement: <AppRouteError /> }]);

  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  markStartup('render-requested');
}

async function reportSnapshotRuntimeFailure(error: unknown): Promise<void> {
  markStartup('snapshot-runtime-failed');
  console.error('[startup] Không thể khởi tạo snapshot runtime:', error);
  try {
    const { failAppSnapshotRuntimeInitialization } = await import('@/features/sync');
    failAppSnapshotRuntimeInitialization(error);
  } catch {
    // The sync chunk itself may be the failed import. Keep the rendered app usable.
  }
}

function scheduleSnapshotRuntimeConfiguration(): void {
  let started = false;
  let fallbackId = 0;

  const start = () => {
    if (started) return;
    started = true;
    window.clearTimeout(fallbackId);
    window.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
    void configureSnapshotRuntime().catch(reportSnapshotRuntimeFailure);
  };

  // Snapshot composition touches every domain store. Keep it off the initial
  // render path, but start it immediately before real user interaction and keep
  // an idle-session fallback so auto-sync can still become ready without input.
  window.addEventListener('pointerdown', start, { once: true, passive: true });
  window.addEventListener('keydown', start, { once: true });
  fallbackId = window.setTimeout(start, SNAPSHOT_RUNTIME_FALLBACK_MS);
}

async function startApp(): Promise<void> {
  if (hasResetRequest()) {
    const didReset = await handleResetRequest();
    if (didReset) return;
  }

  if (import.meta.env.DEV) {
    const { bootstrapMockData } = await import('./data/bootstrapMockData');
    await bootstrapMockData();
  }

  renderApp();
  scheduleSnapshotRuntimeConfiguration();
}

void startApp();
