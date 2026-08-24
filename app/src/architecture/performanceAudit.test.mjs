import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');
const appFile = (path) => readFileSync(join(ROOT, path), 'utf8');

describe('interaction performance audit', () => {
  it('keeps PWA chrome aligned for edge-to-edge surfaces', () => {
    const index = appFile('index.html');
    const viteConfig = appFile('vite.config.ts');
    const base = source('shared/styles/base.css');
    expect(index).toContain('viewport-fit=cover');
    expect(index).toContain('<meta name="theme-color" content="#FBF7F2" />');
    expect(viteConfig).toContain("display: 'standalone'");
    expect(viteConfig).toContain("theme_color: '#FBF7F2'");
    expect(viteConfig).toContain("background_color: '#FBF7F2'");
    expect(base).toContain('min-height: 100svh;');
  });

  it('keeps BottomSheet overlays on the appbar status-bar surface', () => {
    const app = source('app/App.tsx');
    expect(app).toContain('const isFullScreenOverlayOpen = Boolean');
    expect(app).toContain('isModalOpen: isFullScreenOverlayOpen');
    expect(app).not.toContain('isModalOpen: modals.isAnyModalOpen');
  });

  it('keeps timeline pointer drag off the React state render path', () => {
    const timeline = source('features/timeline/TimelineView.tsx');
    expect(timeline).not.toContain('const [weekDragX, setWeekDragX]');
    expect(timeline).not.toContain('setWeekDragX(');
    expect(timeline).toContain('weekDragXRef');
    expect(timeline).toContain('weekTrackRef.current.style.transform');
  });

  it('defers Quick Log destination prefetch until the browser is idle', () => {
    const modals = source('app/AppModals.tsx');
    expect(modals).toContain('requestIdleCallback');
    expect(modals).toContain('scheduleQuickLogPrefetch');
    expect(modals).not.toContain('if (!modals.isQuickLogOpen) return;\n    void Promise.all([');
  });

  it('measures notebook layout only near the viewport', () => {
    const notebook = source('features/timeline/components/NotebookStory.tsx');
    expect(notebook).toContain('resizeObserver.observe(story)');
    expect(notebook).not.toContain("querySelectorAll<HTMLElement>('.journal-story-item').forEach");
    expect(notebook).toContain('requestAnimationFrame');
    expect(notebook).toContain('IntersectionObserver');
    expect(notebook).toContain("rootMargin: '600px 0px'");
  });

  it('virtualizes offscreen timeline day rendering and enforces entry bundle budgets', () => {
    const notebook = source('features/timeline/components/NotebookStory.tsx');
    const virtualTimeline = source('features/timeline/timeline-performance.css');
    const viteConfig = appFile('vite.config.ts');

    expect(notebook).toContain("import '../timeline-performance.css'");
    expect(virtualTimeline).toContain('content-visibility: auto');
    expect(virtualTimeline).toContain('contain-intrinsic-size: auto 360px');
    expect(viteConfig).toContain('ENTRY_CHUNK_BUDGET_BYTES = 500_000');
    expect(viteConfig).toContain('ENTRY_GZIP_BUDGET_BYTES = 165_000');
    expect(viteConfig).toContain('performanceBudgetPlugin()');
    expect(viteConfig).toContain('this.error(');
  });

  it('keeps optional sync, reset, mock, and onboarding code off the startup import graph', () => {
    const main = source('main.tsx');
    const app = source('app/App.tsx');
    const mockBootstrap = source('data/bootstrapMockData.ts');
    const mediaUrl = source('features/timeline/hooks/useTimelineMediaUrl.ts');
    expect(main).not.toContain("from './data/mockData'");
    expect(main).not.toContain("from './features/sync'");
    expect(main).toContain("await import('./data/bootstrapMockData')");
    expect(mockBootstrap).toContain("from './mockData'");
    expect(main).toContain("await import('@/app/lifecycle/resetRequest')");
    expect(app).not.toContain("import { OnboardingView } from '@/app/onboarding/OnboardingView'");
    expect(app).toContain("await import('@/app/onboarding/OnboardingView')");
    expect(mediaUrl).not.toContain("from '@/features/sync'");
    expect(mediaUrl).toContain("await import('@/features/sync/googleDriveSync')");
  });

  it('keeps persistent navigation and pull content free of permanent expensive compositing hints', () => {
    const header = source('shared/styles/header.css');
    const bottomNav = source('shared/styles/bottom-nav.css');
    const pullToRefresh = source('shared/ui/PullToRefresh.css');
    expect(header).not.toContain('backdrop-filter');
    expect(header).toContain('safe-area-inset-top');
    expect(header).not.toContain('.app-bar::before');
    expect(header).not.toContain('height: max(1px, env(safe-area-inset-top, 0px));');
    expect(bottomNav).not.toContain('backdrop-filter');
    expect(pullToRefresh).not.toContain('will-change: transform');
  });

  it('uses browser-native animation paths for routes, overlays, and gestures', () => {
    const main = source('main.tsx');
    const routes = source('app/AppRoutes.tsx');
    const bottomNav = source('shared/ui/BottomNav.tsx');
    const header = source('app/components/Header.tsx');
    const nativeTransitions = source('shared/styles/native-transitions.css');
    const nativeAnimations = source('shared/styles/native-animations.css');
    const bottomSheetCss = source('shared/styles/bottom-sheet.css');
    const bottomSheet = source('shared/ui/BottomSheet.tsx');
    const dialog = source('shared/ui/HavenDialog.tsx');
    const mediaPreview = source('features/timeline/components/MomentMediaPreview.tsx');

    expect(routes).not.toContain("from 'motion/react'");
    expect(routes).toContain('useLocation');
    expect(routes).toContain('className="app-route-surface" key={location.pathname}');
    expect((bottomNav.match(/viewTransition/g) ?? [])).toHaveLength(2);
    expect(main).toContain('createBrowserRouter');
    expect(main).toContain('<RouterProvider router={router} />');
    expect(header).toContain("navigate('/profile', { viewTransition: true })");
    expect(nativeTransitions).toContain('::view-transition-old(root)');
    expect(nativeTransitions).toContain('::view-transition-new(root)');
    expect(nativeTransitions).toContain('view-transition-name: app-route-surface;');
    expect(nativeTransitions).toContain('animation: havenRouteContentIn 260ms');
    expect(nativeTransitions).toContain('html[data-tab-direction] .app-route-surface');
    expect(nativeTransitions).toContain('html.has-vt .app-route-surface');
    expect(nativeTransitions).toContain('::view-transition-old(bottom-nav) { display: none; }');
    expect(nativeTransitions).toContain('::view-transition-new(bottom-nav)');
    expect(main).toContain("typeof document.startViewTransition === 'function'");
    expect(nativeTransitions).toContain('view-transition-name: none;');
    expect(nativeAnimations).toContain('@media (prefers-reduced-motion: reduce)');
    expect(bottomSheetCss).toContain('box-shadow: none;');
    expect(bottomSheetCss).not.toContain('box-shadow: 0 -12px 48px');
    expect(bottomSheet).toContain('onPointerMove={handlePointerMove}');
    expect(bottomSheet).toContain('animateElement(');
    expect(dialog).toContain('useNativePresence');
    expect(mediaPreview).toContain('onPointerMove={handlePointerMove}');
    expect(mediaPreview).toContain('translate3d');
  });

  it('keeps the baby timeline runtime behind an idle lazy boundary', () => {
    const homeView = source('features/home/components/HomeView.tsx');
    const babyHome = source('features/home/components/BabyHomeView.tsx');
    const idleTimeline = source('features/home/components/IdleHomeTimelinePreview.tsx');
    const lazyTimeline = source('features/home/components/LazyHomeTimelinePreview.tsx');
    const timelineContent = source('features/home/components/TimelinePreviewContent.tsx');
    const homeMoment = source('features/timeline/components/HomeMomentStoryItem.tsx');
    const lazyDialog = source('features/home/components/LazyTimelineEntryDialog.tsx');
    const lazyPreview = source('features/home/components/LazyMomentMediaPreview.tsx');

    expect(homeView).not.toContain("import { MomHomeView } from './MomHomeView'");
    expect(homeView).toContain("import('./MomHomeView')");
    expect(babyHome).toContain("from './IdleHomeTimelinePreview'");
    expect(babyHome).not.toContain("from '@/features/timeline/");
    expect(babyHome).not.toContain('useHomeTimeline');
    expect(babyHome).not.toContain('NotebookStory');
    expect(babyHome).not.toContain('LazyTimelineEntryDialog');
    expect(babyHome).not.toContain('LazyMomentMediaPreview');

    expect(idleTimeline).toContain('requestIdleCallback');
    expect(idleTimeline).toContain('<LazyHomeTimelinePreview');
    expect(lazyTimeline).toContain("import('./TimelinePreviewContent')");
    expect(timelineContent).toContain('useHomeTimeline');
    expect(timelineContent).toContain('NotebookStory');
    expect(timelineContent).toContain('LazyTimelineEntryDialog');
    expect(timelineContent).toContain('LazyMomentMediaPreview');

    expect(homeMoment).not.toContain("from './TimelineEntryDialog'");
    expect(homeMoment).toContain("from '@/features/timeline/components/TimelineMediaButton'");
    expect(lazyDialog).toContain("import('@/features/timeline/components/TimelineEntryDialog')");
    expect(lazyPreview).toContain("import('@/features/timeline/components/MomentMediaPreview')");
    expect(lazyDialog).toContain('DIALOG_EXIT_RETENTION_MS = 280');
    expect(lazyPreview).toContain('PREVIEW_EXIT_RETENTION_MS = 280');
  });

  it('keeps large public images out of precache and optimizes Home decor delivery', () => {
    const viteConfig = appFile('vite.config.ts');
    const serviceWorker = source('sw.ts');
    const babyHome = source('features/home/components/BabyHomeView.tsx');

    expect(viteConfig).not.toContain("'**/*.{js,css,html,svg,png,ico}'");
    expect(viteConfig).toContain("'pwa-*.png'");
    expect(serviceWorker).toContain("new CacheFirst({ cacheName: 'babygrowth-runtime-images' })");
    expect(babyHome).toContain('/assets/decor/care-milk.webp');
    expect(babyHome).toContain('/assets/decor/care-sleep.webp');
    expect(babyHome).not.toContain('/assets/decor/care-milk.png');
    expect((babyHome.match(/decoding="async"/g) ?? [])).toHaveLength(4);
  });

  it('progressively mounts long timeline, expense, and growth lists', () => {
    const timeline = source('features/timeline/TimelineView.tsx');
    const expenses = source('features/expenses/ExpensesView.tsx');
    const growthHistory = source('features/growth/GrowthHistory.tsx');
    const progressiveList = source('shared/hooks/useProgressiveList.ts');
    const expenseCss = source('features/expenses/expenses.css');
    const growthCss = source('features/growth/growth-view.css');

    expect(progressiveList).toContain('IntersectionObserver');
    expect(progressiveList).toContain("rootMargin = '720px 0px'");
    expect(timeline).toContain('initialCount: 7');
    expect(timeline).toContain('renderedEntryGroups');
    expect(expenses).toContain('initialCount: 10');
    expect(expenses).toContain('renderedTimelineDateGroups');
    expect(growthHistory).toContain('initialCount: 12');
    expect(growthHistory).toContain('renderedHistory');
    expect(expenseCss).toContain('.haven-timeline-day-group');
    expect(expenseCss).toContain('content-visibility: auto');
    expect(growthCss).toContain('.haven-growth-history-row');
    expect(growthCss).toContain('content-visibility: auto');
  });

  it('keeps mobile interaction feedback and scrolling on lightweight paths', () => {
    const app = source('app/App.tsx');
    const routes = source('app/AppRoutes.tsx');
    const routePreload = source('app/routePreload.ts');
    const modals = source('app/hooks/useAppModals.ts');
    const bottomNav = source('shared/ui/BottomNav.tsx');
    const bottomNavCss = source('shared/styles/bottom-nav.css');
    const baseCss = source('shared/styles/base.css');
    const pullToRefresh = source('shared/ui/PullToRefresh.tsx');
    const header = source('app/components/Header.tsx');
    const headerCss = source('shared/styles/header.css');
    const babyHome = source('features/home/components/BabyHomeView.tsx');
    const momHome = source('features/home/components/MomHomeView.tsx');
    const segmentClock = source('features/home/components/SegmentClock.tsx');
    const dayReference = source('shared/hooks/useLocalDayReference.ts');
    const nativeTransitions = source('shared/styles/native-transitions.css');

    expect(pullToRefresh).toContain("root.addEventListener('touchmove', onTouchMove, { passive: false });");
    expect(pullToRefresh).toContain("root.removeEventListener('touchmove', onTouchMove);");
    expect(pullToRefresh).toContain('event.preventDefault();');

    expect(bottomNav).not.toContain("from 'motion/react'");
    expect(bottomNav).not.toContain('layoutId=');
    expect(bottomNav).toContain('onPointerDown={handleRouteIntent}');
    expect(bottomNavCss).toContain('.nav-tab-item:active');
    expect(bottomNavCss).toContain('.fab-center-btn:active');
    expect(bottomNavCss).toContain('view-transition-name: bottom-nav-active-tab;');
    expect(bottomNavCss).toContain('::view-transition-group(bottom-nav-active-tab)');
    expect(bottomNavCss).toContain('::view-transition-old(bottom-nav-active-tab)');
    expect(bottomNavCss).toContain('::view-transition-new(bottom-nav-active-tab)');
    expect(nativeTransitions).toContain('::view-transition-group(bottom-nav-active-tab) { z-index: 51; }');
    expect(bottomNavCss).toContain('animation: havenRouteTabIn 260ms cubic-bezier(0.05, 0.7, 0.1, 1) both;');
    expect(bottomNavCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(bottomNavCss).toContain('--bottom-nav-safe-area: var(--safe-area-inset-bottom);');
    expect(bottomNavCss).toContain('--bottom-nav-safe-area-max: var(--safe-area-max-inset-bottom);');
    expect(bottomNavCss).toContain('bottom: calc(var(--bottom-nav-safe-area) - var(--bottom-nav-safe-area-max));');
    expect(bottomNavCss).toContain('padding: 8px 6px calc(8px + var(--bottom-nav-safe-area-max)) 6px;');
    expect(baseCss).toContain('--safe-area-max-inset-bottom: env(safe-area-max-inset-bottom, env(safe-area-inset-bottom, 0px));');
    expect(baseCss).toContain('height: calc(76px + var(--safe-area-max-inset-bottom)) !important;');
    expect(headerCss).toContain('min-height: 68px;');
    expect(headerCss).toContain('padding: 9px 12px;');

    expect(routePreload).toContain('export async function preloadAppRoute');
    expect(routes).not.toContain('export function preloadAppRoute');
    expect(routes).toContain('memo(function AppRoutes');
    expect(app).toContain('onRouteIntent={preloadAppRoute}');
    expect(modals).toContain('useCallback');
    expect(header).toContain('useUIStore((state) => state.profileMode)');

    expect(babyHome).not.toContain("from '@/shared/hooks/useLiveNow'");
    expect(momHome).not.toContain("from '@/shared/hooks/useLiveNow'");
    expect(babyHome).toContain('<LiveSegmentClock />');
    expect(momHome).toContain('<LiveSegmentClock />');
    expect(segmentClock).toContain('LiveSegmentClock');
    expect(dayReference).toContain('scheduleMidnightCheck');
  });
  it('keeps native animation ownership out of the React projection runtime', () => {
    const main = source('main.tsx');
    const modals = source('app/AppModals.tsx');
    const timeline = source('features/timeline/TimelineView.tsx');
    const homeTimeline = source('features/home/components/TimelinePreviewContent.tsx');
    const nativeAnimation = source('shared/lib/nativeAnimation.ts');

    expect(main).not.toContain('MotionConfig');
    expect(modals).not.toContain('LayoutGroup');
    expect(timeline).not.toContain('LayoutGroup');
    expect(homeTimeline).not.toContain('LayoutGroup');
    expect(nativeAnimation).toContain('element.animate');
    expect(nativeAnimation).toContain('prefersReducedMotion');
  });

});
