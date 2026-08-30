import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { indexedDbStorage } from '@/data/localDb';
import type { TabType } from '@/types';
import type { ProfileMode } from '@/features/profile';

export interface TimelineDateRange {
  start: string;
  end: string | null;
}

interface UIStoreState {
  currentTab: TabType;
  currentSubView: string | null;
  searchQuery: string;
  profileMode: ProfileMode;
  timelineDateRange: TimelineDateRange | null;
  timelineCalendarExpanded: boolean;
  setTab: (tab: TabType) => void;
  setCurrentSubView: (view: string | null) => void;
  setSearchQuery: (q: string) => void;
  setProfileMode: (mode: ProfileMode) => void;
  setTimelineDateRange: (range: TimelineDateRange) => void;
  setTimelineCalendarExpanded: (expanded: boolean) => void;
  resetTrackingData: () => void;
}

export const useUIStore = create<UIStoreState>()(
  persist(
    (set) => ({
      currentTab: 'home',
      currentSubView: null,
      searchQuery: '',
      profileMode: 'baby',
      timelineDateRange: null,
      timelineCalendarExpanded: false,
      setTab: (tab) => set({ currentTab: tab, currentSubView: null }),
      setCurrentSubView: (view) => set({ currentSubView: view }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setProfileMode: (mode) => set({ profileMode: mode }),
      setTimelineDateRange: (range) => set({ timelineDateRange: range }),
      setTimelineCalendarExpanded: (expanded) => set({ timelineCalendarExpanded: expanded }),
      resetTrackingData: () => set({
        currentTab: 'home',
        currentSubView: null,
        searchQuery: '',
        profileMode: 'baby',
        timelineDateRange: null,
        timelineCalendarExpanded: false,
      }),
    }),
    {
      name: 'babygrowth_v4_ui',
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) => ({
        currentTab: state.currentTab,
        profileMode: state.profileMode,
      }),
    }
  )
);
