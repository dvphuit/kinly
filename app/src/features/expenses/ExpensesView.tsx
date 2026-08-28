/**
 * Haven expenses timeline with a monthly summary, budget progress,
 * category filters, and a daily transaction stream.
 */
import React, { useMemo, useState } from 'react';
import { useProgressiveList } from '@/shared/hooks/useProgressiveList';
import { ProgressiveListBoundary } from '@/shared/ui/ProgressiveListBoundary';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Sparkles,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { getExpenseCategory } from '@/features/expenses/domain/expenseCategories';
import type { AddToast } from '@/app/hooks/useAppModals';
import { useExpenseStore } from '@/features/expenses/store/useExpenseStore';
import type { ExpenseRecord } from '@/types/expense';
import { AddExpenseModal } from './AddExpenseModal';
import { ExpenseCategoryIcon } from './ExpenseCategoryIcon';
import { useExpensesByMonth } from '@/data/useNormalizedData';

interface ExpensesViewProps {
  onOpenAddExpense: () => void;
  onShowToast?: AddToast;
}

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  totalDayAmount: number;
  records: ExpenseRecord[];
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')} đ`;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatGroupDateLabel(dateKey: string): string {
  try {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(Date.now() - 86_400_000);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (dateKey === todayKey) return `Hôm nay · ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
    if (dateKey === yesterdayKey) return `Hôm qua · ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;

    const dayOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][date.getDay()];
    return `${dayOfWeek} · ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  } catch {
    return dateKey;
  }
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({ onOpenAddExpense, onShowToast }) => {
  const deleteExpense = useExpenseStore((state) => state.deleteExpense);
  const monthlyBudget = useExpenseStore((state) => state.monthlyBudget);
  const setMonthlyBudget = useExpenseStore((state) => state.setMonthlyBudget);

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInputK, setBudgetInputK] = useState('5000');
  const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  const expenses = useExpensesByMonth(monthKey);

  const realNow = useMemo(() => new Date(), []);
  const isViewingCurrentMonth = currentDate.getFullYear() === realNow.getFullYear()
    && currentDate.getMonth() === realNow.getMonth();

  const monthExpenses = useMemo(() => expenses.filter((item) => {
    const date = new Date(item.occurredAt);
    return date.getFullYear() === currentDate.getFullYear() && date.getMonth() === currentDate.getMonth();
  }), [currentDate, expenses]);

  const totalMonth = useMemo(
    () => monthExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    [monthExpenses],
  );

  const safeBudget = monthlyBudget > 0 ? monthlyBudget : 5_000_000;
  const usedPercent = Math.round((totalMonth / safeBudget) * 100);
  const isOverBudget = totalMonth > safeBudget;
  const remainingBudget = safeBudget - totalMonth;

  const handleSaveBudget = (event: React.FormEvent) => {
    event.preventDefault();
    const valueInThousands = Number.parseFloat(budgetInputK.replace(/,/g, ''));
    if (!Number.isFinite(valueInThousands) || valueInThousands <= 0) return;

    const newBudget = Math.round(valueInThousands * 1000);
    setMonthlyBudget(newBudget);
    setIsEditingBudget(false);
    onShowToast?.(`Đã đổi ngân sách tháng thành ${formatCurrency(newBudget)}`, '🎯');
  };

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    monthExpenses.forEach((item) => {
      const categories = item.category.split(',').map((category) => category.trim()).filter(Boolean);
      if (categories.length > 1) {
        const splitAmount = (Number(item.amount) || 0) / categories.length;
        categories.forEach((category) => {
          const current = totals.get(category) || { total: 0, count: 0 };
          totals.set(category, { total: current.total + splitAmount, count: current.count + 1 });
        });
        return;
      }
      const category = item.category || 'Khác';
      const current = totals.get(category) || { total: 0, count: 0 };
      totals.set(category, { total: current.total + (Number(item.amount) || 0), count: current.count + 1 });
    });
    return Array.from(totals.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [monthExpenses]);

  const displayedExpenses = useMemo(() => {
    const list = selectedCategoryFilter
      ? monthExpenses.filter((item) => item.category.includes(selectedCategoryFilter))
      : monthExpenses;
    return [...list].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [monthExpenses, selectedCategoryFilter]);

  const timelineDateGroups = useMemo(() => {
    const recordsByDate = new Map<string, ExpenseRecord[]>();
    displayedExpenses.forEach((record) => {
      try {
        const date = new Date(record.occurredAt);
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        recordsByDate.set(dateKey, [...(recordsByDate.get(dateKey) || []), record]);
      } catch {
        recordsByDate.set('other', [...(recordsByDate.get('other') || []), record]);
      }
    });

    return Array.from(recordsByDate.entries())
      .map(([dateKey, records]): DateGroup => {
        const sortedRecords = [...records].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        return {
          dateKey,
          dateLabel: formatGroupDateLabel(dateKey),
          totalDayAmount: sortedRecords.reduce((sum, record) => sum + (Number(record.amount) || 0), 0),
          records: sortedRecords,
        };
      })
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [displayedExpenses]);

  const expenseWindow = useProgressiveList({
    totalCount: timelineDateGroups.length,
    initialCount: 10,
    batchSize: 10,
    resetKey: `${currentDate.getFullYear()}-${currentDate.getMonth()}-${selectedCategoryFilter ?? 'all'}`,
  });
  const renderedTimelineDateGroups = timelineDateGroups.slice(0, expenseWindow.visibleCount);

  const monthLabel = `Tháng ${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
  const topCategoryEntry = categoryTotals[0];
  const daysInCurrentMonth = useMemo(() => (
    isViewingCurrentMonth
      ? Math.max(1, realNow.getDate())
      : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  ), [currentDate, isViewingCurrentMonth, realNow]);
  const averagePerDay = Math.round(totalMonth / daysInCurrentMonth);

  const handleDelete = (record: ExpenseRecord) => {
    if (!window.confirm(`Bạn có chắc muốn xóa khoản chi "${record.category}" (${formatCurrency(record.amount)})?`)) return;
    deleteExpense(record.id);
    onShowToast?.(`Đã xóa khoản chi ${record.category}`, '🗑️');
  };

  return (
    <div className="haven-expenses">
      <section className="haven-expense-summary-card" aria-labelledby="expense-summary-title">
        <div className="haven-summary-ambient-glow" aria-hidden="true" />
        <img
          className="haven-expense-card-decor"
          src="/assets/decor/expense-wallet.png"
          alt=""
          width={256}
          height={256}
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />

        <div className="haven-summary-month-nav">
          <button
            type="button"
            className="haven-month-nav-btn"
            onClick={() => setCurrentDate((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))}
            aria-label="Tháng trước"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="haven-month-nav-center">
            <CalendarDays size={13} className="haven-month-icon-dot" />
            <span className="haven-month-nav-title">{monthLabel}</span>
            {!isViewingCurrentMonth && (
              <button
                type="button"
                className="haven-month-reset-badge"
                onClick={() => setCurrentDate(new Date())}
                title="Về tháng hiện tại"
              >
                <RotateCcw size={10} /> Hiện tại
              </button>
            )}
          </div>
          <button
            type="button"
            className="haven-month-nav-btn"
            onClick={() => setCurrentDate((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))}
            aria-label="Tháng sau"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="haven-summary-hero-row">
          <div className="haven-summary-hero-copy">
            <div className="haven-eyebrow-pill">
              <Sparkles size={10} className="haven-sparkle-ico" />
              <span>TỔNG QUAN CHI TIÊU</span>
            </div>
            <h2 id="expense-summary-title">{formatCurrency(totalMonth)}</h2>
            <p>
              {monthExpenses.length ? (
                <>
                  <b>{monthExpenses.length} khoản đã ghi</b>
                  {totalMonth > 0 && <span> · ~ {formatCurrency(averagePerDay)}/ngày</span>}
                </>
              ) : 'Chưa có khoản chi nào trong tháng'}
            </p>
          </div>

          <button
            type="button"
            id="btnHeroAddExpense"
            className="haven-hero-add-gem-btn"
            aria-label="+ Thêm khoản chi"
            onClick={onOpenAddExpense}
            title="Thêm khoản chi tiêu mới"
          >
            <div className="haven-add-gem-outer">
              <div className="haven-add-gem-core">
                <Plus size={22} strokeWidth={2.8} className="haven-add-gem-icon" />
              </div>
            </div>
          </button>
        </div>

        <div className="haven-budget-panel" aria-label="Tiến độ ngân sách tháng">
          <div className="haven-budget-header">
            <div className="haven-budget-title-group">
              <Target size={12} className="haven-budget-icon" />
              <span className="haven-budget-label">Ngân sách:</span>
              {isEditingBudget ? (
                <form onSubmit={handleSaveBudget} className="haven-budget-edit-form">
                  <input
                    type="number"
                    className="haven-budget-input"
                    value={budgetInputK}
                    onChange={(event) => setBudgetInputK(event.target.value)}
                    placeholder="5000"
                    autoFocus
                    min="100"
                    step="100"
                    aria-label="Số tiền ngân sách tính theo nghìn đồng"
                  />
                  <span className="haven-budget-k-unit">k</span>
                  <button type="submit" className="haven-budget-action-btn haven-budget-save" title="Lưu"><Check size={11} /></button>
                  <button type="button" className="haven-budget-action-btn haven-budget-cancel" onClick={() => setIsEditingBudget(false)} title="Hủy"><X size={11} /></button>
                </form>
              ) : (
                <button
                  type="button"
                  className="haven-budget-val-btn"
                  onClick={() => {
                    setBudgetInputK(String(Math.round(safeBudget / 1000)));
                    setIsEditingBudget(true);
                  }}
                  title="Chạm để chỉnh sửa hạn mức ngân sách"
                >
                  <span>{formatCurrency(safeBudget)}</span>
                  <Pencil size={10} className="haven-budget-pencil" />
                </button>
              )}
            </div>
            <span className={`haven-budget-percent-badge ${isOverBudget ? 'over' : usedPercent > 80 ? 'warn' : ''}`}>
              {isOverBudget ? `Vượt ${usedPercent}%` : `${usedPercent}%`}
            </span>
          </div>

          <div
            className="haven-budget-track"
            role="progressbar"
            aria-valuenow={usedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tỷ lệ sử dụng ngân sách"
          >
            <div
              className={`haven-budget-fill ${isOverBudget ? 'over' : usedPercent > 80 ? 'warn' : ''}`}
              style={{ width: `${Math.min(100, Math.max(usedPercent > 0 ? 3 : 0, usedPercent))}%` }}
            />
          </div>

          <div className="haven-budget-footer">
            <span className="haven-budget-foot-spent">Đã chi: <b>{formatCurrency(totalMonth)}</b></span>
            <span className={`haven-budget-foot-rem ${isOverBudget ? 'over' : ''}`}>
              {isOverBudget ? `Vượt: +${formatCurrency(totalMonth - safeBudget)}` : `Còn: ${formatCurrency(remainingBudget)}`}
            </span>
          </div>
        </div>

        {monthExpenses.length > 0 && (
          <div className="haven-summary-metrics-strip">
            <div className="haven-summary-metric">
              <div className="haven-metric-title-row"><TrendingUp size={10} /><span className="haven-metric-label">TB / ngày</span></div>
              <strong className="haven-metric-val">{formatCurrency(averagePerDay)}</strong>
            </div>
            <div className="haven-summary-metric-divider" />
            <div className="haven-summary-metric">
              <div className="haven-metric-title-row"><Tag size={10} /><span className="haven-metric-label">Nhiều nhất</span></div>
              <strong className="haven-metric-val" title={topCategoryEntry?.[0] ?? ''}>{topCategoryEntry?.[0] ?? '—'}</strong>
            </div>
            <div className="haven-summary-metric-divider" />
            <div className="haven-summary-metric">
              <div className="haven-metric-title-row"><Receipt size={10} /><span className="haven-metric-label">Giao dịch</span></div>
              <strong className="haven-metric-val">{monthExpenses.length} khoản</strong>
            </div>
          </div>
        )}

        {categoryTotals.length > 0 && (
          <div className="haven-summary-filter-section" aria-label="Bộ lọc danh mục chi tiêu">
            <div className="haven-filter-pills-row">
              <button
                type="button"
                className={`haven-filter-pill ${selectedCategoryFilter === null ? 'active' : ''}`}
                onClick={() => setSelectedCategoryFilter(null)}
              >
                <span>Tất cả</span>
                <span className="haven-filter-count">{monthExpenses.length}</span>
              </button>
              {categoryTotals.map(([categoryName, info]) => {
                const isSelected = selectedCategoryFilter === categoryName;
                const category = getExpenseCategory(categoryName);
                return (
                  <button
                    key={categoryName}
                    type="button"
                    className={`haven-filter-pill ${isSelected ? 'active' : ''}`}
                    style={{
                      borderColor: isSelected ? category.color : undefined,
                      backgroundColor: isSelected ? category.bgLight : undefined,
                      color: isSelected ? category.color : undefined,
                    }}
                    onClick={() => setSelectedCategoryFilter((previous) => previous === categoryName ? null : categoryName)}
                  >
                    <ExpenseCategoryIcon category={categoryName} size={12} />
                    <span>{categoryName}</span>
                    <span className="haven-filter-count">{formatCurrency(info.total)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="haven-expense-timeline-section" aria-label="Dòng thời gian chi tiêu">
        <div className="haven-expense-sheet-heading">
          <div>
            <span className="haven-expense-eyebrow">NHỊP CHI TIÊU</span>
            <h3>Dòng tiền tháng này</h3>
          </div>
          <span className="haven-expense-sheet-count">
            <Receipt size={12} />
            {displayedExpenses.length} khoản
          </span>
        </div>

        {selectedCategoryFilter && (
          <div className="haven-timeline-filter-banner">
            <span className="haven-filter-banner-text">Đang lọc danh mục: <strong>{selectedCategoryFilter}</strong></span>
            <button type="button" className="haven-filter-clear-btn" onClick={() => setSelectedCategoryFilter(null)} title="Bỏ lọc danh mục">
              <FilterX size={12} /> Bỏ lọc
            </button>
          </div>
        )}

        {timelineDateGroups.length === 0 ? (
          <div className="haven-empty-state haven-timeline-empty">
            <span><Sparkles size={20} /></span>
            <strong>
              {selectedCategoryFilter
                ? `Không có khoản chi nào thuộc "${selectedCategoryFilter}" trong ${monthLabel}`
                : `Chưa có khoản chi nào trong ${monthLabel}`}
            </strong>
            <p>Ghi chép các khoản chi giúp theo dõi nhịp tài chính gia đình một cách nhẹ nhàng, chủ động.</p>
            <button type="button" className="haven-empty-action" onClick={onOpenAddExpense}>Thêm khoản chi ngay</button>
          </div>
        ) : (
          <div className="haven-timeline-stream">
            {renderedTimelineDateGroups.map((group) => (
              <div key={group.dateKey} className="haven-timeline-day-group">
                <div className="haven-day-header">
                  <div className="haven-day-header-left"><CalendarDays size={13} className="haven-day-icon" /><span className="haven-day-label">{group.dateLabel}</span></div>
                  <span className="haven-day-sum-badge">Tổng: <b>{formatCurrency(group.totalDayAmount)}</b></span>
                </div>

                <div className="haven-day-timeline-track">
                  {group.records.map((record) => {
                    const primaryCategoryName = record.category.split(',')[0].trim();
                    const primaryCategory = getExpenseCategory(primaryCategoryName);
                    const allCategoryNames = record.category.split(',').map((category) => category.trim()).filter(Boolean);

                    return (
                      <div key={record.id} className="haven-timeline-item">
                        <div
                          className="haven-timeline-node"
                          style={{ borderColor: primaryCategory.color, color: primaryCategory.color }}
                        >
                          <ExpenseCategoryIcon category={primaryCategoryName} size={12} />
                        </div>

                        <div className="haven-timeline-card">
                          <div className="haven-tl-row-top">
                            <div className="haven-tl-cat-list">
                              {allCategoryNames.map((categoryName) => {
                                const category = getExpenseCategory(categoryName);
                                return (
                                  <span
                                    key={categoryName}
                                    className="haven-tl-cat-badge"
                                    style={{ backgroundColor: category.bgLight, borderColor: `${category.color}30`, color: category.color }}
                                  >
                                    <ExpenseCategoryIcon category={categoryName} size={11} />
                                    <span>{categoryName}</span>
                                  </span>
                                );
                              })}
                            </div>
                            <div className="haven-tl-amount-badge"><span className="haven-tl-amount">{formatCurrency(record.amount)}</span></div>
                          </div>

                          {record.note && <div className="haven-tl-note-box"><p className="haven-tl-note">{record.note}</p></div>}

                          <div className="haven-tl-footer">
                            <span className="haven-tl-time">{formatTime(record.occurredAt)}</span>
                            <div className="haven-tl-actions">
                              <button type="button" className="haven-tl-act-btn" onClick={() => setEditingExpense(record)} title="Chỉnh sửa khoản chi">
                                <Pencil size={11} /> Sửa
                              </button>
                              <button type="button" className="haven-tl-act-btn haven-tl-act-del" onClick={() => handleDelete(record)} title="Xóa khoản chi">
                                <Trash2 size={11} /> Xóa
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <ProgressiveListBoundary
              autoLoadAvailable={expenseWindow.autoLoadAvailable}
              fallbackLabel="Xem thêm khoản chi"
              hasMore={expenseWindow.hasMore}
              onLoadMore={expenseWindow.revealMore}
              sentinelRef={expenseWindow.sentinelRef}
            />
          </div>
        )}
      </section>

      {editingExpense && (
        <AddExpenseModal
          isOpen
          onClose={() => setEditingExpense(null)}
          editingExpense={editingExpense}
          onSuccessToast={(message) => onShowToast?.(message)}
        />
      )}
    </div>
  );
};
