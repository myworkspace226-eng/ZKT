import React, { useState, useEffect, useRef } from 'react';
import { 
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
  Trash2,
  WifiOff
} from 'lucide-react';
import { Device, Worker, AttendanceRecord } from '../types';

interface LiveMonitorProps {
  devices: Device[];
  workers: Worker[];
  liveSessionRecords: AttendanceRecord[];
  onClearLiveSession?: () => void;
  onSyncAll?: (silent?: boolean) => void;
  isSyncing?: boolean;
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({
  devices,
  workers,
  liveSessionRecords,
  onClearLiveSession,
  onSyncAll,
  isSyncing = false,
}) => {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [selectedMachineFilter, setSelectedMachineFilter] = useState<number | 'all'>('all');

  const prevCountRef = useRef<number>(liveSessionRecords.length);

  // Auto-polling interval every 6 seconds while the Live Monitor is active
  useEffect(() => {
    if (!onSyncAll) return;
    const intervalId = setInterval(() => {
      onSyncAll(true);
    }, 6000);

    return () => {
      clearInterval(intervalId);
    };
  }, [onSyncAll]);

  useEffect(() => {
    if (soundEnabled && liveSessionRecords.length > prevCountRef.current) {
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
        // AudioContext restricted
      }
    }
    prevCountRef.current = liveSessionRecords.length;
  }, [liveSessionRecords.length, soundEnabled]);

  const connectedDevices = devices.filter((d) => d.status === 'connected');
  const isAnyDeviceConnected = connectedDevices.length > 0;

  // Filter session records by machine
  const displayFeed = liveSessionRecords.filter(
    (r) => selectedMachineFilter === 'all' || r.deviceId === selectedMachineFilter
  );

  const totalSessionCount = liveSessionRecords.length;
  const sessionWorkersCount = new Set(liveSessionRecords.map((r) => r.workerCode)).size;

  return (
    <div className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 p-6 overflow-y-auto' : ''}`}>
      {/* Top Controller Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            {isAnyDeviceConnected ? (
              <>
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500" />
              </>
            ) : (
              <div className="w-3 h-3 rounded-full bg-rose-500" />
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>المراقبة الحية للبصمات</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                isAnyDeviceConnected 
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              }`}>
                {isAnyDeviceConnected ? 'بث مباشر نشط' : 'البث متوقف'}
              </span>
            </h2>
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
              onClick={() => onSyncAll()}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جاري الفحص...' : 'تحديث البث'}</span>
            </button>
          )}

          {/* Clear Session Feed Button */}
          {onClearLiveSession && liveSessionRecords.length > 0 && (
            <button
              onClick={onClearLiveSession}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-700 text-xs transition-colors cursor-pointer"
              title="مسح سجل الشاشة الحالية"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح الشاشة</span>
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
            title={soundEnabled ? 'كتم الصوت' : 'تفعيل نغمة البصمة الحية'}
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

      {/* Disconnected Warning Banner if no machines connected */}
      {!isAnyDeviceConnected && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-lg p-3 text-rose-300 text-xs flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0 text-rose-400" />
          <span>الاتصال مقطوع مع ماكينات البصمة. يتوقف البث المباشر تلقائياً حتى يتم الاتصال بالماكينات عبر الشبكة المحلية.</span>
        </div>
      )}

      {/* Live Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>بصمات الجلسة الحالية</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {totalSessionCount}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>عمال بصموا في الجلسة</span>
            <UserCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-400 mt-1">
            {sessionWorkersCount}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>الماكينات المتصلة الآن</span>
            <HardDrive className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {connectedDevices.length} / {devices.length}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>حالة البث</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-sm font-bold text-white mt-1 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isAnyDeviceConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>{isAnyDeviceConnected ? 'مستمر (Live)' : 'متوقف مؤقتاً'}</span>
          </div>
        </div>
      </div>

      {/* Live Punch Feed Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="font-semibold text-white">البصمات المباشرة الواردة الآن</span>
          <span className="font-mono">{displayFeed.length} حركة في هذه الجلسة</span>
        </div>

        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
          {displayFeed.length > 0 ? (
            displayFeed.map((record, index) => {
              const isIn = record.resolvedState === 'IN';
              const isEarly = Boolean(record.isEarlyDeparture);

              return (
                <div
                  key={record.id}
                  className={`border rounded-lg p-3 transition-all flex flex-wrap items-center justify-between gap-3 shadow-sm ${
                    index === 0
                      ? 'bg-slate-850 border-emerald-500/50 ring-1 ring-emerald-500/30 animate-in fade-in'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Worker & Biometric method */}
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isIn 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isEarly 
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
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
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800/80 text-cyan-300">
                          {record.punchType === 'FACE' ? 'وجه' : record.punchType === 'CARD' ? 'كارت' : 'بصمة إصبع'}
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
                    <div>
                      {isIn ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-sans font-medium border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>تسجيل حضور</span>
                        </span>
                      ) : isEarly ? (
                        <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 text-[11px] font-sans font-medium border border-amber-500/30 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>انصراف مبكر (-{record.earlyDepartureMinutes || 0} د)</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 text-[11px] font-sans font-medium border border-blue-500/30">
                          تسجيل انصراف
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
              <p>بانتظار تسجيل بصمات جديدة من العمال على الماكينات المتصلة حالياً...</p>
              <p className="text-[11px] text-slate-600">هذه الشاشة تعرض البصمات اللحظية المباشرة فقط بعد فتح البرنامج، ويتم مسح السجل تلقائياً عند إغلاق البرنامج.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
