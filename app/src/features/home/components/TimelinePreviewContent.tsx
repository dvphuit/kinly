import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { HeartPulse, Layers, Milk, Moon, Pill, Plus, Smile, Sparkles, Thermometer } from 'lucide-react';
import { getBabyActivitiesForDay, getMomActivitiesForDay } from '@/features/activities/domain/activitySelectors';
import { HomeMomentStoryItem } from '@/features/timeline/components/HomeMomentStoryItem';
import { NotebookStory } from '@/features/timeline/components/NotebookStory';
import { buildBabyTimelineEntry } from '@/features/timeline/domain/timelineSelectors';
import { useLiveNow } from '@/shared/hooks/useLiveNow';
import { formatDurationMinutes, formatTimeOfDay, localDateKey } from '@/shared/lib/time';
import type { BabyActivity, MomActivity } from '@/features/activities';
import type { ProfileMode } from '@/features/profile';
import { LazyMomentMediaPreview } from './LazyMomentMediaPreview';
import { LazyTimelineEntryDialog } from './LazyTimelineEntryDialog';
import { useHomeTimeline } from '../hooks/useHomeTimeline';
import { useJournalRange } from '@/data/useNormalizedData';

interface TimelinePreviewContentProps {
  owner: ProfileMode;
  onAddActivity: () => void;
}

type ActivityPresentation = { label: string; tone: string; Icon: LucideIcon };

function babyActivityPresentation(type: BabyActivity['type']): ActivityPresentation {
  const values: Record<BabyActivity['type'], ActivityPresentation> = {
    feeding: { label: 'Cữ bú', tone: 'apricot', Icon: Milk },
    sleep: { label: 'Giấc ngủ', tone: 'lavender', Icon: Moon },
    diaper: { label: 'Thay tã', tone: 'sage', Icon: Layers },
    medicine: { label: 'Thuốc / vitamin', tone: 'rose', Icon: Pill },
    temperature: { label: 'Nhiệt độ', tone: 'coral', Icon: Thermometer },
    health_note: { label: 'Ghi chú sức khỏe', tone: 'blue', Icon: HeartPulse },
  };
  return values[type];
}

function babyActivityDisplay(record: BabyActivity): { summary: string; signs: string } {
  const entry = buildBabyTimelineEntry(record);
  const summary = record.type === 'medicine'
    ? [entry.title, ...entry.stats].join(' · ')
    : entry.stats.join(' · ');
  return { summary, signs: entry.signs?.join(' · ') ?? '' };
}

function momActivityPresentation(type: MomActivity['type']): ActivityPresentation {
  const values: Record<MomActivity['type'], ActivityPresentation> = {
    pumping: { label: 'Hút sữa', tone: 'blue', Icon: Milk },
    sleep: { label: 'Giấc ngủ', tone: 'lavender', Icon: Moon },
    mood: { label: 'Tâm trạng', tone: 'rose', Icon: Smile },
    recovery_note: { label: 'Phục hồi', tone: 'neutral', Icon: HeartPulse },
  };
  return values[type];
}

function moodLabel(value: string | undefined): string {
  const labels: Record<string, string> = {
    great: 'Rất tốt',
    good: 'Tốt',
    neutral: 'Bình thường',
    low: 'Không tốt',
    very_low: 'Rất không tốt',
  };
  return value ? labels[value] ?? value : 'Chưa ghi nhận';
}

function momActivityDetail(record: MomActivity): string {
  if (record.type === 'pumping') return `${record.amountMl} ml`;
  if (record.type === 'sleep') return `Đã ngủ ${formatDurationMinutes(record.durationMinutes)}`;
  if (record.type === 'mood') return `Mẹ cảm thấy ${moodLabel(record.mood).toLowerCase()}`;
  return '';
}

