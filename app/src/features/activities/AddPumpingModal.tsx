import { useState, useId } from 'react';
import { Milk, ArrowRight } from 'lucide-react';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import type { AddToast } from '@/shared/hooks/useToast';
import { useActivityStore } from '@/features/activities/store/useActivityStore';

interface AddPumpingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast: AddToast;
}

const SIDE_MAP: Record<string, 'left' | 'right' | 'both'> = {
  '2 bên': 'both',
  'Ngực trái': 'left',
  'Ngực phải': 'right',
};

export const AddPumpingModal: React.FC<AddPumpingModalProps> = ({ isOpen, onClose, onSuccessToast }) => {
  const addMomActivity = useActivityStore((state) => state.addMomActivity);
  const [amount, setAmount] = useState<string>('180');
  const [side, setSide] = useState<string>('2 bên');
  const formId = useId();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const amountMl = Number.parseInt(amount, 10) || 0;
    if (amountMl <= 0) {
      window.alert('Vui lòng nhập lượng sữa hút được!');
      return;
    }

    const saved = addMomActivity({
      owner: 'mom',
      type: 'pumping',
      occurredAt: new Date().toISOString(),
      amountMl,
      side: SIDE_MAP[side] ?? 'both',
    });

    onClose();
    onSuccessToast(`Đã lưu cữ hút sữa: +${amountMl}ml (${side}) 🥛`, '✓', {
      actionLabel: 'Hoàn tác',
      durationMs: 5000,
      onAction: () => useActivityStore.getState().deleteActivity(saved.id),
    });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Ghi Nhận Cữ Hút Sữa Mẹ"
      footer={
        <button type="submit" form={formId} className="log-btn-primary">
          <span>Lưu Cữ Hút Sữa</span>
          <ArrowRight size={14} />
        </button>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <div className="log-form-group">
          <label className="log-form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Milk size={13} color="var(--color-mom-rose)" /> Lượng sữa vắt / hút được (ml)
          </label>
          <input
            type="number"
            required
            min="1"
            inputMode="numeric"
            enterKeyHint="done"
            aria-label="Lượng sữa hút được (ml)"
            className="log-input-control"
            style={{ textAlign: 'center', fontFamily: 'var(--font-family-display)', fontSize: '18px', fontWeight: 800 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="180"
          />
        </div>

        <div className="log-form-group">
          <label className="log-form-label">Bên ngực hút</label>
          <div className="chart-metric-selector-pills" style={{ marginBottom: 0 }}>
            {['2 bên', 'Ngực trái', 'Ngực phải'].map((option) => (
              <button type="button" key={option} className={`metric-pill-choice ${side === option ? 'active' : ''}`} onClick={() => setSide(option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      </form>
    </BottomSheet>
  );
};
