import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/store/useUIStore';
import { useFamily } from '@/features/profile';
import { useLocalDayReference } from '@/shared/hooks/useLocalDayReference';
import { formatVietnameseDate } from '@/utils/date';
import { Baby, Bell, Calendar, ChevronRight, Heart } from 'lucide-react';
import { AppBar } from '@/shared/ui/AppBar';

interface HeaderProps {
  onOpenNotifications: () => void;
  onProfileIntent?: () => void;
}

function formatAge(birthDate: string, referenceDate: Date): string {
  const birth = new Date(birthDate);
  if (!Number.isFinite(birth.getTime())) return '';
  let months = (referenceDate.getFullYear() - birth.getFullYear()) * 12 + referenceDate.getMonth() - birth.getMonth();
  if (referenceDate.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return '';
  if (months < 24) return `${months} tháng`;
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return restMonths ? `${years} tuổi ${restMonths} tháng` : `${years} tuổi`;
}

export const Header = memo(function Header({ onOpenNotifications, onProfileIntent }: HeaderProps) {
  const navigate = useNavigate();
  const profileMode = useUIStore((state) => state.profileMode);
  const setProfileMode = useUIStore((state) => state.setProfileMode);
  const family = useFamily();
  const dayReference = useLocalDayReference();
  const isMom = profileMode === 'mom';
  const name = isMom ? family.momName : family.childName;
  const avatar = isMom ? family.momAvatar : family.childAvatar;
  const todayFormatted = formatVietnameseDate(dayReference);
  const ageText = !isMom ? formatAge(family.birthDate, dayReference) : '';

  return (
    <AppBar
      id="mainHeader"
      className="app-header"
      tone={isMom ? 'mom' : 'baby'}
      variant="profile"
      ariaLabel="Thanh điều hướng chính"
      start={(
        <button
          type="button"
          className="header-profile-main"
          onClick={() => navigate('/profile', { viewTransition: true })}
          onPointerDown={onProfileIntent}
          onPointerEnter={onProfileIntent}
          onFocus={onProfileIntent}
          title="Xem hồ sơ"
          id="btnHeaderProfile"
        >
          <div className="header-avatar-circle">
            <img className="header-avatar-img" src={avatar} alt={name} />
          </div>
          <div className="header-profile-meta">
            <span className="header-date-text">
              <Calendar size={11} strokeWidth={2.2} />
              <span>{todayFormatted}</span>
            </span>
            <div className="header-welcome-title">
              <span>{name}</span>
              <ChevronRight size={13} />
            </div>
            <span className="header-profile-caption">
              {isMom ? 'Chăm sóc & phục hồi' : ageText || 'Hồ sơ của Bé'}
            </span>
          </div>
        </button>
      )}
      end={(
        <div className="header-right-actions">
          <div className="dual-mode-toggle" aria-label="Chọn hồ sơ theo dõi">
            <button type="button" className={`dual-mode-btn ${!isMom ? 'active' : ''}`} id="btnModeBaby" aria-pressed={!isMom} onClick={() => setProfileMode('baby')}>
              <Baby size={13} strokeWidth={2.2} />
              <span>Bé</span>
            </button>
            <button type="button" className={`dual-mode-btn ${isMom ? 'active' : ''}`} id="btnModeMom" aria-pressed={isMom} onClick={() => setProfileMode('mom')}>
              <Heart size={12} strokeWidth={2.2} />
              <span>Mẹ</span>
            </button>
          </div>
          <button
            type="button"
            className="header-notification-btn"
            id="btnNotification"
            title="Thông báo"
            aria-label="Mở thông báo"
            onClick={onOpenNotifications}
          >
            <Bell size={15} strokeWidth={2.2} />
          </button>
        </div>
      )}
    />
  );
});
