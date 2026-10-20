import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Wifi, 
  RefreshCw, 
  Minimize2, 
  Square, 
  X, 
  Building2,
  HardDrive
} from 'lucide-react';
import { Device } from '../types';

interface HeaderProps {
  devices: Device[];
  onSyncAll: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  devices,
  onSyncAll,
  isSyncing,
}) => {
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDate(now.toLocaleDateString('ar-EG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }));
    };
    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const connectedCount = devices.filter(d => d.status === 'connected').length;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 select-none sticky top-0 z-40">
      {/* Desktop Window Title Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-950 border-b border-slate-800/80 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="font-medium text-slate-300">نظام إدارة الحضور والانصراف - ZKT Client</span>
        </div>

        <div className="flex items-center gap-1 text-slate-500">
          <button className="p-1 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title="تصغير">
            <Minimize2 className="w-3 h-3" />
          </button>
          <button className="p-1 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title="تكبير">
            <Square className="w-3 h-3" />
          </button>
          <button className="p-1 hover:text-red-400 hover:bg-red-950/40 rounded transition-colors" title="إغلاق">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Workspace Bar */}
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
            ZKT
          </div>
          <div className="text-sm font-bold text-white tracking-tight">نظام إدارة البصمة</div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/70 border border-slate-700/60 font-mono">
            <Wifi className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-400">الأجهزة:</span>
            <span className="font-bold text-white tabular-nums">{connectedCount}/{devices.length}</span>
          </div>

          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/70 border border-slate-700/60 font-mono text-[11px]">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold text-white tabular-nums">{time}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">{date}</span>
          </div>

          <button
            onClick={onSyncAll}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'جاري الاتصال...' : 'سحب الحركات'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
