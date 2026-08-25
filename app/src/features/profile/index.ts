export { initializeChildProfile, resetChildStoresToDefaults } from './profileLifecycle';
export { useProfileStore } from './store/useProfileStore';
export { useFamily } from './hooks/useFamily';
export type { FamilyData, ProfileMode } from './domain/types';

export async function loadProfileStyles(): Promise<void> {
  await import('./profile.css');
}

export async function loadProfileFeature() {
  const feature = await import('./profileUi');
  return {
    EditProfileModal: feature.EditProfileModal,
    GoogleDriveDataView: feature.GoogleDriveDataView,
    ProfileView: feature.ProfileView,
    loadProfileStyles,
  };
}
