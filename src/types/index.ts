export type DeviceStatus = 'connected' | 'disconnected' | 'syncing' | 'error';

export interface Device {
  id: number;
  name: string;
  ip: string;
  port: number;
  commKey?: number; // Communication Password / Key
  model: string; // MB2000, MB2000/ID, K40 Pro/ID, etc.
  serialNumber: string;
  status: DeviceStatus;
  department: string;
  userCount: number;
  fpCount: number;
  faceCount: number;
  recordCount: number;
  lastSyncTime: string;
  pingMs?: number;
}

export type Nationality = 'مصري' | 'بنغلاديشي' | 'أخرى';

export interface Worker {
  id: string;
  code: number;
  name: string;
  department: string;
  line: string;
  jobTitle: string;
  nationality: Nationality;
  shiftId: 'standard' | 'bangladeshi' | 'custom';
  customGraceMinutes: number;
  isActive: boolean;
  deactivationReason?: string;
  deactivationDate?: string;
  assignedDeviceIds: number[];
  aliasCodes?: number[];
  hasFingerprint: boolean;
  hasFace: boolean;
  phone?: string;
  joinDate: string;
  hourlyRate?: number;
  isNameSyncedToDevice?: boolean;
  enrolledOnDeviceName?: string;
}

export type PunchType = 'FINGERPRINT' | 'FACE' | 'CARD' | 'MANUAL';

export interface AttendanceRecord {
  id: string;
  workerCode: number;
  workerName: string;
  department: string;
  timestamp: string; // ISO
  displayTime: string;
  displayDate: string;
  rawState: 'IN' | 'OUT';
  resolvedState: 'IN' | 'OUT';
  deviceId: number;
  deviceName: string;
  punchType: PunchType;
  verifyType?: number;
  isDuplicateIgnored?: boolean;
  duplicateGroup?: string;
  duplicateReason?: string;
  isManual?: boolean;
  isHROverride?: boolean;
  manualNote?: string;
  manualEditor?: string;
  isOvertime?: boolean;
  overtimeHours?: number;
  lateMinutes?: number;
  isMissedPunch?: boolean;
  isAmbiguousSinglePunch?: boolean;
  missedPunchType?: 'IN' | 'OUT' | 'AMBIGUOUS';
  missedPunchReason?: string;
  isEarlyDeparture?: boolean;
  earlyDepartureMinutes?: number;
  earlyDepartureReason?: string;
}

export interface ShiftRule {
  id: 'standard' | 'bangladeshi' | 'custom';
  name: string;
  description: string;
  startTime: string; // e.g. "08:00"
  endTime: string; // e.g. "16:30" or "18:30"
  breakStart: string; // "12:30"
  breakDurationMinutes: number; // 30
  earlyArrivalWindowStart: string; // "06:30"
  generalGraceMinutes: number; // 15
  overnightEndThreshold: string; // "07:00"
  fridayMultiplier: number; // 2.0
}

export type AbsenceCategory = 
  | 'excused_annual'     // إجازة اعتيادية
  | 'excused_casual'     // إجازة عارضة
  | 'official_pass'      // بإذن / تصريح معتمد
  | 'medical'            // إجازة مرضي
  | 'unexcused';         // غياب بدون إذن

export interface DailyAbsenceRecord {
  workerCode: number;
  workerName: string;
  department: string;
  line: string;
  jobTitle: string;
  status: 'present' | 'absent';
  absenceType?: AbsenceCategory;
  checkInTime?: string;
  notes?: string;
}

export interface GatePass {
  id: string;
  workerCode: number;
  workerName: string;
  department: string;
  date: string; // YYYY-MM-DD (Supports any day/retroactive)
  exitTime: string;
  returnTime?: string;
  type: 'temporary' | 'rest_of_day';
  reason: 'official_mission' | 'medical' | 'personal_with_deduction' | 'personal_excused';
  reasonText: string;
  approvedBy: string;
  status: 'active' | 'completed';
  isRetroactive?: boolean;
}

export interface FactorySettings {
  factoryName: string;
  branchName: string;
  defaultGraceMinutes: number;
  earlyDepartureWindowMinutes: number; // e.g. 30 (from 16:00 to 16:30)
  duplicateWindowMinutes: number; // e.g. 60 (cooldown to ignore duplicate punches)
  standardShiftStart: string; // "08:00"
  standardShiftEnd: string; // "16:30"
  bangladeshiShiftStart: string; // "08:00"
  bangladeshiShiftEnd: string; // "18:30"
  overnightCutoffHour: number; // 6 (06:00 AM)
  autoAbsenceCutoffTime: string; // e.g. "08:30"
  autoSyncIntervalMinutes: number;
  fridayMultiplier?: number;
  regularOvertimeMultiplier?: number;
  nightOvertimeMultiplier?: number;
  defaultHourlyRate?: number;
}

export interface ProductionLineStatus {
  lineName: string;
  department: string;
  totalAssigned: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  attendanceRate: number;
  isCritical: boolean;
}
