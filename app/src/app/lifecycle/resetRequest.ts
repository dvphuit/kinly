import { removeLocalRecord } from '@/data/localDb';
import { SYNC_KEYS } from '@/features/sync/googleDriveSync';
import { resetNormalizedDatabase } from '@/data/normalizedRepositories';

const STORE_KEYS = [...SYNC_KEYS, 'babygrowth_v4_expenses', 'babygrowth_v4_sync_meta'];

/** Wipes the current local persistence generation and reloads without reset. */
export async function handleResetRequest(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('reset')) return false;

  await Promise.all(STORE_KEYS.map((key) => removeLocalRecord(key)));
  await resetNormalizedDatabase();
  window.localStorage.removeItem('babygrowth_v4_device_id');

  params.delete('reset');
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.location.replace(next);
  return true;
}
