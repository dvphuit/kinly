export { EditProfileModal } from './EditProfileModal';
export { GoogleDriveDataView } from './GoogleDriveDataView';
export { ProfileView } from './ProfileView';
export { initializeChildProfile, resetChildStoresToDefaults } from './profileLifecycle';
export { useProfileStore } from './store/useProfileStore';
export { useFamily } from './hooks/useFamily';
export type { FamilyData, ProfileMode } from './domain/types';

export async function loadProfileStyles(): Promise<void> {
  await import('./profile.css');
}
