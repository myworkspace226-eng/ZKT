import React, { useState, useMemo } from 'react';
import { 
  Palmtree, 
  Plus, 
  Trash2, 
  Search, 
  Calendar, 
  CalendarDays, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Building2, 
  Tag, 
  X,
  Sparkles,
  FileText
} from 'lucide-react';
import { LeaveRecord, OfficialHoliday, Worker } from '../types';
import { CustomDatePicker } from './CustomDatePicker';

interface LeavesManagerProps {
  leaves: LeaveRecord[];
  officialHolidays: OfficialHoliday[];
  workers: Worker[];
  onAddLeave: (leave: LeaveRecord) => void;
  onDeleteLeave: (id: string) => void;
  onAddOfficialHoliday: (holiday: OfficialHoliday) => void;
  onDeleteOfficialHoliday: (id: string) => void;
}

const LEAVE_TYPE_MAP: Record<LeaveRecord['leaveType'], { label: string; bg: string; text: string; border: string }> = {
  excused_annual: {
    label: 'إجازة اعتيادية / سنوية',
    bg: 'bg-blue-950/60',
    text: 'text-blue-300',
    border: 'border-blue-800/60',
  },
  excused_casual: {
    label: 'إجازة عارضة',
    bg: 'bg-amber-950/60',
    text: 'text-amber-300',
    border: 'border-amber-800/60',
  },
  medical: {
    label: 'إجازة مرضية',
    bg: 'bg-purple-950/60',
    text: 'text-purple-300',
    border: 'border-purple-800/60',
  },
  official_pass: {
    label: 'إذن رسمي معتمد',
    bg: 'bg-emerald-950/60',
    text: 'text-emerald-300',
    border: 'border-emerald-800/60',
  },
};

