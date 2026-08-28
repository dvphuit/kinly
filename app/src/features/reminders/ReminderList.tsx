import { Check, Clock3, Edit3 } from 'lucide-react';
import { getReminderOccurrences } from '@/features/reminders/domain/reminderScheduler';
import { useReminderStore } from '@/features/reminders/store/useReminderStore';
import type { ReminderOccurrence } from '@/types/reminder';
import { useReminderActivitySources } from '@/data/useNormalizedData';
import { useReminderOccurrenceStates } from '@/features/reminders/hooks/useReminderOccurrenceStates';

interface ReminderListProps {
  onQuickLog?: (action: string) => void;
}

function statusLabel(occurrence: ReminderOccurrence, now: Date): string {
  const delta = now.getTime() - new Date(occurrence.dueAt).getTime();
  if (delta > 60_000) return 'Quá hạn';
  if (delta >= 0) return 'Đến hạn';
  return 'Sắp tới';
}

export function ReminderList({ onQuickLog }: ReminderListProps) {
  const reminders = useReminderStore((state) => state.reminders);
  const occurrenceStates = useReminderOccurrenceStates();
  const completeOccurrence = useReminderStore((state) => state.completeOccurrence);
  const snoozeOccurrence = useReminderStore((state) => state.snoozeOccurrence);
  const { babyActivities, momActivities } = useReminderActivitySources();
  const now = new Date();
  const occurrences = getReminderOccurrences({ reminders, babyActivities, momActivities, occurrenceStates, now });

  if (occurrences.length === 0) {
    return <div className="empty-state" style={{ padding: '20px 4px' }}><p>Chưa có reminder đang hoạt động.</p></div>;
  }

  return (
    <div className="notifications-list-container">
      {occurrences.map((occurrence) => {
        const isDue = new Date(occurrence.dueAt).getTime() <= now.getTime();
        const quickLogAction = occurrence.reminder.quickLogAction;
        return (
          <div key={occurrence.occurrenceId} className="notification-card-item">
            <div className="notif-icon-circle"><Clock3 size={16} /></div>
            <div className="notif-content-box">
              <div className="notif-top-row">
                <h5 className="notif-title">{occurrence.reminder.title}</h5>
                <span className="notif-badge">{statusLabel(occurrence, now)}</span>
              </div>
              {occurrence.reminder.note && <p className="notif-desc">{occurrence.reminder.note}</p>}
              <span className="notif-time">
                {new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(occurrence.dueAt))}
              </span>
              {isDue && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                  <button type="button" className="metric-pill-choice" onClick={() => completeOccurrence(occurrence)}><Check size={13} strokeWidth={2} /> <span>Đã xong</span></button>
                  <button type="button" className="metric-pill-choice" onClick={() => snoozeOccurrence(occurrence, 10)}><Clock3 size={13} strokeWidth={2} /> <span>+10 phút</span></button>
                  {quickLogAction && (
                    <button type="button" className="metric-pill-choice" onClick={() => onQuickLog?.(quickLogAction)}><Edit3 size={13} strokeWidth={2} /> <span>Ghi nhanh</span></button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
