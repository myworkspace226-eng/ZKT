import * as XLSX from 'xlsx';
import { AttendanceRecord, ShiftRule, Worker } from '../types';

/**
 * Smart logic to resolve whether a punch is IN or OUT, fixing old ZKTeco hardware button glitches.
 * If someone punches at 07:45 AM, it is guaranteed to be a CHECK-IN regardless of machine button state.
 */
export function resolveSmartPunchState(
  timeStr: string, // "HH:mm:ss" or ISO string
  rawState: 'IN' | 'OUT',
  shift: ShiftRule
): { resolvedState: 'IN' | 'OUT'; autoCorrected: boolean; reason: string } {
  let hours = 8;
  let minutes = 0;

  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    hours = d.getHours();
    minutes = d.getMinutes();
  } else if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    hours = parseInt(parts[0], 10) || 8;
    minutes = parseInt(parts[1], 10) || 0;
  }

  const decimalHour = hours + minutes / 60;

  // Check-In window: 06:00 AM to 11:30 AM
  if (decimalHour >= 6.0 && decimalHour <= 11.5) {
    if (rawState === 'OUT') {
      return {
        resolvedState: 'IN',
        autoCorrected: true,
        reason: 'تم التصحيح تلقائياً: البصمة في نافذة الصباح (بداية العمل)',
      };
    }
    return { resolvedState: 'IN', autoCorrected: false, reason: 'حضور طبيعي' };
  }

  // Afternoon & Evening Check-Out window: 13:00 to 23:59 or early morning overnight
  if (decimalHour >= 14.0 || decimalHour <= 6.5) {
    if (rawState === 'IN') {
      return {
        resolvedState: 'OUT',
        autoCorrected: true,
        reason: 'تم التصحيح تلقائياً: البصمة في نافذة الانصراف/نهاية الوردية',
      };
    }
    return { resolvedState: 'OUT', autoCorrected: false, reason: 'انصراف طبيعي' };
  }

  return { resolvedState: rawState, autoCorrected: false, reason: 'مطابق لحالة الماكينة' };
}

/**
 * Smart Attendance Processing Engine (خوارزمية معالجة البصمات الذكية الاحترافية)
 * 1. 1-Hour Cooldown Deduplication: Ignore any punch occurring within < 60 minutes of previous accepted punch.
 * 2. Overnight Shifts Attachment: Punches between 00:00 and 05:59 AM attach to previous day as OUT if worker was checked in.
 * 3. First & Last Punch: 1st punch = IN, last punch = OUT, intermediate punches = ignored.
 * 4. Missed Punch Exceptions: Mark single punch days as isMissedPunch without guessing fake times.
 * 5. HR Override Protection: isHROverride / isManual records are preserved exactly as set by HR.
 */
export interface SmartAttendanceOptions {
  shiftEndTime?: string; // e.g. "16:30"
  shiftStartTime?: string; // e.g. "08:00"
  bangladeshiShiftEnd?: string; // e.g. "18:30"
  bangladeshiShiftStart?: string; // e.g. "08:00"
  earlyDepartureWindowMinutes?: number; // e.g. 30 (16:00 - 16:30)
  duplicateWindowMinutes?: number; // default 60 min
  overnightCutoffHour?: number; // e.g. 6 (06:00 AM)
  workers?: Worker[];
  workerMap?: Map<number, Worker>;
  now?: Date;
}

/**
 * Smart Attendance Processing Engine (خوارزمية معالجة البصمات الذكية الاحترافية - V 4.0.0)
 * 1. Cooldown Deduplication: Ignore any punch occurring within < duplicateWindowMinutes (default 60 min) of previous accepted punch.
 * 2. Overnight Shifts Attachment: Punches between 00:00 and overnightCutoffHour (06:00 AM) attach to previous day as OUT.
 * 3. First & Last Punch: 1st punch = IN, last punch = OUT, intermediate punches = ignored.
 * 4. Shift Reactivity: Reads shiftEndTime & bangladeshiShiftEnd dynamically from settings.
 * 5. Ambiguous Single Punch (حالات البصمة الواحدة الغامضة):
 *    - Morning (< 11:00 AM) -> IN.
 *    - End of shift (>= shiftEnd - 45 min) -> OUT (missed IN).
 *    - Mid-shift (11:00 AM to shiftEnd - 45 min) -> isAmbiguousSinglePunch = true (HR manual resolution required).
 * 6. HR Override Protection: isHROverride / isManual records are preserved exactly as set by HR.
 */