const ARABIC_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const LeavesManager: React.FC<LeavesManagerProps> = ({
  leaves,
  officialHolidays,
  workers,
  onAddLeave,
  onDeleteLeave,
  onAddOfficialHoliday,
  onDeleteOfficialHoliday,
}) => {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Filter and search states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Leave Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedWorkerCode, setSelectedWorkerCode] = useState<number | ''>('');
  const [leaveType, setLeaveType] = useState<LeaveRecord['leaveType']>('excused_annual');
  const [dateMode, setDateMode] = useState<'continuous' | 'specific'>('continuous');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [newSpecificDate, setNewSpecificDate] = useState<string>(todayStr);
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [leaveNote, setLeaveNote] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Official Holiday Form State
  const [holidayDate, setHolidayDate] = useState<string>(todayStr);
  const [holidayName, setHolidayName] = useState<string>('');
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [holidayNotice, setHolidayNotice] = useState<string | null>(null);

  // Active leaves today
  const activeLeavesToday = useMemo(() => {
    return leaves.filter((l) => {
      if (l.startDate && l.endDate) {
        return todayStr >= l.startDate && todayStr <= l.endDate;
      }
      if (l.specificDates && l.specificDates.length > 0) {
        return l.specificDates.includes(todayStr);
      }
      return false;
    });
  }, [leaves, todayStr]);

  // Filtered leaves
  const filteredLeaves = useMemo(() => {
    return leaves.filter((l) => {
      if (selectedTypeFilter !== 'all' && l.leaveType !== selectedTypeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const codeMatch = String(l.workerCode).includes(q);
        const nameMatch = (l.workerName || '').toLowerCase().includes(q);
        const noteMatch = (l.note || '').toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && !noteMatch) return false;
      }
      return true;
    });
  }, [leaves, selectedTypeFilter, searchQuery]);

  // Calculate days difference for continuous dates
  const continuousDaysCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  }, [startDate, endDate]);

  const handleOpenAddModal = () => {
    setSelectedWorkerCode(workers.length > 0 ? workers[0].code : '');
    setLeaveType('excused_annual');
    setDateMode('continuous');
    setStartDate(todayStr);
    setEndDate(todayStr);
    setNewSpecificDate(todayStr);
    setSpecificDates([]);
    setLeaveNote('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleAddSpecificDate = () => {
    if (!newSpecificDate) return;
    if (specificDates.includes(newSpecificDate)) {
      setModalError('هذا التاريخ مضاف بالفعل.');
      return;
    }
    setSpecificDates((prev) => [...prev, newSpecificDate].sort());
    setModalError(null);
  };

  const handleRemoveSpecificDate = (dateToRemove: string) => {
    setSpecificDates((prev) => prev.filter((d) => d !== dateToRemove));
  };

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerCode) {
      setModalError('يرجى اختيار العامل.');
      return;
    }
    const worker = workers.find((w) => Number(w.code) === Number(selectedWorkerCode));
    if (!worker) {
      setModalError('العامل المحدد غير موجود في قاعدة البيانات.');
      return;
    }

    if (dateMode === 'continuous') {
      if (!startDate || !endDate) {
        setModalError('يرجى تحديد تاريخ البداية والنهاية.');
        return;
      }
      if (startDate > endDate) {
        setModalError('تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية.');
        return;
      }
    } else {
      if (specificDates.length === 0) {
        setModalError('يرجى إضافة تاريخ يوم واحد على الأقل للأيام المتفرقة.');
        return;
      }
    }

    const newRecord: LeaveRecord = {
      id: `leave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workerCode: Number(worker.code),
      workerName: worker.name,
      leaveType,
      note: leaveNote.trim(),
      ...(dateMode === 'continuous'
        ? { startDate, endDate }
        : { specificDates: [...specificDates] }),
    };

    onAddLeave(newRecord);
    setIsModalOpen(false);
  };

  const handleAddHolidaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate) {
      setHolidayError('يرجى اختيار تاريخ العطلة.');
      return;
    }
    if (!holidayName.trim()) {
      setHolidayError('يرجى كتابة اسم أو مناسبة العطلة الرسمية.');
      return;
    }

    // Check if holiday date already exists
    if (officialHolidays.some((h) => h.date === holidayDate)) {
      setHolidayError('يوجد عطلة رسمية مسجلة بالفعل بهذا التاريخ.');
      return;
    }

    const newHoliday: OfficialHoliday = {
      id: `holiday-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: holidayDate,
      name: holidayName.trim(),
    };

    onAddOfficialHoliday(newHoliday);
    setHolidayName('');
    setHolidayError(null);
    setHolidayNotice(`تمت إضافة العطلة الرسمية (${newHoliday.name}) بنجاح.`);
    setTimeout(() => setHolidayNotice(null), 3500);
  };

  const getLeaveStatusBadge = (leave: LeaveRecord) => {
    let isActive = false;
    let isPast = false;
    let isUpcoming = false;

    if (leave.startDate && leave.endDate) {
      if (todayStr >= leave.startDate && todayStr <= leave.endDate) {
        isActive = true;
      } else if (todayStr > leave.endDate) {
        isPast = true;
      } else {
        isUpcoming = true;
      }
    } else if (leave.specificDates && leave.specificDates.length > 0) {
      if (leave.specificDates.includes(todayStr)) {
        isActive = true;
      } else if (leave.specificDates.every((d) => d < todayStr)) {
        isPast = true;
      } else {
        isUpcoming = true;
      }
    }

    if (isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 animate-pulse">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          سارية اليوم
        </span>
      );
    }
    if (isUpcoming) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-950/60 text-blue-300 border border-blue-800/50">
          <Clock className="w-3 h-3 text-blue-400" />
          قادمة
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-slate-400 bg-slate-950 border border-slate-800">
        منتهية
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
            <Palmtree className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>نظام إدارة الإجازات والعطلات الرسمية</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              تسجيل الإجازات الاعتيادية والعارضة والمرضية والأذونات المعتمدة، وتحديد العطلات الرسمية السنوية للمصنع
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>تسجيل إجازة عامل</span>
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block">إجمالي سجلات الإجازات</span>
            <span className="text-2xl font-bold font-mono text-white mt-0.5 block">{leaves.length}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-emerald-400 block font-medium">إجازات سارية اليوم</span>
            <span className="text-2xl font-bold font-mono text-emerald-300 mt-0.5 block">{activeLeavesToday.length}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-amber-400 block font-medium">العطلات الرسمية المسجلة</span>
            <span className="text-2xl font-bold font-mono text-amber-300 mt-0.5 block">{officialHolidays.length}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Building2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Leave Records Table Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-white">سجل إجازات العاملين</h3>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {filteredLeaves.length} سجل
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Filter by Type */}
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 outline-none cursor-pointer"
            >
              <option value="all">جميع أنواع الإجازات</option>
              <option value="excused_annual">اعتيادية / سنوية</option>
              <option value="excused_casual">عارضة</option>
              <option value="medical">مرضية</option>
              <option value="official_pass">إذن رسمي</option>
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
              <input
                type="text"
                placeholder="بحث بكود أو اسم العامل أو الملاحظة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg pr-8 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none w-56"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-slate-800/80 rounded-lg">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 select-none">
              <tr>
                <th className="py-2.5 px-3 font-semibold text-center w-12">م</th>
                <th className="py-2.5 px-3 font-semibold w-24">كود العامل</th>
                <th className="py-2.5 px-3 font-semibold">اسم العامل</th>
                <th className="py-2.5 px-3 font-semibold">نوع الإجازة</th>
                <th className="py-2.5 px-3 font-semibold">النطاق والمدة</th>
                <th className="py-2.5 px-3 font-semibold">الملاحظات</th>
                <th className="py-2.5 px-3 font-semibold text-center w-28">الحالة</th>
                <th className="py-2.5 px-3 font-semibold text-center w-20">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredLeaves.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                    {leaves.length === 0 
                      ? 'لا توجد إجازات مسجلة بعد. اضغط على "تسجيل إجازة عامل" لإضافة أول إجازة.' 
                      : 'لا توجد إجازات تطابق معايير البحث والفلترة.'}
                  </td>
                </tr>
              ) : (
                filteredLeaves.map((l, index) => {
                  const typeMeta = LEAVE_TYPE_MAP[l.leaveType] || LEAVE_TYPE_MAP.excused_annual;
                  return (
                    <tr key={l.id} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{index + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-cyan-300">{l.workerCode}</td>
                      <td className="py-2.5 px-3 font-medium text-white">{l.workerName}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${typeMeta.bg} ${typeMeta.text} ${typeMeta.border}`}>
                          {typeMeta.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {l.startDate && l.endDate ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-slate-200 text-[11px] flex items-center gap-1.5">
                              <span>{l.startDate}</span>
                              <span className="text-slate-500">←</span>
                              <span>{l.endDate}</span>
                            </div>
                            <span className="text-[10px] text-blue-400 font-medium">
                              فترة متصلة ({Math.round((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} يوم)
                            </span>
                          </div>
                        ) : l.specificDates && l.specificDates.length > 0 ? (
                          <div className="space-y-1">
                            <span className="text-[10px] text-amber-400 font-medium block">
                              أيام متفرقة ({l.specificDates.length} يوم):
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {l.specificDates.map((d) => (
                                <span key={d} className="px-1.5 py-0.2 bg-slate-950 text-slate-300 border border-slate-800 rounded font-mono text-[10px]">
                                  {d}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 text-xs">
                        {l.note || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {getLeaveStatusBadge(l)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => setDeleteConfirmId(l.id)}
                          className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors cursor-pointer"
                          title="حذف الإجازة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Official Holidays Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">العطلات والإجازات الرسمية للمصنع</h3>
              <p className="text-[11px] text-slate-400">
                تسجيل العطلات الرسمية المعتمدة (مثل الأعياد والمناسبات القومية) لتُحتسب تلقائياً في التقارير
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800/40">
            {officialHolidays.length} عطلة مسجلة
          </span>
        </div>

        {holidayNotice && (
          <div className="bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 p-2.5 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{holidayNotice}</span>
          </div>
        )}

        {/* Add Official Holiday Inline Form */}
        <form onSubmit={handleAddHolidaySubmit} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>إضافة عطلة رسمية جديدة</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">تاريخ العطلة</label>
              <CustomDatePicker
                value={holidayDate}
                onChange={setHolidayDate}
                placeholder="تاريخ العطلة..."
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">اسم أو مناسبة العطلة</label>
              <input
                type="text"
                placeholder="مثال: عيد العمال، عيد الأضحى، ثورة 23 يوليو..."
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>حفظ العطلة الرسمية</span>
              </button>
            </div>
          </div>

          {holidayError && (
            <div className="text-rose-400 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{holidayError}</span>
            </div>
          )}
        </form>

        {/* Official Holidays Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 select-none">
              <tr>
                <th className="py-2 px-3 font-semibold text-center w-12">م</th>
                <th className="py-2 px-3 font-semibold w-36">التاريخ</th>
                <th className="py-2 px-3 font-semibold w-28">اليوم</th>
                <th className="py-2 px-3 font-semibold">اسم العطلة والمناسبة</th>
                <th className="py-2 px-3 font-semibold text-center w-20">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {officialHolidays.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                    لا توجد عطلات رسمية مسجلة بعد.
                  </td>
                </tr>
              ) : (
                officialHolidays
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((h, idx) => {
                    const dow = new Date(`${h.date}T12:00:00`).getDay();
                    const dayName = ARABIC_WEEKDAYS[dow] || '';
                    return (
                      <tr key={h.id} className="hover:bg-slate-850/60 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-white">{h.date}</td>
                        <td className="py-2 px-3 text-slate-300 font-medium">{dayName}</td>
                        <td className="py-2 px-3 font-bold text-emerald-300">{h.name}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => onDeleteOfficialHoliday(h.id)}
                            className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="حذف العطلة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Leave Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-4 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold text-white">تأكيد حذف سجل الإجازة</h4>
            </div>
            <p className="text-xs text-slate-300">
              هل أنت متأكد من رغبتك في حذف هذا السجل؟ سيتم إلغاء تأثير هذه الإجازة على تقارير الغياب وسجلات البصمة فوراً.
            </p>
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteLeave(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Leave Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl my-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                  <Palmtree className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">تسجيل إجازة عامل</h3>
                  <p className="text-[11px] text-slate-400">إدخال فترة الإجازة ونوعها لتوثيق الغياب المعتمد</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="space-y-4 text-xs">
              {/* 1. Worker Selector */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">اختيار العامل</label>
                <select
                  value={selectedWorkerCode}
                  onChange={(e) => setSelectedWorkerCode(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none cursor-pointer"
                  required
                >
                  <option value="" disabled>-- اختر العامل --</option>
                  {workers
                    .filter((w) => w.isActive)
                    .sort((a, b) => a.code - b.code)
                    .map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name} ({w.department || 'عام'})
                      </option>
                    ))}
                </select>
              </div>

              {/* 2. Leave Type */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">نوع الإجازة</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveRecord['leaveType'])}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none cursor-pointer"
                >
                  <option value="excused_annual">إجازة اعتيادية / سنوية</option>
                  <option value="excused_casual">إجازة عارضة</option>
                  <option value="medical">إجازة مرضية</option>
                  <option value="official_pass">إذن رسمي معتمد</option>
                </select>
              </div>

              {/* 3. Mode Toggle */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">طريقة تحديد المواعيد</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDateMode('continuous')}
                    className={`py-1.5 px-3 rounded text-center font-medium transition-colors cursor-pointer ${
                      dateMode === 'continuous'
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    فترة متصلة (من - إلى)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateMode('specific')}
                    className={`py-1.5 px-3 rounded text-center font-medium transition-colors cursor-pointer ${
                      dateMode === 'specific'
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    أيام متفرقة
                  </button>
                </div>
              </div>

              {/* 4. Date Inputs based on mode */}
              {dateMode === 'continuous' ? (
                <div className="space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">تاريخ البداية</label>
                      <CustomDatePicker
                        value={startDate}
                        onChange={setStartDate}
                        placeholder="بداية الإجازة..."
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">تاريخ النهاية</label>
                      <CustomDatePicker
                        value={endDate}
                        onChange={setEndDate}
                        placeholder="نهاية الإجازة..."
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-400">إجمالي مدة الإجازة:</span>
                    <span className="font-bold text-cyan-300 font-mono">
                      {continuousDaysCount} {continuousDaysCount === 1 ? 'يوم' : 'أيام'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <label className="text-[11px] text-slate-400 block">إضافة يوم إلى قائمة الإجازة</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <CustomDatePicker
                        value={newSpecificDate}
                        onChange={setNewSpecificDate}
                        placeholder="اختر التاريخ لإضافته..."
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddSpecificDate}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors"
                    >
                      + إضافة اليوم
                    </button>
                  </div>

                  {/* Selected Days Chips */}
                  <div className="pt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>الأيام المحددة:</span>
                      <span className="font-mono text-cyan-300 font-bold">{specificDates.length} يوم</span>
                    </div>

                    {specificDates.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic py-1">لم يتم إضافة أي أيام بعد.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-950 rounded border border-slate-800">
                        {specificDates.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 text-[11px] font-mono"
                          >
                            <span>{d}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSpecificDate(d)}
                              className="text-blue-400 hover:text-white cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. Notes */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">ملاحظات / سبب الإجازة (اختياري)</label>
                <textarea
                  value={leaveNote}
                  onChange={(e) => setLeaveNote(e.target.value)}
                  placeholder="مثال: إجازة اعتيادية معتمدة من مدير المصنع، تقرير طبي، إذن سفر..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white placeholder-slate-500 focus:border-blue-500 outline-none"
                />
              </div>

              {modalError && (
                <div className="bg-rose-950/40 border border-rose-800 text-rose-300 p-2.5 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Form Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-md cursor-pointer"
                >
                  حفظ وتسجيل الإجازة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
