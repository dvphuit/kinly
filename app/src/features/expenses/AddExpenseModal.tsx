import React, { useEffect, useId, useMemo, useState } from 'react';
import { Calendar, Check, FileText } from 'lucide-react';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { HavenDatePicker } from '@/shared/ui/HavenDatePicker';
import { HavenWalletIcon } from '@/shared/ui/HavenIcons';
import { EXPENSE_CATEGORIES } from '@/features/expenses/domain/expenseCategories';
import { useExpenseStore } from '@/features/expenses/store/useExpenseStore';
import type { ExpenseRecord } from '@/types/expense';
import { evaluateMathExpression, formatExpression } from '@/features/expenses/domain/expenseMath';
import { ExpenseCategoryIcon } from './ExpenseCategoryIcon';
import { ExpenseKeypad } from './ExpenseKeypad';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
  editingExpense?: ExpenseRecord | null;
}

function localDateTimeInputValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getYesterdayDateTime(): string {
  const yesterday = new Date(Date.now() - 86_400_000);
  const local = new Date(yesterday.getTime() - yesterday.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSuccessToast,
  editingExpense,
}) => {
  const addExpense = useExpenseStore((state) => state.addExpense);
  const updateExpense = useExpenseStore((state) => state.updateExpense);

  const [expression, setExpression] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([EXPENSE_CATEGORIES[0].name]);
  const [occurredAt, setOccurredAt] = useState(localDateTimeInputValue);
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (editingExpense) {
      setExpression(String(editingExpense.amount / 1000));
      const parsed = (editingExpense.category || '')
        .split(',')
        .map((category) => category.trim())
        .filter(Boolean);
      setSelectedCategories(parsed.length > 0 ? parsed : ['Khác']);
      setOccurredAt(localDateTimeInputValue(new Date(editingExpense.occurredAt)));
      setDatePreset('custom');
      setNote(editingExpense.note || '');
    } else {
      setExpression('');
      setSelectedCategories([EXPENSE_CATEGORIES[0].name]);
      setOccurredAt(localDateTimeInputValue());
      setDatePreset('today');
      setNote('');
    }
    setError(null);
  }, [editingExpense, isOpen]);

  const currentThousands = useMemo(() => evaluateMathExpression(expression), [expression]);
  const finalVndAmount = useMemo(() => Math.round(currentThousands * 1000), [currentThousands]);

  const handleToggleCategory = (categoryName: string) => {
    setSelectedCategories((current) => {
      if (current.includes(categoryName)) {
        const filtered = current.filter((category) => category !== categoryName);
        return filtered.length > 0 ? filtered : ['Khác'];
      }
      if (current.length === 1 && current[0] === 'Khác' && categoryName !== 'Khác') return [categoryName];
      return [...current, categoryName];
    });
  };

  const handleDatePreset = (preset: 'today' | 'yesterday' | 'custom') => {
    setDatePreset(preset);
    if (preset === 'today') setOccurredAt(localDateTimeInputValue());
    if (preset === 'yesterday') setOccurredAt(getYesterdayDateTime());
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!Number.isFinite(finalVndAmount) || finalVndAmount <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ lớn hơn 0.');
      return;
    }

    const combinedCategory = (selectedCategories.length > 0 ? selectedCategories : ['Khác']).join(', ');
    const input = {
      amount: finalVndAmount,
      category: combinedCategory,
      occurredAt: new Date(occurredAt).toISOString(),
      note: note.trim() || undefined,
    };

    if (editingExpense) {
      updateExpense(editingExpense.id, input);
      onSuccessToast?.(`Đã cập nhật khoản chi ${finalVndAmount.toLocaleString('vi-VN')} đ.`);
    } else {
      addExpense(input);
      onSuccessToast?.(`Đã lưu chi tiêu ${finalVndAmount.toLocaleString('vi-VN')} đ.`);
    }

    onClose();
  };

  const formId = useId();

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={editingExpense ? 'Sửa khoản chi' : 'Chi tiêu'}
      className="expense-bottom-sheet"
      footer={
        <button
          type="submit"
          form={formId}
          className="sheet-action sheet-action-primary"
          disabled={finalVndAmount <= 0}
        >
          {editingExpense ? 'Lưu thay đổi' : 'Lưu khoản chi'}
          {finalVndAmount > 0 ? ` • ${finalVndAmount.toLocaleString('vi-VN')} đ` : ''}
        </button>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="tracker-sheet-form haven-expense-form">
        <div className="tracker-sheet-intro expense-sheet-intro">
          <span className="tracker-sheet-intro-icon">
            <HavenWalletIcon size={22} color="currentColor" secondaryColor="rgba(255, 255, 255, 0.2)" />
          </span>
          <div className="tracker-sheet-intro-copy">
            <span className="tracker-sheet-kicker">GHI NHẬN CHI TIÊU</span>
            <p>Nhập số tiền trước, sau đó chọn nhóm chi và thời điểm phát sinh.</p>
          </div>
        </div>

        <section className="tracker-sheet-section expense-amount-section">
          <div className="tracker-sheet-section-header">
            <span>Số tiền</span>
            <small>Đơn vị ×1.000 đ</small>
          </div>
          <div className="haven-expense-display">
            <div className="haven-expense-amount-readout">
              <div className="haven-formula-scroll-box" title="Biểu thức đã nhập">
                <span className="haven-formula-text">{expression ? formatExpression(expression) : '0'}</span>
              </div>
              <div className="haven-total-vnd-line">
                <span className="haven-amount-number">{finalVndAmount > 0 ? finalVndAmount.toLocaleString('vi-VN') : '0'}</span>
                <span className="haven-amount-unit">đ</span>
              </div>
            </div>
          </div>
          <div className="haven-form-keypad-wrapper">
            <ExpenseKeypad expression={expression} onChangeExpression={setExpression} />
          </div>
        </section>

        <section className="tracker-sheet-section expense-category-section">
          <div className="tracker-sheet-section-header">
            <span>Nhóm chi</span>
            <small>{selectedCategories.length} đã chọn</small>
          </div>
          <div className="expense-category-grid" role="group" aria-label="Danh mục chi tiêu (chọn một hoặc nhiều)">
            {EXPENSE_CATEGORIES.map((category) => {
              const isSelected = selectedCategories.includes(category.name);
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-label={category.name}
                  aria-pressed={isSelected}
                  className={`expense-category-card ${isSelected ? 'active' : ''}`}
                  style={{
                    backgroundColor: isSelected ? category.bgLight : undefined,
                    borderColor: isSelected ? category.color : undefined,
                    color: isSelected ? category.color : undefined,
                  }}
                  onClick={() => handleToggleCategory(category.name)}
                >
                  <span className="expense-category-icon" style={{ backgroundColor: category.bgLight }}>
                    <ExpenseCategoryIcon category={category.name} size={17} />
                  </span>
                  <span className="expense-category-title">{category.shortName}</span>
                  {isSelected && (
                    <span className="expense-category-check" style={{ backgroundColor: category.color }}>
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="tracker-sheet-section">
          <div className="tracker-sheet-section-header"><span>Thời gian</span></div>
          <div className="haven-date-segmented-bar">
            <button type="button" className={`haven-date-seg-btn ${datePreset === 'today' ? 'active' : ''}`} onClick={() => handleDatePreset('today')}>Hôm nay</button>
            <button type="button" className={`haven-date-seg-btn ${datePreset === 'yesterday' ? 'active' : ''}`} onClick={() => handleDatePreset('yesterday')}>Hôm qua</button>
            <button type="button" className={`haven-date-seg-btn ${datePreset === 'custom' ? 'active' : ''}`} onClick={() => handleDatePreset('custom')}>
              <Calendar size={12} /> Ngày khác
            </button>
          </div>

          {datePreset === 'custom' && (
            <div className="expense-custom-date">
              <HavenDatePicker label="Thời điểm chi tiêu" value={occurredAt} showTime onChange={setOccurredAt} />
            </div>
          )}
        </section>

        <section className="tracker-sheet-section">
          <div className="log-form-group sheet-note-field">
            <label className="log-form-label icon-label"><FileText size={13} /> Ghi chú</label>
            <input
              className="log-input-control"
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ví dụ: 2 hộp Meiji, bình sữa Comotomo..."
            />
          </div>
        </section>

        {error && <p role="alert" className="haven-form-error">{error}</p>}
      </form>
    </BottomSheet>
  );
};
