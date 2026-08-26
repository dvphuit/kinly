import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Cloud, CloudDownload, CloudUpload, Database, RefreshCw, UserRound } from 'lucide-react';
import {
  getGoogleLinkedAccount,
  getLastSyncedAt,
  getSyncState,
  isGoogleConfigured,
  isGoogleLinked,
  isGoogleSessionActive,
  requestGoogleAccessToken,
  resolveSyncConflict,
  setAutoSyncEnabled,
  subscribeSyncState,
  syncWithGoogleDrive,
  type GoogleAccountIdentity,
  type SyncResult,
  type SyncState,
} from '@/features/sync';

interface GoogleSyncCardProps {
  onShowToast?: (message: string, icon?: string) => void;
}

function formatSyncTime(value: string | null): string {
  if (!value) return 'Chưa đồng bộ';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatGoogleAccount(account: GoogleAccountIdentity | null): string | null {
  if (!account) return null;
  return account.emailAddress || account.displayName || null;
}

const STATUS_LABELS: Record<SyncState['status'], string> = {
  idle: 'Sẵn sàng',
  syncing: 'Đang đồng bộ...',
  synced: 'Đã đồng bộ',
  offline: 'Ngoại tuyến · Lưu trên máy',
  'auth-required': 'Cần kết nối Google',
  error: 'Cần thử lại',
  conflict: 'Cần chọn dữ liệu',
};

export const GoogleSyncCard: React.FC<GoogleSyncCardProps> = ({ onShowToast }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState(isGoogleLinked());
  const [sessionActive, setSessionActive] = useState(isGoogleSessionActive());
  const [account, setAccount] = useState<GoogleAccountIdentity | null>(getGoogleLinkedAccount());
  const [syncState, setSyncState] = useState<SyncState>(getSyncState());
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(getSyncState().lastSyncedAt);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeSyncState((state) => {
      setSyncState(state);
      setLastSyncedAt(state.lastSyncedAt);
      setLinked(isGoogleLinked());
      setSessionActive(isGoogleSessionActive());
      setAccount(getGoogleLinkedAccount());
      setError(state.error);
    });
    getLastSyncedAt().then((value) => {
      setLastSyncedAt(value);
    }).catch(() => {});
    return unsubscribe;
  }, []);

  const showResult = (result: Exclude<SyncResult, { status: 'conflict' }>) => {
    if (result.status === 'uploaded') onShowToast?.('Đã tự động đẩy dữ liệu lên Google Drive.', '☁️');
    if (result.status === 'downloaded') onShowToast?.('Đã nhận dữ liệu mới từ Google Drive.', '⬇️');
    if (result.status === 'unchanged') onShowToast?.('Dữ liệu local và Google Drive đã đồng nhất.', '✓');
  };

  const ensureGoogleSession = async () => {
    if (isGoogleSessionActive()) return;
    const nextAccount = await requestGoogleAccessToken();
    setAccount(nextAccount);
    setLinked(true);
    setSessionActive(true);
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureGoogleSession();
      const result = await syncWithGoogleDrive();
      if (result.status === 'conflict') {
        onShowToast?.('Phát hiện hai phiên bản dữ liệu khác nhau. Hãy chọn bản muốn giữ.', '⚠️');
      } else {
        showResult(result);
      }
    } catch (syncError) {
      setSessionActive(isGoogleSessionActive());
      setError(syncError instanceof Error ? syncError.message : 'Không thể đồng bộ với Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAutoSync = async () => {
    setBusy(true);
    setError(null);
    try {
      if (syncState.autoSyncEnabled) {
        await setAutoSyncEnabled(false);
        onShowToast?.('Đã tắt tự động đồng bộ. Dữ liệu vẫn được lưu local.', '◌');
        return;
      }

      await ensureGoogleSession();
      await setAutoSyncEnabled(true);
      const result = await syncWithGoogleDrive();
      if (result.status === 'conflict') {
        onShowToast?.('Auto-sync đã bật nhưng cần chọn bản dữ liệu đầu tiên.', '⚠️');
      } else {
        showResult(result);
        onShowToast?.('Đã bật tự động đồng bộ khi dữ liệu thay đổi.', '↻');
      }
    } catch (toggleError) {
      setSessionActive(isGoogleSessionActive());
      setError(toggleError instanceof Error ? toggleError.message : 'Không thể bật auto-sync.');
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      const nextAccount = await requestGoogleAccessToken({ selectAccount: true });
      setAccount(nextAccount);
      setLinked(true);
      setSessionActive(true);
      const label = formatGoogleAccount(nextAccount);
      onShowToast?.(label ? `Đã chuyển Google Drive sang ${label}.` : 'Đã chuyển tài khoản Google Drive.', '👤');
    } catch (switchError) {
      setSessionActive(isGoogleSessionActive());
      setError(switchError instanceof Error ? switchError.message : 'Không thể đổi tài khoản Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async (choice: 'local' | 'remote') => {
    const conflict = syncState.conflict;
    if (!conflict) return;
    setBusy(true);
    setError(null);
    try {
      const result = await resolveSyncConflict(choice, conflict.remote);
      if (result === 'downloaded') {
        onShowToast?.('Đã áp dụng dữ liệu trên Google Drive.', '⬇️');
      } else {
        onShowToast?.('Đã chọn dữ liệu local và cập nhật bản Drive.', '☁️');
      }
    } catch (resolveError) {
      setSessionActive(isGoogleSessionActive());
      setError(resolveError instanceof Error ? resolveError.message : 'Không thể xử lý xung đột.');
    } finally {
      setBusy(false);
    }
  };

  if (!isGoogleConfigured()) {
    return (
      <section className="profile-sync-card profile-sync-card-muted" aria-labelledby="profile-sync-title">
        <div className="profile-sync-header">
          <span className="profile-sync-icon"><Cloud size={20} /></span>
          <div className="profile-sync-title">
            <span>Sao lưu</span>
            <h2 id="profile-sync-title">Google Drive</h2>
          </div>
          <span className="profile-sync-status muted">Chưa sẵn sàng</span>
        </div>
        <p className="profile-sync-description">Tính năng sao lưu chưa sẵn sàng trên phiên bản ứng dụng này.</p>
      </section>
    );
  }

  const conflict = syncState.conflict;
  const statusLabel = syncState.status === 'auth-required' && linked
    ? 'Cần xác thực lại Google'
    : STATUS_LABELS[syncState.status];
  const connectionLabel = sessionActive ? 'Đã xác thực' : linked ? 'Đã liên kết' : 'Chưa kết nối';
  const accountLabel = formatGoogleAccount(account);
  const visibleError = syncState.status === 'auth-required' && linked ? null : error;
  const syncButtonLabel = busy
    ? 'Đang đồng bộ...'
    : sessionActive
      ? 'Đồng bộ ngay với Google Drive'
      : linked
        ? 'Xác thực lại & đồng bộ'
        : 'Kết nối Google & đồng bộ';

  return (
    <section className="profile-sync-card" aria-labelledby="profile-sync-title">
      <div className="profile-sync-header">
        <span className="profile-sync-icon"><Cloud size={20} /></span>
        <div className="profile-sync-title">
          <span aria-live="polite">{statusLabel}</span>
          <h2 id="profile-sync-title">Google Drive</h2>
        </div>
        <span className={`profile-sync-status ${sessionActive ? 'active' : linked ? 'linked' : 'muted'}`}>{connectionLabel}</span>
      </div>

      {accountLabel && (
        <div className="profile-sync-account">
          <span className="profile-sync-row-icon"><UserRound size={16} /></span>
          <div>
            <span>{`Lần cuối · ${formatSyncTime(lastSyncedAt)}`}</span>
            <strong>{accountLabel}</strong>
          </div>
          <button type="button" onClick={handleSwitchGoogleAccount} disabled={busy} aria-label="Đổi tài khoản Google">
            Đổi
          </button>
        </div>
      )}

      <div className="profile-sync-auto">
        <div>
          <span>Tự động sao lưu</span>
          <small>Lưu thay đổi mới lên Drive khi có mạng.</small>
        </div>
        <button
          type="button"
          className={syncState.autoSyncEnabled ? 'is-on' : 'is-off'}
          aria-pressed={syncState.autoSyncEnabled}
          aria-label={syncState.autoSyncEnabled ? 'Tắt tự động đồng bộ' : 'Bật tự động đồng bộ'}
          onClick={handleToggleAutoSync}
          disabled={busy || syncState.status === 'syncing'}
        >
          <span aria-hidden="true" />
          {syncState.autoSyncEnabled ? 'Bật' : 'Tắt'}
        </button>
      </div>

      {conflict && (
        <div className="profile-sync-alert" role="alert">
          <div className="profile-sync-alert-title"><RefreshCw size={15} /> Dữ liệu đã thay đổi ở cả hai nơi</div>
          <p>Chọn một bản để tiếp tục. Bản còn lại sẽ bị thay thế trên hệ thống tương ứng.</p>
          <div className="profile-sync-conflict-actions">
            <button type="button" onClick={() => handleResolve('local')} disabled={busy}>
              <CloudUpload size={15} /> Giữ dữ liệu trên thiết bị
            </button>
            <button type="button" onClick={() => handleResolve('remote')} disabled={busy}>
              <CloudDownload size={15} /> Dùng dữ liệu trên Drive
            </button>
          </div>
        </div>
      )}

      {visibleError && <p className="profile-sync-error" role="alert">{visibleError}</p>}

      <button type="button" className="profile-sync-primary" onClick={handleSync} disabled={busy}>
        <RefreshCw size={16} className={busy || syncState.status === 'syncing' ? 'spin' : ''} />
        <span>{syncButtonLabel}</span>
      </button>

      <button type="button" className="profile-sync-manage" onClick={() => navigate('/profile/google-drive')}>
        <span className="profile-sync-row-icon"><Database size={16} /></span>
        <span>
          <strong>Quản lý dữ liệu</strong>
          <small>Local & Google Drive</small>
        </span>
        <ChevronRight size={17} />
      </button>
    </section>
  );
};