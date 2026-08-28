import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { indexedDbStorage } from '@/data/localDb';
import type { TimelineItem, TimelineMediaItem, CalendarViewMode } from '@/features/timeline/domain/types';
import { INITIAL_TIMELINE_ITEMS, FAMILY_DATA } from '@/data/seedData';
import { todayStr, currentTimeStr } from '@/utils/date';
import { generateId } from '@/utils/format';
import { useUIStore } from '@/store/useUIStore';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import { useProfileStore } from '@/features/profile/store/useProfileStore';
import {
  clearTimelineRecords,
  deleteTimelineRecord,
  saveTimelineItem,
} from '@/data/normalizedRepositories';
import { logDiagnostic } from '@/app/diagnostics/diagnosticLog';

function reportPersistenceFailure(operation: Promise<void>, action: string, id?: string): void {
  void operation.catch((error: unknown) => {
    logDiagnostic('database', 'error', `Không thể ${action} nhật ký`, { id, error });
  });
}

interface TimelineStoreState {
  timelineItems: TimelineItem[];
  selectedCalendarDate: string;
  calendarYear: number;
  calendarMonth: number;
  calendarViewMode: CalendarViewMode;
  timelineFilter: string;
  currentTimelineSubTab: 'feed' | 'mood-history';

  addTimelineItem: (item: Partial<TimelineItem>) => void;
  updateTimelineItem: (id: string, patch: Partial<Pick<TimelineItem, 'date' | 'timeFormatted' | 'title' | 'content' | 'mediaItems' | 'mediaUrl' | 'mediaType' | 'tag' | 'tagType' | 'owner'>>) => void;
  deleteTimelineItem: (id: string) => void;
  toggleLike: (id: string) => void;
  setSelectedCalendarDate: (date: string) => void;
  setCalendarMonth: (year: number, month: number) => void;
  setCalendarViewMode: (mode: CalendarViewMode) => void;
  toggleCalendarViewMode: () => void;
  setTimelineFilter: (filter: string) => void;
  setCurrentTimelineSubTab: (subTab: 'feed' | 'mood-history') => void;
  resetTrackingData: () => void;
}

