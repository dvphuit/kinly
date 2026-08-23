import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Cloud, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { AppBar } from '@/shared/ui/AppBar';
import {
  clearPasskeyTokenVault,
  hasGoogleRefreshTokenInPasskeyVault,
  hasPasskeyTokenVault,
  isPasskeyTokenVaultSupported,
  PasskeyTokenVaultError,
} from './passkeyTokenVault';
import './passkey-vault-prototype.css';

type CapabilityState = 'checking' | 'available' | 'unavailable';

function errorMessage(error: unknown): string {
  if (error instanceof PasskeyTokenVaultError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thể hoàn thành thao tác Passkey.';
}

export function PasskeyVaultPrototypeView() {
  const navigate = useNavigate();
  const [capability, setCapability] = useState<CapabilityState>('checking');
  const [vaultExists, setVaultExists] = useState(false);
  const [googleTokenReady, setGoogleTokenReady] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Đang kiểm tra Passkey và Google Drive trên thiết bị...');

  const refreshState = useCallback(async () => {
    setCapability('checking');
    try {
      const sync = await import('./index');
      const [supported, exists, hasGoogleToken] = await Promise.all([
        isPasskeyTokenVaultSupported(),
        hasPasskeyTokenVault(),
        hasGoogleRefreshTokenInPasskeyVault(),
      ]);
      setCapability(supported ? 'available' : 'unavailable');
      setVaultExists(exists);
      setGoogleTokenReady(hasGoogleToken);
      setSessionActive(sync.isGoogleSessionActive());
      setStatus(supported
        ? hasGoogleToken
          ? sync.isGoogleSessionActive()
            ? 'Google Drive đang hoạt động. Refresh token được mã hóa bằng Passkey trên thiết bị này.'
            : 'Google refresh token đã được bảo vệ bằng Passkey. Mở khóa để khôi phục phiên Google Drive.'
          : exists
            ? 'Passkey thử nghiệm cũ đã sẵn sàng. Kết nối Google Drive một lần để chuyển refresh token vào vault này.'
            : 'Thiết bị hỗ trợ Passkey. Kết nối Google Drive một lần để tạo vault và lưu refresh token đã mã hóa.'
        : 'Thiết bị hoặc trình duyệt chưa đáp ứng WebAuthn PRF trong secure context HTTPS.');
    } catch (error) {
      setCapability('unavailable');
      setStatus(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const connectGoogle = async () => {
    if (busy || capability !== 'available') return;
    setBusy(true);
    setStatus('Đang mở Google để cấp refresh token lần cuối...');
    try {
      const sync = await import('./index');
      await sync.startGoogleOAuth();
    } catch (error) {
      setStatus(errorMessage(error));
      setBusy(false);
    }
  };

  const unlockGoogle = async () => {
    if (busy || capability !== 'available') return;
    setBusy(true);
    setStatus('Đang xác thực Passkey và làm mới Google Drive...');
    try {
      const sync = await import('./index');
      const restored = await sync.restoreGoogleSession();
      if (!restored) throw new Error('Chưa có Google refresh token trong Passkey vault.');
      setSessionActive(true);
      setStatus('Google Drive đã được mở khóa. Access token mới chỉ nằm trong RAM; refresh token vẫn được mã hóa trên thiết bị.');
    } catch (error) {
      setSessionActive(false);
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const clearVault = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearPasskeyTokenVault();
      setVaultExists(false);
      setGoogleTokenReady(false);
      setSessionActive(false);
      setStatus('Đã xóa refresh token đã mã hóa khỏi thiết bị. Lần kết nối tiếp theo sẽ cần đăng nhập Google lại.');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <main className="passkey-vault-prototype" aria-label="Google Drive bằng Passkey">
      <AppBar
        className="passkey-vault-appbar"
        tone="baby"
        variant="page"
        ariaLabel="Google Drive bằng Passkey"
        start={(
          <button type="button" className="passkey-vault-back" onClick={() => navigate('/profile/google-drive')} aria-label="Quay lại Google Drive">
            <ArrowLeft size={20} />
          </button>
        )}
        center={(
          <div className="passkey-vault-title">
            <span>BẢO MẬT GOOGLE DRIVE</span>
            <h1>Google Drive bằng Passkey</h1>
          </div>
        )}
      />

      <div className="passkey-vault-content">
        <section className="passkey-vault-card" aria-labelledby="passkey-vault-heading">
          <span className="passkey-vault-icon" aria-hidden="true"><KeyRound size={25} /></span>
          <div className="passkey-vault-heading-copy">
            <span className="passkey-vault-badge">Refresh token local · AES-256-GCM</span>
            <h2 id="passkey-vault-heading">Không cần đăng nhập Google mỗi lần</h2>
            <p>Kinly dùng Passkey để mở refresh token đã mã hóa trên thiết bị, sau đó chỉ giữ access token ngắn hạn trong RAM để đồng bộ Google Drive.</p>
          </div>
        </section>

        <section className={`passkey-vault-status is-${capability}`} aria-live="polite">
          <span className="passkey-vault-status-icon" aria-hidden="true">
            {capability === 'checking' ? <RefreshCw size={19} className="spin" /> : capability === 'available' ? <ShieldCheck size={19} /> : <LockKeyhole size={19} />}
          </span>
          <div className="passkey-vault-status-copy">
            <strong>{capability === 'checking'
              ? 'Đang kiểm tra'
              : capability === 'available'
                ? googleTokenReady
                  ? sessionActive ? 'Google Drive đang hoạt động' : 'Đã bảo vệ bằng Passkey'
                  : 'Sẵn sàng thiết lập'
                : 'Chưa thể sử dụng Passkey'}</strong>
            <p>{status}</p>
          </div>
        </section>

        <section className="passkey-vault-actions" aria-label="Thao tác Google Drive Passkey">
          {googleTokenReady ? (
            <button type="button" className="passkey-vault-primary" onClick={() => void unlockGoogle()} disabled={busy || capability !== 'available'}>
              <LockKeyhole size={17} /> {busy ? 'Đang xác thực...' : sessionActive ? 'Làm mới phiên bằng Passkey' : 'Mở khóa Google Drive'}
            </button>
          ) : (
            <button type="button" className="passkey-vault-primary" onClick={() => void connectGoogle()} disabled={busy || capability !== 'available'}>
              <Cloud size={17} /> {busy ? 'Đang kết nối...' : 'Kết nối Google Drive một lần'}
            </button>
          )}
          {vaultExists && (
            <button type="button" className="passkey-vault-secondary danger" onClick={() => void clearVault()} disabled={busy}>
              <Trash2 size={16} /> Xóa token khỏi thiết bị
            </button>
          )}
          <button type="button" className="passkey-vault-secondary" onClick={() => void refreshState()} disabled={busy}>
            <RefreshCw size={16} /> Kiểm tra lại
          </button>
        </section>

        <section className="passkey-vault-notes">
          <div className="passkey-vault-notes-heading">
            <ShieldCheck size={18} aria-hidden="true" />
            <h2>Luồng hoạt động</h2>
          </div>
          <ul>
            <li>Lần đầu: đăng nhập Google một lần, rồi refresh token được chuyển vào Passkey vault local và bản tạm trên server bị xóa.</li>
            <li>Mỗi lần mở app: xác thực Passkey một lần để giải mã refresh token vào RAM.</li>
            <li>Khi access token hết hạn trong cùng phiên, Kinly tự làm mới mà không hỏi Google hoặc Passkey lại.</li>
            <li>Chỉ cần đăng nhập Google lại nếu refresh token bị Google thu hồi hoặc bạn xóa vault trên thiết bị.</li>
          </ul>
        </section>
      </div>
    </main>,
    document.body,
  );
}
