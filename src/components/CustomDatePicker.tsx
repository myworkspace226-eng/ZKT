import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronRight, ChevronLeft, X, Check } from 'lucide-react';

export interface CustomDatePickerProps {
  value?: string; // Format: "YYYY-MM-DD"
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  min?: string;
  max?: string;
}

const MONTHS_ARABIC = [
  'يناير (01)',
  'فبراير (02)',
  'مارس (03)',
  'أبريل (04)',
  'مايو (05)',
  'يونيو (06)',
  'يوليو (07)',
  'أغسطس (08)',
  'سبتمبر (09)',
  'أكتوبر (10)',
  'نوفمبر (11)',
  'ديسمبر (12)'
];

const WEEKDAYS_ARABIC = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']; // Sun - Sat

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value = '',
  onChange,
  placeholder = 'اختر التاريخ...',
  className = '',
  disabled = false,
  align = 'right',
  min,
  max
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value or fallback to today
  const parsedDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedDate.getMonth()); // 0-11

  // Update view month/year when value changes from outside
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Generate days grid
  const daysGrid = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
    const totalDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const blanks: null[] = Array(firstDayOfMonth).fill(null);
    const days: number[] = Array.from({ length: totalDaysInMonth }, (_, i) => i + 1);

    return { blanks, days };
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mStr = String(viewMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const dateStr = `${viewYear}-${mStr}-${dStr}`;
    onChange(dateStr);
    setIsOpen(false);
  };

  const handleToday = () => {
    const now = new Date();
    const yStr = now.getFullYear();
    const mStr = String(now.getMonth() + 1).padStart(2, '0');
    const dStr = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yStr}-${mStr}-${dStr}`;
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    onChange(todayStr);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const todayISO = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const yearsRange = useMemo(() => {
    const currentY = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentY - 7; y <= currentY + 3; y++) {
      years.push(y);
    }
    return years;
  }, []);

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-slate-950 border border-slate-700/80 hover:border-slate-600 text-xs font-mono text-slate-200 transition-colors select-none focus:outline-none focus:border-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className={value ? 'text-white' : 'text-slate-500'}>
            {value || placeholder}
          </span>
        </div>
        {value && !disabled && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            title="مسح التاريخ"
            className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Modern Popover */}
      {isOpen && (
        <div
          dir="rtl"
          className={`absolute mt-1.5 z-50 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-3 animate-in fade-in zoom-in-95 text-xs select-none backdrop-blur-md ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          {/* Header Controls (Month & Year Dropdowns + Navigation) */}
          <div className="flex items-center justify-between gap-1 pb-2.5 border-b border-slate-800">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="الشهر السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              {/* Month Dropdown */}
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-[11px] rounded px-1.5 py-1 focus:outline-none focus:border-blue-500 cursor-pointer font-sans"
              >
                {MONTHS_ARABIC.map((m, idx) => (
                  <option key={idx} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              {/* Year Dropdown */}
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-[11px] rounded px-1.5 py-1 focus:outline-none focus:border-blue-500 cursor-pointer font-mono"
              >
                {yearsRange.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="الشهر التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Names */}
          <div className="grid grid-cols-7 gap-1 pt-2 pb-1 text-center font-bold text-[10px] text-slate-400">
            {WEEKDAYS_ARABIC.map((w, idx) => (
              <span key={idx} className={idx === 5 ? 'text-amber-400' : ''}>
                {w}
              </span>
            ))}
          </div>

          {/* Day Numbers Grid */}
          <div className="grid grid-cols-7 gap-1 py-1 text-center font-mono text-xs">
            {daysGrid.blanks.map((_, idx) => (
              <div key={`blank-${idx}`} className="h-7 w-7" />
            ))}

            {daysGrid.days.map((day) => {
              const mStr = String(viewMonth + 1).padStart(2, '0');
              const dStr = String(day).padStart(2, '0');
              const dateStr = `${viewYear}-${mStr}-${dStr}`;
              const isSelected = value === dateStr;
              const isToday = todayISO === dateStr;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all cursor-pointer font-medium text-xs ${
                    isSelected
                      ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/50 scale-105'
                      : isToday
                      ? 'border border-blue-500/60 text-blue-300 hover:bg-slate-800'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Actions */}
          <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={handleToday}
              className="px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-medium transition-colors cursor-pointer"
            >
              اليوم
            </button>

            <button
              type="button"
              onClick={handleClear}
              className="px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              مسح
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
