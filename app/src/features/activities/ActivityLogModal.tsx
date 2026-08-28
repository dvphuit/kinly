import { useMemo } from 'react';
import { TimelineEntryDialog } from '@/features/timeline';
import type { ActivityRecord } from '@/features/activities/domain/types';

export type ActivityLogMode =
  | 'feeding'
  | 'baby-sleep'
  | 'diaper'
  | 'baby-note'
  | 'mom-sleep'
  | 'mom-mood'
  | 'medicine'
  | 'temperature';

interface ActivityLogModalProps {
  isOpen: boolean;
  mode: ActivityLogMode;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const TITLES: Record<ActivityLogMode, string> = {
  feeding: 'Cữ bú',
  'baby-sleep': 'Giấc ngủ của bé',
  diaper: 'Thay tã',
  'baby-note': 'Ghi chú sức khỏe',
  'mom-sleep': 'Giấc ngủ của mẹ',
  'mom-mood': 'Tâm trạng của mẹ',
  medicine: 'Uống thuốc / vitamin',
  temperature: 'Nhiệt độ',
};

const SAVED_MESSAGES: Record<ActivityLogMode, string> = {
  feeding: 'Đã lưu cữ bú.',
  'baby-sleep': 'Đã lưu giấc ngủ của bé.',
  diaper: 'Đã lưu lần thay tã.',
  'baby-note': 'Đã lưu ghi chú.',
  'mom-sleep': 'Đã lưu giấc ngủ của mẹ.',
  'mom-mood': 'Đã lưu tâm trạng của mẹ.',
  medicine: 'Đã lưu thuốc / vitamin.',
  temperature: 'Đã lưu nhiệt độ.',
};

function createActivityDraft(mode: ActivityLogMode, now = new Date()): ActivityRecord {
  const occurredAt = now.toISOString();
  const base = {
    id: `draft-${mode}`,
    occurredAt,
    createdAt: occurredAt,
  };

  switch (mode) {
    case 'feeding':
      return { ...base, owner: 'baby', type: 'feeding', amountMl: 90, method: 'breast_direct' };
    case 'baby-sleep': {
      const endedAt = new Date(now.getTime() + 60 * 60_000).toISOString();
      return {
        ...base,
        owner: 'baby',
        type: 'sleep',
        startedAt: occurredAt,
        endedAt,
        durationMinutes: 60,
        sleepKind: 'nap',
        sleepQuality: 'normal',
        wakeCount: 0,
      };
    }
    case 'diaper':
      return { ...base, owner: 'baby', type: 'diaper', diaperKind: 'wet' };
    case 'baby-note':
      return { ...base, owner: 'baby', type: 'health_note' };
    case 'mom-sleep':
      return { ...base, owner: 'mom', type: 'sleep', durationMinutes: 60 };
    case 'mom-mood':
      return { ...base, owner: 'mom', type: 'mood', mood: 'good' };
    case 'medicine':
      return { ...base, owner: 'baby', type: 'medicine', name: '' };
    case 'temperature':
      return {
        ...base,
        owner: 'baby',
        type: 'temperature',
        temperatureC: 36.8,
        measurementSite: 'forehead',
        symptoms: [],
      };
  }
}

export function ActivityLogModal({ isOpen, mode, onClose, onSaved }: ActivityLogModalProps) {
  const draft = useMemo(() => createActivityDraft(mode), [mode]);

  return (
    <TimelineEntryDialog
      open={isOpen}
      entry={draft}
      initialEditing
      creating
      titleOverride={TITLES[mode]}
      onClose={onClose}
      onSaved={() => onSaved(SAVED_MESSAGES[mode])}
    />
  );
}
