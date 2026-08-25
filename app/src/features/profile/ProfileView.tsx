import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronRight,
  Droplet,
  Edit3,
  HeartPulse,
  MapPin,
  Ruler,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import { useFamily } from '@/features/profile/hooks/useFamily';
import { GoogleSyncCard } from './GoogleSyncCard';
import { ResetTrackingDataSection } from './ResetTrackingDataSection';
import { formatDateDisplay } from '@/utils/date';
import { getZodiacSign } from '@/utils/zodiac';
import { getRealGrowthHistory } from '@/features/growth/domain/growthSelectors';
import { AppBar } from '@/shared/ui/AppBar';
import './ProfileView.css';

interface ProfileViewProps {
  onOpenEditProfile: () => void;
  onOpenNotifications: () => void;
  onShowToast?: (msg: string, icon?: string) => void;
}

function parseLocalDate(dateStr: string): Date | null {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getAgeCopy(dateStr: string): { primary: string; secondary: string } | null {
  const birth = parseLocalDate(dateStr);
  if (!birth) return null;

  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (birth > current) return { primary: 'Sắp chào đời', secondary: 'Cả nhà đang chờ con' };

  let months = (current.getFullYear() - birth.getFullYear()) * 12 + current.getMonth() - birth.getMonth();
  let anchor = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate());
  if (anchor > current) {
    months -= 1;
    anchor = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate());
  }

  const days = Math.max(0, Math.floor((current.getTime() - anchor.getTime()) / 86_400_000));
  const totalDays = Math.max(0, Math.floor((current.getTime() - birth.getTime()) / 86_400_000));
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  let primary = `${totalDays} ngày tuổi`;
  if (years > 0) primary = `${years} tuổi${remainingMonths ? ` ${remainingMonths} tháng` : ''}`;
  else if (months > 0) primary = `${months} tháng${days ? ` ${days} ngày` : ''}`;

  return { primary, secondary: `${totalDays} ngày bên gia đình` };
}

