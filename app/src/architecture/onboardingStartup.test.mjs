import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');

describe('onboarding startup boundary', () => {
  it('defers profile and growth runtime until profile submission', () => {
    const onboarding = source('app/onboarding/OnboardingView.tsx');

    expect(onboarding).not.toContain("import { initializeChildProfile } from '@/features/profile'");
    expect(onboarding).toContain("await import('@/features/profile')");
  });
});