export function processSmartAttendanceLogs(
  records: AttendanceRecord[],
  options?: SmartAttendanceOptions
): AttendanceRecord[] {
  if (!records || records.length === 0) return [];

  const now = options?.now || new Date();
  const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();

  // Local YYYY-MM-DD
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  const defaultShiftEndStr = options?.shiftEndTime || '16:30';
  const bangladeshiShiftEndStr = options?.bangladeshiShiftEnd || '18:30';
  const earlyWindowMin = options?.earlyDepartureWindowMinutes ?? 30;
  const overnightCutoff = options?.overnightCutoffHour ?? 6;
  const duplicateWindowMinutes = options?.duplicateWindowMinutes ?? 60;
  const duplicateWindowMs = duplicateWindowMinutes * 60 * 1000;

  // Build lookup map for workers if provided
  const workerLookup = options?.workerMap || (options?.workers ? new Map(options.workers.map((w) => [w.code, w])) : null);

  // Group records by workerCode
  const workerGroups = new Map<number, AttendanceRecord[]>();
  for (const r of records) {
    let list = workerGroups.get(r.workerCode);
    if (!list) {
      list = [];
      workerGroups.set(r.workerCode, list);
    }
    list.push({ ...r });
  }

  const processedAll: AttendanceRecord[] = [];

  workerGroups.forEach((workerRecords, workerCode) => {
    // Determine worker specific shift
    const workerObj = workerLookup?.get(workerCode);
    const isBengali = workerObj?.nationality === 'بنغلاديشي' || workerObj?.shiftId === 'bangladeshi';
    const effectiveShiftEndStr = isBengali ? bangladeshiShiftEndStr : defaultShiftEndStr;

    const [endH, endM] = effectiveShiftEndStr.split(':').map((v) => parseInt(v, 10) || 0);
    const shiftEndTotalMinutes = endH * 60 + endM;
    const earlyStartMinutes = shiftEndTotalMinutes - earlyWindowMin;

    // 1. Sort all punches for this worker chronologically
    workerRecords.sort((a, b) => {
      const tA = new Date(`${a.displayDate}T${a.displayTime}:00`).getTime();
      const tB = new Date(`${b.displayDate}T${b.displayTime}:00`).getTime();
      if (isNaN(tA) || isNaN(tB)) return (a.id || '').localeCompare(b.id || '');
      return tA - tB;
    });

    // 2. Deduplication using dynamic duplicate window cooldown
    const validPunches: AttendanceRecord[] = [];
    let lastAcceptedTime: number | null = null;

    for (const rec of workerRecords) {
      // HR Override is always authoritative and protected
      if (rec.isHROverride || (rec.isManual && rec.resolvedState)) {
        rec.isDuplicateIgnored = false;
        validPunches.push(rec);
        const t = new Date(`${rec.displayDate}T${rec.displayTime}:00`).getTime();
        if (!isNaN(t)) lastAcceptedTime = t;
        continue;
      }

      const punchTime = new Date(`${rec.displayDate}T${rec.displayTime}:00`).getTime();
      if (isNaN(punchTime)) {
        validPunches.push(rec);
        continue;
      }

      // If less than duplicateWindowMinutes from last accepted punch -> ignore as duplicate
      if (lastAcceptedTime !== null && (punchTime - lastAcceptedTime) < duplicateWindowMs) {
        rec.isDuplicateIgnored = true;
        rec.duplicateReason = `تكرار بصمة (أقل من ${duplicateWindowMinutes} دقيقة)`;
        processedAll.push(rec);
      } else {
        rec.isDuplicateIgnored = false;
        validPunches.push(rec);
        lastAcceptedTime = punchTime;
      }
    }

    // 3. Work Day Assignment (Handling Overnight Shifts & Late Night Punches)
    const dayPunchesMap = new Map<string, AttendanceRecord[]>();

    for (const rec of validPunches) {
      const [hStr] = (rec.displayTime || '08:00').split(':');
      const hours = parseInt(hStr, 10) || 0;
      let targetWorkDay = rec.displayDate;

      // Check if late night punch (before overnight cutoff e.g. 06:00 AM)
      if (hours < overnightCutoff) {
        // Calculate previous calendar date YYYY-MM-DD
        const curDate = new Date(`${rec.displayDate}T12:00:00`);
        curDate.setDate(curDate.getDate() - 1);
        const prevDayStr = curDate.toISOString().slice(0, 10);

        // Any punch between 00:00 and overnightCutoff belongs to the night shift of previous day
        targetWorkDay = prevDayStr;
      }

      let dList = dayPunchesMap.get(targetWorkDay);
      if (!dList) {
        dList = [];
        dayPunchesMap.set(targetWorkDay, dList);
      }
      dList.push(rec);
    }

    // Helper to evaluate Early Departure for a check-out punch
    const applyEarlyDepartureCheck = (punch: AttendanceRecord) => {
      if (punch.isHROverride) return;
      const [pHStr, pMStr] = (punch.displayTime || '16:00').split(':');
      const pH = parseInt(pHStr, 10) || 0;
      const pM = parseInt(pMStr, 10) || 0;
      const punchMinutes = pH * 60 + pM;

      if (punchMinutes >= earlyStartMinutes && punchMinutes < shiftEndTotalMinutes) {
        const diff = shiftEndTotalMinutes - punchMinutes;
        punch.isEarlyDeparture = true;
        punch.earlyDepartureMinutes = diff;
        punch.earlyDepartureReason = `انصراف مبكر (-${diff} د) قبل موعد نهاية الوردية (${effectiveShiftEndStr})`;
      } else {
        punch.isEarlyDeparture = false;
        punch.earlyDepartureMinutes = 0;
        punch.earlyDepartureReason = undefined;
      }
    };

    // 4. First and Last Punch Rule per Work Day & Missed Punch Detection
    dayPunchesMap.forEach((punchesOnDay, workDay) => {
      punchesOnDay.sort((a, b) => {
        const tA = new Date(`${a.displayDate}T${a.displayTime}:00`).getTime();
        const tB = new Date(`${b.displayDate}T${b.displayTime}:00`).getTime();
        return tA - tB;
      });

      const isToday = workDay === todayStr;
      const isPastShiftEnd = isToday ? nowTotalMinutes >= shiftEndTotalMinutes : true;

      if (punchesOnDay.length === 1) {
        const singlePunch = punchesOnDay[0];

        if (singlePunch.isHROverride) {
          singlePunch.isAmbiguousSinglePunch = false;
          if (singlePunch.resolvedState === 'IN') {
            if (isPastShiftEnd) {
              singlePunch.isMissedPunch = true;
              singlePunch.missedPunchType = 'OUT';
              singlePunch.missedPunchReason = 'بصمة انصراف مفقودة (تم تسجيل الحضور يدوياً)';
            } else {
              singlePunch.isMissedPunch = false;
            }
          } else {
            singlePunch.isMissedPunch = true;
            singlePunch.missedPunchType = 'IN';
            singlePunch.missedPunchReason = 'بصمة حضور مفقودة (تم تسجيل الانصراف يدوياً)';
            applyEarlyDepartureCheck(singlePunch);
          }
          processedAll.push(singlePunch);
          return;
        }

        const [pHStr, pMStr] = (singlePunch.displayTime || '08:00').split(':');
        const pH = parseInt(pHStr, 10) || 8;
        const pM = parseInt(pMStr, 10) || 0;
        const punchMinutes = pH * 60 + pM;

        // Zone 1: Morning Check-in Window (Punch before 11:00 AM)
        if (punchMinutes < 11 * 60) {
          singlePunch.resolvedState = 'IN';
          singlePunch.isAmbiguousSinglePunch = false;
          if (isPastShiftEnd) {
            singlePunch.isMissedPunch = true;
            singlePunch.missedPunchType = 'OUT';
            singlePunch.missedPunchReason = 'بصمة انصراف مفقودة (لم يسجل خروج)';
          } else {
            singlePunch.isMissedPunch = false;
            singlePunch.missedPunchReason = undefined;
          }
          singlePunch.isEarlyDeparture = false;
        } 
        // Zone 2: Shift-End Window (within 45 minutes of shift end or later, e.g. >= 15:45 for Egyptian, >= 17:45 for Bengali)
        else if (punchMinutes >= (shiftEndTotalMinutes - 45)) {
          singlePunch.resolvedState = 'OUT';
          singlePunch.isAmbiguousSinglePunch = false;
          singlePunch.isMissedPunch = true;
          singlePunch.missedPunchType = 'IN';
          singlePunch.missedPunchReason = 'بصمة حضور مفقودة (لم يسجل دخول في الصباح)';
          applyEarlyDepartureCheck(singlePunch);
        } 
        // Zone 3: Mid-Shift Ambiguous Punch (11:00 AM to shiftEnd - 45 min)
        else {
          // Do NOT guess! Tag as ambiguous single punch requiring HR decision
          singlePunch.resolvedState = singlePunch.rawState || 'IN';
          singlePunch.isAmbiguousSinglePunch = true;
          singlePunch.isMissedPunch = true;
          singlePunch.missedPunchType = 'AMBIGUOUS';
          singlePunch.missedPunchReason = 'بصمة واحدة في منتصف الوردية (تحتاج قرار HR: حضور متأخر أم انصراف مبكر؟)';
          singlePunch.isEarlyDeparture = false;
        }

        processedAll.push(singlePunch);

      } else {
        // 2 or more punches: First is IN, Last is OUT
        const firstPunch = punchesOnDay[0];
        if (!firstPunch.isHROverride) {
          firstPunch.resolvedState = 'IN';
        }
        firstPunch.isDuplicateIgnored = false;
        firstPunch.isMissedPunch = false;
        firstPunch.isAmbiguousSinglePunch = false;
        firstPunch.missedPunchReason = undefined;
        firstPunch.isEarlyDeparture = false;
        processedAll.push(firstPunch);

        const lastPunch = punchesOnDay[punchesOnDay.length - 1];
        if (!lastPunch.isHROverride) {
          lastPunch.resolvedState = 'OUT';
        }
        lastPunch.isDuplicateIgnored = false;
        lastPunch.isMissedPunch = false;
        lastPunch.isAmbiguousSinglePunch = false;
        lastPunch.missedPunchReason = undefined;
        // Check early departure for the OUT punch
        applyEarlyDepartureCheck(lastPunch);
        processedAll.push(lastPunch);

        // Any intermediate punches are ignored as intermediate
        for (let i = 1; i < punchesOnDay.length - 1; i++) {
          const midPunch = punchesOnDay[i];
          if (!midPunch.isHROverride) {
            midPunch.isDuplicateIgnored = true;
            midPunch.duplicateReason = 'بصمة بينية (تم اعتماد الأولى كحضور والأخيرة كانصراف)';
          }
          midPunch.isAmbiguousSinglePunch = false;
          processedAll.push(midPunch);
        }
      }
    });
  });

  // Sort overall descending by timestamp for display
  processedAll.sort((a, b) => {
    const tA = new Date(`${a.displayDate}T${a.displayTime}:00`).getTime();
    const tB = new Date(`${b.displayDate}T${b.displayTime}:00`).getTime();
    if (isNaN(tA) || isNaN(tB)) return (b.id || '').localeCompare(a.id || '');
    return tB - tA;
  });

  return processedAll;
}

