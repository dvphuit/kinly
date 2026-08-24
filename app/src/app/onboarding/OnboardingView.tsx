import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Cloud,
  CloudDownload,
  Droplet,
  Heart,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react';
import { initializeChildProfile } from '@/features/profile';
import {
  checkDriveBackup,
  isGoogleConfigured,
  isGoogleConnected,
  overwriteDriveBackupWithLocalData,
  requestGoogleAccessToken,
  restoreDriveBackup,
  setAutoSyncEnabled,
  syncWithGoogleDrive,
  type DriveBackupSummary,
} from '@/features/sync';
import {
  HavenFeedingIcon,
  HavenHeadCircIcon,
  HavenRulerIcon,
  HavenScaleIcon,
} from '@/shared/ui/HavenIcons';
import { HavenDatePicker } from '@/shared/ui/HavenDatePicker';
import { HavenDropdown } from '@/shared/ui/HavenDropdown';

interface OnboardingViewProps {
  onComplete?: () => void;
}

type ProfileSetupMode = 'create' | 'replace-drive';

const PRESET_BABY_AVATARS = [
  { label: 'Bé Yêu', url: '/assets/avatars/baby_avatar.jpg' },
];

const PRESET_MOM_AVATARS = [
  { label: 'Mẹ Hiền', url: '/assets/avatars/mom_avatar.jpg' },
];

const GoogleLogoSvg: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
);

