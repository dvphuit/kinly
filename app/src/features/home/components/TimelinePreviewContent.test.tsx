import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import type { MomActivity } from '@/features/activities';
import type { TimelineItem } from '@/features/timeline';
import { TimelinePreviewContent } from './TimelinePreviewContent';

let records: MomActivity[] = [];

vi.mock('@/features/activities/store/useActivityStore', () => ({
  useActivityStore: (
    selector: (state: { babyActivities: []; momActivities: MomActivity[] }) => unknown,
  ) => selector({ babyActivities: [], momActivities: records }),
}));

vi.mock('./LazyTimelineEntryDialog', () => ({
  LazyTimelineEntryDialog: ({
    open,
    entry,
  }: {
    open: boolean;
    entry: { id?: string } | null;
  }) => open ? (
    <div role="dialog" aria-label="Timeline entry detail">{entry?.id}</div>
  ) : null,
}));

vi.mock('./LazyMomentMediaPreview', () => ({
  LazyMomentMediaPreview: () => null,
}));

function todayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function momMoment(overrides: Partial<TimelineItem> = {}): TimelineItem {
  const date = todayDateKey();
  return {
    id: 'mom-home-moment',
    owner: 'mom',
    date,
    timeFormatted: '16:20',
    time: `${date} • 16:20`,
    author: 'Mẹ',
    authorAvatar: '/mom.jpg',
    title: 'Một phút thư giãn',
    content: 'Mẹ nghỉ một chút.',
    mediaItems: [],
    mediaUrl: null,
    mediaType: null,
    stats: [],
    likes: 0,
    comments: 0,
    userLiked: false,
    tag: 'Của mẹ',
    tagType: 'mom',
    type: 'mom',
    ...overrides,
  };
}

describe('TimelinePreviewContent for mom', () => {
  beforeEach(() => {
    records = [];
    useTimelineStore.setState({ timelineItems: [] });
  });

  it('renders only current-day mom activities and moments', () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    records = [
      {
        id: 'today-mood',
        owner: 'mom',
        type: 'mood',
        mood: 'good',
        occurredAt: now.toISOString(),
        createdAt: now.toISOString(),
      },
      {
        id: 'old-note',
        owner: 'mom',
        type: 'recovery_note',
        note: 'Ghi chú hôm qua',
        occurredAt: yesterday.toISOString(),
        createdAt: yesterday.toISOString(),
      },
    ];
    useTimelineStore.setState({
      timelineItems: [
        momMoment(),
        momMoment({
          id: 'baby-hidden',
          owner: 'baby',
          title: 'Khoảnh khắc của bé',
          tag: 'Của bé',
          tagType: 'general',
          type: 'daily',
        }),
      ],
    });

    const { container } = render(
      <TimelinePreviewContent owner="mom" onAddActivity={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: 'Dòng thời gian' })).toBeInTheDocument();
    expect(screen.getAllByText('Tâm trạng').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Một phút thư giãn, 16:20' })).toBeInTheDocument();
    expect(screen.queryByText('Ghi chú hôm qua')).not.toBeInTheDocument();
    expect(screen.queryByText('Khoảnh khắc của bé')).not.toBeInTheDocument();
    expect(container.querySelector('.journal-story.owner-mom.haven-home-notebook')).toBeInTheDocument();
  });

  it('keeps mom activity detail selection after moving behind the idle boundary', () => {
    const now = new Date().toISOString();
    records = [
      {
        id: 'pump-test',
        owner: 'mom',
        type: 'pumping',
        amountMl: 120,
        side: 'both',
        occurredAt: now,
        createdAt: now,
      },
    ];

    const { container } = render(
      <TimelinePreviewContent owner="mom" onAddActivity={vi.fn()} />,
    );
    const itemButton = container.querySelector('.journal-story-main') as HTMLButtonElement;

    fireEvent.click(itemButton);
    expect(screen.getByRole('dialog', { name: 'Timeline entry detail' })).toHaveTextContent('pump-test');
  });

  it('renders the newest moment at the top of the Home timeline', () => {
    useTimelineStore.setState({
      timelineItems: [
        momMoment({ id: 'older', title: 'Cũ hơn', timeFormatted: '08:00', time: `${todayDateKey()} • 08:00` }),
        momMoment({ id: 'newer', title: 'Mới nhất', timeFormatted: '18:00', time: `${todayDateKey()} • 18:00` }),
      ],
    });

    const { container } = render(
      <TimelinePreviewContent owner="mom" onAddActivity={vi.fn()} />,
    );

    expect([...container.querySelectorAll('.journal-story-title')].map((node) => node.textContent)).toEqual([
      'Mới nhất',
      'Cũ hơn',
    ]);
  });

  it('forwards the empty-state action to the mom activity flow', () => {
    const onAddActivity = vi.fn();
    render(<TimelinePreviewContent owner="mom" onAddActivity={onAddActivity} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ghi hoạt động đầu tiên' }));
    expect(onAddActivity).toHaveBeenCalledTimes(1);
  });
});
