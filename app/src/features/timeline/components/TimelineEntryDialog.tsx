import { useEffect, useState } from 'react';
import { Check, Clock3, Pencil, Trash2 } from 'lucide-react';
import { useActivityStore, type ActivityRecord } from '@/features/activities';
import { useGrowthStore } from '@/features/growth';
import { HavenDialog } from '@/shared/ui/HavenDialog';
import { getTimelineMediaItems } from '../domain/timelineMedia';
import type { TimelineMediaItem } from '../domain/types';
import { buildBabyTimelineEntry } from '../domain/timelineSelectors';
import { useTimelineStore } from '../store/useTimelineStore';
import { TimelineEntryEditor } from './TimelineEntryEditor';
import { TimelineMediaButton } from './TimelineMediaButton';
import { entryMeta } from './timelineEntryPresentation';
import { removeTimelineMediaFiles } from './timelineMediaFiles';
import type { EditableTimelineSource, JournalTimelineEntry } from './timelineEntryTypes';

export { TimelineEntryEditor, TimelineMediaButton };
export type { TimelineEntryEditorProps } from './TimelineEntryEditor';
export type { TimelineMediaButtonProps } from './TimelineMediaButton';
export type { EditableTimelineSource, JournalTimelineEntry } from './timelineEntryTypes';

function entryCategoryLabel(entry: JournalTimelineEntry): string {
  if (entry.moment) return entry.moment.tag;
  return (
    {
      feeding: 'Ăn uống',
      sleep: 'Giấc ngủ',
      diaper: 'Chăm sóc',
      medicine: 'Sức khỏe',
      temperature: 'Sức khỏe',
      growth: 'Tăng trưởng',
      pumping: 'Sữa mẹ',
      mood: 'Cảm xúc',
    }[entry.type] ?? 'Ghi nhận'
  );
}

function ownerLabel(owner?: string): string {
  return owner === 'baby' ? 'Của bé' : owner === 'mom' ? 'Của mẹ' : 'Hệ thống';
}

