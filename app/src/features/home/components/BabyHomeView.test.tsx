import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BabyHomeView } from './BabyHomeView';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import type { BabyActivity } from '@/features/activities';
import type { TimelineItem } from '@/features/timeline';

let records: BabyActivity[] = [];

vi.mock('@/features/activities/store/useActivityStore', () => ({
  useActivityStore: (selector: (state: { babyActivities: BabyActivity[] }) => unknown) => selector({ babyActivities: records }),
}));

function feeding(id: string, amountMl: number, hour: number): BabyActivity {
  const now = new Date();
  now.setHours(hour, 0, 0, 0);
  return { id, owner: 'baby', type: 'feeding', amountMl, method: 'bottle', occurredAt: now.toISOString(), createdAt: now.toISOString() };
}

function renderView(onOpenQuickLog = vi.fn()) {
  render(<BabyHomeView onOpenQuickLog={onOpenQuickLog} />);
  return onOpenQuickLog;
}

async function waitForTimeline() {
  await screen.findByRole('heading', { name: 'Dòng thời gian' }, { timeout: 2500 });
}

function moment(overrides: Partial<TimelineItem> = {}): TimelineItem {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    id: 'home-moment', owner: 'baby', date, timeFormatted: '08:30', time: `${date} • 08:30`,
    author: 'Mẹ', authorAvatar: '/mom.jpg', title: 'Nụ cười ở nhà', content: 'Một buổi sáng thật vui.',
    mediaItems: [{ id: 'home-photo', url: 'https://example.com/home.jpg', type: 'photo' }],
    mediaUrl: 'https://example.com/home.jpg', mediaType: 'photo', stats: [], likes: 0, comments: 0,
    userLiked: false, tag: 'Khoảnh khắc', tagType: 'general', type: 'daily', ...overrides,
  };
}

