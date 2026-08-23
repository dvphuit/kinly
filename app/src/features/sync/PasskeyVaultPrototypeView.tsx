import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { AppBar } from '@/shared/ui/AppBar';
import {
  clearPasskeyTokenVault,
  createPasskeyTokenVault,
  hasPasskeyTokenVault,
  isPasskeyTokenVaultSupported,
  PasskeyTokenVaultError,
  unlockPasskeyTokenVault,
} from './passkeyTokenVault';
import './passkey-vault-prototype.css';

type CapabilityState = 'checking' | 'available' | 'unavailable';

function errorMessage(error: unknown): string {
  if (error instanceof PasskeyTokenVaultError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thể hoàn thành thử nghiệm passkey vault.';
}

export function PasskeyVaultPrototypeView() {
  const navigate = useNavigate();
  const [capability, setCapability] = useState<CapabilityState>('checking');
  const [vaultExists, setVaultExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Đang kiểm tra WebAuthn trên thiết bị...');

  const refreshState = useCallback(async () => {
    setCapability('checking');
    try {
      const [supported, exists] = await Promise.all([
        isPasskeyTokenVaultSupported(),
        hasPasskeyTokenVault(),
      ]);
      setCapability(supported ? 'available' : 'unavailable');
      setVaultExists(exists);
      setStatus(supported
        ? exists
          ? 'Vault thử nghiệm đã tồn tại. Bạn có thể mở khóa lại bằng passkey.'
          : 'Thiết bị có platform authenticator. Có thể bắt đầu thử WebAuthn PRF.'
        : 'Thiết bị hoặc trình duyệt chưa đáp ứng điều kiện WebAuthn passkey trong secure context.');
    } catch (error) {
      setCapability('unavailable');
      setStatus(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const createVault = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const probeSecret = `${crypto.randomUUID()}:${crypto.randomUUID()}`;
      await createPasskeyTokenVault(probeSecret);
      setVaultExists(true);
      setStatus('Đã tạo vault. Secret thử nghiệm chỉ được lưu dưới dạng AES-GCM ciphertext trong IndexedDB.');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const unlockVault = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const secret = await unlockPasskeyTokenVault();
      if (!secret) throw new Error('Vault giải mã thành công nhưng không có payload.');
      setStatus('Mở khóa thành công. Payload được giải mã trong RAM và không hiển thị ra giao diện.');
    } catch (error) {
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
      setStatus('Đã xóa ciphertext và metadata vault khỏi IndexedDB. Passkey đã tạo vẫn do hệ điều hành quản lý.');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="passkey-vault-prototype">
      <AppBar
        tone="baby"
        variant="page"
        ariaLabel="Thử nghiệm passkey vault"
        start={(
          <button type="button" className="passkey-vault-back" onClick={() => navigate('/profile/google-drive')} aria-label="Quay lại Google Drive">
            <ArrowLeft size={20} />
          </button>
        )}
        center={(
          <div className="passkey-vault-title">
            <span>EXPERIMENT</span>
            <h1>Passkey token vault</h1>
          </div>
        )}
      />

      <div className="passkey-vault-content">
        <section className="passkey-vault-card" aria-labelledby="passkey-vault-heading">
          <span className="passkey-vault-icon"><KeyRound size={26} /></span>
          <div className="passkey-vault-heading-copy">
            <span className="passkey-vault-badge">Không dùng token Google thật</span>
            <h2 id="passkey-vault-heading">WebAuthn PRF + AES-256-GCM</h2>
            <p>Prototype tạo một secret ngẫu nhiên, dẫn xuất khóa từ passkey bằng PRF rồi chỉ lưu ciphertext, IV và salt trong IndexedDB.</p>
          </div>
        </section>

        <section className="passkey-vault-status" aria-live="polite">
          <span className={`passkey-vault-status-icon is-${capability}`}>
            {capability === 'checking' ? <RefreshCw size={19} className="spin" /> : capability === 'available' ? <ShieldCheck size={19} /> : <LockKeyhole size={19} />}
          </span>
          <div>
            <strong>{capability === 'checking' ? 'Đang kiểm tra' : capability === 'available' ? 'Có thể thử trên thiết bị này' : 'Chưa thể thử'}</strong>
            <p>{status}</p>
          </div>
        </section>

        <section className="passkey-vault-actions" aria-label="Thao tác passkey vault">
          {!vaultExists ? (
            <button type="button" className="passkey-vault-primary" onClick={() => void createVault()} disabled={busy || capability !== 'available'}>
              <KeyRound size={17} /> {busy ? 'Đang tạo...' : 'Tạo vault thử nghiệm'}
            </button>
          ) : (
            <>
              <button type="button" className="passkey-vault-primary" onClick={() => void unlockVault()} disabled={busy || capability !== 'available'}>
                <LockKeyhole size={17} /> {busy ? 'Đang xác thực...' : 'Mở khóa bằng Passkey'}
              </button>
              <button type="button" className="passkey-vault-secondary" onClick={() => void clearVault()} disabled={busy}>
                <Trash2 size={16} /> Xóa vault thử nghiệm
              </button>
            </>
          )}
          <button type="button" className="passkey-vault-secondary" onClick={() => void refreshState()} disabled={busy}>
            <RefreshCw size={16} /> Kiểm tra lại
          </button>
        </section>

        <section className="passkey-vault-notes">
          <h2>Prototype này chứng minh gì?</h2>
          <ul>
            <li>PRF output, AES key và plaintext secret không được ghi vào storage.</li>
            <li>Mở lại vault yêu cầu WebAuthn user verification trên passkey đã tạo.</li>
            <li>Google OAuth hiện tại chưa được đổi. Refresh token thật chưa đi vào PWA trong thử nghiệm này.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
