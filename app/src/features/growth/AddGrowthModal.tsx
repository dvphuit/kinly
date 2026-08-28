import { useId } from 'react';
import { ArrowRight } from 'lucide-react';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { GrowthMeasurementForm } from './GrowthMeasurementForm';

interface AddGrowthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast: (msg: string) => void;
}

export const AddGrowthModal: React.FC<AddGrowthModalProps> = ({
  isOpen,
  onClose,
  onSuccessToast,
}) => {
  const formId = useId();

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Cân đo tăng trưởng"
      className="growth-bottom-sheet"
      footer={
        <button type="submit" form={formId} className="sheet-action sheet-action-primary">
          <span>Lưu số đo</span>
          <ArrowRight size={14} />
        </button>
      }
    >
      <GrowthMeasurementForm
        key={isOpen ? 'growth-create-open' : 'growth-create-closed'}
        formId={formId}
        onSaved={(message) => {
          onSuccessToast(message);
          onClose();
        }}
      />
    </BottomSheet>
  );
};
