import { useEffect, useId, useState } from 'react';
import {
  Building,
  Calendar,
  Check,
  Clock,
  Droplet,
  FileText,
  Heart,
  Ruler,
  Save,
  Scale,
  ShieldAlert,
  Sparkles,
  User,
} from 'lucide-react';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { HavenDatePicker } from '@/shared/ui/HavenDatePicker';
import { HavenDropdown } from '@/shared/ui/HavenDropdown';
import { useFamily } from '@/features/profile/hooks/useFamily';
import { useProfileStore } from '@/features/profile/store/useProfileStore';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast?: (msg: string, icon?: string) => void;
}

const PRESET_AVATARS = [
  { label: 'Bé Bơ', url: '/assets/avatars/baby_avatar.jpg' },
  { label: 'Mẹ Thảo', url: '/assets/avatars/mom_avatar.jpg' },
  { label: 'Bố Tuấn', url: '/assets/avatars/dad_avatar.jpg' },
];

const BLOOD_TYPE_OPTIONS = [
  { value: 'O+', label: 'O+ (Phổ biến)' },
  { value: 'A+', label: 'A+' },
  { value: 'B+', label: 'B+' },
  { value: 'AB+', label: 'AB+' },
  { value: 'O-', label: 'O- (Hiếm)' },
  { value: 'A-', label: 'A-' },
  { value: 'B-', label: 'B-' },
  { value: 'AB-', label: 'AB-' },
  { value: 'Chưa xác định', label: 'Chưa xác định' },
];

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  onSuccessToast,
}) => {
  const family = useFamily();
  const updateFamilyData = useProfileStore((state) => state.updateFamilyData);

  const [childName, setChildName] = useState(family.childName);
  const [childFullName, setChildFullName] = useState(family.childFullName);
  const [birthDate, setBirthDate] = useState(family.birthDate);
  const [birthTime, setBirthTime] = useState(family.birthTime ?? '');
  const [gender, setGender] = useState<'boy' | 'girl'>(family.gender);
  const [bloodType, setBloodType] = useState(family.bloodType);
  const [childAvatar, setChildAvatar] = useState(family.childAvatar);
  const [birthWeight, setBirthWeight] = useState(family.birthWeight ?? '');
  const [birthHeight, setBirthHeight] = useState(family.birthHeight ?? '');
  const [hospital, setHospital] = useState(family.hospital ?? '');
  const [insuranceCode, setInsuranceCode] = useState(family.insuranceCode ?? '');
  const [notes, setNotes] = useState(family.notes || '');
  const formId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setChildName(family.childName);
    setChildFullName(family.childFullName);
    setBirthDate(family.birthDate);
    setBirthTime(family.birthTime ?? '');
    setGender(family.gender);
    setBloodType(family.bloodType);
    setChildAvatar(family.childAvatar);
    setBirthWeight(family.birthWeight ?? '');
    setBirthHeight(family.birthHeight ?? '');
    setHospital(family.hospital ?? '');
    setInsuranceCode(family.insuranceCode ?? '');
    setNotes(family.notes || '');
  }, [isOpen, family]);

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const nextChildName = childName.trim() || family.childName || 'Bé';

    updateFamilyData({
      childName: nextChildName,
      childFullName: childFullName.trim(),
      birthDate,
      birthTime,
      gender,
      bloodType,
      childAvatar,
      birthWeight,
      birthHeight,
      hospital,
      insuranceCode,
      notes,
    });

    onClose();
    onSuccessToast?.(`Đã cập nhật thông tin cho ${nextChildName} thành công!`);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Chỉnh sửa hồ sơ bé"
      className="kinly-themed-sheet edit-profile-bottom-sheet"
      footer={
        <button type="submit" form={formId} className="log-btn-primary sheet-primary-action">
          <Save size={15} />
          <span>Lưu thay đổi</span>
        </button>
      }
    >
      <form id={formId} onSubmit={handleSave} className="tracker-sheet-form edit-profile-form">
        <div className="tracker-sheet-intro edit-profile-sheet-intro">
          <span className="tracker-sheet-intro-icon"><Sparkles size={20} /></span>
          <div className="tracker-sheet-intro-copy">
            <span className="tracker-sheet-kicker">HỒ SƠ CỦA BÉ</span>
            <p>Cập nhật những thông tin Kinly dùng để cá nhân hóa hồ sơ và các mốc chăm sóc.</p>
          </div>
        </div>

        <section className="tracker-sheet-section">
          <div className="tracker-sheet-section-header">
            <span>Ảnh đại diện</span>
            <small>Hiển thị trên hồ sơ</small>
          </div>
          <div className="avatar-preview-picker-row">
            <div className="avatar-big-preview">
              <img src={childAvatar} alt={`Ảnh đại diện của ${childName || 'bé'}`} />
            </div>
            <div className="avatar-preset-list" role="group" aria-label="Chọn ảnh đại diện">
              {PRESET_AVATARS.map((avatar) => {
                const selected = childAvatar === avatar.url;
                return (
                  <button
                    key={avatar.url}
                    type="button"
                    className={`avatar-preset-thumb-btn ${selected ? 'selected' : ''}`}
                    onClick={() => setChildAvatar(avatar.url)}
                    title={avatar.label}
                    aria-label={`Chọn ảnh ${avatar.label}`}
                    aria-pressed={selected}
                  >
                    <img src={avatar.url} alt="" />
                    {selected && (
                      <span className="avatar-check-badge" aria-hidden="true">
                        <Check size={10} color="#FFFFFF" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="tracker-sheet-section">
          <div className="tracker-sheet-section-header">
            <span>Thông tin cơ bản</span>
            <small>Tên và giới tính</small>
          </div>
          <div className="tracker-sheet-form">
            <div className="tracker-sheet-two-column">
              <div className="log-form-group">
                <label className="log-form-label icon-label">
                  <User size={13} /> Tên gọi ở nhà *
                </label>
                <input
                  type="text"
                  className="log-input-control"
                  required
                  value={childName}
                  onChange={(event) => setChildName(event.target.value)}
                  placeholder="VD: Bé Bơ"
                />
              </div>
              <div className="log-form-group">
                <label className="log-form-label icon-label">
                  <User size={13} /> Họ tên khai sinh *
                </label>
                <input
                  type="text"
                  className="log-input-control"
                  required
                  value={childFullName}
                  onChange={(event) => setChildFullName(event.target.value)}
                  placeholder="VD: Nguyễn Minh Khang"
                />
              </div>
            </div>

            <div className="log-form-group">
              <label className="log-form-label icon-label">
                <Heart size={13} /> Giới tính
              </label>
              <div className="gender-selector-pills" role="group" aria-label="Giới tính của bé">
                <button
                  type="button"
                  className={`gender-pill-btn ${gender === 'boy' ? 'active boy' : ''}`}
                  onClick={() => setGender('boy')}
                  aria-pressed={gender === 'boy'}
                >
                  👦 Bé trai
                </button>
                <button
                  type="button"
                  className={`gender-pill-btn ${gender === 'girl' ? 'active girl' : ''}`}
                  onClick={() => setGender('girl')}
                  aria-pressed={gender === 'girl'}
                >
                  👧 Bé gái
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="tracker-sheet-section">
          <div className="tracker-sheet-section-header">
            <span>Ngày sinh</span>
            <small>Thông tin dùng để tính tuổi</small>
          </div>
          <div className="tracker-sheet-two-column">
            <div className="log-form-group">
              <label className="log-form-label icon-label">
                <Calendar size={13} /> Ngày sinh *
              </label>
              <HavenDatePicker
                label="Ngày sinh"
                value={birthDate}
                onChange={setBirthDate}
                maxDate={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="log-form-group">
              <label className="log-form-label icon-label">
                <Clock size={13} /> Giờ sinh
              </label>
              <input
                type="time"
                className="log-input-control"
                value={birthTime}
                onChange={(event) => setBirthTime(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="tracker-sheet-section">
          <div className="tracker-sheet-section-header">
            <span>Thông tin lúc sinh</span>
            <small>Số đo và nhóm máu</small>
          </div>
          <div className="tracker-sheet-form">
            <div className="tracker-sheet-two-column">
              <div className="log-form-group">
                <label className="log-form-label icon-label">
                  <Scale size={13} /> Cân nặng
                </label>
                <input
                  type="text"
                  className="log-input-control"
                  value={birthWeight}
                  onChange={(event) => setBirthWeight(event.target.value)}
                  placeholder="VD: 3.3 kg"
                />
              </div>
              <div className="log-form-group">
                <label className="log-form-label icon-label">
                  <Ruler size={13} /> Chiều dài
                </label>
                <input
                  type="text"
                  className="log-input-control"
                  value={birthHeight}
                  onChange={(event) => setBirthHeight(event.target.value)}
                  placeholder="VD: 50.0 cm"
                />
              </div>
            </div>
            <div className="log-form-group">
              <label className="log-form-label icon-label">
                <Droplet size={13} /> Nhóm máu
              </label>
              <HavenDropdown
                label="Nhóm máu"
                value={bloodType}
                onChange={setBloodType}
                options={BLOOD_TYPE_OPTIONS}
              />
            </div>
          </div>
        </section>

        <section className="tracker-sheet-section">
          <div className="tracker-sheet-section-header">
            <span>Y tế & ghi chú</span>
            <small>Thông tin tham khảo nhanh</small>
          </div>
          <div className="tracker-sheet-form">
            <div className="tracker-sheet-two-column">
              <div className="log-form-group">
                <label className="log-form-label icon-label">
                  <Building size={13} /> Bệnh viện nơi sinh
                </label>
                <input
                  type="text"
                  className="log-input-control"
                  value={hospital}
                  onChange={(event) => setHospital(event.target.value)}
                  placeholder="VD: BV Phụ sản..."
                />
              </div>
              <div className="log-form-group">
                <label className="log-form-label icon-label">
                  <ShieldAlert size={13} /> Mã thẻ BHYT
                </label>
                <input
                  type="text"
                  className="log-input-control"
                  value={insuranceCode}
                  onChange={(event) => setInsuranceCode(event.target.value)}
                  placeholder="VD: DN4012984920"
                />
              </div>
            </div>
            <div className="log-form-group sheet-note-field">
              <label className="log-form-label icon-label">
                <FileText size={13} /> Ghi chú & đặc điểm riêng
              </label>
              <textarea
                className="log-input-control"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="VD: Bé sinh đủ tháng, thích nghe nhạc êm dịu..."
              />
            </div>
          </div>
        </section>
      </form>
    </BottomSheet>
  );
};
