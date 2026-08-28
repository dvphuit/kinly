import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HavenCalendar } from './HavenCalendar';

export interface HavenDatePickerProps {
  label: string;
  value: string; // 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm'
  onChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  showTime?: boolean;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  align?: 'start' | 'end';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getNowParts(): { date: string; time: string; hours: number; minutes: number } {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = `${pad2(hours)}:${pad2(minutes)}`;
  return { date, time, hours, minutes };
}

function formatDateDisplay(value: string, showTime: boolean): string {
  if (!value) return '';
  try {
    const isIsoTime = value.includes('T');
    const [datePart, timePart] = isIsoTime ? value.split('T') : [value, ''];
    const [year, month, day] = datePart.split('-').map(Number);
    if (!year || !month || !day) return value;
    const formattedDate = `${pad2(day)}/${pad2(month)}/${year}`;
    if (showTime && timePart) {
      return `${formattedDate} · ${timePart.slice(0, 5)}`;
    }
    return formattedDate;
  } catch {
    return value;
  }
}

export function HavenDatePicker({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  showTime = false,
  className = '',
  triggerClassName = '',
  disabled = false,
  id,
  placeholder = 'Chọn ngày',
}: HavenDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'date' | 'time'>('date');
  const modalRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const effectiveId = id || inputId;
  const titleId = useId();

  // Split value into date and time parts
  const isDateTime = value.includes('T');
  const datePart = isDateTime ? value.split('T')[0] : value || getNowParts().date;
  const timePart = isDateTime ? (value.split('T')[1] || '12:00').slice(0, 5) : '12:00';

  const [hoursStr, minutesStr] = timePart.split(':');
  const hours = Number.parseInt(hoursStr || '12', 10);
  const minutes = Number.parseInt(minutesStr || '00', 10);

  const handleDateChange = (newDate: string) => {
    if (showTime) {
      onChange(`${newDate}T${timePart}`);
    } else {
      onChange(newDate);
      setOpen(false);
    }
  };

  const handleTimeChange = (newTime: string) => {
    onChange(`${datePart}T${newTime}`);
  };

  const adjustHour = (delta: number) => {
    const nextHour = (hours + delta + 24) % 24;
    handleTimeChange(`${pad2(nextHour)}:${pad2(minutes)}`);
  };

  const adjustMinute = (delta: number) => {
    const nextMin = (minutes + delta + 60) % 60;
    handleTimeChange(`${pad2(hours)}:${pad2(nextMin)}`);
  };

  const setRelativeMinutes = (offsetMinutes: number) => {
    const target = new Date(Date.now() + offsetMinutes * 60_000);
    const date = `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`;
    const time = `${pad2(target.getHours())}:${pad2(target.getMinutes())}`;
    onChange(`${date}T${time}`);
  };

  const handleSetNow = () => {
    const { date, time } = getNowParts();
    if (showTime) {
      onChange(`${date}T${time}`);
    } else {
      onChange(date);
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const displayLabel = value ? formatDateDisplay(value, showTime) : placeholder;

  return (
    <div className={`haven-date-picker ${className}`.trim()}>
      <button
        id={effectiveId}
        type="button"
        className={`haven-date-picker-trigger ${triggerClassName}`.trim()}
        aria-label={`${label}: ${displayLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            setActiveTab('date');
          }
        }}
      >
        <span className="haven-date-picker-trigger-left">
          {showTime ? (
            <Clock size={15} className="haven-date-picker-trigger-icon" aria-hidden="true" />
          ) : (
            <Calendar size={15} className="haven-date-picker-trigger-icon" aria-hidden="true" />
          )}
          <span className={`haven-date-picker-trigger-text ${!value ? 'placeholder' : ''}`}>
            {displayLabel}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`haven-date-picker-chevron ${open ? 'is-open' : ''}`.trim()}
          aria-hidden="true"
        />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="haven-datepicker-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={modalRef}
            className="haven-datepicker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            {/* Modal Header */}
            <div className="haven-datepicker-header">
              <div className="haven-datepicker-title-group">
                <h3 id={titleId} className="haven-datepicker-title">{label}</h3>
                <span className="haven-datepicker-subtitle">{displayLabel}</span>
              </div>
              <button
                type="button"
                className="haven-datepicker-close-btn"
                aria-label="Đóng"
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Date / Time Tabs */}
            {showTime && (
              <div className="haven-dt-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'date'}
                  className={`haven-dt-tab ${activeTab === 'date' ? 'active' : ''}`}
                  onClick={() => setActiveTab('date')}
                >
                  <Calendar size={13} />
                  <span>Ngày: {formatDateDisplay(datePart, false)}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'time'}
                  className={`haven-dt-tab ${activeTab === 'time' ? 'active' : ''}`}
                  onClick={() => setActiveTab('time')}
                >
                  <Clock size={13} />
                  <span>Giờ: {timePart}</span>
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="haven-datepicker-body">
              {(!showTime || activeTab === 'date') && (
                <div className="haven-dt-calendar-wrap">
                  <HavenCalendar
                    mode="single"
                    value={datePart}
                    onChange={handleDateChange}
                    minDate={minDate}
                    maxDate={maxDate}
                    showFooter={false}
                  />
                  {showTime && (
                    <div className="haven-dt-next-step">
                      <button
                        type="button"
                        className="haven-dt-switch-btn"
                        onClick={() => setActiveTab('time')}
                      >
                        <Clock size={13} /> Tiếp tục chỉnh giờ ({timePart}) &rarr;
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showTime && activeTab === 'time' && (
                <div className="haven-time-view">
                  <div className="haven-time-steppers">
                    <div className="haven-time-unit">
                      <span className="haven-time-unit-label">Giờ</span>
                      <button
                        type="button"
                        className="haven-time-step-btn"
                        aria-label="Tăng 1 giờ"
                        onClick={() => adjustHour(1)}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <div className="haven-time-digit">{pad2(hours)}</div>
                      <button
                        type="button"
                        className="haven-time-step-btn"
                        aria-label="Giảm 1 giờ"
                        onClick={() => adjustHour(-1)}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>

                    <div className="haven-time-colon">:</div>

                    <div className="haven-time-unit">
                      <span className="haven-time-unit-label">Phút</span>
                      <button
                        type="button"
                        className="haven-time-step-btn"
                        aria-label="Tăng 5 phút"
                        onClick={() => adjustMinute(5)}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <div className="haven-time-digit">{pad2(minutes)}</div>
                      <button
                        type="button"
                        className="haven-time-step-btn"
                        aria-label="Giảm 5 phút"
                        onClick={() => adjustMinute(-5)}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="haven-time-presets">
                    <button
                      type="button"
                      className="haven-time-chip"
                      onClick={() => setRelativeMinutes(0)}
                    >
                      Vừa xong
                    </button>
                    <button
                      type="button"
                      className="haven-time-chip"
                      onClick={() => setRelativeMinutes(-15)}
                    >
                      15p trước
                    </button>
                    <button
                      type="button"
                      className="haven-time-chip"
                      onClick={() => setRelativeMinutes(-30)}
                    >
                      30p trước
                    </button>
                    <button
                      type="button"
                      className="haven-time-chip"
                      onClick={() => setRelativeMinutes(-60)}
                    >
                      1h trước
                    </button>
                  </div>

                  <div className="haven-time-manual-row">
                    <label htmlFor={`${effectiveId}-manual-time`}>Chọn trực tiếp:</label>
                    <input
                      id={`${effectiveId}-manual-time`}
                      type="time"
                      className="haven-time-native-input"
                      value={timePart}
                      onChange={(e) => handleTimeChange(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="haven-dt-footer">
              <button
                type="button"
                className="haven-dt-now-btn"
                onClick={handleSetNow}
              >
                <RotateCcw size={11} /> {showTime ? 'Bây giờ' : 'Hôm nay'}
              </button>
              <button
                type="button"
                className="haven-dt-done-btn"
                onClick={() => setOpen(false)}
              >
                <Check size={14} /> Xong
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