function displayValue(value?: string, fallback = 'Chưa cập nhật'): string {
  return value?.trim() || fallback;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onOpenEditProfile, onOpenNotifications, onShowToast }) => {
  const navigate = useNavigate();
  const family = useFamily();
  const currentStageData = useGrowthStore((state) => state.currentStageData());
  const latestGrowth = useMemo(
    () => getRealGrowthHistory(currentStageData.growthHistory)[0] ?? null,
    [currentStageData.growthHistory],
  );
  const age = getAgeCopy(family.birthDate);
  const zodiac = getZodiacSign(family.birthDate);
  const birthVitals = [family.birthWeight, family.birthHeight, family.headCircAtBirth].filter(Boolean).join(' · ');
  const childName = family.childName || 'Bé';

  const growthMetrics = [
    { key: 'weight', label: 'Cân nặng', value: latestGrowth?.weight, unit: 'kg', Icon: Scale },
    { key: 'height', label: 'Chiều cao', value: latestGrowth?.height, unit: 'cm', Icon: Ruler },
    { key: 'head', label: 'Vòng đầu', value: latestGrowth?.headCirc, unit: 'cm', Icon: HeartPulse },
  ] as const;

  return createPortal(
    <div className="baby-profile-view-container profile-page-overlay baby-profile-v2">
      <AppBar
        className="profile-app-bar baby-profile-v2-appbar"
        tone="baby"
        variant="page"
        ariaLabel="Điều hướng hồ sơ"
        start={(
          <button type="button" className="profile-icon-btn" onClick={() => navigate('/')} aria-label="Về trang chủ" id="btnBackFromProfile">
            <ArrowLeft size={20} />
          </button>
        )}
        center={(
          <div className="profile-top-heading">
            <span className="profile-top-eyebrow">HỒ SƠ CỦA BÉ</span>
            <h1>Thông tin của {childName}</h1>
          </div>
        )}
        end={(
          <button type="button" className="profile-edit-btn" onClick={onOpenEditProfile} id="btnEditProfileTop">
            <Edit3 size={15} />
            <span>Sửa</span>
          </button>
        )}
      />

      <main className="baby-profile-v2-main">
        <section className="profile-summary-card" aria-labelledby="profile-child-name">
          <div className="profile-summary-hero">
            <img src={family.childAvatar} alt={`Ảnh của ${childName}`} className="profile-summary-avatar" />
            <div className="profile-summary-identity">
              <span className="profile-summary-overline"><span>{family.gender === 'boy' ? 'Bé trai' : 'Bé gái'}</span><span aria-hidden="true">·</span><span>{zodiac}</span></span>
              <h2 id="profile-child-name">{childName}</h2>
              {family.childFullName && <p className="profile-summary-fullname">{family.childFullName}</p>}
              {age && (
                <p className="profile-summary-age">
                  <strong>{age.primary}</strong>
                  <span>{age.secondary}</span>
                </p>
              )}
            </div>
          </div>

          <div className="profile-summary-divider" />

          <div className="profile-facts-grid">
            <article className="profile-fact">
              <span className="profile-fact-icon sage"><CalendarDays size={16} /></span>
              <div>
                <span>Ngày sinh</span>
                <strong>{displayValue(formatDateDisplay(family.birthDate))}{family.birthTime ? ` · ${family.birthTime}` : ''}</strong>
              </div>
            </article>
            <article className="profile-fact">
              <span className="profile-fact-icon honey"><Scale size={16} /></span>
              <div>
                <span>Lúc chào đời</span>
                <strong>{displayValue(birthVitals)}</strong>
              </div>
            </article>
            <article className="profile-fact">
              <span className="profile-fact-icon rose"><Droplet size={16} /></span>
              <div>
                <span>Nhóm máu</span>
                <strong>{displayValue(family.bloodType)}</strong>
              </div>
            </article>
            <article className="profile-fact">
              <span className="profile-fact-icon clay"><MapPin size={16} /></span>
              <div>
                <span>Nơi sinh</span>
                <strong>{displayValue(family.hospital)}</strong>
              </div>
            </article>
            <article className="profile-fact profile-fact-wide">
              <span className="profile-fact-icon sage"><ShieldCheck size={16} /></span>
              <div>
                <span>Dị ứng</span>
                <strong>{family.allergies?.length ? family.allergies.join(', ') : 'Chưa ghi nhận dị ứng'}</strong>
              </div>
            </article>
          </div>

          {family.notes && (
            <div className="profile-summary-note">
              <span>Ghi chú</span>
              <p>{family.notes}</p>
            </div>
          )}

          <button type="button" className="profile-growth-strip" onClick={() => navigate('/growth')} aria-label="Xem chi tiết tăng trưởng">
            <div className="profile-growth-heading">
              <span>
                <HeartPulse size={16} />
                Tăng trưởng
              </span>
              <small>{latestGrowth ? `Đo ${formatDateDisplay(latestGrowth.date)}` : 'Chưa có số đo'}</small>
            </div>
            <div className="profile-growth-metrics">
              {growthMetrics.map(({ key, label, value, unit, Icon }) => (
                <div className="profile-growth-metric" key={key}>
                  <span className={`profile-growth-icon ${key}`}><Icon size={14} /></span>
                  <span>{label}</span>
                  <strong>{value ? `${value} ${unit}` : '—'}</strong>
                </div>
              ))}
              <ChevronRight className="profile-growth-chevron" size={18} />
            </div>
          </button>
        </section>

        <button type="button" className="profile-quick-action" onClick={onOpenNotifications}>
          <span className="profile-quick-action-icon"><Bell size={19} /></span>
          <span className="profile-quick-action-copy">
            <strong>Lịch nhắc chăm sóc bé</strong>
            <small>Cữ bú, giấc ngủ, thay tã và lịch hẹn</small>
          </span>
          <ChevronRight size={18} />
        </button>

        <div className="baby-profile-v2-system-separator">
          <span>Dữ liệu & thiết bị</span>
        </div>

        <GoogleSyncCard onShowToast={onShowToast} />
        <ResetTrackingDataSection onShowToast={onShowToast} />

        <p className="profile-zodiac-note">Cung hoàng đạo chỉ mang tính giải trí, không dùng để đánh giá sức khỏe hoặc đưa ra nhắc nhở chăm sóc.</p>
      </main>
    </div>,
    document.body,
  );
};
