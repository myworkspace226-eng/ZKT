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
  Search, 
  Printer, 
  HardDrive, 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  ChevronDown, 
  DoorOpen, 
  Info, 
  Sparkles, 
  Layers, 
  User, 
  SlidersHorizontal 
} from 'lucide-react';
import { Worker, AttendanceRecord, ShiftRule, AbsenceCategory, GatePass, Device } from '../types';
import { exportToExcel, exportStyledExcel, calculateDailyPerformance } from '../utils/attendanceEngine';

interface ReportsCenterProps {
  workers: Worker[];
  attendanceRecords: AttendanceRecord[];
  shifts: ShiftRule[];
  gatePasses?: GatePass[];
  devices?: Device[];
  onSyncDevices?: () => void;
  isSyncing?: boolean;
}

export const ReportsCenter: React.FC<ReportsCenterProps> = ({
  workers,
  attendanceRecords,
  shifts,
  gatePasses = [],
  devices = [],
  onSyncDevices,
  isSyncing = false,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'daily_manager' | 'worker_dossier' | 'overtime' | 'late' | 'timesheet'>('daily_manager');
  
  // Date states
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstDayOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(firstDayOfMonthStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [quickPreset, setQuickPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom'>('month');

  // Override absence classification state for workers on the selected day
  const [absenceOverrides, setAbsenceOverrides] = useState<Record<number, { category: AbsenceCategory; note: string }>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --------------------------------------------------------------------------
  // POINT 12: WORKER DOSSIER STATE (الملف الشامل للعامل)
  // --------------------------------------------------------------------------
  const [dossierWorkerCode, setDossierWorkerCode] = useState<number>(workers.length > 0 ? workers[0].code : 0);
  const [dossierSearch, setDossierSearch] = useState<string>('');

  // --------------------------------------------------------------------------
  // POINT 13: ADVANCED OVERTIME CONTROLS & PARAMETERS
  // --------------------------------------------------------------------------
  const [otViewMode, setOtViewMode] = useState<'summary' | 'detailed'>('summary');
  const [otDepartureGrace, setOtDepartureGrace] = useState<number>(15); // 15 mins default (4:30 - 4:45 is normal departure)
  const [otMinThresholdMinutes, setOtMinThresholdMinutes] = useState<number>(30); // overtime starts if worked >= 30m
  const [otHourlyRate, setOtHourlyRate] = useState<number>(35); // EGP per hour default
  const [otDeviceFilter, setOtDeviceFilter] = useState<string>('all');
  const [otDepartmentFilter, setOtDepartmentFilter] = useState<string>('all');
  const [otNationalityFilter, setOtNationalityFilter] = useState<string>('all');

  const handleSetPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom') => {
    setQuickPreset(preset);
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().slice(0, 10);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'yesterday') {
      const y = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      setStartDate(oneWeekAgo);
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      setStartDate(first);
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'last_month') {
      const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      setStartDate(firstLastMonth);
      setEndDate(lastDayLastMonth);
    }
  };

  // --------------------------------------------------------------------------
  // TAB 1: DAILY ABSENCE REPORT FOR FACTORY MANAGER (Automated & Smart)
  // --------------------------------------------------------------------------
  const activeWorkers = useMemo(() => workers.filter((w) => w.isActive), [workers]);
  const factoryStrength = activeWorkers.length;

  const recordsOnSelectedDay = useMemo(() => {
    return attendanceRecords.filter((r) => r.timestamp.slice(0, 10) === selectedDay && !r.isDuplicateIgnored);
  }, [attendanceRecords, selectedDay]);

  const presentWorkerCodes = useMemo(() => {
    return new Set(
      recordsOnSelectedDay
        .filter((r) => r.resolvedState === 'IN')
        .map((r) => r.workerCode)
    );
  }, [recordsOnSelectedDay]);

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

  const absentWorkersList = useMemo(() => {
    return activeWorkers
      .filter((w) => !presentWorkerCodes.has(w.code))
      .map((w) => {
        const override = absenceOverrides[w.code];
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

  const handleUpdateWorkerAbsence = (workerCode: number, category: AbsenceCategory, note?: string) => {
    setAbsenceOverrides((prev) => ({
      ...prev,
      [workerCode]: {
        category,
        note: note !== undefined ? note : (prev[workerCode]?.note || ''),
      },
    }));
  };

  const handleUpdateWorkerNote = (workerCode: number, note: string) => {
    setAbsenceOverrides((prev) => ({
      ...prev,
      [workerCode]: {
        category: prev[workerCode]?.category || 'unexcused',
        note,
      },
    }));
  };

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

  const handleExportManagerReport = () => {
    const categoryLabels: Record<AbsenceCategory, string> = {
      unexcused: 'بدون إذن',
      excused_casual: 'إجازة عارضة',
      excused_annual: 'إجازة اعتيادية',
      official_pass: 'بتصريح / إذن معتمد',
      medical: 'إجازة مرضي',
    };

    const detailRows = absentWorkersList.map((w, idx) => ({
      'م': idx + 1,
      'كود العامل': w.code,
      'الاسم': w.name,
      'القسم': w.department,
      'خط الإنتاج': w.line || '-',
      'الوظيفة': w.jobTitle,
      'الجنسية': w.nationality,
      'نوع الغياب': categoryLabels[w.absenceCategory],
      'الملاحظات': w.note || '-',
    }));

    exportToExcel(detailRows, 'الغياب_اليومي', `تقرير_غياب_المصنع_${selectedDay}`, `تقرير الغياب اليومي - ${selectedDay}`);
  };

  // --------------------------------------------------------------------------
  // POINT 12: COMPREHENSIVE WORKER DOSSIER COMPUTATION (الملف الشامل للعامل)
  // --------------------------------------------------------------------------
  const selectedDossierWorker = useMemo(() => {
    return workers.find((w) => w.code === dossierWorkerCode) || workers[0];
  }, [workers, dossierWorkerCode]);

  const dossierWorkerRecords = useMemo(() => {
    if (!selectedDossierWorker) return [];
    return attendanceRecords.filter((r) => {
      const d = r.timestamp.slice(0, 10);
      return r.workerCode === selectedDossierWorker.code && d >= startDate && d <= endDate && !r.isDuplicateIgnored;
    });
  }, [selectedDossierWorker, attendanceRecords, startDate, endDate]);

  const dossierWorkerPasses = useMemo(() => {
    if (!selectedDossierWorker) return [];
    return gatePasses.filter((g) => {
      return g.workerCode === selectedDossierWorker.code && g.date >= startDate && g.date <= endDate;
    });
  }, [selectedDossierWorker, gatePasses, startDate, endDate]);

  // Generate day-by-day calendar matrix for worker
  const dossierDailyLedger = useMemo(() => {
    if (!selectedDossierWorker || !startDate || !endDate) return [];
    const list: any[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    const shift = shifts.find((s) => s.id === selectedDossierWorker.shiftId) || shifts[0];
    const [endH, endM] = shift.endTime.split(':').map(Number);
    const scheduledEndMinutes = endH * 60 + endM;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('ar-EG', { weekday: 'long' });
      const isFriday = d.getDay() === 5;

      const dayPunches = dossierWorkerRecords.filter((r) => r.timestamp.slice(0, 10) === dateStr);
      const checkInPunch = dayPunches.find((p) => p.resolvedState === 'IN') || dayPunches[0];
      const checkOutPunch = dayPunches.length > 1 ? dayPunches[dayPunches.length - 1] : undefined;

      const dayPass = dossierWorkerPasses.find((g) => g.date === dateStr);

      let status = 'غائب';
      let lateMins = 0;
      let otHours = 0;
      let notes = '';

      if (isFriday) {
        if (dayPunches.length > 0) {
          status = 'عمل يوم الجمعة (2x)';
          otHours = 8 * 2;
          notes = 'يوم جمعة مضاعف 16 ساعة';
        } else {
          status = 'عطلة أسبوعية (جمعة)';
        }
      } else if (dayPunches.length > 0) {
        // Calculate late minutes
        if (checkInPunch) {
          const punchTime = new Date(checkInPunch.timestamp);
          const [sH, sM] = shift.startTime.split(':').map(Number);
          const inMins = punchTime.getHours() * 60 + punchTime.getMinutes();
          const threshold = sH * 60 + sM + shift.generalGraceMinutes + (selectedDossierWorker.customGraceMinutes || 0);
          if (inMins > threshold) {
            lateMins = inMins - (sH * 60 + sM);
            status = 'حاضر متأخر';
          } else {
            status = 'حاضر في الموعد';
          }
        }

        // Calculate overtime with departure grace
        if (checkOutPunch) {
          const outTime = new Date(checkOutPunch.timestamp);
          const outMins = outTime.getHours() * 60 + outTime.getMinutes();
          const pastEnd = outMins - scheduledEndMinutes;
          if (pastEnd > otDepartureGrace) {
            otHours = Number((pastEnd / 60).toFixed(2));
            notes = `إضافي بعد انتهاء الوردية (${otHours} س)`;
          } else if (pastEnd >= 0) {
            notes = 'انصراف طبيعي ضمن فترة السماح (4:30 - 4:45)';
          }
        }
      } else if (dayPass) {
        status = 'بتصريح خروج';
        notes = `${dayPass.reasonText} (${dayPass.exitTime} - ${dayPass.returnTime || 'نهاية اليوم'})`;
      } else {
        status = 'غائب';
      }

      list.push({
        date: dateStr,
        dayName,
        isFriday,
        checkIn: checkInPunch ? checkInPunch.displayTime : '-',
        checkOut: checkOutPunch ? checkOutPunch.displayTime : (checkInPunch ? 'لم يبصم' : '-'),
        machineName: checkInPunch ? (checkInPunch.deviceName || `ماكينة #${checkInPunch.deviceId}`) : '-',
        lateMinutes: lateMins,
        overtimeHours: otHours,
        gatePassInfo: dayPass ? `${dayPass.reasonText}` : '-',
        status,
        notes,
      });
    }

    return list;
  }, [selectedDossierWorker, startDate, endDate, dossierWorkerRecords, dossierWorkerPasses, shifts, otDepartureGrace]);

  // Totals for dossier
  const dossierSummary = useMemo(() => {
    let presentDays = 0;
    let absentDays = 0;
    let fridayWorkDays = 0;
    let totalLateMinutes = 0;
    let totalLateDays = 0;
    let totalOtHours = 0;
    let totalPasses = dossierWorkerPasses.length;

    dossierDailyLedger.forEach((row) => {
      if (row.status.startsWith('حاضر')) presentDays++;
      else if (row.status === 'غائب') absentDays++;
      else if (row.status.startsWith('عمل يوم الجمعة')) fridayWorkDays++;

      if (row.lateMinutes > 0) {
        totalLateMinutes += row.lateMinutes;
        totalLateDays++;
      }
      totalOtHours += row.overtimeHours || 0;
    });

    const hourlyRate = selectedDossierWorker?.hourlyRate || otHourlyRate;
    const estimatedPay = Math.round(totalOtHours * hourlyRate * 1.5);

    return {
      presentDays,
      absentDays,
      fridayWorkDays,
      totalLateMinutes,
      totalLateDays,
      totalOtHours: Number(totalOtHours.toFixed(2)),
      totalPasses,
      estimatedPay,
    };
  }, [dossierDailyLedger, dossierWorkerPasses, selectedDossierWorker, otHourlyRate]);

  const handleExportDossier = () => {
    if (!selectedDossierWorker) return;
    const data = dossierDailyLedger.map((row) => ({
      'التاريخ': row.date,
      'اليوم': row.dayName,
      'حضور (IN)': row.checkIn,
      'انصراف (OUT)': row.checkOut,
      'الماكينة': row.machineName,
      'التأخير (دقيقة)': row.lateMinutes > 0 ? row.lateMinutes : 0,
      'الساعات الإضافية': row.overtimeHours > 0 ? row.overtimeHours : 0,
      'التصاريح': row.gatePassInfo,
      'الحالة': row.status,
      'ملاحظات': row.notes,
    }));

    exportToExcel(
      data,
      `ملف_${selectedDossierWorker.code}`,
      `الملف_الشامل_للعامل_${selectedDossierWorker.code}_${selectedDossierWorker.name}_${startDate}_${endDate}`,
      `الملف الشامل للعامل: ${selectedDossierWorker.name} (#${selectedDossierWorker.code})`
    );
  };

  // --------------------------------------------------------------------------
  // POINT 13: ADVANCED OVERTIME REPORT COMPUTATION
  // --------------------------------------------------------------------------
  const recordsInDateRange = useMemo(() => {
    return attendanceRecords.filter((r) => {
      const recordDate = r.timestamp.slice(0, 10);
      return recordDate >= startDate && recordDate <= endDate && !r.isDuplicateIgnored;
    });
  }, [attendanceRecords, startDate, endDate]);

  // Filtered workers by department, nationality, machine
  const filteredOtWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (otDepartmentFilter !== 'all' && w.department !== otDepartmentFilter) return false;
      if (otNationalityFilter !== 'all' && w.nationality !== otNationalityFilter) return false;
      if (otDeviceFilter !== 'all') {
        const devId = parseInt(otDeviceFilter, 10);
        if (!w.assignedDeviceIds?.includes(devId)) return false;
      }
      return true;
    });
  }, [workers, otDepartmentFilter, otNationalityFilter, otDeviceFilter]);

  // Advanced Overtime Analysis Per Worker & Per Day
  const { advancedOtSummary, advancedOtDailyPunches, totalOtFactoryHours, totalOtEstimatedPay, otWorkersCount } = useMemo(() => {
    const summaryMap = new Map<number, {
      worker: Worker;
      daysWorked: number;
      otDays: number;
      shiftOtHours: number;
      fridayOtHours: number;
      totalOtHours: number;
      estimatedPay: number;
      machineName: string;
    }>();

    const dailyPunchesList: any[] = [];

    // Group records by workerCode and date
    // Map: workerCode -> Map: dateStr -> AttendanceRecord[]
    const workerDateMap = new Map<number, Map<string, AttendanceRecord[]>>();

    recordsInDateRange.forEach((r) => {
      if (!workerDateMap.has(r.workerCode)) {
        workerDateMap.set(r.workerCode, new Map());
      }
      const dateMap = workerDateMap.get(r.workerCode)!;
      if (!dateMap.has(r.displayDate)) {
        dateMap.set(r.displayDate, []);
      }
      dateMap.get(r.displayDate)!.push(r);
    });

    let overallFactoryHours = 0;
    let overallFactoryPay = 0;
    let activeOtWorkers = 0;

    filteredOtWorkers.forEach((w) => {
      const shift = shifts.find((s) => s.id === w.shiftId) || shifts[0];
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const scheduledEndMinutes = endH * 60 + endM;
      const workerDates = workerDateMap.get(w.code);

      let daysWorked = 0;
      let otDays = 0;
      let shiftOt = 0;
      let fridayOt = 0;

      const primaryDevice = devices.find((d) => w.assignedDeviceIds?.includes(d.id));
      const machineName = primaryDevice ? primaryDevice.name : (w.enrolledOnDeviceName || 'ماكينة غير محددة');

      if (workerDates) {
        workerDates.forEach((punches, dateStr) => {
          daysWorked++;
          const dObj = new Date(dateStr);
          const isFriday = dObj.getDay() === 5;

          const checkIn = punches.find((p) => p.resolvedState === 'IN') || punches[0];
          const checkOut = punches.length > 1 ? punches[punches.length - 1] : undefined;

          let dayOtHours = 0;
          let statusLabel = 'انصراف اعتيادي';
          let minutesPast = 0;

          if (isFriday) {
            // Friday overtime rule
            dayOtHours = 16; // 8h * 2
            fridayOt += dayOtHours;
            otDays++;
            statusLabel = 'عمل يوم الجمعة (مضاعف 2x - 16 ساعة)';
          } else if (checkOut) {
            const outDate = new Date(checkOut.timestamp);
            const outMinutes = outDate.getHours() * 60 + outDate.getMinutes();
            minutesPast = outMinutes - scheduledEndMinutes;

            // Point 13: Factory Departure Grace Logic
            // If worker punches out within otDepartureGrace (e.g. 16:30 - 16:45), this is normal departure -> 0 overtime
            if (minutesPast > otDepartureGrace) {
              dayOtHours = Number((minutesPast / 60).toFixed(2));
              shiftOt += dayOtHours;
              otDays++;
              statusLabel = `إضافي معتمد (${dayOtHours} س)`;
            } else if (minutesPast >= 0) {
              statusLabel = `انصراف طبيعي ضمن السماحية (${minutesPast} د - بدون إضافي)`;
            } else {
              statusLabel = `انصراف مبكر قبل نهاية الوردية (${Math.abs(minutesPast)} د)`;
            }
          }

          if (dayOtHours > 0 || checkOut) {
            dailyPunchesList.push({
              date: dateStr,
              dayName: dObj.toLocaleDateString('ar-EG', { weekday: 'long' }),
              code: w.code,
              name: w.name,
              department: w.department,
              nationality: w.nationality,
              machineName: checkOut?.deviceName || machineName,
              shiftEnd: shift.endTime,
              checkInTime: checkIn?.displayTime || '-',
              checkOutTime: checkOut?.displayTime || 'لم يبصم',
              minutesPastShift: minutesPast,
              statusLabel,
              otHours: dayOtHours,
              estimatedEgp: Math.round(dayOtHours * (w.hourlyRate || otHourlyRate) * 1.5),
            });
          }
        });
      }

      const totalOt = Number((shiftOt + fridayOt).toFixed(2));
      const workerRate = w.hourlyRate || otHourlyRate;
      const totalPay = Math.round(totalOt * workerRate * 1.5);

      if (totalOt > 0) {
        overallFactoryHours += totalOt;
        overallFactoryPay += totalPay;
        activeOtWorkers++;
      }

      summaryMap.set(w.code, {
        worker: w,
        daysWorked,
        otDays,
        shiftOtHours: Number(shiftOt.toFixed(2)),
        fridayOtHours: Number(fridayOt.toFixed(2)),
        totalOtHours: totalOt,
        estimatedPay: totalPay,
        machineName,
      });
    });

    const summaryArray = Array.from(summaryMap.values())
      .filter((item) => item.daysWorked > 0 || item.totalOtHours > 0)
      .sort((a, b) => b.totalOtHours - a.totalOtHours);

    dailyPunchesList.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.otHours - a.otHours;
    });

    return {
      advancedOtSummary: summaryArray,
      advancedOtDailyPunches: dailyPunchesList,
      totalOtFactoryHours: Number(overallFactoryHours.toFixed(1)),
      totalOtEstimatedPay: overallFactoryPay,
      otWorkersCount: activeOtWorkers,
    };
  }, [recordsInDateRange, filteredOtWorkers, shifts, devices, otDepartureGrace, otHourlyRate]);

  const handleExportAdvancedOt = () => {
    if (otViewMode === 'summary') {
      const data = advancedOtSummary.map((item, idx) => ({
        'م': idx + 1,
        'كود العامل': item.worker.code,
        'الاسم': item.worker.name,
        'القسم': item.worker.department,
        'خط الإنتاج': item.worker.line || '-',
        'الجنسية': item.worker.nationality,
        'الماكينة المسجل عليها': item.machineName,
        'أيام العمل': item.daysWorked,
        'أيام الإضافي': item.otDays,
        'إضافي الوردية (ساعة)': item.shiftOtHours,
        'إضافي الجمعة والسهر (ساعة)': item.fridayOtHours,
        'إجمالي ساعات الأوفر تايم': item.totalOtHours,
        'المستحق المالي التقديري (ج.م)': item.estimatedPay,
      }));
      exportToExcel(
        data, 
        'ملخص_الإضافي', 
        `تقرير_الإضافي_المتقدم_${startDate}_إلى_${endDate}`, 
        `تقرير الساعات الإضافية المتقدم - الفترة من ${startDate} إلى ${endDate}`
      );
    } else {
      const data = advancedOtDailyPunches.map((item, idx) => ({
        'م': idx + 1,
        'التاريخ': item.date,
        'اليوم': item.dayName,
        'كود العامل': item.code,
        'الاسم': item.name,
        'القسم': item.department,
        'الماكينة': item.machineName,
        'نهاية الوردية': item.shiftEnd,
        'حضور': item.checkInTime,
        'انصراف': item.checkOutTime,
        'الدقائق بعد الوردية': item.minutesPastShift,
        'حالة الاحتساب': item.statusLabel,
        'ساعات الإضافي': item.otHours,
        'المستحق (ج.م)': item.estimatedEgp,
      }));
      exportToExcel(
        data, 
        'تفاصيل_بصمات_الإضافي', 
        `سجل_بصمات_الإضافي_اليومي_${startDate}_إلى_${endDate}`, 
        `سجل بصمات الانصراف والإضافي اليومي - الفترة من ${startDate} إلى ${endDate}`
      );
    }
  };

  // --------------------------------------------------------------------------
  // TAB: LATE STATS
  // --------------------------------------------------------------------------
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

  return (
    <div className="space-y-4">
      {/* Top Header & Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>مركز التقارير المتقدمة وتحليلات الحضور</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                V 1.0.0
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              تقارير الغياب اليومي، الملف الشامل للعامل، وحساب الساعات الإضافية المتقدم
            </p>
          </div>
        </div>

        {/* Global Date Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {activeReportTab === 'daily_manager' ? (
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-[11px]">
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
                  هذا الشهر
                </button>
                <button
                  onClick={() => handleSetPreset('last_month')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    quickPreset === 'last_month' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  الشهر السابق
                </button>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setQuickPreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white cursor-pointer"
                />
                <span className="text-slate-400 text-[11px]">إلى:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setQuickPreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Sync from devices button for past periods */}
          {onSyncDevices && (
            <button
              onClick={onSyncDevices}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium cursor-pointer transition-colors border border-slate-700 disabled:opacity-50"
              title="سحب بصمات الفترات السابقة من ماكينات البصمة مباشرة"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جاري السحب...' : 'سحب من الماكينات'}</span>
            </button>
          )}

          {/* Export Button */}
          <button
            onClick={() => {
              if (activeReportTab === 'daily_manager') handleExportManagerReport();
              else if (activeReportTab === 'worker_dossier') handleExportDossier();
              else if (activeReportTab === 'overtime') handleExportAdvancedOt();
              else if (activeReportTab === 'late') {
                const data = dynamicLateStats.map((item) => ({
                  'كود العامل': item.code,
                  'اسم العامل': item.name,
                  'القسم': item.department,
                  'أيام التأخير': item.lateDaysCount,
                  'إجمالي دقائق التأخير': item.totalLateMinutes,
                  'متوسط التأخير اليومي': `${item.avgMinutesPerDay} دقيقة`,
                }));
                exportToExcel(data, 'الأكثر_تأخيرا', `تقرير_التأخير_${startDate}_إلى_${endDate}`);
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
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير Excel ملون</span>
          </button>
        </div>
      </div>

      {/* Primary Report Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
        <button
          onClick={() => setActiveReportTab('daily_manager')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'daily_manager' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>تقرير الغياب اليومي</span>
        </button>

        <button
          onClick={() => setActiveReportTab('worker_dossier')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'worker_dossier' ? 'bg-purple-600 text-white font-bold shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>الملف الشامل للعامل (النقطة 12)</span>
        </button>

        <button
          onClick={() => setActiveReportTab('overtime')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'overtime' ? 'bg-amber-600 text-white font-bold shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <Timer className="w-3.5 h-3.5" />
          <span>تقارير الإضافي المتقدمة (النقطة 13)</span>
        </button>

        <button
          onClick={() => setActiveReportTab('late')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'late' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          الأكثر تأخيراً
        </button>

        <button
          onClick={() => setActiveReportTab('timesheet')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'timesheet' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          كشف العاملين الشامل
        </button>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* TAB 1: DAILY MANAGER ABSENCE REPORT */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'daily_manager' && (
        <div className="space-y-3.5">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-slate-400 text-[10px] block">قوة المصنع</span>
              <span className="text-base font-bold font-mono text-white">{factoryStrength} عامل</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">العمالة النشطة</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-emerald-400 text-[10px] block font-medium">الحضور الفعلي</span>
              <span className="text-base font-bold font-mono text-emerald-400">{presentCount}</span>
              <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-mono">{presentPercent}% نسبة الحضور</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-rose-400 text-[10px] block font-medium">إجمالي الغياب</span>
              <span className="text-base font-bold font-mono text-rose-400">{absentCount}</span>
              <span className="text-[10px] text-rose-400/80 block mt-0.5 font-mono">{absentPercent}% نسبة الغياب</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-rose-300 text-[10px] block">بدون إذن</span>
              <span className="text-base font-bold font-mono text-rose-300">{categoryBreakdown.unexcused.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.unexcused.pct}% من القوة</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-amber-300 text-[10px] block">إجازة عارضة</span>
              <span className="text-base font-bold font-mono text-amber-300">{categoryBreakdown.excused_casual.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.excused_casual.pct}% من القوة</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-blue-300 text-[10px] block">إجازة اعتيادي</span>
              <span className="text-base font-bold font-mono text-blue-300">{categoryBreakdown.excused_annual.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.excused_annual.pct}% من القوة</span>
            </div>

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
                  placeholder="بحث باسم العامل أو الكود أو القسم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg pr-8 pl-3 py-1.5 text-xs text-white placeholder-slate-500 w-64 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Absent Workers Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            {absentWorkersList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                      <th className="py-2.5 px-3 font-semibold text-center w-12">م</th>
                      <th className="py-2.5 px-3 font-semibold">كود</th>
                      <th className="py-2.5 px-3 font-semibold">الاسم</th>
                      <th className="py-2.5 px-3 font-semibold">القسم</th>
                      <th className="py-2.5 px-3 font-semibold">خط الإنتاج</th>
                      <th className="py-2.5 px-3 font-semibold">الوظيفة</th>
                      <th className="py-2.5 px-3 font-semibold">تصنيف الغياب</th>
                      <th className="py-2.5 px-3 font-semibold">ملاحظات والتصريح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {absentWorkersList.map((worker, idx) => (
                      <tr key={worker.code} className="hover:bg-slate-850/60 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-white">{worker.code}</td>
                        <td className="py-2 px-3 font-medium text-white">{worker.name}</td>
                        <td className="py-2 px-3 text-slate-300">{worker.department}</td>
                        <td className="py-2 px-3 font-mono text-slate-400">{worker.line || '-'}</td>
                        <td className="py-2 px-3 text-slate-400">{worker.jobTitle}</td>
                        <td className="py-2 px-3">
                          <select
                            value={worker.absenceCategory}
                            onChange={(e) => handleUpdateWorkerAbsence(worker.code, e.target.value as AbsenceCategory)}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500"
                          >
                            <option value="unexcused">بدون إذن (مخصوم)</option>
                            <option value="excused_casual">إجازة عارضة</option>
                            <option value="excused_annual">إجازة اعتيادية</option>
                            <option value="official_pass">بتصريح / إذن معتمد</option>
                            <option value="medical">إجازة مرضي</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            placeholder="سبب الغياب أو رقم الإذن..."
                            value={worker.note}
                            onChange={(e) => handleUpdateWorkerNote(worker.code, e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white w-full focus:border-blue-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                لا يوجد غياب مسجل لهذا اليوم (حضور بنسبة 100%).
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 2: POINT 12 - COMPREHENSIVE WORKER DOSSIER (الملف الشامل للعامل) */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'worker_dossier' && (
        <div className="space-y-4">
          {/* Worker Selector Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">الملف الشامل والتاريخي للعامل</h3>
                <p className="text-[11px] text-slate-400">سجل مفصل عن الحضور، الغياب، التأخيرات، الأذونات، وساعات الإضافي</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <label className="text-slate-300 font-medium">اختيار العامل:</label>
                <select
                  value={dossierWorkerCode}
                  onChange={(e) => setDossierWorkerCode(parseInt(e.target.value, 10))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-medium focus:border-purple-500 max-w-xs"
                >
                  {workers.map((w) => (
                    <option key={w.code} value={w.code}>
                      #{w.code} - {w.name} ({w.department})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700"
              >
                <Printer className="w-3.5 h-3.5 text-purple-400" />
                <span>طباعة التقرير</span>
              </button>
            </div>
          </div>

          {/* Worker Profile Card */}
          {selectedDossierWorker && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-md font-mono">
                    {selectedDossierWorker.code}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <span>{selectedDossierWorker.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-sans ${
                        selectedDossierWorker.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {selectedDossierWorker.isActive ? 'على رأس العمل' : 'مجمد'}
                      </span>
                    </h2>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 mt-1 font-sans">
                      <span>القسم: <strong className="text-slate-200">{selectedDossierWorker.department}</strong></span>
                      <span>•</span>
                      <span>الوظيفة: <strong className="text-slate-200">{selectedDossierWorker.jobTitle}</strong></span>
                      <span>•</span>
                      <span>خط الإنتاج: <strong className="text-slate-200">{selectedDossierWorker.line || '-'}</strong></span>
                      <span>•</span>
                      <span>الجنسية: <strong className="text-slate-200">{selectedDossierWorker.nationality}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
                  <div>الوردية: <span className="text-indigo-400 font-bold">{selectedDossierWorker.shiftId === 'bangladeshi' ? 'وردية بنغال (8:00 - 18:30)' : 'وردية عادية (8:00 - 16:30)'}</span></div>
                  <div>الماكينة المسجل عليها: <span className="text-amber-400 font-bold">{selectedDossierWorker.enrolledOnDeviceName || 'ماكينة المصنع'}</span></div>
                  <div>سماحية خاصة: <span className="text-emerald-400 font-bold">+{selectedDossierWorker.customGraceMinutes || 0} دقيقة</span></div>
                </div>
              </div>

              {/* Dossier KPI Cards for Selected Date Period */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 pt-4">
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>أيام الحضور الفعلي</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {dossierSummary.presentDays} <span className="text-xs text-slate-400 font-sans">يوم</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">من {dossierDailyLedger.filter(r => !r.isFriday).length} يوم عمل</div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <UserX className="w-3.5 h-3.5 text-rose-400" />
                    <span>أيام الغياب</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                    {dossierSummary.absentDays} <span className="text-xs text-slate-400 font-sans">يوم</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">بدون إذن أو إجازات</div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>إجمالي التأخيرات</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                    {dossierSummary.totalLateMinutes} <span className="text-xs text-slate-400 font-sans">دقيقة</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">في {dossierSummary.totalLateDays} يوم</div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-cyan-400" />
                    <span>الساعات الإضافية</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                    {dossierSummary.totalOtHours} <span className="text-xs text-slate-400 font-sans">ساعة</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono mt-0.5 font-bold">~ {dossierSummary.estimatedPay} ج.م تقديري</div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <DoorOpen className="w-3.5 h-3.5 text-purple-400" />
                    <span>أذونات وتصاريح</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                    {dossierSummary.totalPasses} <span className="text-xs text-slate-400 font-sans">تصريح</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">مسجلة في الأمن</div>
                </div>
              </div>
            </div>
          )}

          {/* Daily Ledger Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <span>سجل الأيام التفصيلي للفترة</span>
                <span className="font-mono text-slate-400 font-normal">({startDate} إلى {endDate})</span>
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">{dossierDailyLedger.length} يوم</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-950/90 text-slate-400 text-[11px] border-b border-slate-800">
                    <th className="py-2.5 px-3">التاريخ</th>
                    <th className="py-2.5 px-3">اليوم</th>
                    <th className="py-2.5 px-3 text-center">حضور (IN)</th>
                    <th className="py-2.5 px-3 text-center">انصراف (OUT)</th>
                    <th className="py-2.5 px-3">الماكينة</th>
                    <th className="py-2.5 px-3 text-center">التأخير (دقيقة)</th>
                    <th className="py-2.5 px-3 text-center">ساعات الإضافي</th>
                    <th className="py-2.5 px-3">التصريح</th>
                    <th className="py-2.5 px-3 text-center">الحالة</th>
                    <th className="py-2.5 px-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {dossierDailyLedger.map((row) => (
                    <tr 
                      key={row.date} 
                      className={`hover:bg-slate-850/60 transition-colors ${row.isFriday ? 'bg-slate-950/40 text-slate-400' : ''}`}
                    >
                      <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{row.date}</td>
                      <td className="py-2 px-3 font-sans text-slate-300 whitespace-nowrap">{row.dayName}</td>
                      <td className="py-2 px-3 text-center font-bold text-emerald-400">{row.checkIn}</td>
                      <td className="py-2 px-3 text-center font-bold text-blue-400">{row.checkOut}</td>
                      <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">{row.machineName}</td>
                      <td className="py-2 px-3 text-center">
                        {row.lateMinutes > 0 ? (
                          <span className="text-amber-400 font-bold">+{row.lateMinutes} د</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {row.overtimeHours > 0 ? (
                          <span className="text-cyan-400 font-bold font-mono">+{row.overtimeHours} س</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-sans text-purple-300 text-[11px]">{row.gatePassInfo}</td>
                      <td className="py-2 px-3 text-center font-sans">
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          row.status.startsWith('حاضر في الموعد')
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : row.status.startsWith('حاضر متأخر')
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : row.status === 'غائب'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : row.status.startsWith('عمل يوم الجمعة')
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{row.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 3: POINT 13 - ADVANCED OVERTIME REPORT (تقارير الإضافي المتقدمة) */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'overtime' && (
        <div className="space-y-4">
          {/* Overtime Policy Settings & Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>محرك حساب الساعات الإضافية المتقدم (Overtime Engine)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                      معادلة المصنع
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    استخراج الإضافي بدقة بعد الـ 4:30، مع استثناء فترة سماح الخروج الطبيعي (4:45)، وحساب إضافي السهر والجمعة
                  </p>
                </div>
              </div>

              {/* View Switcher: Summary vs Detailed */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setOtViewMode('summary')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    otViewMode === 'summary' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ملخص العمال ({advancedOtSummary.length})
                </button>
                <button
                  onClick={() => setOtViewMode('detailed')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    otViewMode === 'detailed' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  سجل البصمات اليومي ({advancedOtDailyPunches.length})
                </button>
              </div>
            </div>

            {/* Overtime Policy Parameters (Point 13 Rule Adjustments) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-medium flex items-center justify-between">
                  <span>سماحية الانصراف العادي:</span>
                  <span className="text-amber-400 font-bold font-mono">{otDepartureGrace} دقيقة</span>
                </label>
                <select
                  value={otDepartureGrace}
                  onChange={(e) => setOtDepartureGrace(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                >
                  <option value={10}>10 دقائق (حتى 4:40 مساءً)</option>
                  <option value={15}>15 دقيقة (حتى 4:45 مساءً - الموصى به)</option>
                  <option value={20}>20 دقيقة (حتى 4:50 مساءً)</option>
                  <option value={30}>30 دقيقة (حتى 5:00 مساءً)</option>
                </select>
                <span className="text-[10px] text-slate-500 block">
                  من يبصم قبل 4:45 يعتبر خروج طبيعي ولا يحسب له إضافي
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-medium flex items-center justify-between">
                  <span>سعر ساعة الإضافي التقديري:</span>
                  <span className="text-emerald-400 font-bold font-mono">{otHourlyRate} ج.م</span>
                </label>
                <input
                  type="number"
                  value={otHourlyRate}
                  onChange={(e) => setOtHourlyRate(Math.max(1, parseInt(e.target.value, 10) || 35))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                />
                <span className="text-[10px] text-slate-500 block">
                  معدل الساعة لتقدير المستحقات المالية
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-medium">تصفية بماكينة البصمة:</label>
                <select
                  value={otDeviceFilter}
                  onChange={(e) => setOtDeviceFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                >
                  <option value="all">جميع الماكينات (الـ 6 أجهزة)</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.department})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 block">
                  ماكينات الرجال / ماكينات السيدات
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-medium">تصفية بالجنسية:</label>
                <select
                  value={otNationalityFilter}
                  onChange={(e) => setOtNationalityFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                >
                  <option value="all">جميع الجنسيات</option>
                  <option value="مصري">مصريين (وردية 8:00 - 16:30)</option>
                  <option value="بنغلاديشي">بنغال (وردية 8:00 - 18:30)</option>
                </select>
                <span className="text-[10px] text-slate-500 block">
                  يطبق مواعيد وردية كل جنسية بدقة
                </span>
              </div>
            </div>
          </div>

          {/* Overtime Metric Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">إجمالي الساعات الإضافية بالمصنع</span>
              <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
                {totalOtFactoryHours} <span className="text-xs text-slate-400 font-sans">ساعة</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">خلال الفترة المحددة</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">إجمالي المستحق المالي التقديري</span>
              <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                {totalOtEstimatedPay.toLocaleString()} <span className="text-xs text-slate-400 font-sans">ج.م</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">على أساس {otHourlyRate} ج.م / س</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">عدد العمال المستحقين للإضافي</span>
              <span className="text-2xl font-bold font-mono text-cyan-400 mt-1 block">
                {otWorkersCount} <span className="text-xs text-slate-400 font-sans">عامل</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">من إجمالي {filteredOtWorkers.length} عامل</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">متوسط الإضافي لكل عامل</span>
              <span className="text-2xl font-bold font-mono text-purple-400 mt-1 block">
                {otWorkersCount > 0 ? (totalOtFactoryHours / otWorkersCount).toFixed(1) : 0} <span className="text-xs text-slate-400 font-sans">س/عامل</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">خلال فترة التقرير</span>
            </div>
          </div>

          {/* VIEW 1: SUMMARY BY WORKER */}
          {otViewMode === 'summary' && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <span>كشف ملخص الساعات الإضافية حسب العامل</span>
                  <span className="text-[11px] text-slate-400 font-mono">({advancedOtSummary.length} عامل)</span>
                </h4>
              </div>

              {advancedOtSummary.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800 font-medium">
                        <th className="py-2.5 px-3 text-center w-12">م</th>
                        <th className="py-2.5 px-3">كود</th>
                        <th className="py-2.5 px-3">اسم العامل</th>
                        <th className="py-2.5 px-3">القسم</th>
                        <th className="py-2.5 px-3">الجنسية</th>
                        <th className="py-2.5 px-3">الماكينة</th>
                        <th className="py-2.5 px-3 text-center">أيام العمل</th>
                        <th className="py-2.5 px-3 text-center">أيام الإضافي</th>
                        <th className="py-2.5 px-3 text-center">إضافي وردية</th>
                        <th className="py-2.5 px-3 text-center">إضافي سهر/جمعة</th>
                        <th className="py-2.5 px-3 text-center">الإجمالي (ساعة)</th>
                        <th className="py-2.5 px-3 text-center">المستحق (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {advancedOtSummary.map((item, idx) => (
                        <tr key={item.worker.code} className="hover:bg-slate-850/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3 font-bold text-white">{item.worker.code}</td>
                          <td className="py-2 px-3 font-sans font-medium text-white">{item.worker.name}</td>
                          <td className="py-2 px-3 font-sans text-slate-300">{item.worker.department}</td>
                          <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{item.worker.nationality}</td>
                          <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{item.machineName}</td>
                          <td className="py-2 px-3 text-center text-slate-300">{item.daysWorked}</td>
                          <td className="py-2 px-3 text-center text-amber-400 font-bold">{item.otDays}</td>
                          <td className="py-2 px-3 text-center text-slate-300">{item.shiftOtHours} س</td>
                          <td className="py-2 px-3 text-center text-indigo-400 font-bold">{item.fridayOtHours} س</td>
                          <td className="py-2 px-3 text-center text-amber-400 font-bold text-sm bg-amber-950/20">
                            {item.totalOtHours} س
                          </td>
                          <td className="py-2 px-3 text-center text-emerald-400 font-bold bg-emerald-950/20">
                            {item.estimatedPay.toLocaleString()} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  لا توجد حركات إضافية مسجلة في هذه الفترة المطابقة لشروط البحث.
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: DETAILED DAILY PUNCHES (Point 13 Daily Trace) */}
          {otViewMode === 'detailed' && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <span>سجل بصمات الانصراف والإضافي اليومي التفصيلي</span>
                    <span className="text-[11px] text-slate-400 font-mono">({advancedOtDailyPunches.length} حركة)</span>
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    يبيّن دقيقة بدقيقة متى بصم العامل، وهل تعتبر البصمة خروج عادي ضمن السماحية أم ساعات إضافية معتمدة
                  </p>
                </div>
              </div>

              {advancedOtDailyPunches.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800 font-medium">
                        <th className="py-2.5 px-3">التاريخ</th>
                        <th className="py-2.5 px-3">اليوم</th>
                        <th className="py-2.5 px-3">كود</th>
                        <th className="py-2.5 px-3">اسم العامل</th>
                        <th className="py-2.5 px-3">القسم</th>
                        <th className="py-2.5 px-3">الماكينة</th>
                        <th className="py-2.5 px-3 text-center">نهاية الوردية</th>
                        <th className="py-2.5 px-3 text-center">حضور</th>
                        <th className="py-2.5 px-3 text-center">انصراف</th>
                        <th className="py-2.5 px-3 text-center">بعد الوردية</th>
                        <th className="py-2.5 px-3">حالة البصمة والاحتساب</th>
                        <th className="py-2.5 px-3 text-center">الإضافي</th>
                        <th className="py-2.5 px-3 text-center">المستحق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {advancedOtDailyPunches.map((punch, idx) => (
                        <tr key={`${punch.code}-${punch.date}-${idx}`} className="hover:bg-slate-850/60 transition-colors">
                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{punch.date}</td>
                          <td className="py-2 px-3 font-sans text-slate-400 whitespace-nowrap">{punch.dayName}</td>
                          <td className="py-2 px-3 font-bold text-white">{punch.code}</td>
                          <td className="py-2 px-3 font-sans font-medium text-white">{punch.name}</td>
                          <td className="py-2 px-3 font-sans text-slate-300">{punch.department}</td>
                          <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{punch.machineName}</td>
                          <td className="py-2 px-3 text-center text-slate-400">{punch.shiftEnd}</td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-400">{punch.checkInTime}</td>
                          <td className="py-2 px-3 text-center font-bold text-blue-400">{punch.checkOutTime}</td>
                          <td className="py-2 px-3 text-center">
                            {punch.minutesPastShift > 0 ? (
                              <span className="text-amber-400 font-bold font-mono">+{punch.minutesPastShift} د</span>
                            ) : (
                              <span className="text-slate-500">{punch.minutesPastShift} د</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <span className={`text-[10px] px-2 py-0.5 rounded ${
                              punch.otHours > 0
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold'
                                : punch.statusLabel.includes('ضمن السماحية')
                                ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {punch.statusLabel}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-bold">
                            {punch.otHours > 0 ? (
                              <span className="text-cyan-400 font-mono">+{punch.otHours} س</span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center text-emerald-400 font-bold">
                            {punch.estimatedEgp > 0 ? `${punch.estimatedEgp} ج.م` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  لا توجد حركات تفصيلية مطابقة لشروط البحث في هذه الفترة.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 4: MOST LATE REPORT */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'late' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          {dynamicLateStats.length > 0 ? (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold text-center w-12">م</th>
                  <th className="py-2.5 px-3 font-semibold">كود</th>
                  <th className="py-2.5 px-3 font-semibold">الاسم</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold text-center">أيام التأخير</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إجمالي التأخير</th>
                  <th className="py-2.5 px-3 font-semibold text-center">متوسط التأخير اليومي</th>
                  <th className="py-2.5 px-3 font-semibold text-center">السماحية المقررة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {dynamicLateStats.map((item, idx) => (
                  <tr key={item.code} className="hover:bg-slate-850/60 transition-colors">
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

      {/* -------------------------------------------------------------------- */}
      {/* TAB 5: ALL WORKERS MASTER */}
      {/* -------------------------------------------------------------------- */}
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
                <th className="py-2.5 px-3 font-semibold text-center">الماكينة</th>
                <th className="py-2.5 px-3 font-semibold text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {workers.map((w) => (
                <tr key={w.code} className="hover:bg-slate-850/60 transition-colors">
                  <td className="py-2 px-3 font-mono font-bold text-white">{w.code}</td>
                  <td className="py-2 px-3 font-medium text-white">{w.name}</td>
                  <td className="py-2 px-3 text-slate-300">{w.department}</td>
                  <td className="py-2 px-3 font-mono text-slate-400">{w.line || '-'}</td>
                  <td className="py-2 px-3 text-slate-400">{w.jobTitle}</td>
                  <td className="py-2 px-3 text-center">{w.nationality}</td>
                  <td className="py-2 px-3 text-center text-slate-400 text-[11px]">{w.enrolledOnDeviceName || 'ماكينة المصنع'}</td>
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
