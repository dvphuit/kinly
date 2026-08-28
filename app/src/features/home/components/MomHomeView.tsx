import { useMemo } from 'react';
import { Clock3, Milk, Moon, Plus, Smile, Sparkles, UserRound } from 'lucide-react';
import { getMomActivitiesForDay, selectMomTodayMetrics } from '@/features/activities/domain/activitySelectors';
import { useLocalDayReference } from '@/shared/hooks/useLocalDayReference';
import { formatDurationMinutes, formatLocalDay, formatTimeOfDay, localDateKey } from '@/shared/lib/time';
import { IdleHomeTimelinePreview } from './IdleHomeTimelinePreview';
import { LiveSegmentClock } from './SegmentClock';
import { useJournalRange } from '@/data/useNormalizedData';

export interface MomHomeViewProps {
  onOpenPumping: () => void;
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

export const MomHomeView: React.FC<MomHomeViewProps> = ({ onOpenPumping }) => {
  const dayReference = useLocalDayReference();
  const dayKey = localDateKey(dayReference);
  const { momActivities: records } = useJournalRange({
    owner: 'mom',
    startDate: dayKey,
    endDate: dayKey,
    limit: 256,
  });
  const metrics = useMemo(() => selectMomTodayMetrics(records, dayReference), [records, dayReference]);
  const dayActivityCount = useMemo(() => getMomActivitiesForDay(records, dayReference).length, [records, dayReference]);
  const latestMood = metrics.latestMood?.type === 'mood' ? metrics.latestMood.mood : undefined;
  const pumpingTotal = metrics.pumpingCount ? `${metrics.pumpingAmountMl} ml` : 'Chưa ghi nhận';

  const summaryMetrics = [
    {
      key: 'pumping', label: 'Hút sữa', value: metrics.pumpingCount ? `${metrics.pumpingAmountMl} ml` : '—',
      detail: metrics.pumpingCount ? `${metrics.pumpingCount} cữ` : 'Chưa ghi nhận', tone: 'rose', Icon: Milk,
    },
    {
      key: 'sleep', label: 'Giấc ngủ', value: metrics.sleepMinutes ? formatDurationMinutes(metrics.sleepMinutes) : '—',
      detail: metrics.sleepMinutes ? 'Tổng trong ngày' : 'Chưa ghi nhận', tone: 'lilac', Icon: Moon,
    },
    {
      key: 'mood', label: 'Tâm trạng', value: latestMood ? moodLabel(latestMood) : '—',
      detail: latestMood ? 'Gần nhất' : 'Chưa ghi nhận', tone: 'honey', Icon: Smile,
    },
    {
      key: 'latest', label: 'Cữ gần nhất', value: metrics.lastPumpingAt ? formatTimeOfDay(metrics.lastPumpingAt) : '—',
      detail: metrics.lastPumpingAt ? 'Thời điểm hút' : 'Chưa ghi nhận', tone: 'clay', Icon: Clock3,
    },
  ];

  return (
    <div className="haven-home haven-home-mom">
      <section className="haven-daily-summary-card haven-daily-summary-card-mom" aria-labelledby="mom-today-title">
        <div className="haven-daily-ambient" aria-hidden="true" />
        <div className="haven-daily-topline">
          <span className="haven-daily-date"><UserRound size={13} /> {formatLocalDay(dayReference)}</span>
          <span className="haven-daily-count">{dayActivityCount} hoạt động</span>
        </div>

        <div className="haven-clock-row">
          <div className="haven-daily-hero-copy">
            <span className="haven-daily-eyebrow"><Sparkles size={11} /> NHỊP CỦA MẸ</span>
            <h2 id="mom-today-title" className="haven-live-clock"><LiveSegmentClock /></h2>
          </div>
          <button type="button" className="haven-daily-add-btn" aria-label="+ Hút sữa" onClick={onOpenPumping}>
            <span><Plus size={22} strokeWidth={2.8} /></span>
          </button>
        </div>

        <div className="haven-daily-metrics" aria-label="Tóm tắt chỉ số của Mẹ">
          {summaryMetrics.map(({ key, label, value, detail, tone, Icon }) => (
            <article className="haven-daily-metric" key={key}>
              <span className={`haven-daily-metric-icon ${tone}`}><Icon size={15} /></span>
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            </article>
          ))}
          {metrics.pumpingCount ? <span className="haven-sr-only">{`${pumpingTotal} · ${metrics.pumpingCount} cữ`}</span> : null}
        </div>
      </section>

      <IdleHomeTimelinePreview owner="mom" onAddActivity={onOpenPumping} />
    </div>
  );
};
