import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  ClockAlert, 
  DoorOpen, 
  Timer, 
  FileSpreadsheet, 
  Calendar, 
  ArrowLeftRight, 
  ShieldCheck, 
  Building2,
  Search,
  Sparkles,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Worker, AttendanceRecord, GatePass, ShiftRule, FactorySettings } from '../types';
import { calculateDailyPerformance, exportToExcel, formatHoursAndMinutes } from '../utils/attendanceEngine';

interface DailySummaryProps {
  workers: Worker[];
  processedAttendanceRecords: AttendanceRecord[];
  gatePasses: GatePass[];
  shifts?: ShiftRule[];
  settings?: FactorySettings;
}

export const DailySummary: React.FC<DailySummaryProps> = ({
  workers,
  processedAttendanceRecords,
  gatePasses,
  shifts = [],
  settings,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent' | 'late' | 'pass'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quick Date Setters
  const handleSetToday = () => setSelectedDate(todayStr);
  const handleSetYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };
  const handleSetDayBefore = () => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  // Dynamic KPI Calculation (Task 5: Reactive to processed records and gate passes)
  const summaryData = useMemo(() => {
    const activeWorkers = workers.filter((w) => w.isActive);
    const workerMap = new Map<number, Worker>();
    activeWorkers.forEach((w) => workerMap.set(w.code, w));

    // Records for the chosen date
    const dayRecords = processedAttendanceRecords.filter(
      (r) => !r.isDuplicateIgnored && r.displayDate === selectedDate
    );

    // Gate passes for the chosen date
    const dayPasses = gatePasses.filter(
      (gp) => gp.date === selectedDate
    );
    const passWorkerCodes = new Set(dayPasses.map((p) => p.workerCode));

    // Group punches by worker
    const punchesByWorker = new Map<number, AttendanceRecord[]>();
    for (const r of dayRecords) {
      let list = punchesByWorker.get(r.workerCode);
      if (!list) {
        list = [];
        punchesByWorker.set(r.workerCode, list);
      }
      list.push(r);
    }

    const isFriday = new Date(`${selectedDate}T12:00:00`).getDay() === 5;
    const defaultShift = shifts.find((s) => s.id === 'standard') || shifts[0] || {
      id: 'standard',
      name: 'الوردية الصباحية الأساسية',
      description: 'الوردية القياسية للعمال المصريين',
      startTime: '08:00',
      endTime: '16:30',
      breakStart: '12:30',
      breakDurationMinutes: 30,
      earlyArrivalWindowStart: '06:30',
      generalGraceMinutes: 15,
      overnightEndThreshold: '07:00',
      fridayMultiplier: 2.0,
    };

    let presentCount = 0;
    let lateCount = 0;
    let totalLateMinutes = 0;
    let earlyCount = 0;
    let totalEarlyMinutes = 0;
    let totalOvertimeHours = 0;

    const workerPerformanceList = activeWorkers.map((worker) => {
      const workerShift = shifts.find((s) => s.id === worker.shiftId) || defaultShift;
      const workerPunches = punchesByWorker.get(worker.code) || [];

      // Find in and out punches
      const inPunch = workerPunches.find((r) => r.resolvedState === 'IN') || (workerPunches.length > 0 && !workerPunches[0].isDuplicateIgnored ? workerPunches[0] : undefined);
      const outPunch = workerPunches.slice().reverse().find((r) => r.resolvedState === 'OUT' && r.id !== inPunch?.id);

      const hasPass = passWorkerCodes.has(worker.code);
      const passInfo = dayPasses.find((p) => p.workerCode === worker.code);

      if (inPunch) {
        presentCount++;
        const perf = calculateDailyPerformance(
          worker,
          inPunch,
          outPunch,
          workerShift,
          isFriday,
          settings?.overtimeGraceMinutes ?? 30
        );

        if (perf.lateMinutes > 0) {
          lateCount++;
          totalLateMinutes += perf.lateMinutes;
        }

        if (perf.isEarlyDeparture && perf.earlyDepartureMinutes > 0) {
          earlyCount++;
          totalEarlyMinutes += perf.earlyDepartureMinutes;
        }

        if (perf.overtimeHours > 0) {
          totalOvertimeHours += perf.overtimeHours;
        }

        return {
          worker,
          isPresent: true,
          status: perf.status,
          inTime: inPunch.displayTime || '—',
          outTime: outPunch ? outPunch.displayTime : '—',
          lateMinutes: perf.lateMinutes,
          earlyMinutes: perf.earlyDepartureMinutes,
          overtimeHours: perf.overtimeHours,
          workHours: perf.workHours,
          hasPass,
          passNote: passInfo ? `${passInfo.type === 'temporary' ? 'تصريح مؤقت' : 'إذن خروج'} (${passInfo.exitTime} - ${passInfo.returnTime || 'نهاية اليوم'})` : '',
        };
      } else {
        return {
          worker,
          isPresent: false,
          status: 'غائب',
          inTime: '—',
          outTime: '—',
          lateMinutes: 0,
          earlyMinutes: 0,
          overtimeHours: 0,
          workHours: 0,
          hasPass,
          passNote: passInfo ? `تصريح مسجل (${passInfo.type})` : '',
        };
      }
    });

    const totalActive = activeWorkers.length;
    const absentCount = Math.max(0, totalActive - presentCount);
    const passCount = dayPasses.length;
    const attendanceRate = totalActive > 0 ? Math.round((presentCount / totalActive) * 100) : 0;

    return {
      totalActive,
      presentCount,
      absentCount,
      lateCount,
      totalLateMinutes,
      earlyCount,
      totalEarlyMinutes,
      totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
      passCount,
      attendanceRate,
      isFriday,
      workerPerformanceList,
    };
  }, [selectedDate, workers, processedAttendanceRecords, gatePasses, shifts, settings]);

  // Filtered workers list
  const filteredList = useMemo(() => {
    return summaryData.workerPerformanceList.filter((item) => {
      // Status Filter
      if (filterStatus === 'present' && !item.isPresent) return false;
      if (filterStatus === 'absent' && item.isPresent) return false;
      if (filterStatus === 'late' && item.lateMinutes <= 0) return false;
      if (filterStatus === 'pass' && !item.hasPass) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const codeMatch = String(item.worker.code).includes(q);
        const nameMatch = item.worker.name.toLowerCase().includes(q);
        const deptMatch = (item.worker.department || '').toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && !deptMatch) return false;
      }

      return true;
    });
  }, [summaryData, filterStatus, searchQuery]);

  // Export Day's Performance to Excel
  const handleExportExcel = () => {
    const rows = summaryData.workerPerformanceList.map((item) => ({
      'كود العامل': item.worker.code,
      'اسم العامل': item.worker.name,
      'القسم': item.worker.department || 'عام',
      'تاريخ اليوم': selectedDate,
      'الحالة': item.status,
      'وقت الحضور': item.inTime,
      'وقت الانصراف': item.outTime,
      'دقائق التأخير': item.lateMinutes,
      'انصراف مبكر (د)': item.earlyMinutes,
      'ساعات الإضافي': item.overtimeHours,
      'ساعات العمل المحسوبة': item.workHours,
      'ملاحظات التصريح': item.passNote || '—',
    }));

    exportToExcel(
      rows,
      `ملخص_${selectedDate}`,
      `تقرير_ملخص_اليوم_${selectedDate}`,
      `تقرير ملخص الأداء اليومي لمصنع - ${selectedDate}`
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header with Date Selection */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>لوحة ملخص اليوم التفاعلية (Daily Performance HUD)</span>
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 font-mono border border-blue-500/30">
              V 5.6.0
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            مؤشرات أداء المصنع، الحضور والغياب والتأخير والانصراف وساعات الإضافي ليوم محدد مع التحديث الفوري مع أي تعديل رجعي.
          </p>
        </div>

        {/* Date Selector Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-1">
            <Calendar className="w-4 h-4 text-emerald-400 mr-1" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-white font-mono focus:outline-hidden cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleSetToday}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                selectedDate === todayStr 
                  ? 'bg-blue-600 text-white font-bold' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              اليوم
            </button>
            <button
              onClick={handleSetYesterday}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition-colors cursor-pointer"
            >
              أمس
            </button>
            <button
              onClick={handleSetDayBefore}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition-colors cursor-pointer"
            >
              قبل أمس
            </button>
          </div>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs mr-2"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>تصدير إكسيل لليوم</span>
          </button>
        </div>
      </div>

      {/* Friday Notification Banner */}
      {summaryData.isFriday && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-lg p-3 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>يوم الجمعة (عطلة رسمية): يتم احتساب ساعات الحضور بمعدل مضاعف 2.0x (16 ساعة أساسي + إضافي مضاعف).</span>
          </div>
          <span className="font-mono font-bold text-amber-300 px-2 py-0.5 rounded bg-amber-500/20">الجمعة 2x</span>
        </div>
      )}

      {/* 7 Colorful High-Performance KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Active Workers (Blue) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between hover:border-blue-500/40 transition-colors shadow-sm">
          <div>
            <span className="text-slate-400 text-xs block font-medium">إجمالي العمالة النشطة</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-white font-mono">{summaryData.totalActive}</span>
              <span className="text-[11px] text-slate-400">عامل</span>
            </div>
            <span className="text-[10px] text-blue-400 block mt-0.5">القوة العاملة المعتمدة</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Present Workers (Green) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between hover:border-emerald-500/40 transition-colors shadow-sm">
          <div>
            <span className="text-slate-400 text-xs block font-medium">الحضور الفعلي</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-400 font-mono">{summaryData.presentCount}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold font-mono">
                {summaryData.attendanceRate}%
              </span>
            </div>
            <span className="text-[10px] text-emerald-400/80 block mt-0.5">بصموا حضور اليوم</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Absent Workers (Red) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between hover:border-rose-500/40 transition-colors shadow-sm">
          <div>
            <span className="text-slate-400 text-xs block font-medium">الغياب المسجل</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-rose-400 font-mono">{summaryData.absentCount}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold font-mono">
                {summaryData.totalActive > 0 ? Math.round((summaryData.absentCount / summaryData.totalActive) * 100) : 0}%
              </span>
            </div>
            <span className="text-[10px] text-rose-400/80 block mt-0.5">لم تسجل لهم أي بصمة</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <UserX className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Delayed Workers (Amber/Orange) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between hover:border-amber-500/40 transition-colors shadow-sm">
          <div>
            <span className="text-slate-400 text-xs block font-medium">المتأخرين بعد السماحية</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-amber-400 font-mono">{summaryData.lateCount}</span>
              <span className="text-[11px] text-amber-300 font-bold font-mono">
                ({summaryData.totalLateMinutes} د)
              </span>
            </div>
            <span className="text-[10px] text-amber-400/80 block mt-0.5">إجمالي دقائق التأخير الصباحي</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <ClockAlert className="w-5 h-5" />
          </div>
        </div>

        {/* Card 5: Early Departures (Yellow/Orange) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between hover:border-yellow-500/40 transition-colors shadow-sm">
          <div>
            <span className="text-slate-400 text-xs block font-medium">الانصراف المبكر</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-yellow-400 font-mono">{summaryData.earlyCount}</span>
              <span className="text-[11px] text-yellow-300 font-bold font-mono">
                ({summaryData.totalEarlyMinutes} د)
              </span>
            </div>
            <span className="text-[10px] text-yellow-400/80 block mt-0.5">خرجوا قبل موعد نهاية الوردية</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400">
            <DoorOpen className="w-5 h-5" />
          </div>
        </div>

        {/* Card 6: Total Overtime Hours (Purple) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between hover:border-purple-500/40 transition-colors shadow-sm">
          <div>
            <span className="text-slate-400 text-xs block font-medium">إجمالي ساعات الإضافي</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-purple-400 font-mono">{summaryData.totalOvertimeHours}</span>
              <span className="text-[11px] text-purple-300">ساعة</span>
            </div>
            <span className="text-[10px] text-purple-400/80 block mt-0.5">
              {formatHoursAndMinutes(summaryData.totalOvertimeHours)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Timer className="w-5 h-5" />
          </div>
        </div>

        {/* Card 7: Out with Gate Pass (Cyan/Sky) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between hover:border-cyan-500/40 transition-colors shadow-sm sm:col-span-2 md:col-span-1 lg:col-span-2">
          <div>
            <span className="text-slate-400 text-xs block font-medium">تصاريح وأذونات اليوم</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-cyan-400 font-mono">{summaryData.passCount}</span>
              <span className="text-[11px] text-slate-400">تصريح رسمي معتمد</span>
            </div>
            <span className="text-[10px] text-cyan-400/80 block mt-0.5">خروج مؤخر/شخصي/رسمي موثق بالإدارة</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Roster Controls & Filtering */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `الكل (${summaryData.totalActive})` },
              { id: 'present', label: `حاضر (${summaryData.presentCount})` },
              { id: 'absent', label: `غائب (${summaryData.absentCount})` },
              { id: 'late', label: `متأخر (${summaryData.lateCount})` },
              { id: 'pass', label: `بتصريح (${summaryData.passCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filterStatus === tab.id
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="بحث بالاسم، الكود، أو القسم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pr-9 pl-3 py-1.5 text-xs text-white focus:outline-hidden"
            />
          </div>
        </div>

        {/* Detailed Performance Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                <th className="py-2.5 px-3 font-semibold">كود العامل</th>
                <th className="py-2.5 px-3 font-semibold">اسم العامل</th>
                <th className="py-2.5 px-3 font-semibold">القسم</th>
                <th className="py-2.5 px-3 font-semibold text-center">حالة اليوم</th>
                <th className="py-2.5 px-3 font-semibold text-center text-emerald-400">حضور</th>
                <th className="py-2.5 px-3 font-semibold text-center text-blue-400">انصراف</th>
                <th className="py-2.5 px-3 font-semibold text-center">تأخير</th>
                <th className="py-2.5 px-3 font-semibold text-center">إضافي</th>
                <th className="py-2.5 px-3 font-semibold">التصاريح والملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredList.length > 0 ? (
                filteredList.map((item) => (
                  <tr key={item.worker.code} className="hover:bg-slate-850 transition-colors">
                    <td className="py-2 px-3 text-slate-300 font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 text-[11px]">
                        {item.worker.code}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-white font-sans font-medium">
                      {item.worker.name}
                    </td>
                    <td className="py-2 px-3 text-slate-300 font-sans text-[11px]">
                      {item.worker.department || 'عام'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] font-sans font-bold px-2 py-0.5 rounded inline-block ${
                        item.isPresent
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={item.inTime !== '—' ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                        {item.inTime}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={item.outTime !== '—' ? 'text-blue-400 font-bold' : 'text-slate-600'}>
                        {item.outTime}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {item.lateMinutes > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold font-sans">
                          +{item.lateMinutes} د
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {item.overtimeHours > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold font-sans">
                          +{item.overtimeHours} س
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-sans text-[11px]">
                      {item.passNote ? (
                        <span className="text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                          {item.passNote}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 text-xs font-sans">
                    لا توجد بيانات مطابقة لليوم المحدد والفلاتر المختارة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
