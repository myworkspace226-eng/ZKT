import React, { useState, useMemo } from 'react';
import { 
  Fingerprint, 
  Search, 
  Plus, 
  FileSpreadsheet,
  Eye,
  EyeOff,
  Calendar,
  Filter,
  ChevronRight,
  ChevronLeft,
  Clock,
  Layers,
  Sparkles,
  Info,
  Edit2,
  Trash2,
  Save,
  X,
  AlertCircle,
  ScanFace,
  CreditCard,
  AlertTriangle
} from 'lucide-react';
import { AttendanceRecord, Worker, Device, FactorySettings } from '../types';
import { processSmartAttendanceLogs, exportToExcel } from '../utils/attendanceEngine';

interface AttendanceLogsProps {
  records: AttendanceRecord[];
  workers: Worker[];
  devices: Device[];
  shiftEndTime?: string;
  settings?: FactorySettings;
  onAddManualRecord: (record: AttendanceRecord) => void;
  onUpdateRecord?: (record: AttendanceRecord) => void;
  onDeleteRecord?: (id: string) => void;
}

type DatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export const AttendanceLogs: React.FC<AttendanceLogsProps> = ({
  records,
  workers,
  devices,
  shiftEndTime = '16:30',
  settings,
  onAddManualRecord,
  onUpdateRecord,
  onDeleteRecord,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');

  // Edit Punch Modal State (Point 5)
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editWorkerCode, setEditWorkerCode] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('');
  const [editState, setEditState] = useState<'IN' | 'OUT'>('IN');
  const [editPunchType, setEditPunchType] = useState<any>('FINGERPRINT');
  const [editDeviceId, setEditDeviceId] = useState<number>(0);
  const [editLateMinutes, setEditLateMinutes] = useState<number>(0);
  const [editOvertimeHours, setEditOvertimeHours] = useState<number>(0);
  const [editNote, setEditNote] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Date Filtering State
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const todayISO = new Date().toISOString().slice(0, 10);
  const [customFromDate, setCustomFromDate] = useState<string>(todayISO);
  const [customToDate, setCustomToDate] = useState<string>(todayISO);

  // Real Dynamic Deduplication State
  const [filterDuplicates, setFilterDuplicates] = useState<boolean>(true);
  const [duplicateThresholdMinutes, setDuplicateThresholdMinutes] = useState<number>(10);

  // Pagination State (for 10,000+ records lightning-fast rendering)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  // Manual record form modal
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualWorkerCode, setManualWorkerCode] = useState<number>(workers.length > 0 ? workers[0].code : 101);
  const [manualType, setManualType] = useState<'IN' | 'OUT'>('IN');
  const [manualTime, setManualTime] = useState<string>('08:00');
  const [manualDate, setManualDate] = useState<string>(todayISO);
  const [manualReason, setManualReason] = useState<string>('');
  const [manualEditor, setManualEditor] = useState<string>('مسؤول الموارد البشرية');

  // Fast map lookup for worker info
  const workerMap = useMemo(() => {
    const map = new Map<number, Worker>();
    workers.forEach((w) => map.set(w.code, w));
    return map;
  }, [workers]);

  // Smart Attendance Processing (Dynamic Cooldown, 1st & Last Punch, Shift Reactivity, 3-zone Single Punch)
  const { smartRecords, detectedDuplicatesCount, missedPunchesCount, ambiguousCount } = useMemo(() => {
    const processed = processSmartAttendanceLogs(records, { 
      shiftEndTime: settings?.standardShiftEnd || shiftEndTime,
      bangladeshiShiftEnd: settings?.bangladeshiShiftEnd || '18:30',
      earlyDepartureWindowMinutes: settings?.earlyDepartureWindowMinutes ?? 30,
      duplicateWindowMinutes: settings?.duplicateWindowMinutes ?? 60,
      overnightCutoffHour: settings?.overnightCutoffHour ?? 6,
      workers,
      workerMap,
    });
    let dupCount = 0;
    let missedCount = 0;
    let ambigCount = 0;

    const enriched = processed.map((rec) => {
      const worker = workerMap.get(rec.workerCode);
      const effectiveName = (worker && worker.name && !worker.name.startsWith('عامل كود #') && !worker.name.startsWith('عامل كود'))
        ? worker.name 
        : rec.workerName;
      const effectiveDept = worker?.department || rec.department;

      if (rec.isDuplicateIgnored) dupCount++;
      if (rec.isMissedPunch) missedCount++;
      if (rec.isAmbiguousSinglePunch) ambigCount++;

      return {
        ...rec,
        workerName: effectiveName,
        department: effectiveDept,
      };
    });

    // Re-sort descending (newest records first) for the UI
    enriched.sort((a, b) => {
      const tA = new Date(`${a.displayDate}T${a.displayTime}:00`).getTime();
      const tB = new Date(`${b.displayDate}T${b.displayTime}:00`).getTime();
      if (isNaN(tA) || isNaN(tB)) return (b.id || '').localeCompare(a.id || '');
      return tB - tA;
    });

    return { 
      smartRecords: enriched, 
      detectedDuplicatesCount: dupCount, 
      missedPunchesCount: missedCount,
      ambiguousCount: ambigCount
    };
  }, [records, workerMap, settings, shiftEndTime, workers]);

  // Filtered records by Date, Deduplication, Department, State, and Search
  const filteredRecords = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    return smartRecords.filter((rec) => {
      // 1. Deduplication filter (< 60 minutes)
      if (filterDuplicates && rec.isDuplicateIgnored) return false;

      // 2. Date presets
      if (datePreset === 'today' && rec.displayDate !== today) return false;
      if (datePreset === 'yesterday' && rec.displayDate !== yesterdayDate) return false;
      if (datePreset === 'week' && rec.displayDate < sevenDaysAgo) return false;
      if (datePreset === 'month' && rec.displayDate < monthStart) return false;
      if (datePreset === 'custom') {
        if (customFromDate && rec.displayDate < customFromDate) return false;
        if (customToDate && rec.displayDate > customToDate) return false;
      }

      // 3. Department filter
      if (selectedDept !== 'all' && rec.department !== selectedDept) return false;

      // 4. Punch state & special filters
      if (selectedState === 'IN' && rec.resolvedState !== 'IN') return false;
      if (selectedState === 'OUT' && rec.resolvedState !== 'OUT') return false;
      if (selectedState === 'AMBIGUOUS' && !rec.isAmbiguousSinglePunch) return false;
      if (selectedState === 'MISSED' && !rec.isMissedPunch) return false;
      if (selectedState === 'HR_OVERRIDE' && !rec.isHROverride && !rec.isManual) return false;

      // 5. Device filter
      if (selectedDeviceId !== 'all' && String(rec.deviceId) !== selectedDeviceId) return false;

      // 6. Text search query (Name, Code, Dept)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = rec.workerName.toLowerCase().includes(q);
        const matchesCode = rec.workerCode.toString().includes(q);
        const matchesDept = rec.department.toLowerCase().includes(q);
        const matchesDevice = rec.deviceName.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesDept && !matchesDevice) return false;
      }

      return true;
    });
  }, [
    smartRecords,
    filterDuplicates,
    datePreset,
    customFromDate,
    customToDate,
    selectedDept,
    selectedState,
    selectedDeviceId,
    searchQuery,
  ]);

  // Departments list for dropdown
  const departments = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => set.add(w.department));
    records.forEach((r) => set.add(r.department));
    return Array.from(set).filter(Boolean);
  }, [workers, records]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const paginatedRecords = useMemo(() => {
    const startIndex = (validPage - 1) * pageSize;
    return filteredRecords.slice(startIndex, startIndex + pageSize);
  }, [filteredRecords, validPage, pageSize]);

  // Handle Export to Excel with full details
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return;
    const exportData = filteredRecords.map((r) => ({
      'كود العامل': r.workerCode,
      'اسم العامل': r.workerName,
      'القسم': r.department,
      'التاريخ': r.displayDate,
      'الوقت': r.displayTime,
      'الحالة': r.resolvedState === 'IN' ? 'حضور' : 'انصراف',
      'طريقة التسجيل': r.punchType === 'FACE' ? 'بصمة وجه' : r.punchType === 'CARD' ? 'كارت' : r.punchType === 'MANUAL' ? 'يدوي (HR)' : 'بصمة إصبع',
      'الماكينة': r.deviceName,
      'حالة الحركة': r.isMissedPunch ? 'بصمة ناقصة' : r.isHROverride ? 'معتمد HR' : r.isDuplicateIgnored ? 'تكرار مستبعد' : 'حركة سليمة',
      'ملاحظات': r.manualNote || '',
    }));

    const dateLabel = datePreset === 'today' ? 'اليوم' : datePreset === 'all' ? 'الكل' : datePreset;
    exportToExcel(
      exportData, 
      'سجل_الحركات', 
      `سجل_حركات_البصمة_${dateLabel}_${new Date().toISOString().slice(0, 10)}`
    );
  };

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    const worker = workers.find((w) => w.code === manualWorkerCode);
    if (!worker) return;

    const newRecord: AttendanceRecord = {
      id: `man-${Date.now()}`,
      workerCode: worker.code,
      workerName: worker.name,
      department: worker.department,
      timestamp: `${manualDate}T${manualTime}:00`,
      displayDate: manualDate,
      displayTime: manualTime,
      rawState: manualType,
      resolvedState: manualType,
      deviceId: 0,
      deviceName: 'تسجيل يدوي',
      punchType: 'MANUAL',
      isManual: true,
      isHROverride: true,
      isMissedPunch: false,
      isDuplicateIgnored: false,
      manualNote: manualReason || 'تسجيل يدوي بواسطة HR',
      manualEditor: manualEditor,
    };

    onAddManualRecord(newRecord);
    setShowManualModal(false);
    setManualReason('');
  };

  const handleStartEdit = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setEditWorkerCode(rec.workerCode);
    setEditDate(rec.displayDate);
    setEditTime(rec.displayTime);
    setEditState(rec.resolvedState);
    setEditPunchType(rec.punchType || 'FINGERPRINT');
    setEditDeviceId(rec.deviceId);
    setEditLateMinutes(rec.lateMinutes || 0);
    setEditOvertimeHours(rec.overtimeHours || 0);
    setEditNote(rec.manualNote || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const worker = workerMap.get(editWorkerCode);
    const device = devices.find((d) => d.id === editDeviceId);

    const updatedRecord: AttendanceRecord = {
      ...editingRecord,
      workerCode: editWorkerCode,
      workerName: worker ? worker.name : editingRecord.workerName,
      department: worker ? worker.department : editingRecord.department,
      displayDate: editDate,
      displayTime: editTime,
      timestamp: `${editDate}T${editTime}:00`,
      rawState: editState,
      resolvedState: editState,
      punchType: editPunchType,
      deviceId: editDeviceId,
      deviceName: device ? device.name : editingRecord.deviceName,
      isManual: true,
      isHROverride: true,
      isMissedPunch: false,
      isDuplicateIgnored: false,
      lateMinutes: editState === 'IN' && editLateMinutes > 0 ? editLateMinutes : undefined,
      overtimeHours: editOvertimeHours > 0 ? editOvertimeHours : undefined,
      isOvertime: editOvertimeHours > 0,
      manualNote: editNote.trim() ? editNote.trim() : 'تم التعديل والاعتماد يدوياً (HR Override)',
    };

    if (onUpdateRecord) {
      onUpdateRecord(updatedRecord);
    }
    setEditingRecord(null);
  };

  const handleDeletePunch = (id: string) => {
    if (onDeleteRecord) {
      onDeleteRecord(id);
    }
    setDeleteConfirmId(null);
  };

  const handleResolveAmbiguous = (record: AttendanceRecord, chosenDirection: 'IN' | 'OUT') => {
    if (!onUpdateRecord) return;
    const updatedRecord: AttendanceRecord = {
      ...record,
      rawState: chosenDirection,
      resolvedState: chosenDirection,
      isAmbiguousSinglePunch: false,
      isHROverride: true,
      isManual: true,
      isMissedPunch: true,
      missedPunchType: chosenDirection === 'IN' ? 'OUT' : 'IN',
      missedPunchReason: chosenDirection === 'IN' 
        ? 'تم اعتماد البصمة كحضور متأخر بواسطة HR (الانصراف مفقود)' 
        : 'تم اعتماد البصمة كانصراف مبكر بواسطة HR (الحضور مفقود)',
      manualNote: `اعتماد HR: ${chosenDirection === 'IN' ? 'حضور' : 'انصراف'}`,
    };
    onUpdateRecord(updatedRecord);
  };

  return (
    <div className="space-y-3.5">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Fingerprint className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>سجل حركات البصمة</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-blue-400 font-mono border border-slate-700">
                {filteredRecords.length.toLocaleString('ar-EG')} حركة
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              إجمالي السجلات المسحوبة: <span className="font-mono text-slate-300 font-bold">{records.length.toLocaleString('ar-EG')}</span>
              {detectedDuplicatesCount > 0 && (
                <span className="text-amber-400 mr-2">
                  (تم رصد {detectedDuplicatesCount} بصمة مكررة)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Deduplication Toggle (Smart 1-Hour Rule) */}
          <button
            onClick={() => {
              setFilterDuplicates(!filterDuplicates);
              setCurrentPage(1);
            }}
            title="تجاهل تكرار البصمة الأقل من ساعة واحدة (Smart Deduplication)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
              filterDuplicates
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {filterDuplicates ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>استبعاد التكرار (&lt; 1 ساعة)</span>
            {detectedDuplicatesCount > 0 && filterDuplicates && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-800 text-[10px] font-mono">
                -{detectedDuplicatesCount}
              </span>
            )}
          </button>

          {/* Add Manual Record */}
          {workers.length > 0 && (
            <button
              onClick={() => {
                setManualWorkerCode(workers[0].code);
                setShowManualModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة حركة يدوية</span>
            </button>
          )}

          {/* Export to Excel */}
          {filteredRecords.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>تصدير Excel ({filteredRecords.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Date Range Selection Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1 ml-1">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>نطاق العرض:</span>
          </span>

          <button
            onClick={() => { setDatePreset('all'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'all'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            كل السجلات (الأرشيف)
          </button>

          <button
            onClick={() => { setDatePreset('today'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'today'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            اليوم فقط
          </button>

          <button
            onClick={() => { setDatePreset('yesterday'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'yesterday'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            أمس
          </button>

          <button
            onClick={() => { setDatePreset('week'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'week'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            آخر 7 أيام
          </button>

          <button
            onClick={() => { setDatePreset('month'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'month'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            الشهر الحالي
          </button>

          <button
            onClick={() => { setDatePreset('custom'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'custom'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            فترة مخصصة
          </button>
        </div>

        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">من:</span>
            <input
              type="date"
              value={customFromDate}
              onChange={(e) => { setCustomFromDate(e.target.value); setCurrentPage(1); }}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs"
            />
            <span className="text-slate-400">إلى:</span>
            <input
              type="date"
              value={customToDate}
              onChange={(e) => { setCustomToDate(e.target.value); setCurrentPage(1); }}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* Advanced Search & Filtering Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="بحث باسم العامل، الكود، أو القسم..."
            className="w-full bg-slate-950 border border-slate-800 rounded pr-8 pl-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {departments.length > 0 && (
          <select
            value={selectedDept}
            onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">كل الأقسام</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}

        <select
          value={selectedState}
          onChange={(e) => { setSelectedState(e.target.value); setCurrentPage(1); }}
          className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="all">كل الحركات</option>
          <option value="IN">حضور فقط</option>
          <option value="OUT">انصراف فقط</option>
          <option value="AMBIGUOUS">بصمات غامضة تحتاج قرار HR ({ambiguousCount})</option>
          <option value="MISSED">بصمات ناقصة ({missedPunchesCount})</option>
          <option value="HR_OVERRIDE">معتمد ومعدل يدوياً (HR)</option>
        </select>

        {devices.length > 0 && (
          <select
            value={selectedDeviceId}
            onChange={(e) => { setSelectedDeviceId(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">كل الماكينات</option>
            {devices.map((d) => (
              <option key={d.id} value={String(d.id)}>{d.name} ({d.ip})</option>
            ))}
          </select>
        )}

        {/* Page Size */}
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
          className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value={50}>50 في الصفحة</option>
          <option value={100}>100 في الصفحة</option>
          <option value={250}>250 في الصفحة</option>
          <option value={500}>500 في الصفحة</option>
        </select>
      </div>

      {/* Main Records Table with High-Performance Rendering */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        {paginatedRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold">كود العامل</th>
                  <th className="py-2.5 px-3 font-semibold">اسم العامل</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold">التاريخ</th>
                  <th className="py-2.5 px-3 font-semibold">الوقت</th>
                  <th className="py-2.5 px-3 font-semibold text-center">نوع الحركة</th>
                  <th className="py-2.5 px-3 font-semibold text-center">طريقة البصمة</th>
                  <th className="py-2.5 px-3 font-semibold">الماكينة</th>
                  <th className="py-2.5 px-3 font-semibold">ملاحظات</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {paginatedRecords.map((record) => (
                  <tr 
                    key={record.id} 
                    className={`hover:bg-slate-850 transition-colors ${
                      record.isDuplicateIgnored 
                        ? 'bg-amber-950/20 opacity-75' 
                        : record.isAmbiguousSinglePunch
                          ? 'bg-amber-950/30 border-l-2 border-amber-500'
                          : record.isMissedPunch 
                            ? 'bg-rose-950/15' 
                            : ''
                    }`}
                  >
                    <td className="py-2 px-3 text-slate-300 font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 text-[11px]">
                        {record.workerCode}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-white font-sans font-medium">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span>{record.workerName}</span>
                          {record.isHROverride && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-sans font-normal" title="حركة معتمدة أو مضافة يدوياً بواسطة HR">
                              معتمد HR
                            </span>
                          )}
                        </div>
                        {record.isAmbiguousSinglePunch ? (
                          <span className="text-[9px] text-amber-300 font-sans flex items-center gap-1 font-semibold" title={record.missedPunchReason}>
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                            <span>بصمة واحدة غامضة (منتصف الوردية)</span>
                          </span>
                        ) : record.isMissedPunch ? (
                          <span className="text-[9px] text-rose-400 font-sans flex items-center gap-1" title={record.missedPunchReason}>
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            <span>{record.missedPunchReason || 'بصمة ناقصة'}</span>
                          </span>
                        ) : null}
                        {record.isDuplicateIgnored && (
                          <span className="text-[9px] text-amber-400/80 font-sans">
                            {record.duplicateReason || 'تكرار مستبعد (أقل من ساعة)'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-300 font-sans text-[11px]">
                      {record.department}
                    </td>
                    <td className="py-2 px-3 text-slate-300 text-[11px]">
                      {record.displayDate}
                    </td>
                    <td className="py-2 px-3 text-slate-200 font-bold text-xs">
                      {record.displayTime}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {record.isAmbiguousSinglePunch ? (
                          <>
                            <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded inline-block bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              غير محددة (منتصف الوردية)
                            </span>
                            {onUpdateRecord && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleResolveAmbiguous(record, 'IN')}
                                  className="px-1.5 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-[9px] font-sans transition-colors cursor-pointer"
                                  title="اعتماد كحضور متأخر"
                                >
                                  اعتماد حضور
                                </button>
                                <button
                                  onClick={() => handleResolveAmbiguous(record, 'OUT')}
                                  className="px-1.5 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 text-[9px] font-sans transition-colors cursor-pointer"
                                  title="اعتماد كانصراف مبكر"
                                >
                                  اعتماد انصراف
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <span className={`text-[10px] font-sans font-bold px-2 py-0.5 rounded inline-block ${
                              record.resolvedState === 'IN'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            }`}>
                              {record.resolvedState === 'IN' ? 'حضور' : 'انصراف'}
                            </span>
                            {record.isEarlyDeparture && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-sans" title={record.earlyDepartureReason}>
                                انصراف مبكر (-{record.earlyDepartureMinutes || 0} د)
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {record.punchType === 'FACE' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          <ScanFace className="w-3 h-3 text-purple-400 shrink-0" />
                          <span>بصمة وجه</span>
                        </span>
                      ) : record.punchType === 'CARD' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <CreditCard className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>كارت</span>
                        </span>
                      ) : record.punchType === 'MANUAL' || record.isManual ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          <Edit2 className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>يدوي (HR)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                          <Fingerprint className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span>بصمة إصبع</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-300 font-sans text-[11px]">
                      {record.deviceName}
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-sans text-[11px]">
                      {record.manualNote || '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleStartEdit(record)}
                          className="p-1 rounded bg-slate-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-400 transition-colors cursor-pointer"
                          title="تعديل بصمة العامل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteRecord && (
                          <button
                            onClick={() => setDeleteConfirmId(record.id)}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-600/30 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer"
                            title="حذف الحركة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-xs text-slate-400 space-y-2">
            <Info className="w-7 h-7 mx-auto text-slate-600 mb-1" />
            <p className="font-medium text-slate-300">لا توجد حركات مسجلة تطابق خيارات التصفية الحالية.</p>
            <p className="text-[11px] text-slate-500">
              جرّب اختيار "كل السجلات (الأرشيف)" أو إلغاء تفعيل "استبعاد التكرار" للاطلاع على كامل السجلات.
            </p>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredRecords.length > pageSize && (
          <div className="bg-slate-950 p-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-slate-400 font-mono text-[11px]">
              عرض السجلات من <span className="text-white font-bold">{((validPage - 1) * pageSize) + 1}</span> إلى{' '}
              <span className="text-white font-bold">{Math.min(validPage * pageSize, filteredRecords.length)}</span> من أصل{' '}
              <span className="text-blue-400 font-bold">{filteredRecords.length.toLocaleString('ar-EG')}</span>
            </div>

            <div className="flex items-center gap-1.5 font-mono">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage <= 1}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="font-sans text-xs">السابق</span>
              </button>

              <span className="text-slate-300 px-2 text-[11px]">
                صفحة <span className="text-white font-bold">{validPage}</span> من{' '}
                <span className="text-white font-bold">{totalPages}</span>
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage >= totalPages}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
              >
                <span className="font-sans text-xs">التالي</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-5 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>إضافة حركة يدوية (تصحيح HR)</span>
              </h3>
              <button 
                onClick={() => setShowManualModal(false)} 
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">العامل:</label>
                <select
                  value={manualWorkerCode}
                  onChange={(e) => setManualWorkerCode(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white cursor-pointer"
                >
                  {workers.map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.code} - {w.name} ({w.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">نوع الحركة:</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white cursor-pointer"
                  >
                    <option value="IN">حضور</option>
                    <option value="OUT">انصراف</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">الوقت:</label>
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">التاريخ:</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">سبب التسجيل اليدوي:</label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                  placeholder="مثلاً: عطل قارئ البصمة، نسيان البصمة، مأمورية عمل..."
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
                >
                  حفظ الحركة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Punch Modal (Point 5) */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  تعديل بصمة العامل #{editingRecord.workerCode} ({editingRecord.workerName})
                </h3>
              </div>
              <button 
                onClick={() => setEditingRecord(null)} 
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">كود العامل:</label>
                  <select
                    value={editWorkerCode}
                    onChange={(e) => setEditWorkerCode(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white cursor-pointer"
                  >
                    {workers.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name} ({w.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">نوع الحركة (حضور / انصراف):</label>
                  <select
                    value={editState}
                    onChange={(e) => setEditState(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white cursor-pointer"
                  >
                    <option value="IN">حضور (Check-In)</option>
                    <option value="OUT">انصراف (Check-Out)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">التاريخ:</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">الوقت الدقيق (ساعة:دقيقة:ثانية):</label>
                  <input
                    type="time"
                    step="1"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">طريقة البصمة:</label>
                  <select
                    value={editPunchType}
                    onChange={(e) => setEditPunchType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white cursor-pointer"
                  >
                    <option value="FINGERPRINT">بصمة يد (Fingerprint)</option>
                    <option value="FACE">بصمة وجه (Face)</option>
                    <option value="CARD">كارت (Card)</option>
                    <option value="MANUAL">يدوي / تصحيح إدارة (Manual)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">الماكينة المسجل عليها:</label>
                  <select
                    value={editDeviceId}
                    onChange={(e) => setEditDeviceId(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white cursor-pointer"
                  >
                    <option value={0}>تسجيل يدوي (بدون ماكينة)</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} (#{d.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editState === 'IN' && (
                <div>
                  <label className="text-slate-300 block mb-1">دقائق التأخير المرصودة (0 إذا كان في الموعد):</label>
                  <input
                    type="number"
                    min="0"
                    value={editLateMinutes}
                    onChange={(e) => setEditLateMinutes(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              )}

              {editState === 'OUT' && (
                <div>
                  <label className="text-slate-300 block mb-1">ساعات العمل الإضافي المعتمدة (اختياري):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editOvertimeHours}
                    onChange={(e) => setEditOvertimeHours(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
                    placeholder="مثلاً: 1.5 أو 2"
                  />
                </div>
              )}

              <div>
                <label className="text-slate-300 block mb-1">ملاحظات وسبب التعديل:</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
                  placeholder="مثلاً: تصحيح خطأ بصمة خروج بدلاً من دخول، مأمورية عمل..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ التعديل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">تأكيد حذف حركة البصمة</h3>
            </div>
            <p className="text-xs text-slate-300">
              هل أنت متأكد من حذف هذه الحركة نهائياً من سجل الحركات؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleDeletePunch(deleteConfirmId)}
                className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
