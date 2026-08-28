import { Fragment, useEffect, useId, useState } from 'react';
import { CalendarDays, Check, FileText, Pencil, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { HavenHeadCircIcon, HavenRulerIcon, HavenScaleIcon } from '@/shared/ui/HavenIcons';
import type { GrowthHistoryRecord } from '@/features/growth/domain/types';
import { useGrowthStore } from '@/features/growth/store/useGrowthStore';
import { GrowthMeasurementForm } from './GrowthMeasurementForm';

interface GrowthMeasurementSheetProps {
  isOpen: boolean;
  record: GrowthHistoryRecord;
  onClose: () => void;
  onSuccessToast?: (message: string) => void;
}

function formatMeasurementDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function GrowthMeasurementSheet({
  isOpen,
  record,
  onClose,
  onSuccessToast,
}: GrowthMeasurementSheetProps) {
  const formId = useId();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteGrowthMeasurement = useGrowthStore((state) => state.deleteGrowthMeasurement);
  const currentStageData = useGrowthStore((state) => state.currentStageData());
  const labelIndex = record.labelIndex ?? Math.max(0, (currentStageData.growthChart?.labels.length ?? 1) - 3);
  const milestoneLabel = currentStageData.growthChart?.labels[labelIndex];

  useEffect(() => {
    if (!isOpen) return;
    setEditing(false);
    setConfirmingDelete(false);
  }, [isOpen, record.id]);

  const footer = editing ? (
    <Fragment key="editing-actions">
      <button type="button" className="sheet-action sheet-action-secondary" onClick={() => setEditing(false)}>
        Hủy
      </button>
      <button type="submit" form={formId} className="sheet-action sheet-action-primary">
        <Check size={15} /> Lưu thay đổi
      </button>
    </Fragment>
  ) : confirmingDelete ? (
    <Fragment key="delete-confirmation-actions">
      <button type="button" className="sheet-action sheet-action-secondary" onClick={() => setConfirmingDelete(false)}>
        Giữ lại
      </button>
      <button
        type="button"
        className="sheet-action sheet-action-danger is-confirming"
        onClick={() => {
          deleteGrowthMeasurement(record.id);
          onSuccessToast?.('Đã xóa bản ghi cân đo');
          onClose();
        }}
      >
        <Trash2 size={15} /> Xóa bản ghi
      </button>
    </Fragment>
  ) : (
    <Fragment key="preview-actions">
      <button type="button" className="sheet-action sheet-action-danger" onClick={() => setConfirmingDelete(true)}>
        <Trash2 size={15} /> Xóa
      </button>
      <button type="button" className="sheet-action sheet-action-primary" onClick={() => setEditing(true)}>
        <Pencil size={15} /> Chỉnh sửa
      </button>
    </Fragment>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Chỉnh sửa số đo' : 'Chi tiết cân đo'}
      className="growth-bottom-sheet growth-measurement-sheet"
      footer={footer}
    >
      {editing ? (
        <GrowthMeasurementForm
          key={record.id}
          formId={formId}
          measurement={record}
          onSaved={(message) => {
            onSuccessToast?.(message);
            setEditing(false);
          }}
        />
      ) : (
        <div className="growth-preview">
          <section className="growth-preview-hero">
            <div className="growth-preview-hero-copy">
              <span className="tracker-sheet-kicker">LẦN CÂN ĐO</span>
              <strong>{record.ageText || 'Mốc đo của bé'}</strong>
              <span><CalendarDays size={13} /> {formatMeasurementDate(record.date)}</span>
            </div>
            {milestoneLabel && <span className="growth-preview-milestone">Mốc {milestoneLabel}</span>}
          </section>

          <div className="growth-preview-metrics" aria-label="Các chỉ số đã ghi">
            <article className="growth-preview-metric tone-weight">
              <span><HavenScaleIcon size={22} color="currentColor" secondaryColor="var(--growth-preview-icon-soft)" /></span>
              <small>Cân nặng</small>
              <strong>{record.weight > 0 ? `${record.weight} kg` : 'Chưa ghi'}</strong>
            </article>
            <article className="growth-preview-metric tone-height">
              <span><HavenRulerIcon size={22} color="currentColor" secondaryColor="var(--growth-preview-icon-soft)" /></span>
              <small>Chiều cao</small>
              <strong>{record.height > 0 ? `${record.height} cm` : 'Chưa ghi'}</strong>
            </article>
            <article className="growth-preview-metric tone-head">
              <span><HavenHeadCircIcon size={22} color="currentColor" secondaryColor="var(--growth-preview-icon-soft)" /></span>
              <small>Vòng đầu</small>
              <strong>{record.headCirc > 0 ? `${record.headCirc} cm` : 'Chưa ghi'}</strong>
            </article>
          </div>

          <section className="growth-preview-note">
            <span><FileText size={14} /> Ghi chú</span>
            <p>{record.note || 'Không có ghi chú cho lần cân đo này.'}</p>
          </section>

          {confirmingDelete && (
            <p className="growth-preview-delete-warning" role="alert">
              Bản ghi sẽ bị xóa khỏi lịch sử và biểu đồ tăng trưởng.
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
