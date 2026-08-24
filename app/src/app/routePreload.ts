function createFeatureLoader<T>(
  importFeature: () => Promise<T>,
  loadStyles: (feature: T) => Promise<void>,
) {
  let loaded: T | undefined;
  let pending: Promise<T> | undefined;

  return {
    getLoaded: () => loaded,
    load: () => {
      pending ??= importFeature()
        .then(async (feature) => {
          await loadStyles(feature);
          loaded = feature;
          return feature;
        })
        .catch((error: unknown) => {
          pending = undefined;
          throw error;
        });
      return pending;
    },
  };
}

const timelineFeature = createFeatureLoader(
  () => import('@/features/timeline'),
  (feature) => feature.loadTimelineStyles(),
);
const growthFeature = createFeatureLoader(
  () => import('@/features/growth'),
  (feature) => feature.loadGrowthStyles(),
);
const expensesFeature = createFeatureLoader(
  () => import('@/features/expenses'),
  (feature) => feature.loadExpensesStyles(),
);
const profileFeature = createFeatureLoader(
  () => import('@/features/profile'),
  (feature) => feature.loadProfileStyles(),
);

export const loadTimelineFeature = timelineFeature.load;
export const loadGrowthFeature = growthFeature.load;
export const loadExpensesFeature = expensesFeature.load;
export const loadProfileFeature = profileFeature.load;

export const getLoadedTimelineFeature = timelineFeature.getLoaded;
export const getLoadedGrowthFeature = growthFeature.getLoaded;
export const getLoadedExpensesFeature = expensesFeature.getLoaded;

export async function preloadAppRoute(pathname: string): Promise<void> {
  switch (pathname) {
    case '/timeline':
      await loadTimelineFeature();
      return;
    case '/growth':
      await loadGrowthFeature();
      return;
    case '/expenses':
      await loadExpensesFeature();
      return;
    case '/profile':
    case '/profile/google-drive':
      await loadProfileFeature();
      return;
    default:
      return;
  }
}
