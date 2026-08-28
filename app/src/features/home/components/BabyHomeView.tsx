import { useMemo } from 'react';
import { Clock3, Layers, Milk, Moon, Plus } from 'lucide-react';
import { selectBabyTodayMetrics } from '@/features/activities/domain/activitySelectors';
import { getMilkTarget, getSleepTarget } from '@/features/activities/domain/dailyCareTargets';
import { getRealGrowthHistory } from '@/features/growth/domain/growthSelectors';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import { useFamily } from '@/features/profile/hooks/useFamily';
import { useLocalDayReference } from '@/shared/hooks/useLocalDayReference';
import { formatDurationMinutes, formatTimeOfDay, localDateKey } from '@/shared/lib/time';
import { IdleHomeTimelinePreview } from './IdleHomeTimelinePreview';
import { LiveSegmentClock } from './SegmentClock';
import { useJournalRange } from '@/data/useNormalizedData';

export interface BabyHomeViewProps {
  onOpenQuickLog: () => void;
}

function progressPercent(value: number, target: number | null): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

export const BabyHomeView: React.FC<BabyHomeViewProps> = ({ onOpenQuickLog }) => {
  const currentStageData = useGrowthStore((state) => state.currentStageData());
  const family = useFamily();
  const dayReference = useLocalDayReference();
  const dayKey = localDateKey(dayReference);
  const { babyActivities: records } = useJournalRange({
    owner: 'baby',
    startDate: dayKey,
    endDate: dayKey,
    limit: 256,
  });
  const metrics = useMemo(() => selectBabyTodayMetrics(records, dayReference), [records, dayReference]);
  const latestGrowth = useMemo(
    () => getRealGrowthHistory(currentStageData.growthHistory)[0] ?? null,
    [currentStageData.growthHistory],
  );
  const weightKg = latestGrowth?.weight
    || Number.parseFloat(currentStageData.todayVitals.weight)
    || Number.parseFloat(family.birthWeight || '')
    || null;
  const milkTarget = getMilkTarget(family.birthDate, weightKg, dayReference);
  const sleepTarget = getSleepTarget(family.birthDate, dayReference);
  const milkProgress = progressPercent(metrics.feedingAmountMl, milkTarget.targetMl);
  const sleepProgress = progressPercent(metrics.sleepMinutes, sleepTarget.minMinutes);

  return (
    <div className="haven-home haven-home-baby">
      <section className="haven-daily-summary-card" aria-labelledby="baby-daily-title">
        <div className="haven-daily-ambient" aria-hidden="true" />
        <div className="haven-clock-row">
          <div className="haven-daily-hero-copy">
            <h2 id="baby-daily-title" className="haven-live-clock"><LiveSegmentClock /></h2>
          </div>
          <button type="button" className="haven-daily-add-btn" aria-label="+ Ghi nhanh" onClick={onOpenQuickLog}>
            <span><Plus size={22} strokeWidth={2.8} /></span>
          </button>
        </div>

        <div className="haven-care-progress-grid">
          <article className="haven-care-progress haven-care-progress-milk">
            <img className="haven-card-decor" src="/assets/decor/care-milk.webp" alt="" width={320} height={320} loading="lazy" decoding="async" aria-hidden="true" />
            <div className="haven-care-progress-heading">
              <span className="haven-care-icon"><Milk size={18} /></span>
              <div><span>Sữa đã ghi</span><small>{metrics.feedingCount} cữ</small></div>
            </div>
            <div className="haven-care-progress-value">
              <strong>{metrics.feedingAmountMl.toLocaleString('vi-VN')} <small>ml</small></strong>
              <span>{milkTarget.label}</span>
            </div>
            <div className="haven-care-track" role="progressbar" aria-label="Tiến độ lượng sữa" aria-valuemin={0} aria-valuemax={100} aria-valuenow={milkProgress}>
              <span style={{ width: `${milkProgress}%` }} />
            </div>
            <p>
              {metrics.feedingCount > 0 && metrics.feedingAmountMl === 0
                ? 'Cữ bú mẹ trực tiếp không quy đổi sang ml.'
                : milkTarget.detail}
            </p>
          </article>

          <article className="haven-care-progress haven-care-progress-sleep">
            <img className="haven-card-decor" src="/assets/decor/care-sleep.webp" alt="" width={320} height={320} loading="lazy" decoding="async" aria-hidden="true" />
            <div className="haven-care-progress-heading">
              <span className="haven-care-icon"><Moon size={18} /></span>
              <div><span>Giấc ngủ</span><small>Bao gồm giấc ngày</small></div>
            </div>
            <div className="haven-care-progress-value">
              <strong>{metrics.sleepMinutes ? formatDurationMinutes(metrics.sleepMinutes) : '0 phút'}</strong>
              <span>{sleepTarget.label}</span>
            </div>
            <div className="haven-care-track" role="progressbar" aria-label="Tiến độ giấc ngủ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={sleepProgress}>
              <span style={{ width: `${sleepProgress}%` }} />
            </div>
            <p>Tiến độ tính đến mốc thấp của khoảng tham khảo.</p>
          </article>
        </div>

        <div className="haven-daily-secondary-strip">
          <div className="haven-secondary-metric haven-secondary-metric-diaper">
            <img className="haven-card-decor" src="/assets/decor/care-diaper.webp" alt="" width={128} height={128} loading="lazy" decoding="async" aria-hidden="true" />
            <Layers size={14} /><span>Thay tã</span><strong>{metrics.diaperCount} lần</strong>
          </div>
          <span className="haven-secondary-divider" />
          <div className="haven-secondary-metric haven-secondary-metric-clock">
            <img className="haven-card-decor" src="/assets/decor/care-clock.webp" alt="" width={128} height={128} loading="lazy" decoding="async" aria-hidden="true" />
            <Clock3 size={14} /><span>Cữ gần nhất</span><strong>{metrics.lastFeedingAt ? formatTimeOfDay(metrics.lastFeedingAt) : '—'}</strong>
          </div>
        </div>

        <p className="haven-care-reference">
          Mốc tham khảo từ <a href="https://www.cdc.gov/sleep/about/index.html" target="_blank" rel="noreferrer">CDC</a>, <a href="https://www.nhs.uk/baby/weaning-and-feeding/babys-first-solid-foods/" target="_blank" rel="noreferrer">NHS</a> và <a href="https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/Amount-and-Schedule-of-Formula-Feedings.aspx" target="_blank" rel="noreferrer">AAP</a>. Nhu cầu thực tế của mỗi bé có thể khác.
        </p>
      </section>

      <IdleHomeTimelinePreview owner="baby" onAddActivity={onOpenQuickLog} />
    </div>
  );
};
