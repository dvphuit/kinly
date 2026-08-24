import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Cloud, CloudDownload, CloudUpload, Database, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
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
      <div className="profile-section-block">
        <div className="section-title-row">
          <span className="section-main-title"><Cloud size={16} /> Đồng bộ dữ liệu</span>
        </div>
        <div className="profile-medical-card">
          <div className="medical-info-row single">
            <div className="medical-info-item full">
              <div className="medical-item-icon"><ShieldCheck size={15} /></div>
              <div>
              <span className="medical-item-lbl">Sao lưu Google Drive</span>
              <span className="medical-item-val">Tính năng sao lưu chưa sẵn sàng trên phiên bản ứng dụng này.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const conflict = syncState.conflict;
  const statusLabel = syncState.status === 'auth-required' && linked
    ? 'Cần xác thực lại Google'
    : STATUS_LABELS[syncState.status];
  const connectionLabel = sessionActive ? 'Đã xác thực' : linked ? 'Đã liên kết' : 'Chưa kết nối';
  const accountLabel = formatGoogleAccount(account);
  const visibleError = syncState.status === 'auth-required' && linked ? null : error;

  return (
    <div className="profile-section-block">
      <div className="section-title-row">
        <span className="section-main-title"><Cloud size={16} /> Đồng bộ dữ liệu</span>
        <span className="section-score-pill">{connectionLabel}</span>
      </div>

      <div className="profile-medical-card">
        <div className="medical-info-row single">
          <div className="medical-info-item full">
            <div className="medical-item-icon"><ShieldCheck size={15} /></div>
            <div>
              <span className="medical-item-lbl">Thiết bị này + Google Drive</span>
              <span className="medical-item-val">Dữ liệu luôn được lưu trên thiết bị trước, sau đó sao lưu riêng lên Drive.</span>
            </div>
          </div>
        </div>
        {accountLabel && (
          <>
            <div className="medical-divider"></div>
            <div className="medical-info-row single">
              <div className="medical-info-item full">
                <div className="medical-item-icon"><UserRound size={15} /></div>
                <div>
                  <span className="medical-item-lbl">Tài khoản Google</span>
                  <span className="medical-item-val">{accountLabel}</span>
                </div>
              </div>
            </div>
          </>
        )}
        <div className="medical-divider"></div>
        <div className="medical-info-row single">
          <div className="medical-info-item full">
            <div className="medical-item-icon"><RefreshCw size={15} /></div>
            <div>
              <span className="medical-item-lbl" aria-live="polite">Trạng thái: {statusLabel}</span>
              <span className="medical-item-val">Lần cuối: {formatSyncTime(lastSyncedAt)}</span>
            </div>
          </div>
        </div>

        <div className="medical-allergy-box" style={{ marginTop: 16 }}>
          <div className="allergy-header"><RefreshCw size={14} color="var(--color-sage-dark)" /> Tự động đồng bộ</div>
          <p className="summary-desc">Khi bật, thay đổi mới sẽ được sao lưu khi ứng dụng có mạng. Google có thể yêu cầu xác thực lại sau một thời gian.</p>
          <button
            type="button"
            className={`profile-action-btn ${syncState.autoSyncEnabled ? 'primary' : 'secondary'}`}
            style={{ marginTop: 12 }}
            onClick={handleToggleAutoSync}
            disabled={busy || syncState.status === 'syncing'}
          >
            <RefreshCw size={16} className={syncState.status === 'syncing' ? 'spin' : ''} />
            <span>{syncState.autoSyncEnabled ? 'Tắt tự động đồng bộ' : 'Bật tự động đồng bộ'}</span>
          </button>
        </div>

        {conflict && (
          <div className="medical-allergy-box" style={{ marginTop: 16 }}>
            <div className="allergy-header"><RefreshCw size={14} color="#E97332" /> Dữ liệu đã thay đổi ở cả hai nơi</div>
            <p className="summary-desc">Chọn một bản để tiếp tục. Bản còn lại sẽ bị thay thế trên hệ thống tương ứng.</p>
            <div className="profile-action-buttons-group" style={{ marginTop: 12 }}>
              <button type="button" className="profile-action-btn primary" onClick={() => handleResolve('local')} disabled={busy}>
                <CloudUpload size={16} /> Giữ dữ liệu trên thiết bị
              </button>
              <button type="button" className="profile-action-btn secondary" onClick={() => handleResolve('remote')} disabled={busy}>
                <CloudDownload size={16} /> Dùng dữ liệu trên Drive
              </button>
            </div>
          </div>
        )}

        {visibleError && <p className="summary-desc" style={{ color: '#B45309', marginTop: 12 }}>{visibleError}</p>}

        <button type="button" className="profile-action-btn secondary" style={{ marginTop: 16 }} onClick={handleSync} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'spin' : ''} />
          <span>{busy ? 'Đang đồng bộ...' : sessionActive ? 'Đồng bộ ngay với Google Drive' : linked ? 'Xác thực lại & đồng bộ' : 'Kết nối Google & đồng bộ'}</span>
        </button>
        {linked && (
          <button type="button" className="profile-action-btn secondary" style={{ marginTop: 10 }} onClick={handleSwitchGoogleAccount} disabled={busy}>
            <UserRound size={16} />
            <span>Đổi tài khoản Google</span>
          </button>
        )}
        <button type="button" className="profile-drive-manage-link" onClick={() => navigate('/profile/google-drive')}>
          <span className="profile-drive-manage-icon"><Database size={17} /></span>
          <span><strong>Quản lý dữ liệu</strong><small>Xem dữ liệu trên máy và Google Drive</small></span>
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
};
