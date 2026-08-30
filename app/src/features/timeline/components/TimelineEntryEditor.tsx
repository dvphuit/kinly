import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  Baby,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Droplet,
  Heart,
  Info,
  Image as ImageIcon,
  Images,
  Layers,
  LoaderCircle,
  Milk,
  NotebookPen,
  Package,
  Plus,
  Sparkles,
  ShieldAlert,
  TriangleAlert,
  Video,
  X,
} from 'lucide-react';
import {
  HavenMedicationPicker,
  HavenMilkAmountInput,
  HavenTemperatureInput,
  assessBabySleep,
  assessDiaper,
  assessTemperature,
  getAgeInMonths,
  useActivityStore,
  type ActivityRecord,
  type LiveAssessment,
  type NewBabyActivity,
  type NewMomActivity,
} from '@/features/activities';
import { useGrowthStore } from '@/features/growth';
import { useProfileStore } from '@/features/profile';
import { HavenDatePicker } from '@/shared/ui/HavenDatePicker';
import { HavenDropdown } from '@/shared/ui/HavenDropdown';
import { TimelineMediaAsset } from './TimelineMediaAsset';
import {
  detectTimelineMediaType,
  readTimelineMediaFiles,
  removeTimelineMediaFiles,
  type TimelineMediaReadProgress,
} from './timelineMediaFiles';
import { getTimelineMediaItems } from '../domain/timelineMedia';
import type { TimelineItem, TimelineMediaItem } from '../domain/types';
import { useTimelineStore } from '../store/useTimelineStore';
import type { EditableTimelineSource } from './timelineEntryTypes';

const FEEDING_SOURCES = [
  { value: 'breast', label: 'Sữa mẹ', detail: 'Từ mẹ, bú trực tiếp hoặc qua bình', icon: Heart },
  { value: 'formula', label: 'Sữa công thức', detail: 'Pha theo đúng hướng dẫn của sản phẩm', icon: Package },
] as const;

const BREAST_FEEDING_MODES = [
  { value: 'direct', label: 'Bú trực tiếp', detail: 'Bé bú trực tiếp từ mẹ', icon: Baby },
  { value: 'bottle', label: 'Qua bình', detail: 'Sữa mẹ đã hút và cho bú bình', icon: Milk },
] as const;

const SLEEP_KINDS = [
  { value: 'nap', label: 'Ngủ ngày' },
  { value: 'night', label: 'Ngủ đêm' },
] as const;

const SLEEP_QUALITIES = [
  { value: 'restful', label: 'Ngủ sâu', symbol: '●' },
  { value: 'normal', label: 'Bình thường', symbol: '◐' },
  { value: 'restless', label: 'Chập chờn', symbol: '○' },
] as const;

const STOOL_TYPES = [
  { value: 1, label: 'Loại 1', detail: 'Viên cứng rời' },
  { value: 2, label: 'Loại 2', detail: 'Khối cứng, lổn nhổn' },
  { value: 3, label: 'Loại 3', detail: 'Khuôn, có nứt' },
  { value: 4, label: 'Loại 4', detail: 'Mềm, trơn' },
  { value: 5, label: 'Loại 5', detail: 'Mảnh mềm' },
  { value: 6, label: 'Loại 6', detail: 'Mềm nhão' },
  { value: 7, label: 'Loại 7', detail: 'Toàn nước' },
] as const;

const STOOL_COLORS = [
  { value: 'yellow', label: 'Vàng', color: '#d9a42e' },
  { value: 'brown', label: 'Nâu', color: '#825534' },
  { value: 'green', label: 'Xanh', color: '#648442' },
  { value: 'red', label: 'Đỏ', color: '#c94a43' },
  { value: 'black', label: 'Đen', color: '#332d2a' },
  { value: 'pale', label: 'Trắng/xám', color: '#d8d2c9' },
] as const;

const TEMPERATURE_SITES = [
  { value: 'rectal', label: 'Hậu môn' },
  { value: 'ear', label: 'Tai' },
  { value: 'forehead', label: 'Trán' },
  { value: 'oral', label: 'Miệng' },
  { value: 'axillary', label: 'Nách' },
] as const;

const TEMPERATURE_SYMPTOMS = [
  { value: 'lethargy', label: 'Khó đánh thức' },
  { value: 'breathing', label: 'Khó thở' },
  { value: 'seizure', label: 'Co giật' },
  { value: 'rash', label: 'Ban tím/không mất màu' },
  { value: 'dehydration', label: 'Ít tiểu/khô môi' },
] as const;