describe('BabyHomeView', () => {
  beforeEach(() => {
    records = [];
    useTimelineStore.setState({ timelineItems: [] });
  });

  it('shows honest empty states when there are no records', async () => {
    renderView();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ lượng sữa' }).parentElement).toHaveTextContent('0 ml');
    expect(screen.getByRole('progressbar', { name: 'Tiến độ giấc ngủ' }).parentElement).toHaveTextContent('0 phút');
    await waitForTimeline();
    expect(screen.getByText('Chưa có dữ liệu được ghi nhận.')).toBeInTheDocument();
    expect(screen.queryByText(/540 ml|12h 30p|Growth Score/)).not.toBeInTheDocument();
    expect(screen.queryByText(/hôm nay/i)).not.toBeInTheDocument();
  });

  it('derives today metrics from persisted activity records', () => {
    const now = new Date();
    records = [
      feeding('f1', 90, 8),
      feeding('f2', 60, 11),
      { id: 'd1', owner: 'baby', type: 'diaper', diaperKind: 'wet', occurredAt: now.toISOString(), createdAt: now.toISOString() },
      { id: 's1', owner: 'baby', type: 'sleep', durationMinutes: 90, occurredAt: now.toISOString(), createdAt: now.toISOString() },
    ];
    renderView();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ lượng sữa' }).parentElement).toHaveTextContent('150 ml');
    expect(screen.getByRole('progressbar', { name: 'Tiến độ lượng sữa' }).parentElement).toHaveTextContent('2 cữ');
    expect(screen.getByRole('progressbar', { name: 'Tiến độ giấc ngủ' }).parentElement).toHaveTextContent('1g 30p');
    expect(screen.getByText('1 lần')).toBeInTheDocument();
  });

  it('opens Quick Log from the primary action', () => {
    const onOpenQuickLog = renderView();
    fireEvent.click(screen.getByRole('button', { name: '+ Ghi nhanh' }));
    expect(onOpenQuickLog).toHaveBeenCalledTimes(1);
  });

  it('shows only today records in the home diary', async () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    records = [
      feeding('today-feeding', 90, 8),
      {
        id: 'yesterday-note', owner: 'baby', type: 'health_note', note: 'Nội dung của hôm qua',
        occurredAt: yesterday.toISOString(), createdAt: yesterday.toISOString(),
      },
    ];

    renderView();
    await waitForTimeline();

    expect(screen.getByRole('heading', { name: 'Dòng thời gian' })).toBeInTheDocument();
    expect(screen.getByText('Cữ bú')).toBeInTheDocument();
    expect(screen.queryByText(/Nội dung của hôm qua/i)).not.toBeInTheDocument();
  });

  it('uses the shared notebook timeline in newest-first order', async () => {
    records = [feeding('late-feeding', 60, 11), feeding('early-feeding', 90, 7)];

    const { container } = render(<BabyHomeView onOpenQuickLog={vi.fn()} />);
    await waitForTimeline();

    expect(container.querySelector('.journal-story.owner-baby.haven-home-notebook')).toBeInTheDocument();
    expect(container.querySelector('.haven-activity-list')).not.toBeInTheDocument();
    expect([...container.querySelectorAll('.journal-story-time')].map((node) => node.textContent)).toEqual(['11:00', '07:00']);
  });

  it('shows baby moments from today with media and opens their shared preview', async () => {
    useTimelineStore.setState({ timelineItems: [moment()] });
    const { container } = render(<BabyHomeView onOpenQuickLog={vi.fn()} />);
    await waitForTimeline();

    expect(screen.getByRole('button', { name: 'Nụ cười ở nhà, 08:30' })).toBeInTheDocument();
    expect(container.querySelector('.journal-story-item.is-moment .journal-story-media')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mở ảnh Nụ cười ở nhà' }));
    expect(await screen.findByRole('dialog', { name: 'Xem media Nụ cười ở nhà' })).toBeInTheDocument();
  });

  it('allows clicking timeline items on Home to view detail and edit', async () => {
    records = [feeding('test-feed', 120, 9)];
    renderView();
    await waitForTimeline();

    const itemButton = screen.getByRole('button', { name: /Cữ bú/i });
    expect(itemButton).toBeInTheDocument();
    fireEvent.click(itemButton);

    expect(await screen.findByRole('dialog', { name: /Cữ bú/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Chỉnh sửa/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Đóng' }).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa/i }));
    expect(await screen.findByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument();
  });

  it('shows associated diaper and temperature signs in timeline items and previews', async () => {
    const now = new Date();
    records = [
      {
        id: 'diaper-signs', owner: 'baby', type: 'diaper', diaperKind: 'dirty',
        stoolFlags: ['mucus', 'blood'], occurredAt: now.toISOString(), createdAt: now.toISOString(),
      },
      {
        id: 'temperature-signs', owner: 'baby', type: 'temperature', temperatureC: 38.2,
        measurementSite: 'axillary', symptoms: ['breathing', 'dehydration'],
        note: 'Theo dõi thêm', occurredAt: new Date(now.getTime() + 60_000).toISOString(), createdAt: now.toISOString(),
      },
    ];
    renderView();
    await waitForTimeline();

    const diaperItem = screen.getByRole('button', { name: /Thay tã/i }).closest('.journal-story-item');
    expect(diaperItem?.querySelector('.journal-story-facts-value')).toHaveTextContent('Bẩn');
    expect(diaperItem?.querySelector('.journal-story-signs')).toHaveTextContent('Dấu hiệu: Có nhầy · Nghi có máu');

    const temperatureButton = screen.getByRole('button', { name: /Nhiệt độ/i });
    const temperatureItem = temperatureButton.closest('.journal-story-item');
    const signsRow = temperatureItem?.querySelector('.journal-story-signs');
    const noteRow = temperatureItem?.querySelector('.journal-story-detail');
    expect(temperatureItem?.querySelector('.journal-story-facts-value')).toHaveTextContent('38.2 °C · Nách');
    expect(signsRow).toHaveTextContent('Dấu hiệu: Khó thở · Ít tiểu/khô môi');
    expect(noteRow).toHaveTextContent('Theo dõi thêm');
    expect(signsRow).not.toBeNull();
    expect(noteRow).not.toBeNull();
    expect(signsRow!.compareDocumentPosition(noteRow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(temperatureButton);
    const dialog = await screen.findByRole('dialog', { name: 'Đo nhiệt độ' });
    expect(dialog).toHaveTextContent('Khó thở');
    expect(dialog).toHaveTextContent('Ít tiểu/khô môi');
    expect(dialog).not.toHaveTextContent('2 triệu chứng');
  });

  it('places feeding, sleep and medicine facts on the second row above notes', async () => {
    const now = new Date();
    records = [
      {
        id: 'feeding-facts', owner: 'baby', type: 'feeding', amountMl: 90, method: 'formula',
        note: 'Bú tốt', occurredAt: now.toISOString(), createdAt: now.toISOString(),
      },
      {
        id: 'sleep-facts', owner: 'baby', type: 'sleep', durationMinutes: 75, sleepKind: 'nap',
        sleepQuality: 'restless', wakeCount: 2, occurredAt: now.toISOString(), createdAt: now.toISOString(),
      },
      {
        id: 'medicine-facts', owner: 'baby', type: 'medicine', name: 'Vitamin D3', dose: '1 giọt',
        occurredAt: now.toISOString(), createdAt: now.toISOString(),
      },
    ];
    renderView();
    await waitForTimeline();

    const feedingItem = screen.getByRole('button', { name: /Cữ bú/i }).closest('.journal-story-item');
    const feedingFacts = feedingItem?.querySelector('.journal-story-facts-value');
    const feedingNote = feedingItem?.querySelector('.journal-story-detail');
    expect(feedingFacts).toHaveTextContent('90 ml · Sữa công thức');
    expect(feedingNote).toHaveTextContent('Bú tốt');
    expect(feedingFacts!.compareDocumentPosition(feedingNote!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.getByRole('button', { name: /Giấc ngủ/i }).closest('.journal-story-item')?.querySelector('.journal-story-facts-value'))
      .toHaveTextContent('75 phút · Ngủ ngày · Chập chờn · Thức 2 lần');
    expect(screen.getByRole('button', { name: /Thuốc \/ vitamin/i }).closest('.journal-story-item')?.querySelector('.journal-story-facts-value'))
      .toHaveTextContent('Vitamin D3 · 1 giọt');
  });
});
