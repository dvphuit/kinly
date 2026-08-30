import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, ChevronDown, ChevronUp,
  NotebookPen,
} from 'lucide-react';
import { HavenAlert } from '@/shared/ui/HavenAlert';
import { HavenCalendar, type HavenDateRange } from '@/shared/ui/HavenCalendar';
import { ProgressiveListBoundary } from '@/shared/ui/ProgressiveListBoundary';
import { useProgressiveList } from '@/shared/hooks/useProgressiveList';
import { NotebookStory } from '@/features/timeline/components/NotebookStory';
import { MomentMediaPreview, type MomentMediaPreviewState } from '@/features/timeline/components/MomentMediaPreview';
import {
  TimelineEntryDialog,
  TimelineMediaButton,
  type JournalTimelineEntry,
  type EditableTimelineSource,
} from '@/features/timeline/components/TimelineEntryDialog';
import { entryMeta } from '@/features/timeline/components/timelineEntryPresentation';
import { getRealGrowthHistory } from '@/features/growth/domain/growthSelectors';
import { getTimelineMediaItems } from '@/features/timeline/domain/timelineMedia';
import {
  buildTimelineEntries,
  compareTimelineEntriesNewestFirst,
  filterTimelineByLocalDateRange,
} from '@/features/timeline/domain/timelineSelectors';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import { useProfileStore } from '@/features/profile/store/useProfileStore';
import { useUIStore } from '@/store/useUIStore';
import type { TimelineItem } from '@/features/timeline/domain/types';
import { useJournalDates, useJournalRange } from '@/data/useNormalizedData';
import {
  timelineEntryElementId,
  useRecentlyAddedTimelineAnimation,
} from '@/features/timeline/hooks/useRecentlyAddedTimelineAnimation';