function localDateTimeValue(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function addMinutesToLocalValue(value: string, minutes: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return localDateTimeValue(new Date(date.getTime() + minutes * 60_000).toISOString());
}

function dateInputValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return value;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function AssessmentBanner({ assessment }: { assessment: LiveAssessment }) {
  const Icon = assessment.severity === 'danger'
    ? ShieldAlert
    : assessment.severity === 'warning'
      ? TriangleAlert
      : assessment.severity === 'info'
        ? Info
        : CheckCircle2;
  return (
    <div className={`journal-live-assessment is-${assessment.severity}`} role="status" aria-live="polite">
      <span className="journal-live-assessment-icon" aria-hidden="true"><Icon size={17} /></span>
      <div>
        <strong>{assessment.label}</strong>
        <small>{assessment.detail}</small>
      </div>
    </div>
  );
}

const DIAPER_KINDS = [
  { value: 'wet', label: 'Tã ướt', icon: Droplet },
  { value: 'dirty', label: 'Tã bẩn', icon: Sparkles },
  { value: 'both', label: 'Cả hai', icon: Layers },
] as const;

const MOMENT_TAGS: Array<{ value: TimelineItem['tagType']; label: string }> = [
  { value: 'general', label: 'Khoảnh khắc' },
  { value: 'milestone', label: 'Cột mốc' },
  { value: 'feeding', label: 'Ăn dặm' },
  { value: 'health', label: 'Sức khỏe' },
  { value: 'mom', label: 'Của mẹ' },
];

function TimelineMediaReadStatus({ progress }: { progress: TimelineMediaReadProgress }) {
  const kind = progress.mediaType === 'video' ? 'video' : 'ảnh';
  const phaseProgress = progress.phase === 'preparing'
    ? 0.25
    : progress.phase === 'saving'
      ? 0.75
      : 0;
  const progressUnits = progress.completedFiles + phaseProgress;
  const percent = Math.round(
    (progressUnits / progress.totalFiles) * 100,
  );
  const statusLabel = progress.phase === 'preparing'
    ? `Đang chuẩn bị ${kind}`
    : progress.phase === 'saving'
      ? `Đang lưu ${kind} trên thiết bị`
      : `${kind === 'ảnh' ? 'Ảnh' : 'Video'} đã sẵn sàng`;

  return (
    <div className="journal-live-assessment is-info journal-media-processing" role="status" aria-live="polite" aria-atomic="true">
      <span className="journal-live-assessment-icon" aria-hidden="true">
        <LoaderCircle size={17} className="journal-media-processing-spinner" />
      </span>
      <div>
        <strong>{statusLabel} · {progress.fileNumber}/{progress.totalFiles}</strong>
        <small title={progress.fileName}>{progress.fileName} · {percent}%</small>
        <div
          className="journal-media-processing-progress"
          role="progressbar"
          aria-label={`Tiến độ chuẩn bị ảnh và video: ${percent}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

export interface TimelineEntryEditorProps {
  source: EditableTimelineSource;
  onSaved: (savedTitle?: string) => void;
  onMediaProcessingChange?: (processing: boolean) => void;
  creating?: boolean;
}

export function TimelineEntryEditor({
  source,
  onSaved,
  onMediaProcessingChange,
  creating = false,
}: TimelineEntryEditorProps) {
  const addBabyActivity = useActivityStore((state) => state.addBabyActivity);
  const addMomActivity = useActivityStore((state) => state.addMomActivity);
  const updateActivity = useActivityStore((state) => state.updateActivity);
  const medicationCatalog = useActivityStore((state) => state.medicationCatalog);
  const upsertMedication = useActivityStore((state) => state.upsertMedication);
  const deleteMedication = useActivityStore((state) => state.deleteMedication);
  const updateGrowthMeasurement = useGrowthStore((state) => state.updateGrowthMeasurement);
  const familyBirthDate = useProfileStore((state) => state.familyData.birthDate);
  const addTimelineItem = useTimelineStore((state) => state.addTimelineItem);
  const updateTimelineItem = useTimelineStore((state) => state.updateTimelineItem);
  const activity = source.kind === 'activity' ? source.record : null;
  const growth = source.kind === 'growth' ? source.record : null;
  const moment = source.kind === 'moment' ? source.record : null;

  const [occurredAt, setOccurredAt] = useState(() =>
    activity
      ? localDateTimeValue(activity.occurredAt)
      : growth
        ? dateInputValue(growth.date)
        : moment
          ? `${moment.date}T${moment.timeFormatted}`
          : '',
  );
  const [note, setNote] = useState(moment?.content ?? activity?.note ?? growth?.note ?? '');
  const [title, setTitle] = useState(moment?.title ?? '');
  const [momentTag, setMomentTag] = useState(moment?.tag ?? 'Khoảnh khắc');
  const [momentTagType, setMomentTagType] = useState<TimelineItem['tagType']>(
    moment?.tagType ?? 'general',
  );
  const [mediaItems, setMediaItems] = useState<TimelineMediaItem[]>(() =>
    moment ? getTimelineMediaItems(moment) : [],
  );
  const [mediaReadProgress, setMediaReadProgress] = useState<TimelineMediaReadProgress | null>(null);
  const [momentMediaUrl, setMomentMediaUrl] = useState('');
  const [amount, setAmount] = useState(() =>
    activity && 'amountMl' in activity ? String(activity.amountMl ?? '') : '',
  );
  const [duration, setDuration] = useState(() =>
    activity && 'durationMinutes' in activity ? String(activity.durationMinutes ?? '') : '',
  );
  const [sleepStartedAt, setSleepStartedAt] = useState(() =>
    activity?.type === 'sleep' && activity.owner === 'baby'
      ? localDateTimeValue(activity.startedAt ?? activity.occurredAt)
      : occurredAt,
  );
  const [sleepEndedAt, setSleepEndedAt] = useState(() => {
    if (activity?.type !== 'sleep' || activity.owner !== 'baby') return occurredAt;
    if (activity.endedAt) return localDateTimeValue(activity.endedAt);
    return addMinutesToLocalValue(
      localDateTimeValue(activity.startedAt ?? activity.occurredAt),
      activity.durationMinutes,
    );
  });
  const [sleepKind, setSleepKind] = useState<'nap' | 'night'>(() =>
    activity?.type === 'sleep' && activity.owner === 'baby' ? activity.sleepKind ?? 'nap' : 'nap',
  );
  const [sleepQuality, setSleepQuality] = useState<'restful' | 'normal' | 'restless'>(() =>
    activity?.type === 'sleep' && activity.owner === 'baby' ? activity.sleepQuality ?? 'normal' : 'normal',
  );
  const [wakeCount, setWakeCount] = useState(() =>
    activity?.type === 'sleep' && activity.owner === 'baby' ? activity.wakeCount ?? 0 : 0,
  );
  const [milkSource, setMilkSource] = useState<'breast' | 'formula'>(() => {
    if (activity?.type === 'feeding') {
      if (activity.method === 'formula' || activity.method === 'bottle' || activity.method === 'other') {
        return 'formula';
      }
      return 'breast';
    }
    return 'breast';
  });
  const [breastFeedMode, setBreastFeedMode] = useState<'direct' | 'bottle'>(() => {
    if (activity?.type === 'feeding') {
      if (activity.method === 'breast_bottle' || activity.method === 'bottle') {
        return 'bottle';
      }
    }
    return 'direct';
  });
  const [diaperKind, setDiaperKind] = useState(() =>
    activity?.type === 'diaper' ? activity.diaperKind : 'wet',
  );
  const [stoolType, setStoolType] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(() =>
    activity?.type === 'diaper' ? activity.stoolType ?? 4 : 4,
  );
  const [stoolColor, setStoolColor] = useState<'yellow' | 'brown' | 'green' | 'red' | 'black' | 'pale'>(() =>
    activity?.type === 'diaper' ? activity.stoolColor ?? 'yellow' : 'yellow',
  );
  const [stoolFlags, setStoolFlags] = useState<Array<'mucus' | 'blood'>>(() =>
    activity?.type === 'diaper' ? activity.stoolFlags ?? [] : [],
  );
  const [medicineName, setMedicineName] = useState(() =>
    activity?.type === 'medicine' ? activity.name : '',
  );
  const [dose, setDose] = useState(() =>
    activity?.type === 'medicine' ? activity.dose ?? '' : '',
  );
  const [temperature, setTemperature] = useState(() =>
    activity?.type === 'temperature' ? String(activity.temperatureC) : '',
  );
  const [measurementSite, setMeasurementSite] = useState<'rectal' | 'ear' | 'forehead' | 'oral' | 'axillary'>(() =>
    activity?.type === 'temperature' ? activity.measurementSite ?? 'forehead' : 'forehead',
  );
  const [temperatureSymptoms, setTemperatureSymptoms] = useState<Array<'lethargy' | 'breathing' | 'seizure' | 'rash' | 'dehydration'>>(() =>
    activity?.type === 'temperature' ? activity.symptoms ?? [] : [],
  );
  const [side, setSide] = useState(() =>
    activity?.type === 'pumping' ? activity.side : 'both',
  );
  const [mood, setMood] = useState(() =>
    activity?.type === 'mood' ? activity.mood : 'good',
  );
  const [weight, setWeight] = useState(() => (growth ? String(growth.weight) : ''));
  const [height, setHeight] = useState(() => (growth ? String(growth.height) : ''));
  const [headCirc, setHeadCirc] = useState(() => (growth ? String(growth.headCirc) : ''));
  const [error, setError] = useState<string | null>(null);
  const isFeeding = activity?.type === 'feeding';
  const isBabySleep = activity?.owner === 'baby' && activity.type === 'sleep';
  const isDiaper = activity?.type === 'diaper';
  const isTemperature = activity?.type === 'temperature';
  const usesSpecializedEditor = isFeeding || isBabySleep || isDiaper || isTemperature || Boolean(moment);
  const sleepAssessment = useMemo(
    () => assessBabySleep({ startedAt: sleepStartedAt, endedAt: sleepEndedAt, quality: sleepQuality, wakeCount }),
    [sleepEndedAt, sleepQuality, sleepStartedAt, wakeCount],
  );
  const diaperAssessment = useMemo(
    () => assessDiaper({ diaperKind, stoolType, stoolColor, flags: stoolFlags }),
    [diaperKind, stoolColor, stoolFlags, stoolType],
  );
  const temperatureNumber = Number(temperature);
  const temperatureAgeMonths = useMemo(() => {
    if (!familyBirthDate) return null;
    const measuredAt = new Date(occurredAt);
    return getAgeInMonths(familyBirthDate, Number.isFinite(measuredAt.getTime()) ? measuredAt : new Date());
  }, [familyBirthDate, occurredAt]);
  const temperatureAssessment = useMemo(
    () => assessTemperature({
      temperatureC: Number.isFinite(temperatureNumber) ? temperatureNumber : 36.8,
      ageMonths: temperatureAgeMonths,
      measurementSite,
      symptoms: temperatureSymptoms,
    }),
    [measurementSite, temperatureAgeMonths, temperatureNumber, temperatureSymptoms],
  );

  const initialBlobIds = useRef(
    new Set(mediaItems.flatMap((media) => (media.blobId ? [media.blobId] : []))),
  );
  const pendingBlobIds = useRef(new Set<string>());
  const removedBlobIds = useRef(new Set<string>());
  const editorActive = useRef(true);
  const mediaProcessing = useRef(false);

  const discardPendingMedia = useCallback(async () => {
    const items = [...pendingBlobIds.current].map((blobId) => ({
      blobId,
      type: 'photo' as const,
    }));
    pendingBlobIds.current.clear();
    await removeTimelineMediaFiles(items);
  }, []);

  useEffect(() => {
    editorActive.current = true;
    return () => {
      editorActive.current = false;
      onMediaProcessingChange?.(false);
      void discardPendingMedia();
    };
  }, [discardPendingMedia, onMediaProcessingChange]);

  const appendMediaFiles = async (files?: FileList | null) => {
    if (mediaProcessing.current) {
      setError('Ảnh/video đang được chuẩn bị. Vui lòng đợi một chút.');
      return;
    }
    mediaProcessing.current = true;
    onMediaProcessingChange?.(true);
    try {
      const nextItems = await readTimelineMediaFiles(files, {
        onProgress: (progress) => {
          if (editorActive.current) setMediaReadProgress(progress);
        },
      });
      if (nextItems.length === 0) return;
      if (!editorActive.current) {
        await removeTimelineMediaFiles(nextItems);
        return;
      }
      nextItems.forEach((item) => {
        if (item.blobId) pendingBlobIds.current.add(item.blobId);
      });
      setMediaItems((current) => [...current, ...nextItems]);
      setError(null);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Không thể đọc media đã chọn.');
    } finally {
      mediaProcessing.current = false;
      onMediaProcessingChange?.(false);
      if (editorActive.current) setMediaReadProgress(null);
    }
  };

  const appendMediaUrl = () => {
    const url = momentMediaUrl.trim();
    if (!url) return;
    setMediaItems((current) => [
      ...current,
      {
        id: `media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url,
        type: detectTimelineMediaType(url) ?? 'photo',
        focalX: 50,
        focalY: 38,
      },
    ]);
    setMomentMediaUrl('');
    setError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mediaProcessing.current) {
      setError('Ảnh/video vẫn đang được chuẩn bị. Vui lòng đợi hoàn tất trước khi lưu.');
      return;
    }

    if (source.kind === 'moment') {
      if (!title.trim()) {
        setError('Nhập tiêu đề khoảnh khắc.');
        return;
      }
      const [date, time] = occurredAt.split('T');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time ?? '')) {
        setError('Thời điểm chưa hợp lệ.');
        return;
      }
      const nextMediaItems = mediaItems.filter(
        (media) => media.blobId || media.driveFileId || media.url?.trim(),
      );
      if (creating) {
        addTimelineItem({
          owner: source.record.owner,
          date,
          timeFormatted: time.slice(0, 5),
          title: title.trim(),
          content: note.trim(),
          tag: momentTag,
          tagType: momentTagType,
          mediaItems: nextMediaItems,
          stats: [],
          type: 'daily',
        });
      } else {
        updateTimelineItem(source.record.id, {
          date,
          timeFormatted: time.slice(0, 5),
          title: title.trim(),
          content: note.trim(),
          tag: momentTag,
          tagType: momentTagType,
          mediaItems: nextMediaItems,
        });
      }
      pendingBlobIds.current.clear();
      await removeTimelineMediaFiles(
        [...removedBlobIds.current].map((blobId) => ({ blobId, type: 'photo' })),
      );
      removedBlobIds.current.clear();
      onSaved(title.trim());
      return;
    }

    if (source.kind === 'growth') {
      const nextWeight = Number(weight);
      const nextHeight = Number(height);
      const nextHeadCirc = Number(headCirc);
      if (
        ![nextWeight, nextHeight, nextHeadCirc].every(
          (value) => Number.isFinite(value) && value >= 0,
        )
      ) {
        setError('Các số đo phải là số hợp lệ.');
        return;
      }
      updateGrowthMeasurement(source.record.id, {
        date: occurredAt,
        weight: nextWeight,
        height: nextHeight,
        headCirc: nextHeadCirc,
        note: note.trim(),
      });
      onSaved();
      return;
    }

    const occurredDate = new Date(occurredAt);
    if (!Number.isFinite(occurredDate.getTime())) {
      setError('Thời điểm chưa hợp lệ.');
      return;
    }
    const common = { occurredAt: occurredDate.toISOString(), note: note.trim() || undefined };
    const current = source.record;
    let patch: Partial<ActivityRecord> = common;

    if (current.type === 'feeding') {
      const nextAmount = Number(amount);
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        setError('Vui lòng chọn hoặc nhập lượng sữa.');
        return;
      }
      const derivedMethod =
        milkSource === 'formula'
          ? 'formula'
          : breastFeedMode === 'bottle'
            ? 'breast_bottle'
            : 'breast_direct';
      patch = {
        ...common,
        amountMl: nextAmount,
        method: derivedMethod,
      } as Partial<ActivityRecord>;
    } else if (current.type === 'sleep' && current.owner === 'baby') {
      if (!sleepAssessment.durationMinutes || sleepAssessment.durationMinutes <= 0) {
        setError('Giờ kết thúc phải sau giờ bắt đầu.');
        return;
      }
      const sleepStartDate = new Date(sleepStartedAt);
      const sleepEndDate = new Date(sleepEndedAt);
      patch = {
        occurredAt: sleepStartDate.toISOString(),
        startedAt: sleepStartDate.toISOString(),
        endedAt: sleepEndDate.toISOString(),
        durationMinutes: sleepAssessment.durationMinutes,
        sleepKind,
        sleepQuality,
        wakeCount,
        note: note.trim() || undefined,
      } as Partial<ActivityRecord>;
    } else if (current.type === 'sleep') {
      const nextDuration = Number(duration);
      if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
        setError('Thời lượng phải lớn hơn 0 phút.');
        return;
      }
      patch = { ...common, durationMinutes: nextDuration } as Partial<ActivityRecord>;
    } else if (current.type === 'diaper') {
      patch = {
        ...common,
        diaperKind,
        stoolType: diaperKind === 'wet' ? undefined : stoolType,
        stoolColor: diaperKind === 'wet' ? undefined : stoolColor,
        stoolFlags: diaperKind === 'wet' ? undefined : stoolFlags,
      } as Partial<ActivityRecord>;
    } else if (current.type === 'medicine') {
      if (!medicineName.trim()) {
        setError('Nhập tên thuốc hoặc vitamin.');
        return;
      }
      patch = {
        ...common,
        name: medicineName.trim(),
        dose: dose.trim() || undefined,
      } as Partial<ActivityRecord>;
      upsertMedication({ name: medicineName, dose });
    } else if (current.type === 'temperature') {
      const nextTemperature = Number(temperature);
      if (!Number.isFinite(nextTemperature) || nextTemperature <= 0) {
        setError('Nhiệt độ chưa hợp lệ.');
        return;
      }
      patch = {
        ...common,
        temperatureC: nextTemperature,
        measurementSite,
        symptoms: temperatureSymptoms,
      } as Partial<ActivityRecord>;
    } else if (current.type === 'health_note') {
      if (!note.trim()) {
        setError('Nhập nội dung ghi chú.');
        return;
      }
      patch = common as Partial<ActivityRecord>;
    } else if (current.type === 'pumping') {
      const nextAmount = Number(amount);
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        setError('Lượng sữa phải lớn hơn 0 ml.');
        return;
      }
      patch = { ...common, amountMl: nextAmount, side } as Partial<ActivityRecord>;
    } else if (current.type === 'mood') {
      patch = { ...common, mood } as Partial<ActivityRecord>;
    }

    if (creating) {
      const { id: _id, createdAt: _createdAt, ...nextActivity } = {
        ...current,
        ...patch,
      };
      void _id;
      void _createdAt;
      if (current.owner === 'baby') {
        addBabyActivity(nextActivity as NewBabyActivity);
      } else {
        addMomActivity(nextActivity as NewMomActivity);
      }
    } else {
      updateActivity(current.id, patch);
    }
    onSaved();
  };

  return (
    <form
      id="timeline-edit-form"
      className={`journal-edit-form ${moment ? 'journal-moment-edit-form' : ''} ${isFeeding ? 'journal-feeding-edit-form' : ''} ${isBabySleep ? 'journal-sleep-edit-form' : ''} ${isDiaper ? 'journal-diaper-edit-form' : ''} ${isTemperature ? 'journal-temperature-edit-form' : ''}`.trim()}
      onSubmit={save}
    >
      {!usesSpecializedEditor && (
        <label>
          <span>{source.kind === 'growth' ? 'Ngày đo' : 'Thời điểm'}</span>
          <HavenDatePicker
            label={source.kind === 'growth' ? 'Ngày đo' : 'Thời điểm'}
            value={occurredAt}
            showTime={source.kind !== 'growth'}
            onChange={setOccurredAt}
          />
        </label>
      )}
      {moment && (
        <div className="journal-moment-editor">
          <div className="journal-care-card journal-moment-card">
            <div className="journal-care-section">
              <div className="journal-care-heading">
                <span><Clock3 size={14} /> Thời điểm</span>
                <small>Ngày và giờ của khoảnh khắc</small>
              </div>
              <HavenDatePicker
                label="Thời điểm"
                value={occurredAt}
                showTime
                onChange={setOccurredAt}
              />
            </div>

            <div className="journal-care-section journal-moment-story-fields">
              <label>
                <span>Tiêu đề</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ví dụ: Lần đầu bé tự đứng"
                  required
                />
              </label>
              <label>
                <span>Câu chuyện</span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ghi lại điều đáng nhớ..."
                />
              </label>
            </div>

            <div className="journal-care-section">
              <div className="journal-care-heading">
                <span><Sparkles size={14} /> Chủ đề</span>
                <small>Giúp tìm lại nhanh hơn</small>
              </div>
              <div className="journal-moment-tag-grid" role="radiogroup" aria-label="Chủ đề khoảnh khắc">
                {MOMENT_TAGS.map((tagOption) => {
                  const selected = momentTagType === tagOption.value;
                  return (
                    <button
                      key={tagOption.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={selected ? 'is-selected' : ''}
                      onClick={() => {
                        setMomentTagType(tagOption.value);
                        setMomentTag(tagOption.label);
                      }}
                    >
                      {selected && <Check size={12} />}
                      {tagOption.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="journal-care-section journal-edit-media-list">
              <div className="journal-care-heading">
                <span><Images size={14} /> Ảnh và video</span>
                <small>
                  {mediaReadProgress
                    ? `Đang xử lý ${mediaReadProgress.fileNumber}/${mediaReadProgress.totalFiles}`
                    : mediaItems.length > 0
                      ? `${mediaItems.length} mục · có thể thêm tiếp`
                      : 'Thêm nhiều, không giới hạn'}
                </small>
              </div>
            <div className="moment-media-source-actions">
              <label className="moment-upload-button">
                <Images size={15} />
                <span>Thư viện</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  disabled={Boolean(mediaReadProgress)}
                  aria-label="Chọn từ thư viện"
                  onChange={(event) => {
                    void appendMediaFiles(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <label className="moment-upload-button">
                <Camera size={15} />
                <span>Chụp ảnh</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={Boolean(mediaReadProgress)}
                  aria-label="Chụp ảnh"
                  onChange={(event) => {
                    void appendMediaFiles(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>

            {mediaReadProgress && <TimelineMediaReadStatus progress={mediaReadProgress} />}

            <div className="journal-moment-url-row">
              <input
                type="url"
                aria-label="URL ảnh hoặc video"
                value={momentMediaUrl}
                onChange={(event) => setMomentMediaUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  appendMediaUrl();
                }}
                placeholder="Dán URL ảnh hoặc video"
              />
              <button
                type="button"
                aria-label="Thêm media từ URL"
                disabled={!momentMediaUrl.trim()}
                onClick={appendMediaUrl}
              >
                <Plus size={15} />
              </button>
            </div>

            {mediaItems.length > 0 && (
              <div className="journal-moment-media-strip" aria-label={`${mediaItems.length} media đã chọn`}>
                {mediaItems.map((media, index) => (
                  <div className="journal-moment-media-item" key={media.id ?? media.blobId ?? index}>
                  <span className="journal-moment-media-placeholder">
                    {media.type === 'video' ? <Video size={18} /> : <ImageIcon size={18} />}
                  </span>
                  <TimelineMediaAsset
                    media={media}
                    className="journal-moment-media-asset"
                    alt={`Media ${index + 1}`}
                    imageStyle={{ objectPosition: `${media.focalX ?? 50}% ${media.focalY ?? 38}%` }}
                    preload="metadata"
                  />
                  {media.type === 'video' && (
                    <span className="journal-moment-media-kind"><Video size={11} /> Video</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Bỏ media ${index + 1}`}
                    onClick={() => {
                      setMediaItems((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      );
                      if (!media.blobId) return;
                      if (pendingBlobIds.current.delete(media.blobId))
                        void removeTimelineMediaFiles([media]);
                      else if (initialBlobIds.current.has(media.blobId))
                        removedBlobIds.current.add(media.blobId);
                    }}
                  >
                    <X size={14} />
                  </button>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>
      )}
      {activity?.type === 'feeding' && (
        <div className="journal-feeding-editor">
          <div className="journal-feeding-compact-card">
            <label className="journal-feeding-compact-field">
              <span className="journal-feeding-compact-label"><Clock3 size={14} /> Thời điểm</span>
              <HavenDatePicker
                label="Thời điểm"
                value={occurredAt}
                showTime
                onChange={setOccurredAt}
              />
            </label>

            <div className="journal-feeding-compact-field">
              <div className="journal-feeding-compact-heading">
                <span>Loại sữa</span>
                <small>Chọn nguồn sữa của cữ này</small>
              </div>
              <div className="journal-feeding-choice-grid" role="radiogroup" aria-label="Nguồn sữa">
                {FEEDING_SOURCES.map((opt) => {
                  const Icon = opt.icon;
                  const active = milkSource === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`journal-feeding-choice is-source ${active ? 'is-selected' : ''}`}
                      onClick={() => setMilkSource(opt.value)}
                    >
                      <span className="journal-feeding-choice-icon"><Icon size={17} /></span>
                      <span className="journal-feeding-choice-copy">
                        <strong>{opt.label}</strong>
                        <small>{opt.detail}</small>
                      </span>
                      <span className="journal-feeding-choice-check" aria-hidden="true">
                        {active && <Check size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {milkSource === 'breast' && (
                <div className="journal-feeding-subchoice">
                  <span>Cách cho bé bú</span>
                  <div className="journal-feeding-choice-grid is-compact" role="radiogroup" aria-label="Cách bú mẹ">
                    {BREAST_FEEDING_MODES.map((opt) => {
                      const Icon = opt.icon;
                      const active = breastFeedMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`journal-feeding-choice is-method ${active ? 'is-selected' : ''}`}
                          onClick={() => setBreastFeedMode(opt.value)}
                        >
                          <span className="journal-feeding-choice-icon"><Icon size={16} /></span>
                          <span className="journal-feeding-choice-copy">
                            <strong>{opt.label}</strong>
                          </span>
                          <span className="journal-feeding-choice-check" aria-hidden="true">
                            {active && <Check size={12} strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="journal-feeding-compact-field">
              <div className="journal-feeding-compact-heading">
                <span>Lượng sữa</span>
                <small>
                  {milkSource === 'breast' && breastFeedMode === 'direct'
                    ? 'Có thể nhập lượng ước tính.'
                    : 'Kéo hoặc chọn nhanh.'}
                </small>
              </div>
              <HavenMilkAmountInput
                value={amount}
                onChange={setAmount}
                className="journal-feeding-amount-control"
              />
            </div>

            <label className="journal-feeding-compact-field">
              <span className="journal-feeding-compact-label"><NotebookPen size={14} /> Ghi chú</span>
              <textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: Bé bú tốt, không ọc sữa..."
              />
            </label>
          </div>
        </div>
      )}
      {activity?.type === 'sleep' && (
        activity.owner === 'baby' ? (
          <div className="journal-care-editor journal-sleep-editor">
            <div className="journal-care-card">
              <div className="journal-care-section">
                <div className="journal-care-heading">
                  <span>Thời gian ngủ</span>
                  <small>Chọn bắt đầu và kết thúc</small>
                </div>
                <div className="journal-care-datetime-grid">
                  <label>
                    <span>Bắt đầu</span>
                    <HavenDatePicker label="Bắt đầu" value={sleepStartedAt} showTime onChange={setSleepStartedAt} />
                  </label>
                  <label>
                    <span>Kết thúc</span>
                    <HavenDatePicker label="Kết thúc" value={sleepEndedAt} showTime onChange={setSleepEndedAt} />
                  </label>
                </div>
                <div className="journal-quick-preset-row" role="group" aria-label="Chọn nhanh thời lượng ngủ">
                  {[30, 60, 90, 120, 180].map((minutes) => (
                    <button key={minutes} type="button" onClick={() => setSleepEndedAt(addMinutesToLocalValue(sleepStartedAt, minutes))}>
                      {minutes < 60 ? `${minutes}p` : `${minutes / 60}h`}
                    </button>
                  ))}
                </div>
              </div>

              <AssessmentBanner assessment={sleepAssessment} />

              <div className="journal-care-section">
                <div className="journal-care-heading"><span>Loại giấc</span></div>
                <div className="journal-care-segments two" role="radiogroup" aria-label="Loại giấc ngủ">
                  {SLEEP_KINDS.map((option) => (
                    <button key={option.value} type="button" role="radio" aria-checked={sleepKind === option.value} className={sleepKind === option.value ? 'is-selected' : ''} onClick={() => setSleepKind(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="journal-care-section">
                <div className="journal-care-heading"><span>Chất lượng giấc ngủ</span><small>Đánh giá nhanh</small></div>
                <div className="journal-sleep-quality-grid" role="radiogroup" aria-label="Chất lượng giấc ngủ">
                  {SLEEP_QUALITIES.map((option) => (
                    <button key={option.value} type="button" role="radio" aria-checked={sleepQuality === option.value} className={sleepQuality === option.value ? 'is-selected' : ''} onClick={() => setSleepQuality(option.value)}>
                      <i aria-hidden="true">{option.symbol}</i><span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="journal-care-section journal-care-inline-section">
                <div className="journal-care-heading"><span>Số lần thức giấc</span></div>
                <div className="journal-count-chips" role="radiogroup" aria-label="Số lần thức giấc">
                  {[0, 1, 2, 3, 4].map((count) => (
                    <button key={count} type="button" role="radio" aria-checked={wakeCount === count} className={wakeCount === count ? 'is-selected' : ''} onClick={() => setWakeCount(count)}>
                      {count === 4 ? '4+' : count}
                    </button>
                  ))}
                </div>
              </div>

              <label className="journal-care-note">
                <span><NotebookPen size={14} /> Ghi chú</span>
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: Bé khó vào giấc, thức vì đói..." />
              </label>
            </div>
          </div>
        ) : (
          <label>
            <span>Thời lượng (phút)</span>
            <input type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} required />
          </label>
        )
      )}
      {activity?.type === 'diaper' && (
        <div className="journal-care-editor journal-diaper-editor">
          <div className="journal-care-card">
            <label className="journal-care-section">
              <span className="journal-care-label"><Clock3 size={14} /> Thời điểm</span>
              <HavenDatePicker label="Thời điểm" value={occurredAt} showTime onChange={setOccurredAt} />
            </label>

            <div className="journal-care-section">
              <div className="journal-care-heading"><span>Loại tã</span></div>
              <div className="journal-care-segments three" role="radiogroup" aria-label="Loại tã">
                {DIAPER_KINDS.map((opt) => {
                  const Icon = opt.icon;
                  const active = diaperKind === opt.value;
                  return (
                    <button key={opt.value} type="button" role="radio" aria-checked={active} className={active ? 'is-selected' : ''} onClick={() => setDiaperKind(opt.value)}>
                      <Icon size={15} /><span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {diaperKind !== 'wet' && (
              <>
                <div className="journal-care-section">
                  <div className="journal-care-heading"><span>Dạng phân · Bristol 1–7</span><small>Chọn hình dạng gần nhất</small></div>
                  <div className="journal-stool-type-grid" role="radiogroup" aria-label="Dạng phân theo thang Bristol">
                    {STOOL_TYPES.map((option) => (
                      <button key={option.value} type="button" role="radio" aria-checked={stoolType === option.value} className={stoolType === option.value ? 'is-selected' : ''} onClick={() => setStoolType(option.value)} aria-label={`${option.label}: ${option.detail}`}>
                        <span className={`journal-stool-shape type-${option.value}`} aria-hidden="true"><i /><i /><i /></span>
                        <strong>{option.value}</strong><small>{option.detail}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="journal-care-section">
                  <div className="journal-care-heading"><span>Màu phân</span><small>Đỏ, đen, trắng/xám sẽ cảnh báo</small></div>
                  <div className="journal-stool-color-grid" role="radiogroup" aria-label="Màu phân">
                    {STOOL_COLORS.map((option) => (
                      <button key={option.value} type="button" role="radio" aria-checked={stoolColor === option.value} className={stoolColor === option.value ? 'is-selected' : ''} onClick={() => setStoolColor(option.value)}>
                        <i style={{ backgroundColor: option.color }} aria-hidden="true" /><span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="journal-care-section journal-care-inline-section">
                  <div className="journal-care-heading"><span>Dấu hiệu kèm theo</span></div>
                  <div className="journal-flag-chips" role="group" aria-label="Dấu hiệu trong phân">
                    {([
                      { value: 'mucus', label: 'Có nhầy' },
                      { value: 'blood', label: 'Nghi có máu' },
                    ] as const).map((option) => {
                      const selected = stoolFlags.includes(option.value);
                      return (
                        <button key={option.value} type="button" aria-pressed={selected} className={selected ? 'is-selected' : ''} onClick={() => setStoolFlags((current) => selected ? current.filter((item) => item !== option.value) : [...current, option.value])}>
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <AssessmentBanner assessment={diaperAssessment} />

            <label className="journal-care-note">
              <span><NotebookPen size={14} /> Ghi chú</span>
              <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: Bé rặn nhiều, đi ngoài lần thứ 3..." />
            </label>
          </div>
        </div>
      )}
      {activity?.type === 'medicine' && (
        <div className="journal-edit-wide">
          <HavenMedicationPicker
            items={medicationCatalog}
            value={medicineName}
            dose={dose}
            onSelect={(item) => {
              setMedicineName(item.name);
              setDose(item.lastDose ?? '');
            }}
            onCreate={(name, infoUrl) => {
              const item = upsertMedication({ name, infoUrl });
              setMedicineName(item.name);
              setDose(item.lastDose ?? '');
            }}
            onDelete={(item) => {
              deleteMedication(item.id);
              if (item.name === medicineName) {
                setMedicineName('');
                setDose('');
              }
            }}
            onDoseChange={setDose}
          />
        </div>
      )}
      {activity?.type === 'temperature' && (
        <div className="journal-care-editor journal-temperature-editor">
          <div className="journal-care-card">
            <label className="journal-care-section">
              <span className="journal-care-label"><Clock3 size={14} /> Thời điểm đo</span>
              <HavenDatePicker label="Thời điểm đo" value={occurredAt} showTime onChange={setOccurredAt} />
            </label>

            <div className="journal-care-section">
              <div className="journal-care-heading"><span>Thân nhiệt của bé</span><small>Trạng thái cập nhật ngay khi nhập</small></div>
              <HavenTemperatureInput value={temperature} onChange={setTemperature} />
            </div>

            <AssessmentBanner assessment={temperatureAssessment} />

            <div className="journal-care-section">
              <div className="journal-care-heading"><span>Vị trí đo</span><small>Ảnh hưởng đến độ chính xác</small></div>
              <div className="journal-temperature-site-grid" role="radiogroup" aria-label="Vị trí đo nhiệt độ">
                {TEMPERATURE_SITES.map((option) => (
                  <button key={option.value} type="button" role="radio" aria-checked={measurementSite === option.value} className={measurementSite === option.value ? 'is-selected' : ''} onClick={() => setMeasurementSite(option.value)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="journal-care-section">
              <div className="journal-care-heading"><span>Triệu chứng kèm theo</span><small>Chọn nếu đang có</small></div>
              <div className="journal-symptom-grid" role="group" aria-label="Triệu chứng kèm theo">
                {TEMPERATURE_SYMPTOMS.map((option) => {
                  const selected = temperatureSymptoms.includes(option.value);
                  return (
                    <button key={option.value} type="button" aria-pressed={selected} className={selected ? 'is-selected' : ''} onClick={() => setTemperatureSymptoms((current) => selected ? current.filter((item) => item !== option.value) : [...current, option.value])}>
                      {selected && <Check size={13} />}<span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="journal-care-note">
              <span><NotebookPen size={14} /> Ghi chú</span>
              <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: Bé vừa ngủ dậy, đã lau ấm..." />
            </label>
          </div>
        </div>
      )}
      {activity?.type === 'pumping' && (
        <>
          <label>
            <span>Lượng sữa (ml)</span>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Bên hút</span>
            <HavenDropdown
              label="Bên hút"
              value={side}
              onChange={(val) => setSide(val as typeof side)}
              options={[
                { value: 'left', label: 'Bên trái' },
                { value: 'right', label: 'Bên phải' },
                { value: 'both', label: 'Hai bên' },
              ]}
            />
          </label>
        </>
      )}
      {activity?.type === 'mood' && (
        <label>
          <span>Tâm trạng</span>
          <HavenDropdown
            label="Tâm trạng"
            value={mood}
            onChange={(val) => setMood(val as typeof mood)}
            options={[
              { value: 'great', label: 'Rất tốt' },
              { value: 'good', label: 'Tốt' },
              { value: 'neutral', label: 'Bình thường' },
              { value: 'low', label: 'Không tốt' },
              { value: 'very_low', label: 'Rất không tốt' },
            ]}
          />
        </label>
      )}
      {growth && (
        <>
          <label>
            <span>Cân nặng (kg)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Chiều cao (cm)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Vòng đầu (cm)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={headCirc}
              onChange={(event) => setHeadCirc(event.target.value)}
              required
            />
          </label>
        </>
      )}
      {!usesSpecializedEditor && !moment && (
        <label className="journal-edit-wide">
          <span>{moment ? 'Câu chuyện' : 'Ghi chú'}</span>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Thêm ghi chú..."
          />
        </label>
      )}
      {error && <p className="journal-edit-error">{error}</p>}
    </form>
  );
}