function formatBackupDate(isoString?: string): string {
  if (!isoString) return 'Chưa rõ';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {

  const [step, setStep] = useState<'auth' | 'backup_found' | 'profile'>(() => {
    return isGoogleConnected() ? 'profile' : 'auth';
  });

  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(() => isGoogleConnected());
  const [profileSetupMode, setProfileSetupMode] = useState<ProfileSetupMode>('create');
  const [backupInfo, setBackupInfo] = useState<DriveBackupSummary | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form states
  const [childName, setChildName] = useState('');
  const [childFullName, setChildFullName] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];
  const [birthDate, setBirthDate] = useState(() => todayStr);
  const [birthTime, setBirthTime] = useState('08:30');
  const [gender, setGender] = useState<'boy' | 'girl'>('boy');
  const [bloodType, setBloodType] = useState('O+');
  const childAvatar = PRESET_BABY_AVATARS[0].url;

  // Birth vitals
  const [birthWeight, setBirthWeight] = useState('3.3');
  const [birthHeight, setBirthHeight] = useState('50.0');
  const [headCircAtBirth, setHeadCircAtBirth] = useState('34.5');
  const [hospital, setHospital] = useState('');

  // Mom info
  const [momName, setMomName] = useState('Mẹ');
  const momAvatar = PRESET_MOM_AVATARS[0].url;

  const [formError, setFormError] = useState<string | null>(null);

  const googleConfigured = isGoogleConfigured();

  const handleGoogleSignIn = async () => {
    setIsConnectingGoogle(true);
    setAuthError(null);
    try {
      await requestGoogleAccessToken();
      setGoogleConnected(true);

      // Check if there is an existing backup on Google Drive before enabling auto-sync.
      const backup = await checkDriveBackup();
      if (backup.found && backup.snapshot && backup.remoteFileId) {
        setBackupInfo(backup);
        setStep('backup_found');
      } else {
        setProfileSetupMode('create');
        setStep('profile');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Không thể kết nối với tài khoản Google Drive.');
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupInfo?.snapshot || !backupInfo?.remoteFileId) return;
    setIsRestoring(true);
    setAuthError(null);
    try {
      await restoreDriveBackup(backupInfo.snapshot, backupInfo.remoteFileId);
      onComplete?.();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Không thể khôi phục dữ liệu từ Google Drive.');
      setIsRestoring(false);
    }
  };

  const handleCreateNewProfile = () => {
    setProfileSetupMode('replace-drive');
    setStep('profile');
  };

  const handleBypassAuth = () => {
    setGoogleConnected(false);
    setProfileSetupMode('create');
    setStep('profile');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!childName.trim()) {
      setFormError('Vui lòng nhập tên gọi ở nhà của Bé.');
      return;
    }
    if (!birthDate) {
      setFormError('Vui lòng chọn ngày sinh của Bé.');
      return;
    }

    const w = parseFloat(birthWeight) || 0;
    const h = parseFloat(birthHeight) || 0;
    const hc = parseFloat(headCircAtBirth) || 0;

    initializeChildProfile(
      {
        childName: childName.trim(),
        childFullName: childFullName.trim(),
        birthDate,
        birthTime,
        gender,
        bloodType,
        childAvatar,
        momName: momName.trim() || 'Mẹ',
        momAvatar,
        birthWeight: w > 0 ? `${w} kg` : undefined,
        birthHeight: h > 0 ? `${h} cm` : undefined,
        headCircAtBirth: hc > 0 ? `${hc} cm` : undefined,
        hospital: hospital.trim() || undefined,
        isInitialized: true,
      },
      { weight: w, height: h, headCirc: hc },
    );

    if (googleConnected) {
      const finishDriveSetup = async () => {
        if (profileSetupMode === 'replace-drive') {
          await overwriteDriveBackupWithLocalData({ interactive: false });
        } else {
          await syncWithGoogleDrive({ interactive: false });
        }
        await setAutoSyncEnabled(true);
      };
      void finishDriveSetup().catch(() => {});
    }

    onComplete?.();
  };

  return (
    <div className="haven-onboarding-container" id="onboardingScreen">
      <div className="haven-onboarding-card">
        {/* ================= STEP 1: GOOGLE DRIVE AUTHENTICATION ================= */}
        {step === 'auth' && (
          <div className="haven-onboarding-step-view" id="stepGoogleAuth">
            <header className="haven-onboarding-header">
              <div className="haven-onboarding-icon-wrap auth-icon">
                <Cloud size={32} />
              </div>
              <span className="haven-eyebrow">THIẾT LẬP LẦN ĐẦU · KINLY</span>
              <h2>Đăng nhập Google Drive</h2>
              <p>
                Lưu trữ và đồng bộ an toàn toàn bộ hồ sơ của Bé & Mẹ trên Google Drive cá nhân của bạn.
              </p>
            </header>

            <div className="haven-auth-benefits">
              <div className="haven-auth-benefit-item">
                <div className="haven-benefit-icon">
                  <ShieldCheck size={18} />
                </div>
                <div className="haven-benefit-text">
                  <strong>Riêng tư theo quyền truy cập Google Drive</strong>
                  <span>Bản sao lưu được lưu trong vùng dữ liệu ứng dụng riêng trên Google Drive.</span>
                </div>
              </div>

              <div className="haven-auth-benefit-item">
                <div className="haven-benefit-icon">
                  <RefreshCw size={18} />
                </div>
                <div className="haven-benefit-text">
                  <strong>Tự động sao lưu</strong>
                  <span>Mọi chỉ số tăng trưởng, cữ bú, giấc ngủ, chi tiêu đều tự động lưu lên Cloud.</span>
                </div>
              </div>

              <div className="haven-auth-benefit-item">
                <div className="haven-benefit-icon">
                  <CloudDownload size={18} />
                </div>
                <div className="haven-benefit-text">
                  <strong>Dễ dàng khôi phục trên máy mới</strong>
                  <span>Không lo mất nhật ký khi đổi điện thoại, đổi trình duyệt hoặc cài lại máy.</span>
                </div>
              </div>
            </div>

            {authError && (
              <div className="haven-form-error" role="alert">
                <AlertCircle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <div className="haven-auth-action-box">
              <button
                type="button"
                id="btnGoogleSignIn"
                className="haven-google-signin-btn"
                onClick={handleGoogleSignIn}
                disabled={isConnectingGoogle}
              >
                {isConnectingGoogle ? (
                  <>
                    <Loader2 size={19} className="spin-animate" />
                    <span>Đang kết nối Google Drive...</span>
                  </>
                ) : (
                  <>
                    <GoogleLogoSvg size={20} />
                    <span>Đăng nhập bằng Google</span>
                  </>
                )}
              </button>

              <div className="haven-auth-dev-box">
                {!googleConfigured && (
                  <span className="haven-auth-dev-label">
                    ⚠️ Google Client ID chưa cấu hình (Môi trường Dev/Test)
                  </span>
                )}
                <button
                  type="button"
                  id="btnDevBypass"
                  className="haven-auth-dev-btn"
                  onClick={handleBypassAuth}
                >
                  Bỏ qua & Thiết lập Offline
                </button>
              </div>
            </div>

            <footer className="haven-auth-footer">
              <Lock size={12} />
              <span>Bản sao lưu được lưu trong vùng ứng dụng riêng của Kinly trên Google Drive của bạn.</span>
            </footer>
          </div>
        )}

        {/* ================= STEP 2: BACKUP FOUND ON GOOGLE DRIVE ================= */}
        {step === 'backup_found' && backupInfo && (
          <div className="haven-onboarding-step-view" id="stepBackupFound">
            <header className="haven-onboarding-header">
              <div className="haven-onboarding-icon-wrap success-icon">
                <CloudDownload size={32} />
              </div>
              <span className="haven-eyebrow">ĐÃ KẾT NỐI GOOGLE DRIVE</span>
              <h2>Tìm thấy bản sao lưu!</h2>
              <p>
                Tài khoản Google Drive của bạn đã có sẵn dữ liệu của bé. Bạn có muốn khôi phục lại không?
              </p>
            </header>

            <div className="haven-backup-card">
              <div className="haven-backup-avatar-box">
                <HavenFeedingIcon size={24} />
              </div>
              <div className="haven-backup-details">
                <strong className="haven-backup-child-name">
                  {backupInfo.childName || 'Hồ sơ Bé Yêu'}
                </strong>
                {backupInfo.birthDate && (
                  <span className="haven-backup-meta">
                    Ngày sinh: {backupInfo.birthDate}
                  </span>
                )}
                <span className="haven-backup-time">
                  Sao lưu lần cuối: {formatBackupDate(backupInfo.updatedAt)}
                </span>
              </div>
            </div>

            {authError && (
              <div className="haven-form-error" role="alert">
                <AlertCircle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <div className="haven-backup-actions">
              <button
                type="button"
                id="btnRestoreBackup"
                className="haven-onboarding-submit-btn"
                onClick={handleRestoreBackup}
                disabled={isRestoring}
              >
                {isRestoring ? (
                  <>
                    <Loader2 size={18} className="spin-animate" />
                    <span>Đang khôi phục dữ liệu...</span>
                  </>
                ) : (
                  <>
                    <CloudDownload size={18} />
                    <span>Khôi phục dữ liệu ngay</span>
                  </>
                )}
              </button>

              <button
                type="button"
                id="btnCreateNewProfile"
                className="haven-secondary-btn"
                onClick={handleCreateNewProfile}
                disabled={isRestoring}
              >
                <UserPlus size={16} />
                <span>Tạo hồ sơ mới thay thế</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: CREATE PROFILE FORM ================= */}
        {step === 'profile' && (
          <div className="haven-onboarding-step-view" id="stepProfileForm">
            {googleConnected && (
              <div className="haven-sync-connected-badge">
                <Cloud size={14} />
                <span>{profileSetupMode === 'replace-drive'
                  ? 'Đã kết nối Google Drive · Bản sao lưu hiện có sẽ được thay thế'
                  : 'Đã kết nối Google Drive · Tự động sao lưu sau khi hoàn tất'}</span>
              </div>
            )}

            <header className="haven-onboarding-header">
              <div className="haven-onboarding-icon-wrap">
                <HavenFeedingIcon size={34} />
              </div>
              <span className="haven-eyebrow">BƯỚC TIẾP THEO · THIẾT LẬP HỒ SƠ</span>
              <h2>Khởi tạo hồ sơ Bé</h2>
              <p>
                Tạo hồ sơ đầu tiên để bắt đầu theo dõi thể chất theo chuẩn WHO và nhịp sinh hoạt nhẹ nhàng mỗi ngày.
              </p>
            </header>

            <form onSubmit={handleSubmit} className="haven-onboarding-form">
              {/* 1. Baby Info Section */}
              <fieldset className="haven-onboarding-section">
                <legend className="haven-section-legend">
                  <User size={15} />
                  <span>1. Thông tin Bé yêu</span>
                </legend>

                <div className="haven-field-group">
                  <label htmlFor="inputChildName" className="haven-label">
                    Tên gọi ở nhà của Bé <strong className="required-star">*</strong>
                  </label>
                  <input
                    id="inputChildName"
                    type="text"
                    className="haven-input"
                    placeholder="Ví dụ: Bé Bơ, Miu, Sữa..."
                    value={childName}
                    onChange={(e) => {
                      setChildName(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    required
                  />
                </div>

                <div className="haven-field-group">
                  <label htmlFor="inputChildFullName" className="haven-label">
                    Họ và tên đầy đủ (không bắt buộc)
                  </label>
                  <input
                    id="inputChildFullName"
                    type="text"
                    className="haven-input"
                    placeholder="Ví dụ: Nguyễn Minh Khang"
                    value={childFullName}
                    onChange={(e) => setChildFullName(e.target.value)}
                  />
                </div>

                <div className="haven-field-row">
                  <div className="haven-field-group">
                    <label className="haven-label">
                      Ngày sinh <strong className="required-star">*</strong>
                    </label>
                    <HavenDatePicker
                      label="Ngày sinh của Bé"
                      value={birthDate}
                      onChange={setBirthDate}
                      maxDate={todayStr}
                    />
                  </div>

                  <div className="haven-field-group">
                    <label htmlFor="inputBirthTime" className="haven-label">
                      Giờ sinh
                    </label>
                    <input
                      id="inputBirthTime"
                      type="time"
                      className="haven-input"
                      value={birthTime}
                      onChange={(e) => setBirthTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="haven-field-row">
                  <div className="haven-field-group">
                    <span className="haven-label">Giới tính</span>
                    <div className="haven-gender-toggle" role="radiogroup" aria-label="Chọn giới tính">
                      <button
                        type="button"
                        className={`haven-gender-btn ${gender === 'boy' ? 'active' : ''}`}
                        onClick={() => setGender('boy')}
                      >
                        👦 Bé trai
                      </button>
                      <button
                        type="button"
                        className={`haven-gender-btn ${gender === 'girl' ? 'active' : ''}`}
                        onClick={() => setGender('girl')}
                      >
                        👧 Bé gái
                      </button>
                    </div>
                  </div>

                  <div className="haven-field-group">
                    <label className="haven-label">
                      <Droplet size={12} style={{ display: 'inline', marginRight: 4 }} />
                      Nhóm máu
                    </label>
                    <HavenDropdown
                      label="Nhóm máu"
                      value={bloodType}
                      onChange={setBloodType}
                      options={[
                        { value: 'O+', label: 'O+' },
                        { value: 'A+', label: 'A+' },
                        { value: 'B+', label: 'B+' },
                        { value: 'AB+', label: 'AB+' },
                        { value: 'O-', label: 'O-' },
                        { value: 'Chưa rõ', label: 'Chưa rõ' },
                      ]}
                    />
                  </div>
                </div>

                <div className="haven-field-group">
                  <span className="haven-label">Ảnh đại diện của Bé</span>
                  <div className="haven-avatar-picker-row">
                    <img src={childAvatar} alt="Avatar Bé" className="haven-avatar-preview-img" />
                    <div className="haven-avatar-note">
                      <strong>Avatar minh họa Kinly</strong>
                      <span>Phong cách vẽ vector ấm áp, mộc mạc</span>
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* 2. Birth Vitals Section */}
              <fieldset className="haven-onboarding-section">
                <legend className="haven-section-legend">
                  <Sparkles size={15} />
                  <span>2. Chỉ số khi chào đời (Tùy chọn)</span>
                </legend>

                <div className="haven-field-row three-cols">
                  <div className="haven-field-group">
                    <label htmlFor="inputBirthWeight" className="haven-label">
                      <HavenScaleIcon size={13} style={{ display: 'inline', marginRight: 4 }} />
                      Cân nặng (kg)
                    </label>
                    <input
                      id="inputBirthWeight"
                      type="number"
                      step="0.01"
                      min="0"
                      className="haven-input"
                      placeholder="Ví dụ: 3.3"
                      value={birthWeight}
                      onChange={(e) => setBirthWeight(e.target.value)}
                    />
                  </div>

                  <div className="haven-field-group">
                    <label htmlFor="inputBirthHeight" className="haven-label">
                      <HavenRulerIcon size={13} style={{ display: 'inline', marginRight: 4 }} />
                      Chiều cao (cm)
                    </label>
                    <input
                      id="inputBirthHeight"
                      type="number"
                      step="0.1"
                      min="0"
                      className="haven-input"
                      placeholder="Ví dụ: 50.0"
                      value={birthHeight}
                      onChange={(e) => setBirthHeight(e.target.value)}
                    />
                  </div>

                  <div className="haven-field-group">
                    <label htmlFor="inputHeadCirc" className="haven-label">
                      <HavenHeadCircIcon size={13} style={{ display: 'inline', marginRight: 4 }} />
                      Vòng đầu (cm)
                    </label>
                    <input
                      id="inputHeadCirc"
                      type="number"
                      step="0.1"
                      min="0"
                      className="haven-input"
                      placeholder="Ví dụ: 34.5"
                      value={headCircAtBirth}
                      onChange={(e) => setHeadCircAtBirth(e.target.value)}
                    />
                  </div>
                </div>

                <div className="haven-field-group">
                  <label htmlFor="inputHospital" className="haven-label">
                    Nơi sinh / Bệnh viện
                  </label>
                  <input
                    id="inputHospital"
                    type="text"
                    className="haven-input"
                    placeholder="Ví dụ: BV Phụ sản Quốc tế..."
                    value={hospital}
                    onChange={(e) => setHospital(e.target.value)}
                  />
                </div>
              </fieldset>

              {/* 3. Mother Info Section */}
              <fieldset className="haven-onboarding-section">
                <legend className="haven-section-legend">
                  <Heart size={15} />
                  <span>3. Thông tin Mẹ</span>
                </legend>

                <div className="haven-field-group">
                  <label htmlFor="inputMomName" className="haven-label">
                    Tên của Mẹ
                  </label>
                  <input
                    id="inputMomName"
                    type="text"
                    className="haven-input"
                    placeholder="Ví dụ: Mẹ Thảo, Mẹ Lan..."
                    value={momName}
                    onChange={(e) => setMomName(e.target.value)}
                  />
                </div>

                <div className="haven-avatar-picker-row">
                  <img src={momAvatar} alt="Avatar Mẹ" className="haven-avatar-preview-img" />
                  <div className="haven-avatar-note">
                    <strong>Hồ sơ Mẹ</strong>
                    <span>Theo dõi nhịp hút sữa, giấc ngủ và phục hồi sau sinh</span>
                  </div>
                </div>
              </fieldset>

              {formError && (
                <div className="haven-form-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <button type="submit" id="btnCompleteOnboarding" className="haven-onboarding-submit-btn">
                <Check size={18} />
                <span>Bắt đầu hành trình cùng Bé</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};