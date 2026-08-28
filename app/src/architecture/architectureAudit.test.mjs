import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findFeatureBoundaryViolations,
  findMissingFeaturePublicApis,
  productionSourceFiles,
} from './importGraph.mjs';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const FORBIDDEN_PRODUCTION_TOKENS = [
  ['useMomStore', 'Mom tracking must use unified activity records'],
  ['@/components/modals/', 'feature-specific modals must be owned by features'],
  ['AIDoctorChatModal', 'AI chat was removed from the product'],
  ['useChatStore', 'AI chat state was removed from the product'],
  ['HomeAIBanner', 'AI home surfaces were removed from the product'],
  ['AIAdviceCard', 'AI home surfaces were removed from the product'],
  ['growth-ai-', 'growth reference UI must not retain AI naming'],
  ['growthLiveAiFeedback', 'growth reference UI must not retain AI naming'],
  ['babygrowth_v2_', 'production persistence must use the current generation directly'],
  ['babygrowth_v3_', 'production persistence must use the current generation directly'],
  ['babygrowth_v4_mom', 'removed Mom store must not reappear as a persistence key'],
  ['useBabyStore', 'profile and growth state must not be recombined into a baby store'],
  ['babygrowth_v4_baby', 'profile and growth persistence must use separate ownership keys'],
  ['@/domain/', 'domain logic must be owned by a feature'],
  ['@/hooks/', 'hooks must be owned by app, feature, or shared boundaries'],
  ['@/store/useActivityStore', 'activity state must be owned by the activities feature'],
  ['@/store/useExpenseStore', 'expense state must be owned by the expenses feature'],
  ['@/store/useReminderStore', 'reminder state must be owned by the reminders feature'],
  ['@/store/useTimelineStore', 'timeline state must be owned by the timeline feature'],
  ['@/services/googleDriveSync', 'Google Drive sync must use the sync feature boundary'],
];

// Existing dependency debt is named as exact edges so architecture enforcement
// can start without changing runtime behavior. The graph assertion also rejects
// stale entries, so remove an edge from this list as soon as the dependency moves
// behind the target feature's public API.
const LEGACY_FEATURE_BOUNDARY_VIOLATIONS = [
  'app/App.tsx -> @/features/profile/store/useProfileStore',
  'app/InitializedApp.tsx -> @/features/reminders/hooks/useReminderLifecycle',
  'app/InitializedApp.tsx -> @/features/sync/hooks/useAutoSyncLifecycle',
  'app/hooks/useAppModals.ts -> @/features/activities/ActivityLogModal',
  'app/lifecycle/resetRequest.ts -> @/features/sync/googleDriveSync',
  'app/lifecycle/trackingDataReset.ts -> @/features/activities/store/useActivityStore',
  'app/lifecycle/trackingDataReset.ts -> @/features/expenses/store/useExpenseStore',
  'app/lifecycle/trackingDataReset.ts -> @/features/growth/store/useGrowthStore',
  'app/lifecycle/trackingDataReset.ts -> @/features/profile/store/useProfileStore',
  'app/lifecycle/trackingDataReset.ts -> @/features/reminders/store/useReminderStore',
  'app/lifecycle/trackingDataReset.ts -> @/features/timeline/store/useTimelineStore',
  'data/mockData.ts -> @/features/activities/store/useActivityStore',
  'data/mockData.ts -> @/features/expenses/store/useExpenseStore',
  'data/mockData.ts -> @/features/growth/store/useGrowthStore',
  'data/mockData.ts -> @/features/reminders/store/useReminderStore',
  'data/mockData.ts -> @/features/timeline/store/useTimelineStore',
  'features/growth/GrowthView.tsx -> @/features/profile/store/useProfileStore',
  'features/home/components/BabyHomeView.tsx -> @/features/activities/domain/activitySelectors',
  'features/home/components/BabyHomeView.tsx -> @/features/activities/domain/dailyCareTargets',
  'features/home/components/BabyHomeView.tsx -> @/features/growth/domain/growthSelectors',
  'features/home/components/BabyHomeView.tsx -> @/features/growth/store/useGrowthStore',
  'features/home/components/BabyHomeView.tsx -> @/features/profile/hooks/useFamily',
  'features/home/components/LazyMomentMediaPreview.tsx -> @/features/timeline/components/MomentMediaPreview',
  'features/home/components/LazyTimelineEntryDialog.tsx -> @/features/timeline/components/TimelineEntryDialog',
  'features/home/components/MomHomeView.tsx -> @/features/activities/domain/activitySelectors',
  'features/home/components/TimelinePreviewContent.tsx -> @/features/activities/domain/activitySelectors',
  'features/home/components/TimelinePreviewContent.tsx -> @/features/timeline/components/HomeMomentStoryItem',
  'features/home/components/TimelinePreviewContent.tsx -> @/features/timeline/components/NotebookStory',
  'features/home/components/TimelinePreviewContent.tsx -> @/features/timeline/domain/timelineSelectors',
  'features/home/hooks/useHomeTimeline.ts -> @/features/timeline/components/MomentMediaPreview',
  'features/home/hooks/useHomeTimeline.ts -> @/features/timeline/components/TimelineEntryDialog',
  'features/home/hooks/useHomeTimeline.ts -> @/features/timeline/domain/timelineMedia',
  'features/home/hooks/useHomeTimeline.ts -> @/features/timeline/store/useTimelineStore',
  'features/profile/GoogleDriveDataView.tsx -> @/features/timeline/components/MomentMediaPreview',
  'features/profile/GoogleDriveDataView.tsx -> @/features/timeline/store/useTimelineStore',
  'features/profile/ProfileView.tsx -> @/features/growth/domain/growthSelectors',
  'features/profile/ProfileView.tsx -> @/features/growth/store/useGrowthStore',
  'features/profile/profileLifecycle.ts -> @/features/growth/store/useGrowthStore',
  'features/sync/timelineMediaDriveSync.ts -> @/features/timeline/store/useTimelineStore',
  'features/timeline/TimelineView.tsx -> @/features/growth/domain/growthSelectors',
  'features/timeline/TimelineView.tsx -> @/features/growth/store/useGrowthStore',
  'features/timeline/TimelineView.tsx -> @/features/profile/store/useProfileStore',
  'features/timeline/components/TimelineMediaSyncBadge.tsx -> @/features/sync/timelineMediaSyncProgress',
  'features/timeline/hooks/useTimelineMediaUrl.ts -> @/features/sync/googleDriveSync',
  'features/timeline/store/useTimelineStore.ts -> @/features/growth/store/useGrowthStore',
  'features/timeline/store/useTimelineStore.ts -> @/features/profile/store/useProfileStore',
].sort();

