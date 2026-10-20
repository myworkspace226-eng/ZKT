import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Users, 
  UserCheck, 
  UserX, 
  Calendar, 
  Clock, 
  Timer,
  AlertTriangle,
  CheckCircle2,
  Filter,
  FileText,
  BadgePercent,
  Search
} from 'lucide-react';
import { Worker, AttendanceRecord, ShiftRule, AbsenceCategory, GatePass } from '../types';
import { exportToExcel } from '../utils/attendanceEngine';

interface ReportsCenterProps {
  workers: Worker[];
  attendanceRecords: AttendanceRecord[];
  shifts: ShiftRule[];
  gatePasses?: GatePass[];
}

export const ReportsCenter: React.FC<ReportsCenterProps> = ({
  workers,
  attendanceRecords,
  shifts,
  gatePasses = [],
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'daily_manager' | 'absent' | 'late' | 'overtime' | 'timesheet'>('daily_manager');
  
  // Date states
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstDayOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(firstDayOfMonthStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [quickPreset, setQuickPreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');

  // Override absence classification state for workers on the selected day
  // Maps workerCode -> { category: AbsenceCategory, note: string }
  const [absenceOverrides, setAbsenceOverrides] = useState<Record<number, { category: AbsenceCategory; note: string }>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleSetPreset = (preset: 'today' | 'week' | 'month' | 'custom') => {
    setQuickPreset(preset);
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().slice(0, 10);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      setStartDate(oneWeekAgo);
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      setStartDate(first);
      setEndDate(now.toISOString().slice(0, 10));
    }
  };

  // -------------------------------------------------------------
  // DAILY ABSENCE REPORT FOR FACTORY MANAGER (Automated & Smart)
  // -------------------------------------------------------------
  const activeWorkers = useMemo(() => workers.filter((w) => w.isActive), [workers]);
  const factoryStrength = activeWorkers.length;

  // Records for selected day
  const recordsOnSelectedDay = useMemo(() => {
    return attendanceRecords.filter((r) => r.timestamp.slice(0, 10) === selectedDay && !r.isDuplicateIgnored);
  }, [attendanceRecords, selectedDay]);

  // Set of worker codes who checked in on selectedDay
  const presentWorkerCodes = useMemo(() => {
    return new Set(
      recordsOnSelectedDay
        .filter((r) => r.resolvedState === 'IN')
        .map((r) => r.workerCode)
    );
  }, [recordsOnSelectedDay]);

  // List of present workers
  const presentWorkersList = useMemo(() => {
    return activeWorkers
      .filter((w) => presentWorkerCodes.has(w.code))
      .map((w) => {
        const punch = recordsOnSelectedDay.find((r) => r.workerCode === w.code && r.resolvedState === 'IN');
        return {
          ...w,
          checkInTime: punch ? punch.displayTime : '08:00',
          deviceName: punch ? punch.deviceName : 'ماكينة البصمة',
          lateMinutes: punch?.lateMinutes || 0,
        };
      });
  }, [activeWorkers, presentWorkerCodes, recordsOnSelectedDay]);

  // List of absent workers (Active workers who did not punch IN)
  const absentWorkersList = useMemo(() => {
    return activeWorkers
      .filter((w) => !presentWorkerCodes.has(w.code))
      .map((w) => {
        // Check if there is an override in memory
        const override = absenceOverrides[w.code];
        // Check if there is a gate pass on this date
        const hasGatePass = gatePasses.find((g) => g.workerCode === w.code && g.date === selectedDay);

        let defaultCat: AbsenceCategory = 'unexcused';
        let defaultNote = '';

        if (override) {
          defaultCat = override.category;
          defaultNote = override.note;
        } else if (hasGatePass) {
          defaultCat = 'official_pass';
          defaultNote = `تصريح: ${hasGatePass.reasonText}`;
        }

        return {
          ...w,
          absenceCategory: defaultCat,
          note: defaultNote,
        };
      });
  }, [activeWorkers, presentWorkerCodes, absenceOverrides, gatePasses, selectedDay]);

  // Update a worker's absence classification
  const handleUpdateWorkerAbsence = (workerCode: number, category: AbsenceCategory, note?: string) => {
    setAbsenceOverrides((prev) => ({
      ...prev,
      [workerCode]: {
        category,
        note: note !== undefined ? note : (prev[workerCode]?.note || ''),
      },
    }));
  };

  // Update a worker's note
  const handleUpdateWorkerNote = (workerCode: number, note: string) => {
    setAbsenceOverrides((prev) => ({
      ...prev,
      [workerCode]: {
        category: prev[workerCode]?.category || 'unexcused',
        note,
      },
    }));
  };

  // Counters & Percentages
  const presentCount = presentWorkersList.length;
  const absentCount = absentWorkersList.length;
  const presentPercent = factoryStrength > 0 ? ((presentCount / factoryStrength) * 100).toFixed(1) : '0';
  const absentPercent = factoryStrength > 0 ? ((absentCount / factoryStrength) * 100).toFixed(1) : '0';

  const categoryBreakdown = useMemo(() => {
    const counts: Record<AbsenceCategory, number> = {
      unexcused: 0,
      excused_casual: 0,
      excused_annual: 0,
      official_pass: 0,
      medical: 0,
    };

    absentWorkersList.forEach((w) => {
      counts[w.absenceCategory] = (counts[w.absenceCategory] || 0) + 1;
    });

    return {
      unexcused: {
        count: counts.unexcused,
        pct: factoryStrength > 0 ? ((counts.unexcused / factoryStrength) * 100).toFixed(1) : '0',
      },
      excused_casual: {
        count: counts.excused_casual,
        pct: factoryStrength > 0 ? ((counts.excused_casual / factoryStrength) * 100).toFixed(1) : '0',
      },
      excused_annual: {
        count: counts.excused_annual,
        pct: factoryStrength > 0 ? ((counts.excused_annual / factoryStrength) * 100).toFixed(1) : '0',
      },
      official_pass: {
        count: counts.official_pass,
        pct: factoryStrength > 0 ? ((counts.official_pass / factoryStrength) * 100).toFixed(1) : '0',
      },
      medical: {
        count: counts.medical,
        pct: factoryStrength > 0 ? ((counts.medical / factoryStrength) * 100).toFixed(1) : '0',
      },
    };
  }, [absentWorkersList, factoryStrength]);

  // Export Daily Manager Absence Report
  const handleExportManagerReport = () => {
    const categoryLabels: Record<AbsenceCategory, string> = {
      unexcused: 'بدون إذن',
      excused_casual: 'إجازة عارضة',
      excused_annual: 'إجازة اعتيادية',
      official_pass: 'بتصريح / إذن معتمد',
      medical: 'إجازة مرضي',
    };

    // Summary Rows at the top
    const summaryRows = [
      { 'كود العامل': '---', 'الاسم': `تقرير الغياب اليومي - تاريخ: ${selectedDay}`, 'القسم': `إجمالي قوة المصنع: ${factoryStrength} عامل`, 'خط الإنتاج': `الحضور: ${presentCount} (${presentPercent}%)`, 'نوع الغياب': `إجمالي الغياب: ${absentCount} (${absentPercent}%)`, 'الملاحظات': 'المعتمد: إدارة المصنع' },
      { 'كود العامل': '---', 'الاسم': `غياب بدون إذن: ${categoryBreakdown.unexcused.count} (${categoryBreakdown.unexcused.pct}%)`, 'القسم': `عارضة: ${categoryBreakdown.excused_casual.count} (${categoryBreakdown.excused_casual.pct}%)`, 'خط الإنتاج': `اعتيادي: ${categoryBreakdown.excused_annual.count} (${categoryBreakdown.excused_annual.pct}%)`, 'نوع الغياب': `مرضي: ${categoryBreakdown.medical.count} (${categoryBreakdown.medical.pct}%)`, 'الملاحظات': `بتصريح: ${categoryBreakdown.official_pass.count} (${categoryBreakdown.official_pass.pct}%)` },
      { 'كود العامل': '', 'الاسم': '', 'القسم': '', 'خط الإنتاج': '', 'نوع الغياب': '', 'الملاحظات': '' },
    ];

    const detailRows = absentWorkersList.map((w, idx) => ({
      'كود العامل': w.code,
      'الاسم': w.name,
      'القسم': w.department,
      'خط الإنتاج': w.line || '-',
      'الوظيفة': w.jobTitle,
      'نوع الغياب': categoryLabels[w.absenceCategory],
      'الملاحظات': w.note || '-',
    }));

    exportToExcel([...summaryRows, ...detailRows], 'تقرير_الغياب_اليومي', `تقرير_غياب_المصنع_${selectedDay}`);
  };

  // -------------------------------------------------------------
  // STATS FOR DATE RANGE (Late / Overtime / Master)
  // -------------------------------------------------------------
  const recordsInDateRange = useMemo(() => {
    return attendanceRecords.filter((r) => {
      const recordDate = r.timestamp.slice(0, 10);
      return recordDate >= startDate && recordDate <= endDate;
    });
  }, [attendanceRecords, startDate, endDate]);

  const dynamicLateStats = useMemo(() => {
    const lateByWorker: Record<number, { count: number; totalMinutes: number }> = {};
    recordsInDateRange.forEach((r) => {
      if ((r.lateMinutes || 0) > 0 && !r.isDuplicateIgnored) {
        if (!lateByWorker[r.workerCode]) {
          lateByWorker[r.workerCode] = { count: 0, totalMinutes: 0 };
        }
        lateByWorker[r.workerCode].count += 1;
        lateByWorker[r.workerCode].totalMinutes += r.lateMinutes || 0;
      }
    });

    return Object.keys(lateByWorker).map((codeStr) => {
      const code = parseInt(codeStr, 10);
      const worker = workers.find((w) => w.code === code);
      const stat = lateByWorker[code];
      const avg = stat.count > 0 ? Math.round(stat.totalMinutes / stat.count) : 0;
      const customGrace = worker?.customGraceMinutes || 0;
      return {
        code,
        name: worker ? worker.name : `عامل كود ${code}`,
        department: worker ? worker.department : 'عام',
        lateDaysCount: stat.count,
        totalLateMinutes: stat.totalMinutes,
        avgMinutesPerDay: avg,
        customGrace: customGrace > 0 ? `سماحية ${customGrace}د` : 'سماحية عامة',
      };
    }).sort((a, b) => b.totalLateMinutes - a.totalLateMinutes);
  }, [recordsInDateRange, workers]);

  const dynamicOvertimeStats = useMemo(() => {
    const otByWorker: Record<number, { regular: number; overnight: number; total: number }> = {};
    recordsInDateRange.forEach((r) => {
      if ((r.overtimeHours || 0) > 0 && !r.isDuplicateIgnored) {
        if (!otByWorker[r.workerCode]) {
          otByWorker[r.workerCode] = { regular: 0, overnight: 0, total: 0 };
        }
        otByWorker[r.workerCode].total += r.overtimeHours || 0;
        if (r.isOvertime) {
          otByWorker[r.workerCode].overnight += r.overtimeHours || 0;
        } else {
          otByWorker[r.workerCode].regular += r.overtimeHours || 0;
        }
      }
    });

    return Object.keys(otByWorker).map((codeStr) => {
      const code = parseInt(codeStr, 10);
      const worker = workers.find((w) => w.code === code);
      const stat = otByWorker[code];
      const rate = worker?.hourlyRate || 35;
      return {
        code,
        name: worker ? worker.name : `عامل كود ${code}`,
        department: worker ? worker.department : 'عام',
        line: worker ? worker.line : '-',
        regularOtHours: Number(stat.regular.toFixed(1)),
        overnightOtHours: Number(stat.overnight.toFixed(1)),
        totalOtHours: Number(stat.total.toFixed(1)),
        hourlyRate: rate,
        totalEstimatedEgp: Math.round(stat.total * rate * 1.5),
      };
    }).sort((a, b) => b.totalOtHours - a.totalOtHours);
  }, [recordsInDateRange, workers]);

  const handleExportCurrentTab = () => {
    if (activeReportTab === 'daily_manager') {
      handleExportManagerReport();
    } else if (activeReportTab === 'late' && dynamicLateStats.length > 0) {
      const data = dynamicLateStats.map((item) => ({
        'كود العامل': item.code,
        'اسم العامل': item.name,
        'القسم': item.department,
        'أيام التأخير': item.lateDaysCount,
        'إجمالي دقائق التأخير': item.totalLateMinutes,
        'متوسط التأخير اليومي': `${item.avgMinutesPerDay} دقيقة`,
      }));
      exportToExcel(data, 'الأكثر_تأخيرا', `تقرير_التأخير_${startDate}_إلى_${endDate}`);
    } else if (activeReportTab === 'overtime' && dynamicOvertimeStats.length > 0) {
      const data = dynamicOvertimeStats.map((item) => ({
        'كود العامل': item.code,
        'اسم العامل': item.name,
        'القسم': item.department,
        'إضافي وردية': `${item.regularOtHours} س`,
        'إضافي سهر ومبيت': `${item.overnightOtHours} س`,
        'إجمالي ساعات الأوفر تايم': `${item.totalOtHours} س`,
        'المستحق المالي التقديري': `${item.totalEstimatedEgp} ج.م`,
      }));
      exportToExcel(data, 'الساعات_الإضافية', `تقرير_الإضافي_${startDate}_إلى_${endDate}`);
    } else {
      const data = workers.map((w) => ({
        'كود العامل': w.code,
        'الاسم': w.name,
        'القسم': w.department,
        'الوظيفة': w.jobTitle,
        'الجنسية': w.nationality,
        'الحالة': w.isActive ? 'نشط' : 'مجمد',
      }));
      exportToExcel(data, 'كشف_العاملين', `كشف_العاملين_${startDate}_إلى_${endDate}`);
    }
  };

  // Filtered absent list by search query
  const filteredAbsentList = absentWorkersList.filter((w) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      w.code.toString().includes(q) ||
      w.department.toLowerCase().includes(q) ||
      w.line.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Top Header & Date Selection */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="text-sm font-bold text-white">مركز التقارير والتحليلات</h2>
            <p className="text-[11px] text-slate-400">تقارير الغياب اليومي، التأخيرات، ونسب الحضور</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {activeReportTab === 'daily_manager' ? (
            /* Day selector specifically for Daily Manager Report */
            <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-300 font-medium">تاريخ تقرير اليوم:</span>
              <input
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono cursor-pointer focus:border-blue-500"
              />
            </div>
          ) : (
            /* Date Range selector for range tabs */
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
                <button
                  onClick={() => handleSetPreset('today')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    quickPreset === 'today' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  اليوم
                </button>
                <button
                  onClick={() => handleSetPreset('week')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    quickPreset === 'week' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  أسبوع
                </button>
                <button
                  onClick={() => handleSetPreset('month')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    quickPreset === 'month' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  شهر
                </button>
              </div>

              <div className="flex items-center gap-1.5 font-mono">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setQuickPreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white cursor-pointer"
                />
                <span className="text-slate-400 text-[11px]">إلى:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setQuickPreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white cursor-pointer"
                />
              </div>
            </div>
          )}

          <button
            onClick={handleExportCurrentTab}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg">
        <button
          onClick={() => setActiveReportTab('daily_manager')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'daily_manager' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>تقرير الغياب اليومي</span>
        </button>

        <button
          onClick={() => setActiveReportTab('late')}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'late' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          الأكثر تأخيراً
        </button>

        <button
          onClick={() => setActiveReportTab('overtime')}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'overtime' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          الساعات الإضافية
        </button>

        <button
          onClick={() => setActiveReportTab('timesheet')}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'timesheet' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          كشف العاملين الشامل
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: DAILY MANAGER ABSENCE REPORT (Automated & Complete) */}
      {/* ------------------------------------------------------------- */}
      {activeReportTab === 'daily_manager' && (
        <div className="space-y-3.5">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {/* Total Strength */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-slate-400 text-[10px] block">قوة المصنع</span>
              <span className="text-base font-bold font-mono text-white">{factoryStrength} عامل</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">العمالة النشطة</span>
            </div>

            {/* Present */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-emerald-400 text-[10px] block font-medium">الحضور الفعلي</span>
              <span className="text-base font-bold font-mono text-emerald-400">{presentCount}</span>
              <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-mono">{presentPercent}% نسبة الحضور</span>
            </div>

            {/* Total Absent */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-rose-400 text-[10px] block font-medium">إجمالي الغياب</span>
              <span className="text-base font-bold font-mono text-rose-400">{absentCount}</span>
              <span className="text-[10px] text-rose-400/80 block mt-0.5 font-mono">{absentPercent}% نسبة الغياب</span>
            </div>

            {/* Unexcused */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-rose-300 text-[10px] block">بدون إذن</span>
              <span className="text-base font-bold font-mono text-rose-300">{categoryBreakdown.unexcused.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.unexcused.pct}% من القوة</span>
            </div>

            {/* Casual */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-amber-300 text-[10px] block">إجازة عارضة</span>
              <span className="text-base font-bold font-mono text-amber-300">{categoryBreakdown.excused_casual.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.excused_casual.pct}% من القوة</span>
            </div>

            {/* Annual */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-blue-300 text-[10px] block">إجازة اعتيادي</span>
              <span className="text-base font-bold font-mono text-blue-300">{categoryBreakdown.excused_annual.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.excused_annual.pct}% من القوة</span>
            </div>

            {/* Medical & Pass */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-purple-300 text-[10px] block">مرضي وتصاريح</span>
              <span className="text-base font-bold font-mono text-purple-300">
                {categoryBreakdown.medical.count + categoryBreakdown.official_pass.count}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                {(Number(categoryBreakdown.medical.pct) + Number(categoryBreakdown.official_pass.pct)).toFixed(1)}% من القوة
              </span>
            </div>
          </div>

          {/* Absence Table Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserX className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-white">
                كشف العمال الغائبين اليوم ({absentWorkersList.length} عامل)
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="بحث باسم العامل أو الكود أو الخط..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg pr-8 pl-3 py-1.5 focus:border-blue-500 w-56"
                />
              </div>
            </div>
          </div>

          {/* Absent Workers Detailed Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            {filteredAbsentList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                      <th className="py-2.5 px-3 font-semibold text-center">#</th>
                      <th className="py-2.5 px-3 font-semibold">كود</th>
                      <th className="py-2.5 px-3 font-semibold">اسم العامل</th>
                      <th className="py-2.5 px-3 font-semibold">القسم</th>
                      <th className="py-2.5 px-3 font-semibold">خط الإنتاج</th>
                      <th className="py-2.5 px-3 font-semibold">الوظيفة</th>
                      <th className="py-2.5 px-3 font-semibold">تصنيف الغياب</th>
                      <th className="py-2.5 px-3 font-semibold">ملاحظات وسبب الغياب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredAbsentList.map((worker, idx) => (
                      <tr key={worker.code} className="hover:bg-slate-850 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold font-mono text-white">{worker.code}</td>
                        <td className="py-2 px-3 font-medium text-white">{worker.name}</td>
                        <td className="py-2 px-3 text-slate-300">{worker.department}</td>
                        <td className="py-2 px-3 text-slate-400 font-mono">{worker.line || '-'}</td>
                        <td className="py-2 px-3 text-slate-400">{worker.jobTitle}</td>
                        
                        {/* Interactive Absence Type Selector */}
                        <td className="py-1.5 px-3">
                          <select
                            value={worker.absenceCategory}
                            onChange={(e) => handleUpdateWorkerAbsence(worker.code, e.target.value as AbsenceCategory)}
                            className={`border rounded px-2 py-1 text-xs font-medium cursor-pointer ${
                              worker.absenceCategory === 'unexcused'
                                ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                                : worker.absenceCategory === 'excused_casual'
                                ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                                : worker.absenceCategory === 'excused_annual'
                                ? 'bg-blue-950/60 border-blue-800 text-blue-300'
                                : worker.absenceCategory === 'medical'
                                ? 'bg-purple-950/60 border-purple-800 text-purple-300'
                                : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                            }`}
                          >
                            <option value="unexcused">بدون إذن</option>
                            <option value="excused_casual">إجازة عارضة</option>
                            <option value="excused_annual">إجازة اعتيادية</option>
                            <option value="official_pass">بتصريح / إذن معتمد</option>
                            <option value="medical">إجازة مرضي طويلة</option>
                          </select>
                        </td>

                        {/* Note Input */}
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            value={worker.note}
                            placeholder="أدخل ملاحظة أو هاتف..."
                            onChange={(e) => handleUpdateWorkerNote(worker.code, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-blue-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                لا يوجد غياب مرصود، جميع العمال حضروا في هذا التاريخ!
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: TOP LATE WORKERS */}
      {/* ------------------------------------------------------------- */}
      {activeReportTab === 'late' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          {dynamicLateStats.length > 0 ? (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold text-center">#</th>
                  <th className="py-2.5 px-3 font-semibold">كود</th>
                  <th className="py-2.5 px-3 font-semibold">الاسم</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold text-center">مرات التأخير</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إجمالي الدقائق</th>
                  <th className="py-2.5 px-3 font-semibold text-center">متوسط التأخير</th>
                  <th className="py-2.5 px-3 font-semibold text-center">السماحية المقررة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {dynamicLateStats.map((item, idx) => (
                  <tr key={item.code} className="hover:bg-slate-850 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-3 text-white font-bold">{item.code}</td>
                    <td className="py-2 px-3 font-sans font-medium text-white">{item.name}</td>
                    <td className="py-2 px-3 font-sans text-slate-400">{item.department}</td>
                    <td className="py-2 px-3 text-center text-amber-400 font-bold">{item.lateDaysCount}</td>
                    <td className="py-2 px-3 text-center text-white">{item.totalLateMinutes} دقيقة</td>
                    <td className="py-2 px-3 text-center text-slate-300">{item.avgMinutesPerDay} د/يوم</td>
                    <td className="py-2 px-3 text-center font-sans text-slate-400">{item.customGrace}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              لا توجد تأخيرات مسجلة في هذه الفترة ({startDate} إلى {endDate}).
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: OVERTIME REPORT */}
      {/* ------------------------------------------------------------- */}
      {activeReportTab === 'overtime' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          {dynamicOvertimeStats.length > 0 ? (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold">كود</th>
                  <th className="py-2.5 px-3 font-semibold">الاسم</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إضافي وردية</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إضافي سهر ومبيت</th>
                  <th className="py-2.5 px-3 font-semibold text-center">الإجمالي</th>
                  <th className="py-2.5 px-3 font-semibold text-center">المستحق التقديري</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {dynamicOvertimeStats.map((item) => (
                  <tr key={item.code} className="hover:bg-slate-850 transition-colors">
                    <td className="py-2 px-3 text-white font-bold">{item.code}</td>
                    <td className="py-2 px-3 font-sans font-medium text-white">{item.name}</td>
                    <td className="py-2 px-3 font-sans text-slate-400">{item.department}</td>
                    <td className="py-2 px-3 text-center text-slate-300">{item.regularOtHours} س</td>
                    <td className="py-2 px-3 text-center text-indigo-400 font-bold">{item.overnightOtHours} س</td>
                    <td className="py-2 px-3 text-center text-cyan-400 font-bold">{item.totalOtHours} س</td>
                    <td className="py-2 px-3 text-center text-emerald-400 font-bold">{item.totalEstimatedEgp} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              لا توجد ساعات إضافية مسجلة في هذه الفترة ({startDate} إلى {endDate}).
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: ALL WORKERS MASTER */}
      {/* ------------------------------------------------------------- */}
      {activeReportTab === 'timesheet' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                <th className="py-2.5 px-3 font-semibold">كود</th>
                <th className="py-2.5 px-3 font-semibold">الاسم</th>
                <th className="py-2.5 px-3 font-semibold">القسم</th>
                <th className="py-2.5 px-3 font-semibold">خط الإنتاج</th>
                <th className="py-2.5 px-3 font-semibold">الوظيفة</th>
                <th className="py-2.5 px-3 font-semibold text-center">الجنسية</th>
                <th className="py-2.5 px-3 font-semibold text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {workers.map((w) => (
                <tr key={w.code} className="hover:bg-slate-850 transition-colors">
                  <td className="py-2 px-3 font-mono font-bold text-white">{w.code}</td>
                  <td className="py-2 px-3 font-medium text-white">{w.name}</td>
                  <td className="py-2 px-3 text-slate-300">{w.department}</td>
                  <td className="py-2 px-3 font-mono text-slate-400">{w.line || '-'}</td>
                  <td className="py-2 px-3 text-slate-400">{w.jobTitle}</td>
                  <td className="py-2 px-3 text-center">{w.nationality}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      w.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {w.isActive ? 'نشط' : 'مجمد'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