function formatFullDate(date: Date): string {
  const formatted = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function normalizeToEntryAndSource(
  input: JournalTimelineEntry | ActivityRecord | null,
): { entry: JournalTimelineEntry | null; source: EditableTimelineSource | null } {
  if (!input) return { entry: null, source: null };

  // If it's already a JournalTimelineEntry
  if ('stats' in input && 'owner' in input) {
    const entry = input as JournalTimelineEntry;
    if (entry.moment) return { entry, source: { kind: 'moment', record: entry.moment } };
    return { entry, source: null }; // Will be resolved by caller if growth / activity
  }

  // If it's an ActivityRecord
  const act = input as ActivityRecord;
  let stats: string[] = [];
  let signs: string[] = [];
  if (act.type === 'feeding') {
    const parts: string[] = [];
    if (act.amountMl) parts.push(`${act.amountMl} ml`);
    if (act.method === 'formula') parts.push('Sữa công thức');
    if (act.method === 'breast_direct') parts.push('Sữa mẹ (trực tiếp)');
    if (act.method === 'breast_bottle') parts.push('Sữa mẹ (bình)');
    if (act.method === 'bottle') parts.push('Bình sữa');
    if (act.method === 'breast') parts.push('Bú mẹ');
    if (act.method === 'other') parts.push('Khác');
    stats = parts;
  } else if (act.type === 'sleep') {
    stats = act.owner === 'baby'
      ? buildBabyTimelineEntry(act).stats
      : [`${act.durationMinutes} phút`];
  } else if (act.type === 'diaper') {
    const timelineEntry = buildBabyTimelineEntry(act);
    stats = timelineEntry.stats;
    signs = timelineEntry.signs ?? [];
  } else if (act.type === 'medicine') {
    stats = [act.name, act.dose].filter(Boolean) as string[];
  } else if (act.type === 'temperature') {
    const timelineEntry = buildBabyTimelineEntry(act);
    stats = timelineEntry.stats;
    signs = timelineEntry.signs ?? [];
  } else if (act.type === 'pumping') {
    const sideLabel = act.side === 'left' ? 'Bên trái' : act.side === 'right' ? 'Bên phải' : 'Hai bên';
    stats = [`${act.amountMl} ml`, sideLabel];
  } else if (act.type === 'mood') {
    stats = [act.mood === 'great' ? 'Rất tốt' : act.mood === 'good' ? 'Tốt' : act.mood === 'neutral' ? 'Bình thường' : 'Không tốt'];
  }

  const titleMap: Record<string, string> = {
    feeding: 'Cữ bú',
    sleep: 'Giấc ngủ',
    diaper: 'Thay tã',
    medicine: 'Uống thuốc',
    temperature: 'Đo nhiệt độ',
    pumping: 'Hút sữa',
    mood: 'Tâm trạng',
    health_note: 'Ghi chú sức khỏe',
  };

  const entry: JournalTimelineEntry = {
    id: act.id,
    occurredAt: act.occurredAt,
    owner: act.owner ?? 'baby',
    type: act.type,
    title: titleMap[act.type] ?? 'Hoạt động',
    detail: act.note ?? '',
    stats,
    signs,
  };

  return { entry, source: { kind: 'activity', record: act } };
}

function creationInitialFocusSelector(source: EditableTimelineSource | null): string | undefined {
  if (!source) return undefined;
  if (source.kind === 'growth') return 'input[type="number"]';
  if (source.kind === 'moment') return 'input:not([type="file"]):not([type="range"])';

  const record = source.record;
  if (record.type === 'feeding') return 'input[aria-label="Lượng sữa (ml)"]';
  if (record.type === 'temperature') return 'input[aria-label="Thân nhiệt (°C)"]';
  if (record.type === 'health_note') return 'textarea';
  if (record.type === 'medicine') return '.haven-medication-option button[role="radio"]';
  if (record.type === 'mood') return '.haven-dropdown-trigger';
  if (record.type === 'diaper') return '[aria-label="Loại tã"] button[role="radio"]';
  if (record.type === 'sleep' && record.owner === 'baby') return '.haven-date-picker-trigger';
  if (record.type === 'sleep' || record.type === 'pumping') return 'input[type="number"]';
  return undefined;
}

export interface TimelineEntryDialogProps {
  open: boolean;
  onClose: () => void;
  entry?: JournalTimelineEntry | ActivityRecord | null;
  source?: EditableTimelineSource | null;
  onOpenLightbox?: (src: string, isVideo?: boolean) => void;
  onOpenMomentMedia?: (
    items: TimelineMediaItem[],
    initialIndex: number,
    title: string,
    layoutId: string,
    originSrc: string,
    getLayoutId?: (index: number, media: TimelineMediaItem) => string,
  ) => void;
  initialEditing?: boolean;
  creating?: boolean;
  titleOverride?: string;
  onSaved?: (savedTitle?: string) => void;
}

export function TimelineEntryDialog({
  open,
  onClose,
  entry: rawEntry = null,
  source: explicitSource = null,
  onOpenLightbox,
  onOpenMomentMedia,
  initialEditing = false,
  creating = false,
  titleOverride,
  onSaved,
}: TimelineEntryDialogProps) {
  const [editing, setEditing] = useState(initialEditing);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteActivity = useActivityStore((state) => state.deleteActivity);
  const deleteGrowthMeasurement = useGrowthStore((state) => state.deleteGrowthMeasurement);
  const deleteTimelineItem = useTimelineStore((state) => state.deleteTimelineItem);

  useEffect(() => {
    if (!open) return;
    setEditing(initialEditing);
    setConfirmingDelete(false);
  }, [initialEditing, open, rawEntry?.id]);

  const { entry: normalizedEntry, source: normalizedSource } = normalizeToEntryAndSource(rawEntry);
  const entry = normalizedEntry;
  const source = explicitSource ?? normalizedSource;

  if (!entry) return null;

  const meta = entryMeta(entry);
  const Icon = meta.icon;
  const item = entry.moment;
  const mediaItems = item ? getTimelineMediaItems(item) : [];
  const activitySource = source?.kind === 'activity' ? source : null;
  const isActivityDialog = source !== null;
  const isFeedingEditor =
    editing && activitySource?.record.type === 'feeding';
  const dialogClassName = [
    isActivityDialog ? `journal-activity-dialog tone-${meta.tone}` : '',
    isFeedingEditor ? 'journal-feeding-editor-dialog' : '',
  ].filter(Boolean).join(' ');
  const initialFocusSelector = creating ? creationInitialFocusSelector(source) : undefined;

  const deleteEntry = () => {
    if (!source) return;
    if (source.kind === 'activity') {
      deleteActivity(source.record.id);
    } else if (source.kind === 'growth') {
      deleteGrowthMeasurement(source.record.id);
    } else {
      const mediaToRemove = getTimelineMediaItems(source.record);
      deleteTimelineItem(source.record.id);
      void removeTimelineMediaFiles(mediaToRemove);
    }
    setConfirmingDelete(false);
    onClose();
  };

  return (
    <HavenDialog
      open={open}
      onClose={onClose}
      title={titleOverride || entry.title || 'Chi tiết ghi nhận'}
      description={`${ownerLabel(entry.owner)} · ${formatFullDate(new Date(entry.occurredAt))}`}
      className={dialogClassName || undefined}
      initialFocusSelector={initialFocusSelector}
      touchOptimized={creating}
      footer={
        editing && source ? (
          <>
            <button
              type="button"
              className="haven-dialog-secondary"
              onClick={() => {
                if (creating) {
                  onClose();
                } else {
                  setEditing(false);
                }
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="timeline-edit-form"
              className="haven-dialog-primary"
            >
              {isFeedingEditor && <Check size={15} />}
              {creating ? 'Lưu ghi nhận' : 'Lưu thay đổi'}
            </button>
          </>
        ) : !editing && source && confirmingDelete ? (
          <>
            <button
              type="button"
              className="haven-dialog-secondary"
              onClick={() => setConfirmingDelete(false)}
            >
              Hủy
            </button>
            <button
              type="button"
              className="haven-dialog-danger is-confirming"
              onClick={deleteEntry}
            >
              <Trash2 size={15} /> Xóa ghi nhận
            </button>
          </>
        ) : !editing && source ? (
          <>
            <button
              type="button"
              className="haven-dialog-primary"
              onClick={() => setEditing(true)}
            >
              <Pencil size={15} /> Chỉnh sửa
            </button>
            <button
              type="button"
              className="haven-dialog-danger"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={15} /> Xóa
            </button>
          </>
        ) : undefined
      }
    >
      {editing && source ? (
        <TimelineEntryEditor
          key={entry.id}
          source={source}
          creating={creating}
          onSaved={(savedTitle) => {
            onSaved?.(savedTitle);
            if (creating) {
              onClose();
            } else {
              setEditing(false);
            }
          }}
        />
      ) : (
        <div className={`journal-detail tone-${meta.tone}`}>
          {mediaItems.length > 0 && (
            <div
              className="journal-detail-media-list"
              aria-label={`${mediaItems.length} media của ${item?.title}`}
            >
              {mediaItems.map((media, index) => (
                <TimelineMediaButton
                  className="journal-detail-media-item"
                  key={media.id ?? media.blobId ?? `${media.url}-${index}`}
                  media={media}
                  layoutId={`moment-dialog-${entry.id}-${media.id ?? media.blobId ?? index}`}
                  onOpen={(src, isVideo) => {
                    if (onOpenMomentMedia) {
                      onOpenMomentMedia(
                        mediaItems,
                        index,
                        item?.title ?? entry.title,
                        `moment-dialog-${entry.id}-${media.id ?? media.blobId ?? index}`,
                        src,
                        (idx, m) => `moment-dialog-${entry.id}-${m.id ?? m.blobId ?? idx}`,
                      );
                    } else {
                      onOpenLightbox?.(src, isVideo);
                    }
                  }}
                  ariaLabel={
                    mediaItems.length === 1
                      ? `Mở ${media.type === 'video' ? 'video' : 'ảnh'} ${item?.title}`
                      : `Mở ${media.type === 'video' ? 'video' : 'ảnh'} ${index + 1} của ${item?.title}`
                  }
                  alt={item?.title ?? ''}
                  playSize={22}
                  showKind={media.type === 'video'}
                />
              ))}
            </div>
          )}
          <div className="journal-detail-overview">
            <span className="journal-detail-icon">
              <Icon size={21} />
            </span>
            <div>
              <small>{entryCategoryLabel(entry)}</small>
              <strong>
                <Clock3 size={15} /> {formatTime(entry.occurredAt)}
              </strong>
            </div>
          </div>
          {entry.stats.length > 0 && (
            <div className="journal-detail-stats">
              {entry.stats.map((stat) => (
                <span key={stat}>{stat}</span>
              ))}
            </div>
          )}
          {entry.signs && entry.signs.length > 0 && (
            <p className="journal-detail-signs"><strong>Dấu hiệu kèm theo:</strong> {entry.signs.join(' · ')}</p>
          )}
          {entry.detail && <p className="journal-detail-copy">{entry.detail}</p>}
        </div>
      )}
    </HavenDialog>
  );
}
