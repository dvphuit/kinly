
import type { BabyActivity, MomActivity } from '@/features/activities';
import type { GrowthHistoryRecord } from '@/features/growth';

export interface DerivedTimelineEntry {
  id: string;
  occurredAt: string;
  owner: 'baby' | 'mom' | 'system';
  type: string;
  title: string;
  detail: string;
  stats: string[];
  signs?: string[];
}

export function compareTimelineEntriesNewestFirst(
  left: Pick<DerivedTimelineEntry, 'occurredAt'>,
  right: Pick<DerivedTimelineEntry, 'occurredAt'>,
): number {
  return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
}

export function buildBabyTimelineEntry(record: BabyActivity): DerivedTimelineEntry {
  switch (record.type) {
    case 'feeding': {
      const methodLabel =
        record.method === 'formula'
          ? 'Sữa công thức'
          : record.method === 'breast_direct'
            ? 'Mẹ trực tiếp'
            : record.method === 'breast_bottle'
              ? 'Sữa mẹ (bình)'
              : record.method === 'bottle'
                ? 'Bình sữa'
                : record.method === 'breast'
                  ? 'Bú mẹ'
                  : record.method === 'other'
                    ? 'Khác'
                    : '';
      return {
        id: record.id,
        occurredAt: record.occurredAt,
        owner: 'baby',
        type: record.type,
        title: 'Cữ bú',
        detail: record.note ?? '',
        stats: [record.amountMl ? `${record.amountMl} ml` : '', methodLabel].filter(Boolean),
      };
    }
    case 'sleep':
      return {
        id: record.id,
        occurredAt: record.occurredAt,
        owner: 'baby',
        type: record.type,
        title: 'Giấc ngủ của bé',
        detail: record.note ?? '',
        stats: [
          `${record.durationMinutes} phút`,
          record.sleepKind === 'night' ? 'Ngủ đêm' : record.sleepKind === 'nap' ? 'Ngủ ngày' : '',
          record.sleepQuality === 'restful' ? 'Ngủ sâu' : record.sleepQuality === 'restless' ? 'Chập chờn' : '',
          record.wakeCount ? `Thức ${record.wakeCount} lần` : '',
        ].filter(Boolean),
      };
    case 'diaper':
      return {
        id: record.id,
        occurredAt: record.occurredAt,
        owner: 'baby',
        type: record.type,
        title: 'Thay tã',
        detail: record.note ?? '',
        stats: [
          record.diaperKind === 'wet' ? 'Ướt' : record.diaperKind === 'dirty' ? 'Bẩn' : 'Ướt + bẩn',
          record.stoolType ? `Bristol ${record.stoolType}` : '',
          record.stoolColor === 'yellow' ? 'Vàng' : record.stoolColor === 'brown' ? 'Nâu' : record.stoolColor === 'green' ? 'Xanh' : record.stoolColor === 'red' ? 'Đỏ' : record.stoolColor === 'black' ? 'Đen' : record.stoolColor === 'pale' ? 'Trắng/xám' : '',
        ].filter(Boolean),
        signs: (record.stoolFlags ?? []).map((flag) => flag === 'mucus' ? 'Có nhầy' : 'Nghi có máu'),
      };
    case 'medicine':
      return { id: record.id, occurredAt: record.occurredAt, owner: 'baby', type: record.type, title: record.name, detail: record.note ?? '', stats: record.dose ? [record.dose] : [] };
    case 'temperature':
      return {
        id: record.id,
        occurredAt: record.occurredAt,
        owner: 'baby',
        type: record.type,
        title: 'Nhiệt độ',
        detail: record.note ?? '',
        stats: [
          `${record.temperatureC} °C`,
          record.measurementSite === 'rectal' ? 'Hậu môn' : record.measurementSite === 'ear' ? 'Tai' : record.measurementSite === 'forehead' ? 'Trán' : record.measurementSite === 'oral' ? 'Miệng' : record.measurementSite === 'axillary' ? 'Nách' : '',
        ].filter(Boolean),
        signs: (record.symptoms ?? []).map((symptom) =>
          symptom === 'lethargy'
            ? 'Khó đánh thức'
            : symptom === 'breathing'
              ? 'Khó thở'
              : symptom === 'seizure'
                ? 'Co giật'
                : symptom === 'rash'
                  ? 'Ban tím/không mất màu'
                  : 'Ít tiểu/khô môi',
        ),
      };
    default:
      return { id: record.id, occurredAt: record.occurredAt, owner: 'baby', type: record.type, title: 'Ghi chú sức khỏe', detail: record.note ?? '', stats: [] };
  }
}

function momEntry(record: MomActivity): DerivedTimelineEntry {
  switch (record.type) {
    case 'pumping':
      return { id: record.id, occurredAt: record.occurredAt, owner: 'mom', type: record.type, title: 'Hút sữa', detail: record.note ?? '', stats: [`${record.amountMl} ml`, record.side === 'both' ? '2 bên' : record.side === 'left' ? 'Bên trái' : 'Bên phải'] };
    case 'sleep':
      return { id: record.id, occurredAt: record.occurredAt, owner: 'mom', type: record.type, title: 'Giấc ngủ của mẹ', detail: record.note ?? '', stats: [`${record.durationMinutes} phút`] };
    case 'mood':
      return { id: record.id, occurredAt: record.occurredAt, owner: 'mom', type: record.type, title: 'Tâm trạng', detail: record.note ?? '', stats: [record.mood] };
    default:
      return { id: record.id, occurredAt: record.occurredAt, owner: 'mom', type: record.type, title: 'Phục hồi', detail: record.note ?? '', stats: [] };
  }
}

function parseGrowthDate(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0).toISOString();
}

function growthEntry(record: GrowthHistoryRecord): DerivedTimelineEntry | null {
  const occurredAt = parseGrowthDate(record.date);
  if (!occurredAt) return null;
  return {
    id: `growth-${record.id}`,
    occurredAt,
    owner: 'baby',
    type: 'growth',
    title: 'Cân đo tăng trưởng',
    detail: record.note || '',
    stats: [`${record.weight} kg`, `${record.height} cm`, `${record.headCirc} cm vòng đầu`],
  };
}

export function buildTimelineEntries(input: {
  babyActivities: BabyActivity[];
  momActivities: MomActivity[];
  growthHistory?: GrowthHistoryRecord[];
}): DerivedTimelineEntry[] {
  return [
    ...input.babyActivities.map(buildBabyTimelineEntry),
    ...input.momActivities.map(momEntry),
    ...(input.growthHistory ?? []).map(growthEntry).filter((entry): entry is DerivedTimelineEntry => entry !== null),
  ].sort(compareTimelineEntriesNewestFirst);
}

export function filterTimelineByLocalDate(entries: DerivedTimelineEntry[], date: string): DerivedTimelineEntry[] {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day).getTime();
  const end = new Date(year, month - 1, day + 1).getTime();
  return entries.filter((entry) => {
    const time = new Date(entry.occurredAt).getTime();
    return time >= start && time < end;
  });
}

export function filterTimelineByLocalDateRange(
  entries: DerivedTimelineEntry[],
  startDate: string,
  endDate: string,
): DerivedTimelineEntry[] {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const start = new Date(startYear, startMonth - 1, startDay).getTime();
  const end = new Date(endYear, endMonth - 1, endDay + 1).getTime();
  return entries.filter((entry) => {
    const time = new Date(entry.occurredAt).getTime();
    return time >= start && time < end;
  });
}
