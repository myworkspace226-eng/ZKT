import React, { useState, useMemo } from 'react';
import { 
  Fingerprint, 
  ScanFace, 
  Search, 
  Plus, 
  FileSpreadsheet,
  Eye,
  EyeOff,
  Clock
} from 'lucide-react';
import { AttendanceRecord, Worker, Device } from '../types';
import { exportToExcel } from '../utils/attendanceEngine';

interface AttendanceLogsProps {
  records: AttendanceRecord[];
  workers: Worker[];
  devices: Device[];
  onAddManualRecord: (record: AttendanceRecord) => void;
}

export const AttendanceLogs: React.FC<AttendanceLogsProps> = ({
  records,
  workers,
  devices,
  onAddManualRecord,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [filterDuplicates, setFilterDuplicates] = useState<boolean>(true);
  const [showManualModal, setShowManualModal] = useState<boolean>(false);

  // Manual record form
  const [manualWorkerCode, setManualWorkerCode] = useState<number>(0);
  const [manualType, setManualType] = useState<'IN' | 'OUT'>('IN');
  const [manualTime, setManualTime] = useState<string>('08:00');
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [manualReason, setManualReason] = useState<string>('');
  const [manualEditor, setManualEditor] = useState<string>('HR');

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      if (filterDuplicates && rec.isDuplicateIgnored) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = rec.workerName.toLowerCase().includes(q);
        const matchesCode = rec.workerCode.toString().includes(q);
        const matchesDept = rec.department.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesDept) return false;
      }

      if (selectedDept !== 'all' && rec.department !== selectedDept) return false;
      if (selectedState !== 'all' && rec.resolvedState !== selectedState) return false;

      return true;
    });
  }, [records, filterDuplicates, searchQuery, selectedDept, selectedState]);

  const departments = useMemo(() => {
    return Array.from(new Set(workers.map((w) => w.department)));
  }, [workers]);

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return;
    const exportData = filteredRecords.map((r) => ({
      'كود العامل': r.workerCode,
      'اسم العامل': r.workerName,
      'القسم': r.department,
      'التاريخ': r.displayDate,
      'الوقت': r.displayTime,
      'الحالة': r.resolvedState === 'IN' ? 'حضور' : 'انصراف',
      'طريقة التسجيل': r.punchType,
      'الماكينة': r.deviceName,
      'ملاحظات': r.manualNote || '',
    }));
    exportToExcel(exportData, 'حركات_الحضور', `سجل_الحركات_${new Date().toISOString().slice(0, 10)}`);
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
      manualNote: manualReason,
      manualEditor: manualEditor,
    };

    onAddManualRecord(newRecord);
    setShowManualModal(false);
  };

  return (
    <div className="space-y-3">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white">سجل الحركات</h2>
          <span className="text-[11px] text-slate-400 font-mono">({filteredRecords.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterDuplicates(!filterDuplicates)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              filterDuplicates
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {filterDuplicates ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>استبعاد التكرار</span>
          </button>

          {workers.length > 0 && (
            <button
              onClick={() => {
                if (workers.length > 0) setManualWorkerCode(workers[0].code);
                setShowManualModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة حركة يدوية</span>
            </button>
          )}

          {filteredRecords.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>تصدير Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو الكود..."
            className="w-full bg-slate-950 border border-slate-800 rounded pr-8 pl-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {departments.length > 0 && (
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">كل الأقسام</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}

        <select
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">كل الحركات</option>
          <option value="IN">حضور</option>
          <option value="OUT">انصراف</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {filteredRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold">كود</th>
                  <th className="py-2.5 px-3 font-semibold">الاسم</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold">الوقت والتاريخ</th>
                  <th className="py-2.5 px-3 font-semibold text-center">نوع الحركة</th>
                  <th className="py-2.5 px-3 font-semibold text-center">النوع</th>
                  <th className="py-2.5 px-3 font-semibold">الماكينة</th>
                  <th className="py-2.5 px-3 font-semibold">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-850 transition-colors">
                    <td className="py-2 px-3 text-slate-300 font-bold">{record.workerCode}</td>
                    <td className="py-2 px-3 text-white font-sans font-medium">{record.workerName}</td>
                    <td className="py-2 px-3 text-slate-400 font-sans">{record.department}</td>
                    <td className="py-2 px-3 text-slate-300">{record.displayTime} · {record.displayDate}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] font-sans font-bold px-2 py-0.5 rounded ${
                        record.resolvedState === 'IN'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      }`}>
                        {record.resolvedState === 'IN' ? 'حضور' : 'انصراف'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400 text-[10px] font-sans">
                      {record.punchType}
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-sans text-[11px]">{record.deviceName}</td>
                    <td className="py-2 px-3 text-slate-500 font-sans text-[11px]">
                      {record.manualNote || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد حركات مسجلة.
          </div>
        )}
      </div>

      {/* Manual Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-white">إضافة حركة يدوية</h3>
              <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">العامل:</label>
                <select
                  value={manualWorkerCode}
                  onChange={(e) => setManualWorkerCode(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                >
                  {workers.map((w) => (
                    <option key={w.code} value={w.code}>{w.code} - {w.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">النوع:</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
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
                <label className="text-slate-300 block mb-1">السبب:</label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                  placeholder="سبب التسجيل اليدوي..."
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
