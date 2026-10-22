import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Fingerprint, 
  ScanFace, 
  CreditCard, 
  Clock, 
  HardDrive, 
  UserCheck, 
  AlertCircle,
  Activity,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Check
} from 'lucide-react';
import { Device, Worker, AttendanceRecord } from '../types';

interface LiveMonitorProps {
  devices: Device[];
  workers: Worker[];
  attendanceRecords: AttendanceRecord[];
  onSyncAll?: () => void;
  isSyncing?: boolean;
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({
  devices,
  workers,
  attendanceRecords,
  onSyncAll,
  isSyncing = false,
}) => {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [selectedMachineFilter, setSelectedMachineFilter] = useState<number | 'all'>('all');

  // Track previous count to beep only when REAL new records are fetched
  const prevCountRef = useRef<number>(attendanceRecords.length);

  useEffect(() => {
    if (soundEnabled && attendanceRecords.length > prevCountRef.current) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.start();
        setTimeout(() => {
          osc.stop();
          audioCtx.close();
        }, 120);
      } catch {
        // AudioContext restricted or unsupported
      }
    }
    prevCountRef.current = attendanceRecords.length;
  }, [attendanceRecords.length, soundEnabled]);

  // Real punches feed only (No synthetic simulation)
  const filteredFeed = attendanceRecords
    .filter((r) => !r.isDuplicateIgnored)
    .filter((r) => selectedMachineFilter === 'all' || r.deviceId === selectedMachineFilter);

  const liveFeed = filteredFeed.slice(0, 35);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRecords = attendanceRecords.filter((r) => !r.isDuplicateIgnored && r.displayDate === todayStr);
  const totalTodayCount = todayRecords.length;
  const todayPresentWorkers = new Set(todayRecords.filter((r) => r.resolvedState === 'IN').map((r) => r.workerCode)).size;
  const todayLateCount = todayRecords.filter((r) => r.resolvedState === 'IN' && (r.lateMinutes || 0) > 0).length;
  const connectedDevicesCount = devices.filter((d) => d.status === 'connected').length;

  return (
    <div className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 p-6 overflow-y-auto' : ''}`}>
      {/* Top Controller Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>المراقبة الحية للبصمات</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>حركات فعلية موثقة</span>
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              يعرض الحركات الحقيقية المسجلة على أجهزة البصمة فقط (بدون أي توليد عشوائي أو وهمي)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Machine Filter */}
          <select
            value={selectedMachineFilter}
            onChange={(e) => setSelectedMachineFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
            className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-hidden"
          >
            <option value="all">جميع الماكينات ({devices.length})</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} (#{d.id})
              </option>
            ))}
          </select>

          {/* Real Sync Button */}
          {onSyncAll && (
            <button
              onClick={onSyncAll}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جاري سحب البصمات...' : 'سحب البصمات الآن'}</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={soundEnabled ? 'كتم صوت البصمة عند تسجيل جديد' : 'تفعيل نغمة عند سحب بصمات جديدة'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>حركات اليوم الفعلية</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {totalTodayCount}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>العمال الحاضرون اليوم</span>
            <UserCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-400 mt-1">
            {todayPresentWorkers} <span className="text-xs font-normal text-slate-400">من {workers.length}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>تأخيرات مرصودة اليوم</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {todayLateCount}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>الماكينات المتصلة</span>
            <HardDrive className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {connectedDevicesCount} / {devices.length}
          </div>
        </div>
      </div>

      {/* Live Punch Feed Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="font-semibold text-white">آخر الحركات الفعلية المسجلة من الماكينات</span>
          <span className="font-mono">{liveFeed.length} حركة معروضة</span>
        </div>

        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
          {liveFeed.length > 0 ? (
            liveFeed.map((record, index) => {
              const isLate = (record.lateMinutes || 0) > 0;
              const isOvertime = record.isOvertime || (record.overtimeHours || 0) > 0;
              const isIn = record.resolvedState === 'IN';

              return (
                <div
                  key={record.id}
                  className={`border rounded-lg p-3 transition-all flex flex-wrap items-center justify-between gap-3 shadow-sm ${
                    index === 0
                      ? 'bg-slate-850 border-blue-500/50 ring-1 ring-blue-500/30'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Worker & Biometric method */}
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isIn 
                        ? isLate ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isOvertime ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                      {record.punchType === 'FACE' ? (
                        <ScanFace className="w-5 h-5" />
                      ) : record.punchType === 'CARD' ? (
                        <CreditCard className="w-5 h-5" />
                      ) : (
                        <Fingerprint className="w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-sans">{record.workerName}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                          كود {record.workerCode}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{record.department}</span>
                        <span>•</span>
                        <span className="text-slate-400 font-mono">{record.deviceName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Punch Status & Time */}
                  <div className="flex items-center gap-3 font-mono">
                    {/* Status Badge */}
                    <div>
                      {isIn ? (
                        isLate ? (
                          <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 text-[11px] font-sans font-medium border border-amber-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>تأخير {record.lateMinutes} دقيقة</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-sans font-medium border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>حضور في الموعد</span>
                          </span>
                        )
                      ) : isOvertime ? (
                        <span className="px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 text-[11px] font-sans font-medium border border-purple-500/30">
                          انصراف (ساعات إضافي)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 text-[11px] font-sans font-medium border border-blue-500/30">
                          انصراف عادي
                        </span>
                      )}
                    </div>

                    {/* Exact Timestamp */}
                    <div className="text-left">
                      <div className="text-xs font-bold text-white">{record.displayTime}</div>
                      <div className="text-[10px] text-slate-400">{record.displayDate}</div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-10 text-center text-xs text-slate-500 space-y-2">
              <Fingerprint className="w-8 h-8 text-slate-600 mx-auto" />
              <p>لا توجد حركات مسجلة تطابق الماكينة المحددة حتى الآن.</p>
              <p className="text-[11px] text-slate-600">اضغط على "سحب البصمات الآن" لجلب أحدث البصمات من الماكينات المتصلة.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