function findForbiddenTokens() {
  const issues = [];
  for (const file of productionSourceFiles(SRC)) {
    const content = readFileSync(file, 'utf8');
    for (const [token, reason] of FORBIDDEN_PRODUCTION_TOKENS) {
      if (content.includes(token)) {
        issues.push(`${relative(ROOT, file)}: ${reason} (${token})`);
      }
    }
  }
  return issues;
}

describe('architecture acceptance guard', () => {
  it('keeps removed AI and legacy persistence paths out of production source', () => {
    expect(findForbiddenTokens()).toEqual([]);
  });

  it('keeps product features under explicit ownership boundaries', () => {
    for (const feature of ['activities', 'home', 'timeline', 'growth', 'expenses', 'reminders', 'profile', 'sync']) {
      const featurePath = join(SRC, 'features', feature);
      expect(existsSync(featurePath), `${feature} feature should exist`).toBe(true);
      expect(statSync(featurePath).isDirectory(), `${feature} should be a directory`).toBe(true);
    }
  });

  it('requires every feature to expose a public index entry point', () => {
    expect(findMissingFeaturePublicApis(SRC)).toEqual([]);
  });

  it('keeps the timeline dialog on the shared adaptive sheet shell', () => {
    const dialog = readFileSync(join(SRC, 'features/timeline/components/TimelineEntryDialog.tsx'), 'utf8');
    const editor = readFileSync(join(SRC, 'features/timeline/components/TimelineEntryEditor.tsx'), 'utf8');

    expect(dialog).toContain("from '@/shared/ui/BottomSheet'");
    expect(dialog).toContain('<BottomSheet');
    expect(dialog).not.toContain('HavenDialog');
    expect(dialog).not.toContain('journal-activity-dialog');
    expect(dialog).not.toContain('journal-feeding-editor-dialog');
    expect(editor).toContain('id="timeline-edit-form"');
    expect(editor).not.toContain('<HavenDialog');
    expect(editor).not.toContain("@/features/activities/");
    expect(editor).not.toContain("@/features/growth/");
    expect(editor).not.toContain("@/features/profile/");
  });

  it('keeps snapshot wire contracts pure and feature-store orchestration in app composition', () => {
    const schema = readFileSync(join(SRC, 'features/sync/appSnapshotSchema.ts'), 'utf8');
    const port = readFileSync(join(SRC, 'features/sync/appSnapshot.ts'), 'utf8');
    const runtime = readFileSync(join(SRC, 'app/lifecycle/appSnapshotRuntime.ts'), 'utf8');

    for (const source of [schema, port]) {
      expect(source).not.toContain('.getState(');
      expect(source).not.toContain('.setState(');
      expect(source).not.toContain('.subscribe(');
    }
    expect(port).toContain("from './appSnapshotSchema'");
    expect(runtime).toContain('createAppSnapshotRuntime');
    for (const feature of ['activities', 'expenses', 'growth', 'profile', 'reminders', 'timeline']) {
      expect(port).not.toContain(`@/features/${feature}`);
      expect(runtime).not.toContain(`@/features/${feature}/`);
      expect(schema).not.toContain(`@/features/${feature}/`);
    }
  });

  it('keeps cross-boundary feature imports on public APIs without adding new debt', () => {
    expect(findFeatureBoundaryViolations(SRC)).toEqual(LEGACY_FEATURE_BOUNDARY_VIOLATIONS);
  });

  it('does not keep the removed modal or mom-store modules', () => {
    expect(existsSync(join(SRC, 'store', 'useMomStore.ts'))).toBe(false);
    expect(existsSync(join(SRC, 'components', 'modals'))).toBe(false);
  });

  it('keeps domain logic, hooks, and feature stores with their owners', () => {
    expect(existsSync(join(SRC, 'domain'))).toBe(false);
    expect(existsSync(join(SRC, 'hooks'))).toBe(false);

    for (const legacyPath of [
      join(SRC, 'store', 'useActivityStore.ts'),
      join(SRC, 'store', 'useExpenseStore.ts'),
      join(SRC, 'store', 'useReminderStore.ts'),
      join(SRC, 'store', 'useTimelineStore.ts'),
      join(SRC, 'services', 'googleDriveSync.ts'),
      join(SRC, 'services', 'localDb.ts'),
      join(SRC, 'services', 'notificationService.ts'),
      join(SRC, 'services', 'timelineMediaDriveSync.ts'),
      join(SRC, 'services', 'timelineMediaSyncProgress.ts'),
    ]) {
      expect(existsSync(legacyPath), `${relative(ROOT, legacyPath)} should not remain`).toBe(false);
    }
  });

  it('keeps feature-owned modules out of legacy shared and global buckets', () => {
    for (const legacyPath of [
      join(SRC, 'data', 'expenseCategories.ts'),
      join(SRC, 'utils', 'expenseMath.ts'),
      join(SRC, 'shared', 'ui', 'HavenMedicationPicker.tsx'),
      join(SRC, 'shared', 'ui', 'HavenMilkAmountInput.tsx'),
      join(SRC, 'shared', 'ui', 'HavenTemperatureInput.tsx'),
      join(SRC, 'shared', 'ui', 'Header.tsx'),
    ]) {
      expect(existsSync(legacyPath), relative(ROOT, legacyPath) + ' should not remain').toBe(false);
    }

    const globalTypes = readFileSync(join(SRC, 'types', 'index.ts'), 'utf8');
    for (const ownedType of [
      'ActivityRecord',
      'FamilyData',
      'ProfileMode',
      'TimelineItem',
      'TimelineMediaItem',
      'GrowthHistoryRecord',
      'GrowthMetric',
      'StageExpenseData',
    ]) {
      expect(globalTypes, ownedType + ' should live with its feature').not.toContain('export interface ' + ownedType);
      expect(globalTypes, ownedType + ' should live with its feature').not.toContain('export type ' + ownedType);
    }
  });

  it('uses a non-AI package identity in package metadata and lockfile', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const packageLock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
    expect(packageJson.name).toBe('babygrowth');
    expect(packageLock.name).toBe('babygrowth');
    expect(packageLock.packages?.['']?.name).toBe('babygrowth');
    expect(JSON.stringify(packageLock)).not.toContain('babygrowth-ai');
  });

  it('keeps reusable moment preview styles owned by the preview component', () => {
    const preview = readFileSync(
      join(SRC, 'features', 'timeline', 'components', 'MomentMediaPreview.tsx'),
      'utf8',
    );
    const previewCss = readFileSync(
      join(SRC, 'features', 'timeline', 'components', 'moment-media-preview.css'),
      'utf8',
    );
    const timelineCss = readFileSync(join(SRC, 'features', 'timeline', 'timeline.css'), 'utf8');

    expect(preview).toContain("import './moment-media-preview.css';");
    expect(previewCss).toContain('.moment-media-preview-loading-thumbnail');
    expect(timelineCss).not.toContain('.moment-media-preview-page');
  });
});