/**
 * Filter out duplicate consecutive punches made within cooldown window (e.g. 60 minutes).
 */
export function markDuplicatePunches(
  records: AttendanceRecord[],
  cooldownMinutes: number = 60
): AttendanceRecord[] {
  return processSmartAttendanceLogs(records);
}

/**
 * Calculate worker daily attendance performance, overtime, and late minutes.
 * Incorporates Point 13: departure grace window (e.g. 16:30 - 16:45 is normal departure, 0 overtime).
 */
export function calculateDailyPerformance(
  worker: Worker,
  checkIn: AttendanceRecord | undefined,
  checkOut: AttendanceRecord | undefined,
  shift: ShiftRule,
  isFriday: boolean = false,
  departureGraceMinutes: number = 15
) {
  if (!checkIn) {
    return {
      status: 'غائب',
      workHours: 0,
      overtimeHours: 0,
      lateMinutes: 0,
      notes: 'لم يسجل حضور',
    };
  }

  const checkInDate = new Date(checkIn.timestamp);
  const inHours = checkInDate.getHours() + checkInDate.getMinutes() / 60;

  // Shift start in decimal
  const [startH, startM] = shift.startTime.split(':').map(Number);
  const shiftStartDecimal = startH + startM / 60;

  // Total allowed grace (General grace + Worker's specific custom grace)
  const totalGraceMinutes = shift.generalGraceMinutes + (worker.customGraceMinutes || 0);
  const graceThresholdDecimal = shiftStartDecimal + totalGraceMinutes / 60;

  let lateMinutes = 0;
  if (inHours > graceThresholdDecimal) {
    lateMinutes = Math.round((inHours - shiftStartDecimal) * 60);
  }

  // Work hours & Overtime
  let workHours = 0;
  let overtimeHours = 0;

  if (checkOut) {
    const checkOutDate = new Date(checkOut.timestamp);
    let diffMs = checkOutDate.getTime() - checkInDate.getTime();

    // If overnight shift (checkout is next morning e.g. 05:40 AM)
    if (diffMs < 0) {
      diffMs += 24 * 3600 * 1000;
    }

    const totalRawHours = diffMs / (1000 * 3600);
    // Deduct 30 min break if worked more than 5 hours
    const netHours = totalRawHours > 5 ? totalRawHours - 0.5 : totalRawHours;

    const [endH, endM] = shift.endTime.split(':').map(Number);
    const standardShiftHours = (endH + endM / 60) - (startH + startM / 60) - (shift.breakDurationMinutes / 60);

    // Calculate checkout minutes past scheduled shift end
    const checkOutMinutesOfDay = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();
    const scheduledEndMinutesOfDay = endH * 60 + endM;
    let minutesPastShiftEnd = checkOutMinutesOfDay - scheduledEndMinutesOfDay;
    if (minutesPastShiftEnd < -720) {
      // Overnight
      minutesPastShiftEnd += 1440;
    }

    if (isFriday) {
      // Friday 2x rule: Basic is 16 hours
      workHours = 8 * shift.fridayMultiplier;
      overtimeHours = Math.max(0, netHours - 8) * shift.fridayMultiplier;
    } else {
      workHours = Math.min(netHours, standardShiftHours);

      // Point 13: Factory Departure Grace Logic
      // If worker punches out within departureGraceMinutes (e.g. 16:30 - 16:45), this is normal departure queue -> 0 overtime
      if (minutesPastShiftEnd > departureGraceMinutes) {
        // Legitimate overtime beyond departure queue window
        const otHours = minutesPastShiftEnd / 60;
        overtimeHours = Number(otHours.toFixed(2));
      } else {
        overtimeHours = 0;
      }
    }
  } else {
    // Punched in but hasn't punched out yet
    workHours = 8;
  }

  const isEarly = Boolean(checkOut?.isEarlyDeparture);
  const earlyMin = checkOut?.earlyDepartureMinutes || 0;

  let statusText = lateMinutes > 0 ? 'حاضر متأخر' : 'حاضر في الموعد';
  if (isEarly && earlyMin > 0) {
    statusText = `حاضر (انصراف مبكر -${earlyMin} د)`;
  }

  return {
    status: statusText,
    workHours: Number(workHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    lateMinutes,
    isEarlyDeparture: isEarly,
    earlyDepartureMinutes: earlyMin,
    notes: isFriday 
      ? 'عمل يوم الجمعة (مضاعف 2x - 16 ساعة)' 
      : isEarly 
      ? `انصراف مبكر (-${earlyMin} دقيقة)` 
      : '',
  };
}

/**
 * Point 11: Export formatted Microsoft Excel (.xlsx) file
 * Features:
 * - Proper RTL sheet view (right-to-left layout for Arabic text)
 * - Dynamic column width calculation with generous padding so text doesn't truncate or display "###"
 * - AutoFilter headers
 * - Also provides rich HTML-formatted corporate Excel table fallback
 */
export function exportToExcel(
  data: Record<string, any>[], 
  sheetName: string, 
  fileName: string, 
  reportTitle?: string
) {
  if (!data || data.length === 0) return;

  try {
    const ws = XLSX.utils.json_to_sheet(data);

    // 1. Right-to-Left (RTL) mode for Arabic
    ws['!views'] = [{ RTL: true }];

    // 2. Auto-compute column widths based on longest cell content in each column
    const keys = Object.keys(data[0] || {});
    const colWidths = keys.map((key) => {
      let maxLen = key.length * 1.5;
      for (const row of data) {
        const val = row[key];
        if (val !== undefined && val !== null) {
          const str = String(val);
          if (str.length * 1.3 > maxLen) {
            maxLen = str.length * 1.3;
          }
        }
      }
      return { wch: Math.max(Math.ceil(maxLen) + 3, 14) };
    });
    ws['!cols'] = colWidths;

    // 3. Set row heights
    ws['!rows'] = [{ hpt: 26 }, ...Array(data.length).fill({ hpt: 20 })];

    // 4. Set AutoFilter on table headers
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (error) {
    console.error('Error in standard XLSX export, trying styled HTML table export:', error);
    exportStyledExcel(data, fileName, reportTitle || sheetName);
  }
}

/**
 * Point 11: Professional HTML/XML-based Spreadsheet Export with soothing, eye-pleasing colors
 * (Opens natively in Microsoft Excel with 100% full CSS styling, RTL, borders, and colors)
 */
export function exportStyledExcel(
  data: Record<string, any>[], 
  fileName: string, 
  title: string = 'تقرير النظام'
) {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const currentDate = new Date().toLocaleDateString('ar-EG');
  const currentTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  let html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${title.slice(0, 31)}</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    body { font-family: 'Segoe UI', 'Cairo', Tahoma, sans-serif; direction: rtl; }
    table { border-collapse: collapse; width: 100%; direction: rtl; }
    .header-banner { background-color: #0f172a; color: #38bdf8; font-size: 16pt; font-weight: bold; text-align: center; padding: 12px; }
    .meta-bar { background-color: #f1f5f9; color: #475569; font-size: 10pt; padding: 6px 12px; text-align: right; border-bottom: 2px solid #cbd5e1; }
    th { background-color: #1e293b; color: #ffffff; font-weight: bold; font-size: 11pt; padding: 10px 8px; border: 1px solid #334155; text-align: center; }
    td { padding: 8px 10px; font-size: 10pt; border: 1px solid #e2e8f0; text-align: right; }
    tr:nth-child(even) { background-color: #f8fafc; }
    tr:hover { background-color: #f1f5f9; }
    .center { text-align: center; }
    .number { font-family: 'JetBrains Mono', 'Consolas', monospace; direction: ltr; text-align: center; font-weight: bold; }
    .badge-success { background-color: #dcfce7; color: #15803d; font-weight: bold; border-radius: 4px; padding: 2px 6px; }
    .badge-danger { background-color: #fee2e2; color: #b91c1c; font-weight: bold; border-radius: 4px; padding: 2px 6px; }
    .badge-warning { background-color: #fef3c7; color: #b45309; font-weight: bold; border-radius: 4px; padding: 2px 6px; }
    .badge-info { background-color: #e0f2fe; color: #0369a1; font-weight: bold; border-radius: 4px; padding: 2px 6px; }
  </style>
</head>
<body>
  <table>
    <tr>
      <td colspan="${headers.length}" class="header-banner">${title}</td>
    </tr>
    <tr>
      <td colspan="${headers.length}" class="meta-bar">
        تاريخ الاستخراج: ${currentDate} ${currentTime} | نظام إدارة ماكينات البصمة - المطور: Muhammad Abdullah | إجمالي السجلات: ${data.length}
      </td>
    </tr>
    <tr>
      ${headers.map((h) => `<th>${h}</th>`).join('')}
    </tr>
    ${data
      .map((row) => {
        return `<tr>
          ${headers
            .map((h) => {
              const val = row[h] ?? '';
              const strVal = String(val);
              let cellClass = '';
              if (/حاضر|معتمد|نشط|مكتمل/.test(strVal)) cellClass = 'class="center badge-success"';
              else if (/غائب|بدون إذن|فشل|غير متصل/.test(strVal)) cellClass = 'class="center badge-danger"';
              else if (/متأخر|أثر رجعي|ساري|عارضة/.test(strVal)) cellClass = 'class="center badge-warning"';
              else if (/إضافي|مأمورية|اعتيادي/.test(strVal)) cellClass = 'class="center badge-info"';
              else if (typeof val === 'number' || /^\d+(\.\d+)?(\s*(س|د|ج\.م|%))?$/.test(strVal)) cellClass = 'class="number"';
              return `<td ${cellClass}>${val}</td>`;
            })
            .join('')}
        </tr>`;
      })
      .join('')}
  </table>
</body>
</html>`;

  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Fallback CSV export
 */
export function exportToCsv(data: Record<string, any>[], fileName: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => `"${row[h] ?? ''}"`).join(','));
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
