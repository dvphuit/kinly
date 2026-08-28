import { useMemo, useState } from 'react';
import {
  isTimelineMomentOnLocalDay,
  timelineMomentOccurredAt,
  timelineMomentOwner,
} from '@/features/timeline/domain/timelineMedia';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import type { JournalTimelineEntry } from '@/features/timeline/components/TimelineEntryDialog';
import type { MomentMediaPreviewState } from '@/features/timeline/components/MomentMediaPreview';
import type { ActivityRecord } from '@/features/activities';
import type { ProfileMode } from '@/features/profile';
import type { TimelineItem, TimelineMediaItem } from '@/features/timeline';

type OwnerActivity<T extends ProfileMode> = Extract<ActivityRecord, { owner: T }>;

export type HomeTimelineEntry<T extends ProfileMode> =
  | { kind: 'activity'; occurredAt: string; record: OwnerActivity<T> }
  | { kind: 'moment'; occurredAt: string; item: TimelineItem };

interface UseHomeTimelineOptions<T extends ProfileMode> {
  owner: T;
  records: OwnerActivity<T>[];
  dayActivities: OwnerActivity<T>[];
  now: Date;
  timelineItems?: TimelineItem[];
}

export function useHomeTimeline<T extends ProfileMode>({
  owner,
  records,
  dayActivities,
  now,
  timelineItems: providedTimelineItems,
}: UseHomeTimelineOptions<T>) {
  const fallbackTimelineItems = useTimelineStore((state) => state.timelineItems);
  const timelineItems = providedTimelineItems ?? fallbackTimelineItems;
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [momentPreview, setMomentPreview] = useState<MomentMediaPreviewState | null>(null);

  const dayMoments = useMemo(
    () => timelineItems.filter((item) => timelineMomentOwner(item) === owner && isTimelineMomentOnLocalDay(item, now)),
    [now, owner, timelineItems],
  );

  const timelineEntries = useMemo<HomeTimelineEntry<T>[]>(() => {
    const activityEntries: HomeTimelineEntry<T>[] = dayActivities.map((record) => ({
      kind: 'activity',
      occurredAt: record.occurredAt,
      record,
    }));
    const momentEntries: HomeTimelineEntry<T>[] = dayMoments.map((item) => ({
      kind: 'moment',
      occurredAt: timelineMomentOccurredAt(item),
      item,
    }));
    return [...activityEntries, ...momentEntries]
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }, [dayActivities, dayMoments]);

  const selectedRecord = selectedRecordId
    ? records.find((item) => item.id === selectedRecordId) ?? null
    : null;
  const selectedMoment = selectedMomentId
    ? timelineItems.find((item) => item.id === selectedMomentId) ?? null
    : null;
  const selectedMomentEntry: JournalTimelineEntry | null = selectedMoment ? {
    id: `moment-${selectedMoment.id}`,
    occurredAt: timelineMomentOccurredAt(selectedMoment),
    owner: timelineMomentOwner(selectedMoment),
    type: 'moment',
    title: selectedMoment.title,
    detail: selectedMoment.content,
    stats: selectedMoment.stats ?? [],
    moment: selectedMoment,
  } : null;

  const openRecord = (id: string) => {
    setSelectedMomentId(null);
    setSelectedRecordId(id);
  };

  const openMoment = (id: string) => {
    setSelectedRecordId(null);
    setSelectedMomentId(id);
  };

  const openMomentMedia = (
    items: TimelineMediaItem[],
    initialIndex: number,
    title: string,
    layoutId: string,
    originSrc: string,
    getLayoutId?: (index: number, media: TimelineMediaItem) => string,
  ) => setMomentPreview({ items, initialIndex, title, layoutId, originSrc, getLayoutId });

  const closeEntry = () => {
    setSelectedRecordId(null);
    setSelectedMomentId(null);
  };

  return {
    timelineEntries,
    selectedRecord,
    selectedMomentEntry,
    momentPreview,
    openRecord,
    openMoment,
    openMomentMedia,
    closeEntry,
    closeMomentPreview: () => setMomentPreview(null),
  };
}
