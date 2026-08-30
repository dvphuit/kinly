import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { timelineJournalEntry } from '@/data/appDatabase';
import type { JournalPage } from '@/data/normalizedRepositories';
import { useActivityStore } from '@/features/activities';
import type { TimelineItem } from '@/features/timeline';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';

const liveQuery = vi.hoisted((): { page: JournalPage | undefined } => ({ page: undefined }));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => liveQuery.page,
}));

import { useJournalRange } from './useNormalizedData';

const DATE = '2026-08-30';

function moment(id: string, title: string, timeFormatted: string): TimelineItem {
  return {
    id,
    owner: 'baby',
    date: DATE,
    timeFormatted,
    time: `30/08/2026 • ${timeFormatted}`,
    author: 'Mẹ',
    authorAvatar: '',
    title,
    content: '',
    mediaItems: [],
    mediaUrl: null,
    mediaType: null,
    stats: [],
    likes: 0,
    comments: 0,
    userLiked: false,
    tag: 'Khoảnh khắc',
    tagType: 'general',
    type: 'daily',
  };
}

function JournalTitles() {
  const journal = useJournalRange({
    owner: 'baby',
    startDate: DATE,
    endDate: DATE,
    limit: 20,
  });
  return (
    <ol>
      {journal.timelineItems.map((item) => <li key={item.id}>{item.title}</li>)}
    </ol>
  );
}

describe('useJournalRange', () => {
  beforeEach(() => {
    useActivityStore.setState({ babyActivities: [], momActivities: [] });
    useTimelineStore.setState({ timelineItems: [] });
    const persisted = timelineJournalEntry(moment('persisted', 'Đã lưu trước đó', '08:00'));
    if (!persisted) throw new Error('The persisted test moment must be valid.');
    liveQuery.page = { entries: [persisted], hasMore: false };
  });

  it('shows a new in-memory moment before the persistent query refreshes', () => {
    render(<JournalTitles />);
    expect(screen.getByText('Đã lưu trước đó')).toBeInTheDocument();

    act(() => {
      useTimelineStore.getState().addTimelineItem({
        owner: 'baby',
        date: DATE,
        timeFormatted: '09:00',
        title: 'Vừa thêm',
      });
    });

    expect(screen.getByText('Vừa thêm')).toBeInTheDocument();
    expect(screen.getByText('Đã lưu trước đó')).toBeInTheDocument();
  });
});