interface TimelineViewProps {
  onOpenLightbox: (src: string, isVideo?: boolean) => void;
  onOpenAddEntry: () => void;
}

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const MONTH_FORMATTER = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' });
const TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' });

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function formatFullDate(value: string): string {
  const formatted = FULL_DATE_FORMATTER.format(dateFromKey(value));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatMonth(value: string): string {
  const formatted = MONTH_FORMATTER.format(dateFromKey(value));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatTime(value: string): string {
  return TIME_FORMATTER.format(new Date(value));
}

const DAY_PERIODS = [
  { id: 'morning', start: 0, end: 12 },
  { id: 'afternoon', start: 12, end: 18 },
  { id: 'evening', start: 18, end: 24 },
] as const;
const DAY_PERIODS_NEWEST_FIRST = [...DAY_PERIODS].reverse();
type DayPeriodId = (typeof DAY_PERIODS)[number]['id'];

function entriesByPeriod(entries: JournalTimelineEntry[]) {
  const buckets: Record<DayPeriodId, JournalTimelineEntry[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  entries.forEach((entry) => {
    const hour = new Date(entry.occurredAt).getHours();
    const period: DayPeriodId = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    buckets[period].push(entry);
  });
  return DAY_PERIODS_NEWEST_FIRST.flatMap((period) => (
    buckets[period.id].length > 0 ? [{ ...period, entries: buckets[period.id] }] : []
  ));
}

function surroundingWeek(dateKey: string): Array<{ key: string; date: Date }> {
  const selected = dateFromKey(dateKey);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(selected);
    date.setDate(selected.getDate() + index - 3);
    return { key: localDateKey(date), date };
  });
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function dateInputValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return value;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function momentOccurredAt(item: Pick<TimelineItem, 'date' | 'timeFormatted'>): string {
  const [year, month, day] = item.date.split('-').map(Number);
  const [hour = 0, minute = 0] = item.timeFormatted.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function momentOwner(item: TimelineItem): JournalTimelineEntry['owner'] {
  return item.owner ?? (item.tagType === 'mom' || item.type === 'mom' ? 'mom' : 'baby');
}

function momentEntry(item: TimelineItem): JournalTimelineEntry {
  return {
    id: `moment-${item.id}`,
    occurredAt: momentOccurredAt(item),
    owner: momentOwner(item),
    type: 'moment',
    title: item.title,
    detail: item.content,
    stats: item.stats ?? [],
    moment: item,
  };
}

interface TimelineDayGroupProps {
  dateKey: string;
  entries: JournalTimelineEntry[];
  owner: 'baby' | 'mom';
  onOpenEntry: (entry: JournalTimelineEntry) => void;
  onOpenMomentMedia: (preview: MomentMediaPreviewState) => void;
}

const TimelineDayGroup = memo(function TimelineDayGroup({
  dateKey,
  entries,
  owner,
  onOpenEntry,
  onOpenMomentMedia,
}: TimelineDayGroupProps) {
  const periods = useMemo(() => entriesByPeriod(entries), [entries]);

  return (
    <section className="journal-day-group">
      <header className="journal-day-header">
        <h2>{formatFullDate(dateKey)}</h2>
        <span>{entries.length} ghi nhận</span>
      </header>
      <NotebookStory entries={entries} owner={owner}>
        {periods.map((period) => (
          <section className={`journal-period period-${period.id}`} key={period.id}>
            <div className="journal-period-items">
              {period.entries.map((entry) => {
                const meta = entryMeta(entry);
                const Icon = meta.icon;
                const item = entry.moment;
                const mediaItems = item ? getTimelineMediaItems(item) : [];
                const visibleMediaItems = mediaItems.slice(0, 4);
                const facts = !item ? entry.stats.join(' · ') : '';
                const associatedSigns = !item ? entry.signs?.join(' · ') ?? '' : '';
                const supportingDetail = entry.detail;
                const entryTime = formatTime(entry.occurredAt);
                return (
                  <div
                    id={item ? timelineEntryElementId(item.id) : undefined}
                    className={`journal-story-item tone-${meta.tone} ${item ? 'is-moment' : ''}`}
                    key={entry.id}
                  >
                    <time className="journal-story-time" dateTime={entry.occurredAt}>{entryTime}</time>
                    <span className="journal-story-icon" aria-hidden="true"><Icon size={16} /></span>
                    <article className="journal-story-content">
                      <button type="button" className="journal-story-main" onClick={() => onOpenEntry(entry)} aria-label={`${entry.title}, ${entryTime}`}>
                        <span className="journal-story-heading">
                          <strong className="journal-story-title">{entry.title}</strong>
                        </span>
                        {(facts || associatedSigns) && (
                          <span className="journal-story-facts">
                            {facts && <span className="journal-story-facts-value">{facts}</span>}
                            {associatedSigns && <span className="journal-story-signs"><strong>Dấu hiệu:</strong> {associatedSigns}</span>}
                          </span>
                        )}
                        {supportingDetail && <span className="journal-story-detail">{supportingDetail}</span>}
                      </button>
                      {mediaItems.length > 0 && (
                        <div className={`journal-story-media-bento count-${visibleMediaItems.length}`} aria-label={`${mediaItems.length} media của ${item?.title}`}>
                          {visibleMediaItems.map((media, index) => (
                            <TimelineMediaButton
                              className="journal-story-media"
                              key={media.id ?? media.blobId ?? `${media.url}-${index}`}
                              media={media}
                              layoutId={`moment-timeline-${entry.id}-${media.id ?? media.blobId ?? index}`}
                              onOpen={(originSrc) => onOpenMomentMedia({
                                items: mediaItems,
                                initialIndex: index,
                                title: item?.title ?? entry.title,
                                layoutId: `moment-timeline-${entry.id}-${media.id ?? media.blobId ?? index}`,
                                originSrc,
                                getLayoutId: (idx) => {
                                  const targetIdx = Math.min(idx, visibleMediaItems.length - 1);
                                  const targetMedia = visibleMediaItems[targetIdx] ?? mediaItems[0];
                                  return `moment-timeline-${entry.id}-${targetMedia?.id ?? targetMedia?.blobId ?? targetIdx}`;
                                },
                              })}
                              ariaLabel={mediaItems.length === 1
                                ? `Mở ${media.type === 'video' ? 'video' : 'ảnh'} ${item?.title}`
                                : `Mở ${media.type === 'video' ? 'video' : 'ảnh'} ${index + 1} của ${item?.title}`}
                              alt=""
                              imageStyle={{ objectPosition: `${media.focalX ?? 50}% ${media.focalY ?? 38}%` }}
                              playSize={19}
                              moreCount={index === 3 && mediaItems.length > 4 ? mediaItems.length - 4 : 0}
                            />
                          ))}
                        </div>
                      )}
                    </article>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </NotebookStory>
    </section>
  );
});

export const TimelineView: React.FC<TimelineViewProps> = ({ onOpenLightbox }) => {
  useRecentlyAddedTimelineAnimation();
  const rawGrowthHistory = useGrowthStore((state) => state.currentStageData().growthHistory);
  const birthDate = useProfileStore((state) => state.familyData.birthDate);
  const ownerFilter = useUIStore((state) => state.profileMode);
  const storedDateRange = useUIStore((state) => state.timelineDateRange);
  const setSelectedRange = useUIStore((state) => state.setTimelineDateRange);
  const calendarExpanded = useUIStore((state) => state.timelineCalendarExpanded);
  const setCalendarExpanded = useUIStore((state) => state.setTimelineCalendarExpanded);
  const growthHistory = useMemo(() => getRealGrowthHistory(rawGrowthHistory), [rawGrowthHistory]);
  const defaultDateRange = useMemo<HavenDateRange>(() => {
    const today = localDateKey();
    return { start: today, end: today };
  }, []);
  const selectedRange = storedDateRange ?? defaultDateRange;
  const [queryLimit, setQueryLimit] = useState(250);
  const journal = useJournalRange({
    owner: ownerFilter,
    startDate: selectedRange.start,
    endDate: selectedRange.end ?? selectedRange.start,
    limit: queryLimit,
  });
  const indexedJournalDates = useJournalDates(ownerFilter);
  const { babyActivities, momActivities, timelineItems } = journal;
  const [weekSettling, setWeekSettling] = useState(false);
  const weekPagerRef = useRef<HTMLDivElement>(null);
  const weekTrackRef = useRef<HTMLDivElement>(null);
  const weekDragXRef = useRef(0);
  const weekSwipeStartX = useRef<number | null>(null);
  const pendingWeekDays = useRef(0);
  const suppressWeekClick = useRef(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState(false);
  const [momentPreview, setMomentPreview] = useState<MomentMediaPreviewState | null>(null);
  const selectedDate = selectedRange.end ?? selectedRange.start;

  useEffect(() => {
    setQueryLimit(250);
  }, [ownerFilter, selectedRange.end, selectedRange.start]);

  const entries = useMemo<JournalTimelineEntry[]>(() => [
    ...buildTimelineEntries({ babyActivities, momActivities, growthHistory }),
    ...timelineItems.map(momentEntry),
  ].sort(compareTimelineEntriesNewestFirst), [babyActivities, growthHistory, momActivities, timelineItems]);
  const ownerEntries = useMemo(() => entries.filter((entry) => entry.owner === ownerFilter), [entries, ownerFilter]);
  const highlightedDates = useMemo(() => [...new Set([
    ...(indexedJournalDates ?? []),
    ...(ownerFilter === 'baby' ? growthHistory.map((record) => dateInputValue(record.date)) : []),
  ])].sort(), [growthHistory, indexedJournalDates, ownerFilter]);
  const highlightedDateSet = useMemo(() => new Set(highlightedDates), [highlightedDates]);
  const visibleEntries = useMemo(
    () => filterTimelineByLocalDateRange(ownerEntries, selectedRange.start, selectedRange.end ?? selectedRange.start),
    [ownerEntries, selectedRange],
  );
  const entryGroups = useMemo(() => {
    const groups = new Map<string, JournalTimelineEntry[]>();
    visibleEntries.forEach((entry) => {
      const key = localDateKey(new Date(entry.occurredAt));
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    });
    return [...groups.entries()]
      .map(([key, groupEntries]) => ({ key, entries: groupEntries.sort(compareTimelineEntriesNewestFirst) }))
      .sort((left, right) => right.key.localeCompare(left.key));
  }, [visibleEntries]);
  const timelineWindow = useProgressiveList({
    totalCount: entryGroups.length,
    initialCount: 7,
    batchSize: 7,
    resetKey: `${ownerFilter}:${selectedRange.start}:${selectedRange.end ?? ''}`,
  });
  const renderedEntryGroups = entryGroups.slice(0, timelineWindow.visibleCount);
  const calendarBounds = useMemo(() => {
    const normalizedBirthDate = dateInputValue(birthDate);
    const minimumCandidates = [normalizedBirthDate, ...highlightedDates].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    const maximumCandidates = [localDateKey(), ...highlightedDates];
    return {
      min: minimumCandidates.sort()[0] ?? '2000-01-01',
      max: maximumCandidates.sort().at(-1) ?? localDateKey(),
    };
  }, [birthDate, highlightedDates]);
  const isRange = Boolean(selectedRange.end && selectedRange.end !== selectedRange.start);
  const selectedDateLabel = isRange
    ? `${formatFullDate(selectedRange.start)} – ${formatFullDate(selectedRange.end ?? selectedRange.start)}`
    : formatFullDate(selectedRange.start);
  const selectedEntry = useMemo(
    () => selectedEntryId ? entries.find((entry) => entry.id === selectedEntryId) ?? null : null,
    [entries, selectedEntryId],
  );
  const selectedSource = useMemo<EditableTimelineSource | null>(() => {
    if (!selectedEntry) return null;
    if (selectedEntry.moment) return { kind: 'moment', record: selectedEntry.moment };
    if (selectedEntry.type === 'growth') {
      const growthId = selectedEntry.id.replace(/^growth-/, '');
      const record = growthHistory.find((item) => item.id === growthId);
      return record ? { kind: 'growth', record } : null;
    }
    const record = [...babyActivities, ...momActivities].find((item) => item.id === selectedEntry.id);
    return record ? { kind: 'activity', record } : null;
  }, [babyActivities, growthHistory, momActivities, selectedEntry]);

  const openEntry = useCallback((entry: JournalTimelineEntry) => {
    setSelectedEntryId(entry.id);
    setEditingEntry(false);
  }, []);
  const openMomentMedia = useCallback((preview: MomentMediaPreviewState) => {
    setMomentPreview(preview);
  }, []);

  const selectQuickDate = (dateKey: string) => {
    if (suppressWeekClick.current || dateKey < calendarBounds.min || dateKey > calendarBounds.max) return;
    setSelectedRange({ start: dateKey, end: dateKey });
  };

  const selectToday = () => {
    const today = localDateKey();
    if (today < calendarBounds.min || today > calendarBounds.max) return;
    setSelectedRange({ start: today, end: today });
  };

  const weekPageWidth = () => weekPagerRef.current?.clientWidth || 320;

  const applyWeekDragX = (value: number) => {
    weekDragXRef.current = value;
    if (weekTrackRef.current) {
      weekTrackRef.current.style.transform = `translate3d(calc(-33.333333% + ${value}px), 0, 0)`;
    }
  };

  const canShiftWeek = (days: number) => {
    const target = shiftDateKey(selectedDate, days);
    return target >= calendarBounds.min && target <= calendarBounds.max;
  };

  const settleWeek = (days: number) => {
    if (days !== 0 && !canShiftWeek(days)) days = 0;
    pendingWeekDays.current = days;
    weekDragXRef.current = days > 0 ? -weekPageWidth() : days < 0 ? weekPageWidth() : 0;
    setWeekSettling(true);
  };

  const finishWeekSwipe = () => {
    if (weekSwipeStartX.current === null) return;
    weekSwipeStartX.current = null;
    const width = weekPageWidth();
    const threshold = Math.max(42, Math.min(72, width * 0.18));
    const dragX = weekDragXRef.current;
    if (Math.abs(dragX) < threshold) settleWeek(0);
    else settleWeek(dragX < 0 ? 7 : -7);
    if (Math.abs(dragX) > 8) {
      suppressWeekClick.current = true;
      requestAnimationFrame(() => { suppressWeekClick.current = false; });
    }
  };

  const completeWeekSettle = () => {
    const days = pendingWeekDays.current;
    pendingWeekDays.current = 0;
    weekDragXRef.current = 0;
    setWeekSettling(false);
    if (days !== 0) {
      const nextDate = shiftDateKey(selectedDate, days);
      setSelectedRange({ start: nextDate, end: nextDate });
    }
  };

  return (
    <main className="journal-page">
      <section className="journal-calendar" aria-label="Chọn ngày xem nhật ký">
        <div className="journal-calendar-bar">
          <div className="journal-calendar-title"><CalendarDays size={17} /><strong>{formatMonth(selectedDate)}</strong></div>
          <div className="journal-calendar-actions">
            <button type="button" className="journal-today-button" onClick={selectToday}>Hôm nay</button>
            <button type="button" aria-expanded={calendarExpanded} onClick={() => setCalendarExpanded(!calendarExpanded)}>
              {calendarExpanded ? 'Thu gọn' : 'Mở lịch'}
              {calendarExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        <div className={`journal-calendar-switch ${calendarExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="journal-week-shell" aria-hidden={calendarExpanded}>
            <div>
              <div
                ref={weekPagerRef}
                className="journal-week-pager"
                onPointerDown={(event) => {
                  if (weekSettling) return;
                  weekSwipeStartX.current = event.clientX;
                  applyWeekDragX(0);
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (weekSwipeStartX.current === null || weekSettling) return;
                  let distance = event.clientX - weekSwipeStartX.current;
                  if ((distance > 0 && !canShiftWeek(-7)) || (distance < 0 && !canShiftWeek(7))) distance *= 0.22;
                  applyWeekDragX(Math.max(-weekPageWidth(), Math.min(weekPageWidth(), distance)));
                }}
                onPointerUp={finishWeekSwipe}
                onPointerCancel={() => { weekSwipeStartX.current = null; settleWeek(0); }}
              >
                <div
                  ref={weekTrackRef}
                  className={`journal-week-track ${weekSettling ? 'is-settling' : 'is-dragging'}`}
                  style={{ transform: `translate3d(calc(-33.333333% + ${weekDragXRef.current}px), 0, 0)` }}
                  onTransitionEnd={(event) => { if (event.target === event.currentTarget) completeWeekSettle(); }}
                >
                  {[-7, 0, 7].map((offset) => {
                    const currentPage = offset === 0;
                    return (
                      <div className="journal-week-page" key={offset} aria-hidden={!currentPage}>
                        <div className="journal-week-strip" role={currentPage ? 'group' : undefined} aria-label={currentPage ? '7 ngày quanh ngày đang chọn' : undefined}>
                          {surroundingWeek(shiftDateKey(selectedDate, offset)).map(({ key, date }) => {
                            const selected = key === selectedRange.start || key === selectedRange.end;
                            const inRange = Boolean(selectedRange.end && key > selectedRange.start && key < selectedRange.end);
                            const disabled = key < calendarBounds.min || key > calendarBounds.max;
                            return (
                              <button type="button" key={key} disabled={disabled} className={`${date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : ''} ${selected ? 'selected' : ''} ${inRange ? 'in-range' : ''}`.trim()} aria-pressed={currentPage ? selected || inRange : undefined} aria-label={formatFullDate(key)} tabIndex={currentPage && !calendarExpanded ? undefined : -1} onClick={() => selectQuickDate(key)}>
                                <span>{WEEKDAY_FORMATTER.format(date).replace('.', '')}</span>
                                <strong>{date.getDate()}</strong>
                                <i className={highlightedDateSet.has(key) ? 'has-entry' : ''} aria-hidden="true" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="journal-month-shell" aria-hidden={!calendarExpanded}>
            <div><HavenCalendar mode="range" value={selectedRange} highlightedDates={highlightedDates} minDate={calendarBounds.min} maxDate={calendarBounds.max} onChange={setSelectedRange} /></div>
          </div>
        </div>
      </section>
      <section className="journal-feed" key={`${ownerFilter}-${selectedRange.start}-${selectedRange.end ?? 'open'}`} aria-live="polite">
        {visibleEntries.length === 0 ? (
          <>
            <header className="journal-day-header">
              <h2>{selectedDateLabel}</h2>
              <span>0 ghi nhận</span>
            </header>
            <HavenAlert tone={ownerFilter === 'baby' ? 'sage' : 'info'} icon={NotebookPen} title={`Chưa có nhật ký của ${ownerFilter === 'baby' ? 'bé' : 'mẹ'} trong ${isRange ? 'khoảng này' : 'ngày này'}`}>
              Ghi nhận mới sẽ được thêm từ Trang chủ.
            </HavenAlert>
          </>
        ) : renderedEntryGroups.map((group) => (
          <TimelineDayGroup
            dateKey={group.key}
            entries={group.entries}
            owner={ownerFilter}
            onOpenEntry={openEntry}
            onOpenMomentMedia={openMomentMedia}
            key={group.key}
          />
        ))}
        <ProgressiveListBoundary
          autoLoadAvailable={timelineWindow.autoLoadAvailable && timelineWindow.hasMore}
          fallbackLabel="Xem thêm nhật ký"
          hasMore={timelineWindow.hasMore || journal.hasMore}
          onLoadMore={() => {
            if (timelineWindow.hasMore) timelineWindow.revealMore();
            else setQueryLimit((current) => current + 250);
          }}
          sentinelRef={timelineWindow.sentinelRef}
        />
      </section>

      <TimelineEntryDialog
        open={selectedEntry !== null}
        entry={selectedEntry}
        source={selectedSource}
        onClose={() => {
          setSelectedEntryId(null);
          setEditingEntry(false);
        }}
        onOpenLightbox={onOpenLightbox}
        onOpenMomentMedia={(items, initialIndex, title, layoutId, originSrc, getLayoutId) => setMomentPreview({
          items, initialIndex, title, layoutId, originSrc, getLayoutId,
        })}
        initialEditing={editingEntry}
      />
      <MomentMediaPreview preview={momentPreview} onClose={() => setMomentPreview(null)} />
    </main>
  );
};