export const useTimelineStore = create<TimelineStoreState>()(
  persist(
    (set) => ({
      timelineItems: INITIAL_TIMELINE_ITEMS,
      selectedCalendarDate: todayStr(),
      calendarYear: new Date().getFullYear(),
      calendarMonth: new Date().getMonth(),
      calendarViewMode: 'collapsed',
      timelineFilter: 'all',
      currentTimelineSubTab: 'feed',

      addTimelineItem: (item) => {
        const dateStr = item.date || todayStr();
        const timeNow = item.timeFormatted || currentTimeStr();
        const dateParts = dateStr.split('-');
        const formattedDay =
          dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : dateStr;

        const profileMode = useUIStore.getState().profileMode;
        const currentStage = useGrowthStore.getState().currentStage;
        const family = useProfileStore.getState().familyData;
        const mediaItems: TimelineMediaItem[] = (item.mediaItems ?? [])
          .filter((media) => media.blobId || media.driveFileId || media.url?.trim())
          .map((media) => ({
            ...media,
            id: media.id || generateId('media'),
            url: media.url?.trim() || undefined,
          }));
        if (mediaItems.length === 0 && item.mediaUrl) {
          mediaItems.push({ id: generateId('media'), url: item.mediaUrl, type: item.mediaType === 'video' ? 'video' : 'photo' });
        }
        const primaryMedia = mediaItems[0];

        const newItem: TimelineItem = {
          id: generateId('tl'),
          owner: item.owner || profileMode,
          stage: currentStage,
          date: dateStr,
          timeFormatted: timeNow,
          time: `${formattedDay} • ${timeNow}`,
          author: family.momName || FAMILY_DATA.momName,
          authorAvatar: family.momAvatar || FAMILY_DATA.momAvatar,
          title: item.title || 'Nhật ký mới',
          content: item.content || '',
          mediaItems,
          mediaUrl: primaryMedia?.url ?? null,
          mediaType: primaryMedia?.type ?? null,
          stats: item.stats || [],
          likes: 1,
          comments: 0,
          userLiked: true,
          tag: item.tag || 'Nhật ký',
          tagType: item.tagType || 'general',
          type: item.type || 'daily',
        };

        set((state) => ({
          timelineItems: [newItem, ...state.timelineItems],
        }));
        reportPersistenceFailure(saveTimelineItem(newItem), 'lưu', newItem.id);
      },

      updateTimelineItem: (id, patch) => {
        set((state) => ({
          timelineItems: state.timelineItems.map((item) => {
            if (item.id !== id) return item;
            const date = patch.date ?? item.date;
            const timeFormatted = patch.timeFormatted ?? item.timeFormatted;
            const [year, month, day] = date.split('-');
            const formattedDay = year && month && day ? `${day}/${month}/${year}` : date;
            const next = { ...item, ...patch, id: item.id, date, timeFormatted, time: `${formattedDay} • ${timeFormatted}` };
            if (patch.mediaItems) {
              next.mediaItems = patch.mediaItems
                .filter((media) => media.blobId || media.driveFileId || media.url?.trim())
                .map((media) => ({
                  ...media,
                  id: media.id || generateId('media'),
                  url: media.url?.trim() || undefined,
                }));
              next.mediaUrl = next.mediaItems[0]?.url ?? null;
              next.mediaType = next.mediaItems[0]?.type ?? null;
            }
            return next;
          }),
        }));
        const updated = useTimelineStore.getState().timelineItems.find((item) => item.id === id);
        if (updated) reportPersistenceFailure(saveTimelineItem(updated), 'cập nhật', id);
      },

      deleteTimelineItem: (id) => {
        set((state) => ({
          timelineItems: state.timelineItems.filter((item) => item.id !== id),
        }));
        reportPersistenceFailure(deleteTimelineRecord(id), 'xóa', id);
      },

      toggleLike: (id) => {
        set((state) => ({
          timelineItems: state.timelineItems.map((item) => {
            if (item.id === id) {
              const userLiked = !item.userLiked;
              return {
                ...item,
                userLiked,
                likes: item.likes + (userLiked ? 1 : -1),
              };
            }
            return item;
          }),
        }));
        const updated = useTimelineStore.getState().timelineItems.find((item) => item.id === id);
        if (updated) reportPersistenceFailure(saveTimelineItem(updated), 'cập nhật', id);
      },

      setSelectedCalendarDate: (date) => set({ selectedCalendarDate: date }),
      setCalendarMonth: (year, month) => set({ calendarYear: year, calendarMonth: month }),
      setCalendarViewMode: (mode) => set({ calendarViewMode: mode }),
      toggleCalendarViewMode: () => set((state) => ({
        calendarViewMode: state.calendarViewMode === 'collapsed' ? 'expanded' : 'collapsed'
      })),
      setTimelineFilter: (filter) => set({ timelineFilter: filter }),
      setCurrentTimelineSubTab: (subTab) => set({ currentTimelineSubTab: subTab }),
      resetTrackingData: () => {
        set({
          timelineItems: [],
          selectedCalendarDate: todayStr(),
          calendarYear: new Date().getFullYear(),
          calendarMonth: new Date().getMonth(),
          calendarViewMode: 'collapsed',
          timelineFilter: 'all',
          currentTimelineSubTab: 'feed',
        });
        reportPersistenceFailure(clearTimelineRecords(), 'xóa toàn bộ');
      },
    }),
    {
      name: 'babygrowth_v4_timeline',
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) => ({
        selectedCalendarDate: state.selectedCalendarDate,
        calendarViewMode: state.calendarViewMode,
      }),
    }
  )
);
