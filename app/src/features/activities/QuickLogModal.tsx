import { Camera, HeartPulse, Sparkles } from 'lucide-react';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import {
  HavenDiaperIcon,
  HavenFeedingIcon,
  HavenIconBadge,
  HavenMedicineIcon,
  HavenPumpingIcon,
  HavenScaleIcon,
  HavenSleepIcon,
  HavenTemperatureIcon,
  HavenWalletIcon,
} from '@/shared/ui/HavenIcons';
import { useUIStore } from '@/store/useUIStore';

interface QuickLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionType: string) => void;
}

type QuickActionTone = 'sage' | 'rose' | 'amber' | 'lavender' | 'clay' | 'blue' | 'meadow';

export const QuickLogModal: React.FC<QuickLogModalProps> = ({ isOpen, onClose, onSelectAction }) => {
  const profileMode = useUIStore((state) => state.profileMode);
  const isMom = profileMode === 'mom';

  const handleAction = (type: string) => {
    onClose();
    onSelectAction(type);
  };

  const Action = ({
    type,
    label,
    icon,
    tone = 'sage',
  }: {
    type: string;
    label: string;
    icon: React.ReactNode;
    tone?: QuickActionTone;
  }) => (
    <button
      type="button"
      className={`quick-action-item tone-${tone}`}
      onClick={() => handleAction(type)}
    >
      <HavenIconBadge icon={icon} tone={tone} size="lg" />
      <span className="action-item-label">{label}</span>
    </button>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Ghi nhanh cho ${isMom ? 'Mẹ' : 'Bé'}`}
      className="kinly-themed-sheet quick-log-bottom-sheet"
      touchOptimized
    >
      <div className="quick-log-sheet">
        <div className="quick-log-intro">
          <span className="quick-log-intro-icon"><Sparkles size={19} /></span>
          <div className="quick-log-intro-copy">
            <span className="quick-log-kicker">{isMom ? 'NHẬT KÝ CỦA MẸ' : 'NHẬT KÝ CỦA BÉ'}</span>
            <p>Chọn hoạt động vừa diễn ra để ghi lại trong vài giây.</p>
          </div>
        </div>

        <div className="quick-log-actions-grid">
          {isMom ? (
            <>
              <Action
                type="pumping"
                label="Hút sữa"
                icon={<HavenPumpingIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="rose"
              />
              <Action
                type="mom-sleep"
                label="Giấc ngủ"
                icon={<HavenSleepIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="lavender"
              />
              <Action
                type="mom-mood"
                label="Tâm lý"
                icon={<HeartPulse size={22} />}
                tone="rose"
              />
            </>
          ) : (
            <>
              <Action
                type="feeding"
                label="Cữ bú"
                icon={<HavenFeedingIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="sage"
              />
              <Action
                type="diaper"
                label="Thay tã"
                icon={<HavenDiaperIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="amber"
              />
              <Action
                type="baby-sleep"
                label="Giấc ngủ"
                icon={<HavenSleepIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="lavender"
              />
              <Action
                type="temperature"
                label="Nhiệt độ"
                icon={<HavenTemperatureIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="rose"
              />
              <Action
                type="medicine"
                label="Thuốc / vitamin"
                icon={<HavenMedicineIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="blue"
              />
              <Action
                type="growth"
                label="Cân đo"
                icon={<HavenScaleIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="meadow"
              />
              <Action
                type="smart-expense"
                label="Chi tiêu"
                icon={<HavenWalletIcon size={24} color="currentColor" secondaryColor="var(--quick-action-icon-soft)" />}
                tone="clay"
              />
              <Action
                type="diary"
                label="Khoảnh khắc"
                icon={<Camera size={22} />}
                tone="clay"
              />
            </>
          )}
        </div>

        <p className="quick-log-hint">Chạm một mục để mở biểu mẫu tương ứng.</p>
      </div>
    </BottomSheet>
  );
};
