import * as XLSX from 'xlsx';
import { AttendanceRecord, ShiftRule, Worker } from '../types';

/**
 * Smart logic to resolve whether a punch is IN or OUT, fixing old ZKTeco hardware button glitches.
 * If someone punches at 07:45 AM (like Mohamed Mohamed Abdallah in user's screenshot),
 * it is guaranteed to be a CHECK-IN regardless of whether the machine was set to OUT.
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
 * Filter out duplicate consecutive punches made within cooldown window (e.g. 5 minutes).
 * As seen in screenshot: Worker 442 punched 8 times between 09:27 and 09:31.
 */
export function markDuplicatePunches(
  records: AttendanceRecord[],
  cooldownMinutes: number = 5
): AttendanceRecord[] {
  // Sort by workerCode and timestamp
  const sorted = [...records].sort((a, b) => {
    if (a.workerCode !== b.workerCode) return a.workerCode - b.workerCode;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  const result: AttendanceRecord[] = [];
  const lastAcceptedByWorker: Record<number, number> = {};

  for (const record of sorted) {
    const recordTime = new Date(record.timestamp).getTime();
    const lastTime = lastAcceptedByWorker[record.workerCode];

    if (lastTime && recordTime - lastTime < cooldownMinutes * 60 * 1000) {
      result.push({
        ...record,
        isDuplicateIgnored: true,
        duplicateGroup: `grp-${record.workerCode}-${Math.floor(lastTime / 100000)}`,
      });
    } else {
      lastAcceptedByWorker[record.workerCode] = recordTime;
      result.push({
        ...record,
        isDuplicateIgnored: false,
      });
    }
  }

  return result;
}

/**
 * Calculate worker daily attendance performance, overtime, and late minutes.
 */
export function calculateDailyPerformance(
  worker: Worker,
  checkIn: AttendanceRecord | undefined,
  checkOut: AttendanceRecord | undefined,
  shift: ShiftRule,
  isFriday: boolean = false
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

    if (isFriday) {
      // Friday 2x rule: Basic is 16 hours
      workHours = 8 * shift.fridayMultiplier;
      overtimeHours = Math.max(0, netHours - 8) * shift.fridayMultiplier;
    } else {
      workHours = Math.min(netHours, standardShiftHours);
      if (netHours > standardShiftHours) {
        overtimeHours = Number((netHours - standardShiftHours).toFixed(2));
      }
    }
  } else {
    // Punched in but hasn't punched out yet
    workHours = 8;
  }

  return {
    status: lateMinutes > 0 ? 'حاضر متأخر' : 'حاضر في الموعد',
    workHours: Number(workHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    lateMinutes,
    notes: isFriday ? 'عمل يوم الجمعة (مضاعف 2x - 16 ساعة)' : '',
  };
}

/**
 * Export table or array data directly into standard formatted Microsoft Excel (.xlsx) file
 */
export function exportToExcel(data: Record<string, any>[], sheetName: string, fileName: string) {
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    // Fallback to CSV
    exportToCsv(data, fileName);
  }
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
}
