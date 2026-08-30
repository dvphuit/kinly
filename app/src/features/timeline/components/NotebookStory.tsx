import { useMemo, type CSSProperties, type ReactNode } from 'react';
import '../timeline-performance.css';

export interface NotebookTimeEntry {
  occurredAt: string;
}

interface NotebookStoryProps {
  entries: readonly NotebookTimeEntry[];
  owner: 'baby' | 'mom';
  children: ReactNode;
  className?: string;
}

const TIME_COLOR_STOPS = [
  { hour: 0, color: '#e4e6ef' },
  { hour: 4, color: '#ebe9f5' },
  { hour: 6, color: '#fdebe3' },
  { hour: 8, color: '#fff0df' },
  { hour: 11, color: '#fff7df' },
  { hour: 13, color: '#f0f7e7' },
  { hour: 16, color: '#e5f3ef' },
  { hour: 18, color: '#e7f0f8' },
  { hour: 20, color: '#ebe9f5' },
  { hour: 22, color: '#e7e8f1' },
  { hour: 24, color: '#e4e6ef' },
] as const;

function interpolateHexColor(start: string, end: string, ratio: number): string {
  const channels = [1, 3, 5].map((index) => {
    const from = Number.parseInt(start.slice(index, index + 2), 16);
    const to = Number.parseInt(end.slice(index, index + 2), 16);
    return Math.round(from + (to - from) * ratio).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

function colorAtHour(hour: number): string {
  const clamped = Math.max(0, Math.min(24, hour));
  const nextIndex = TIME_COLOR_STOPS.findIndex((stop) => stop.hour >= clamped);
  if (nextIndex <= 0) return TIME_COLOR_STOPS[0].color;
  const previous = TIME_COLOR_STOPS[nextIndex - 1];
  const next = TIME_COLOR_STOPS[nextIndex];
  const ratio = (clamped - previous.hour) / (next.hour - previous.hour);
  return interpolateHexColor(previous.color, next.color, ratio);
}

function entryHour(entry: NotebookTimeEntry): number {
  const date = new Date(entry.occurredAt);
  return date.getHours() + date.getMinutes() / 60;
}

function stopPercentage(value: number): string {
  return `${Math.round(Math.max(0, Math.min(100, value)) * 10) / 10}%`;
}

function timeGradient(entries: readonly NotebookTimeEntry[], anchorPercentages?: number[]): string {
  const timeline = [...entries]
    .map((entry) => ({ hour: entryHour(entry) }))
    .filter(({ hour }) => Number.isFinite(hour));
  if (timeline.length === 0) return 'linear-gradient(180deg, #fff7df, #e7ecf3)';
  if (timeline.length === 1) {
    const color = colorAtHour(timeline[0].hour);
    return `linear-gradient(180deg, ${color}, ${color})`;
  }

  const anchors = anchorPercentages?.length === timeline.length
    ? anchorPercentages
    : timeline.map((_, index) => ((index + 0.5) / timeline.length) * 100);
  const points = timeline.map(({ hour }, index) => ({
    hour,
    color: colorAtHour(hour),
    position: Math.max(0, Math.min(100, anchors[index])),
  }));
  const stops = [`${points[0].color} 0%`, `${points[0].color} ${stopPercentage(points[0].position)}`];

  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    if (point.hour !== previous.hour && point.position > previous.position) {
      const ascending = point.hour > previous.hour;
      TIME_COLOR_STOPS
        .filter((stop) => ascending
          ? stop.hour > previous.hour && stop.hour < point.hour
          : stop.hour < previous.hour && stop.hour > point.hour)
        .sort((left, right) => ascending ? left.hour - right.hour : right.hour - left.hour)
        .forEach((stop) => {
          const timeRatio = (stop.hour - previous.hour) / (point.hour - previous.hour);
          const position = previous.position + (point.position - previous.position) * timeRatio;
          stops.push(`${stop.color} ${stopPercentage(position)}`);
        });
    }
    stops.push(`${point.color} ${stopPercentage(point.position)}`);
  });
  stops.push(`${points.at(-1)!.color} 100%`);
  return `linear-gradient(180deg, ${stops.join(', ')})`;
}

export function NotebookStory({ entries, owner, children, className = '' }: NotebookStoryProps) {
  const gradient = useMemo(() => timeGradient(entries), [entries]);

  return (
    <div
      className={`journal-story owner-${owner} ${className}`.trim()}
      style={{ '--journal-time-gradient': gradient } as CSSProperties}
    >
      {children}
    </div>
  );
}
