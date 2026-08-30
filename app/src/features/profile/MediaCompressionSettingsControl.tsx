import { useState, type ReactNode } from 'react';
import {
  ChevronRight,
  Image as ImageIcon,
  ShieldCheck,
  SlidersHorizontal,
  Video,
} from 'lucide-react';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import {
  MEDIA_COMPRESSION_PRESETS,
  MEDIA_INPUT_SIZE_LIMIT_RANGES_MB,
  getMediaCompressionSettings,
  setMediaInputSizeLimitMb,
  setMediaCompressionPreset,
  type MediaCompressionKind,
  type MediaCompressionPreset,
  type MediaCompressionSettings,
} from '@/features/sync';
import './MediaCompressionSettingsControl.css';

const PRESET_LABELS: Record<MediaCompressionPreset, string> = {
  original: 'Bản gốc',
  quality: 'Chất lượng',
  balanced: 'Cân bằng',
  compact: 'Tiết kiệm',
  saver: 'Nhẹ nhất',
};

const PRESET_DESCRIPTIONS: Record<MediaCompressionKind, Record<MediaCompressionPreset, string>> = {
  photo: {
    original: 'Không nén · upload đúng file gốc.',
    quality: 'Tối đa 3840px · ưu tiên giữ chi tiết.',
    balanced: 'Tối đa 2560px · tự chọn JPEG theo độ nét.',
    compact: 'Tối đa 2048px · ưu tiên giảm dung lượng.',
    saver: 'Tối đa 1280px · nhẹ nhất khi upload lên Drive.',
  },
  video: {
    original: 'Không nén · upload đúng file gốc.',
    quality: 'MP4 H.264 · 1080p/30 · chất lượng rất cao.',
    balanced: 'MP4 H.264 · 1080p/30 · chất lượng cao.',
    compact: 'MP4 H.264 · 720p/30 · dung lượng thấp hơn.',
    saver: 'MP4 H.264 · 480p/24 · dung lượng thấp nhất.',
  },
};

interface PresetRowProps {
  kind: MediaCompressionKind;
  label: string;
  icon: ReactNode;
  value: MediaCompressionPreset;
  maxInputSizeMb: number;
  onChange: (kind: MediaCompressionKind, preset: MediaCompressionPreset) => void;
  onLimitChange: (kind: MediaCompressionKind, value: number) => number;
}

function PresetRow({ kind, label, icon, value, maxInputSizeMb, onChange, onLimitChange }: PresetRowProps) {
  const limitRange = MEDIA_INPUT_SIZE_LIMIT_RANGES_MB[kind];
  return (
    <section className="media-compression-row" aria-labelledby={`media-compression-${kind}-label`}>
      <div className="media-compression-row-heading">
        <span className="media-compression-row-icon" aria-hidden="true">{icon}</span>
        <div>
          <strong id={`media-compression-${kind}-label`}>{label}</strong>
          <small>{PRESET_DESCRIPTIONS[kind][value]}</small>
          <small className="media-compression-limit">
            <label>
              Tệp đầu vào tối đa
              <input
                key={`${kind}-${maxInputSizeMb}`}
                type="number"
                inputMode="numeric"
                aria-label={`Dung lượng ${label.toLowerCase()} tối đa (MB)`}
                defaultValue={maxInputSizeMb}
                min={limitRange.min}
                max={limitRange.max}
                step={1}
                onBlur={(event) => {
                  event.currentTarget.value = String(onLimitChange(kind, Number(event.currentTarget.value)));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              MB
            </label>
          </small>
        </div>
      </div>
      <div className="media-compression-presets" role="radiogroup" aria-label={`Mức nén ${label.toLowerCase()}`}>
        {MEDIA_COMPRESSION_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={value === preset}
            className={value === preset ? 'is-selected' : ''}
            onClick={() => onChange(kind, preset)}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>
    </section>
  );
}

function compressionSummary(settings: MediaCompressionSettings): string {
  if (settings.photo === settings.video) return PRESET_LABELS[settings.photo];
  return `Ảnh ${PRESET_LABELS[settings.photo]} · Video ${PRESET_LABELS[settings.video]}`;
}

export function MediaCompressionSettingsControl() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(getMediaCompressionSettings);

  const handleChange = (kind: MediaCompressionKind, preset: MediaCompressionPreset) => {
    setSettings(setMediaCompressionPreset(kind, preset));
  };
  const handleLimitChange = (kind: MediaCompressionKind, value: number): number => {
    const next = setMediaInputSizeLimitMb(kind, value);
    setSettings(next);
    return next.maxInputSizeMb[kind];
  };

  return (
    <>
      <button
        type="button"
        className="profile-sync-manage profile-sync-compression-trigger"
        onClick={() => setOpen(true)}
        aria-label="Cấu hình nén media"
      >
        <span className="profile-sync-row-icon"><SlidersHorizontal size={16} /></span>
        <span>
          <strong>Nén media</strong>
          <small>{compressionSummary(settings)}</small>
        </span>
        <ChevronRight size={17} />
      </button>

      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Nén ảnh & video"
        description="Chọn mức nén dùng cho media mới tải lên Google Drive."
        className="media-compression-sheet"
      >
        <div className="media-compression-settings">
          <p className="media-compression-intro">
            Bản trên thiết bị luôn được giữ nguyên. Thay đổi này chỉ áp dụng cho media chưa upload lên Drive.
          </p>

          <PresetRow
            kind="photo"
            label="Ảnh"
            icon={<ImageIcon size={17} />}
            value={settings.photo}
            maxInputSizeMb={settings.maxInputSizeMb.photo}
            onChange={handleChange}
            onLimitChange={handleLimitChange}
          />
          <PresetRow
            kind="video"
            label="Video"
            icon={<Video size={17} />}
            value={settings.video}
            maxInputSizeMb={settings.maxInputSizeMb.video}
            onChange={handleChange}
            onLimitChange={handleLimitChange}
          />

          <div className="media-compression-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Tệp vượt giới hạn sẽ không được thêm. Bản nén chỉ được dùng khi giảm được ít nhất 10%.</span>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
