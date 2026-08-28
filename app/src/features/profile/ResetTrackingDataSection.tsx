import { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { resetTrackingData } from '@/app/lifecycle/trackingDataReset';

interface ResetTrackingDataSectionProps {
  onShowToast?: (msg: string, icon?: string) => void;
}

export function ResetTrackingDataSection({ onShowToast }: ResetTrackingDataSectionProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeConfirmation = () => {
    if (isResetting) return;
    setIsOpen(false);
    setError(null);
  };

  const handleConfirm = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setError(null);

    try {
      const result = await resetTrackingData();
      if (result.status === 'synced') {
        onShowToast?.('Đã đặt lại dữ liệu và đồng bộ Google Drive.', '✓');
      } else {
        onShowToast?.(`Đã đặt lại dữ liệu cục bộ. Cần đồng bộ lại Google Drive: ${result.error}`, '⚠️');
      }
      navigate('/');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Không thể đặt lại dữ liệu.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <section className="profile-reset-section" aria-labelledby="profile-reset-title">
      <button
        type="button"
        className="profile-quick-action"
        aria-label="Đặt lại dữ liệu theo dõi"
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
      >
        <span className="profile-quick-action-icon"><AlertTriangle size={18} /></span>
        <span className="profile-quick-action-copy">
          <strong id="profile-reset-title">Đặt lại dữ liệu theo dõi</strong>
          <small>Xóa dữ liệu Bé & Mẹ, vẫn giữ hồ sơ và thông tin lúc sinh</small>
        </span>
        <RotateCcw size={17} />
      </button>

      <BottomSheet
        isOpen={isOpen}
        onClose={closeConfirmation}
        title="Xác nhận đặt lại dữ liệu"
        dismissible={!isResetting}
        footer={
          <>
            <button type="button" className="sheet-action sheet-action-secondary" onClick={closeConfirmation} disabled={isResetting}>Hủy</button>
            <button type="button" className="sheet-action sheet-action-primary" onClick={handleConfirm} disabled={isResetting}>
              {isResetting ? 'Đang đặt lại dữ liệu…' : 'Xác nhận đặt lại'}
            </button>
          </>
        }
      >
        <div className="tracker-sheet-form" aria-busy={isResetting}>
          <div className="tracker-sheet-intro">
            <span className="tracker-sheet-intro-icon"><AlertTriangle size={20} /></span>
            <div className="tracker-sheet-intro-copy">
              <span className="tracker-sheet-kicker">KHÔNG THỂ HOÀN TÁC</span>
              <p>Dữ liệu theo dõi sẽ được làm sạch trước khi Kinly tạo trạng thái đồng bộ mới.</p>
            </div>
          </div>

          <section className="tracker-sheet-section">
            <div className="tracker-sheet-section-header">
              <span>Dữ liệu sẽ bị xóa</span>
              <small>Hồ sơ vẫn được giữ</small>
            </div>
            <p className="profile-sync-description">Cữ bú, giấc ngủ, tã, số đo, hoạt động, nhật ký, chi phí và nhắc nhở của Bé và Mẹ sẽ bị xóa.</p>
            <p className="profile-sync-description">Hồ sơ của Bé và Mẹ cùng thông tin lúc sinh vẫn được giữ lại.</p>
            <p className="profile-sync-description">Bản sao lưu hiện có trên Google Drive sẽ được thay thế sau lần đồng bộ tiếp theo.</p>
            {error && <p className="profile-sync-error" role="alert">{error}</p>}
          </section>
        </div>
      </BottomSheet>
    </section>
  );
}
