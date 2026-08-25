import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { ReminderList } from './ReminderList';
import { ReminderSettings } from './ReminderSettings';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuickLog?: (action: string) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ isOpen, onClose, onQuickLog }) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={showSettings ? 'Cài đặt nhắc nhở' : 'Thông báo & Nhắc nhở'}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button type="button" className="metric-pill-choice" onClick={() => setShowSettings((value) => !value)}>
          <Settings2 size={13} strokeWidth={2} />
          <span>{showSettings ? 'Xem nhắc nhở' : 'Cài đặt'}</span>
        </button>
      </div>
      {showSettings ? <ReminderSettings /> : <ReminderList onQuickLog={onQuickLog} />}
    </BottomSheet>
  );
};