function BabyTimelinePreview({ onAddActivity }: { onAddActivity: () => void }) {
  const now = useLiveNow();
  const dayKey = localDateKey(now);
  const { babyActivities: records, timelineItems } = useJournalRange({
    owner: 'baby',
    startDate: dayKey,
    endDate: dayKey,
    limit: 256,
  });
  const dayActivities = useMemo(() => getBabyActivitiesForDay(records, now), [records, now]);
  const {
    timelineEntries,
    selectedRecord,
    selectedMomentEntry,
    momentPreview,
    openRecord,
    openMoment,
    openMomentMedia,
    closeEntry,
    closeMomentPreview,
  } = useHomeTimeline({ owner: 'baby', records, dayActivities, now, timelineItems });

  return (
    <>
      <section className="haven-activity-surface" aria-labelledby="baby-recent-title">
        <div className="haven-sheet-heading">
          <div><span className="haven-eyebrow">NHẬT KÝ TRONG NGÀY</span><h3 id="baby-recent-title">Dòng thời gian</h3></div>
          <button type="button" className="haven-text-action" onClick={onAddActivity}><Plus size={12} /> Thêm</button>
        </div>
        {timelineEntries.length === 0 ? (
          <div className="haven-empty-state">
            <span><Sparkles size={18} /></span>
            <strong>Chưa có hoạt động nào được ghi</strong>
            <span className="haven-sr-only">Chưa có dữ liệu được ghi nhận.</span>
            <p>Ghi một hoạt động nhỏ để bắt đầu quan sát nhịp sinh hoạt của Bé.</p>
            <button type="button" className="haven-empty-action" onClick={onAddActivity}>Ghi hoạt động đầu tiên</button>
          </div>
        ) : (
          <NotebookStory entries={timelineEntries} owner="baby" className="haven-home-notebook">
            <section className="journal-period">
              <div className="journal-period-items">
                {timelineEntries.map((timelineEntry) => {
                  if (timelineEntry.kind === 'moment') {
                    return (
                      <HomeMomentStoryItem
                        key={`moment-${timelineEntry.item.id}`}
                        item={timelineEntry.item}
                        occurredAt={timelineEntry.occurredAt}
                        formattedTime={formatTimeOfDay(timelineEntry.occurredAt)}
                        onOpenEntry={() => openMoment(timelineEntry.item.id)}
                        onOpenMedia={openMomentMedia}
                      />
                    );
                  }

                  const record = timelineEntry.record;
                  const { label, tone, Icon } = babyActivityPresentation(record.type);
                  const { summary, signs } = babyActivityDisplay(record);
                  return (
                    <article key={record.id} className={`journal-story-item tone-${tone}`}>
                      <time className="journal-story-time" dateTime={record.occurredAt}>{formatTimeOfDay(record.occurredAt)}</time>
                      <span className="journal-story-icon" aria-hidden="true"><Icon size={16} /></span>
                      <div className="journal-story-content">
                        <button
                          type="button"
                          className="journal-story-main"
                          onClick={() => openRecord(record.id)}
                          aria-label={`${label}, ${formatTimeOfDay(record.occurredAt)}`}
                        >
                          <span className="journal-story-heading">
                            <strong className="journal-story-title">{label}</strong>
                          </span>
                          {(summary || signs) && (
                            <span className="journal-story-facts">
                              {summary && <span className="journal-story-facts-value">{summary}</span>}
                              {signs && <span className="journal-story-signs"><strong>Dấu hiệu:</strong> {signs}</span>}
                            </span>
                          )}
                          {record.note && <span className="journal-story-detail">{record.note}</span>}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </NotebookStory>
        )}
      </section>
      <LazyTimelineEntryDialog
        open={selectedRecord !== null || selectedMomentEntry !== null}
        entry={selectedMomentEntry ?? selectedRecord}
        onClose={closeEntry}
        onOpenMomentMedia={openMomentMedia}
      />
      <LazyMomentMediaPreview preview={momentPreview} onClose={closeMomentPreview} />
    </>
  );
}

function MomTimelinePreview({ onAddActivity }: { onAddActivity: () => void }) {
  const now = useLiveNow();
  const dayKey = localDateKey(now);
  const { momActivities: records, timelineItems } = useJournalRange({
    owner: 'mom',
    startDate: dayKey,
    endDate: dayKey,
    limit: 256,
  });
  const dayActivities = useMemo(() => getMomActivitiesForDay(records, now), [records, now]);
  const {
    timelineEntries,
    selectedRecord,
    selectedMomentEntry,
    momentPreview,
    openRecord,
    openMoment,
    openMomentMedia,
    closeEntry,
    closeMomentPreview,
  } = useHomeTimeline({ owner: 'mom', records, dayActivities, now, timelineItems });

  return (
    <>
      <section className="haven-activity-surface haven-activity-surface-mom" aria-labelledby="mom-recent-title">
        <div className="haven-sheet-heading">
          <div><span className="haven-eyebrow">NHẬT KÝ TRONG NGÀY</span><h3 id="mom-recent-title">Dòng thời gian</h3></div>
          <button type="button" className="haven-text-action" onClick={onAddActivity}><Plus size={12} /> Thêm</button>
        </div>
        {timelineEntries.length === 0 ? (
          <div className="haven-empty-state haven-empty-state-mom">
            <span><Sparkles size={18} /></span>
            <strong>Mẹ chưa ghi hoạt động nào</strong>
            <p>Ghi một hoạt động nhỏ để quan sát nhịp nghỉ ngơi và phục hồi của Mẹ.</p>
            <button type="button" className="haven-empty-action" onClick={onAddActivity}>Ghi hoạt động đầu tiên</button>
          </div>
        ) : (
          <NotebookStory entries={timelineEntries} owner="mom" className="haven-home-notebook">
            <section className="journal-period">
              <div className="journal-period-items">
                {timelineEntries.map((timelineEntry) => {
                  if (timelineEntry.kind === 'moment') {
                    return (
                      <HomeMomentStoryItem
                        key={`moment-${timelineEntry.item.id}`}
                        item={timelineEntry.item}
                        occurredAt={timelineEntry.occurredAt}
                        formattedTime={formatTimeOfDay(timelineEntry.occurredAt)}
                        onOpenEntry={() => openMoment(timelineEntry.item.id)}
                        onOpenMedia={openMomentMedia}
                      />
                    );
                  }

                  const record = timelineEntry.record;
                  const { label, tone, Icon } = momActivityPresentation(record.type);
                  const detail = momActivityDetail(record);
                  return (
                    <article key={record.id} className={`journal-story-item tone-${tone}`}>
                      <time className="journal-story-time" dateTime={record.occurredAt}>{formatTimeOfDay(record.occurredAt)}</time>
                      <span className="journal-story-icon" aria-hidden="true"><Icon size={16} /></span>
                      <div className="journal-story-content">
                        <button
                          type="button"
                          className="journal-story-main"
                          onClick={() => openRecord(record.id)}
                          aria-label={`${label}, ${formatTimeOfDay(record.occurredAt)}`}
                        >
                          <span className="journal-story-heading">
                            <strong className="journal-story-title">{label}</strong>
                            {detail && <><span className="journal-story-separator" aria-hidden="true">·</span><span className="journal-story-summary">{detail}</span></>}
                          </span>
                          {record.note && <span className="journal-story-detail">{record.note}</span>}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </NotebookStory>
        )}
      </section>
      <LazyTimelineEntryDialog
        open={selectedRecord !== null || selectedMomentEntry !== null}
        entry={selectedMomentEntry ?? selectedRecord}
        onClose={closeEntry}
        onOpenMomentMedia={openMomentMedia}
      />
      <LazyMomentMediaPreview preview={momentPreview} onClose={closeMomentPreview} />
    </>
  );
}

export function TimelinePreviewContent({ owner, onAddActivity }: TimelinePreviewContentProps) {
  return owner === 'baby'
    ? <BabyTimelinePreview onAddActivity={onAddActivity} />
    : <MomTimelinePreview onAddActivity={onAddActivity} />;
}
