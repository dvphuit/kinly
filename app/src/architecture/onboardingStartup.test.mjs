import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');

describe('onboarding startup boundary', () => {
  it('keeps profile UI and lifecycle runtime out of the onboarding import graph until submission', () => {
    const onboarding = source('app/onboarding/OnboardingView.tsx');
    const profileIndex = source('features/profile/index.ts');

    expect(onboarding).not.toContain("import { initializeChildProfile } from '@/features/profile'");
    expect(onboarding).toContain("await import('@/features/profile')");
    expect(onboarding).toContain('loadProfileLifecycle');
    expect(onboarding).not.toContain("@/features/profile/profileLifecycle");

    expect(profileIndex).not.toContain("export { ProfileView } from './ProfileView'");
    expect(profileIndex).not.toContain("export { GoogleDriveDataView } from './GoogleDriveDataView'");
    expect(profileIndex).not.toContain("export { EditProfileModal } from './EditProfileModal'");
    expect(profileIndex).not.toContain("from './profileLifecycle'");
    expect(profileIndex).toContain("return import('./profileLifecycle')");
    expect(profileIndex).toContain("await import('./profileUi')");
  });
});
