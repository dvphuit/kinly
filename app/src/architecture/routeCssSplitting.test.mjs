import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');

const ROUTE_CSS_IMPORTS = [
  "@import './features/profile/profile.css';",
  "@import './features/expenses/expenses.css';",
  "@import './features/growth/growth-view.css';",
  "@import './app/onboarding/onboarding.css';",
  "@import './features/timeline/timeline.css';",
];

describe('route CSS splitting', () => {
  it('keeps lazy route CSS out of the global startup stylesheet', () => {
    const indexCss = source('index.css');

    for (const routeCssImport of ROUTE_CSS_IMPORTS) {
      expect(indexCss).not.toContain(routeCssImport);
    }
    expect(indexCss).toContain("@import './features/home/home.css';");
  });

  it('exposes feature-owned lazy style loaders without making CSS a barrel side effect', () => {
    const featureStyles = [
      ['features/timeline/index.ts', 'loadTimelineStyles', './timeline.css'],
      ['features/growth/index.ts', 'loadGrowthStyles', './growth-view.css'],
      ['features/expenses/index.ts', 'loadExpensesStyles', './expenses.css'],
      ['features/profile/index.ts', 'loadProfileStyles', './profile.css'],
    ];

    for (const [path, loaderName, cssPath] of featureStyles) {
      const featureIndex = source(path);
      expect(featureIndex).toContain(`export async function ${loaderName}(): Promise<void>`);
      expect(featureIndex).toContain(`await import('${cssPath}');`);
      expect(featureIndex).not.toContain(`import '${cssPath}';`);
      expect(featureIndex).not.toContain(`import "${cssPath}";`);
    }
  });

  it('awaits route and modal styles before lazy UI resolves', () => {
    const routePreload = source('app/routePreload.ts');
    const appModals = source('app/AppModals.tsx');

    for (const loader of [
      'loadTimelineStyles',
      'loadGrowthStyles',
      'loadExpensesStyles',
      'loadProfileStyles',
    ]) {
      expect(routePreload).toContain(`(feature) => feature.${loader}(),`);
    }
    expect(routePreload).toContain('await loadStyles(feature);');

    expect(appModals).toContain('const loadAddGrowthModal = loadGrowthFeature;');
    expect(appModals).toContain('const loadAddExpenseModal = loadExpensesFeature;');
    expect(appModals).toContain('const loadAddPostModal = loadTimelineFeature;');
    expect(appModals).toContain('(await loadProfileFeature()).EditProfileModal');
    expect(appModals).not.toContain("const loadAddGrowthModal = () => import('@/features/growth');");
    expect(appModals).not.toContain("const loadAddExpenseModal = () => import('@/features/expenses');");
    expect(appModals).not.toContain("const loadAddPostModal = () => import('@/features/timeline');");
  });

  it('keeps onboarding and the Home timeline preview behind lazy CSS boundaries', () => {
    const app = source('app/App.tsx');
    const lazyHomeTimeline = source('features/home/components/LazyHomeTimelinePreview.tsx');

    expect(app).toContain("const stylesReady = import('@/app/onboarding/onboarding.css');");
    expect(app).toContain("const module = await import('@/app/onboarding/OnboardingView');");
    expect(app).toContain('await stylesReady;');
    expect(lazyHomeTimeline).not.toContain("import { loadTimelineStyles } from '@/features/timeline';");
    expect(lazyHomeTimeline).toContain("import('@/features/timeline')");
    expect(lazyHomeTimeline).toContain('await timelineFeature.loadTimelineStyles();');
    expect(lazyHomeTimeline).toContain("import('./TimelinePreviewContent')");
  });
});
