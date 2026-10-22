import React from 'react';
import { 
  LayoutDashboard, 
  Radio, 
  HardDrive, 
  Fingerprint, 
  Users, 
  CalendarClock, 
  DoorOpen, 
  FileSpreadsheet, 
  Settings,
  MonitorDown
} from 'lucide-react';

export type ActiveTab = 
  | 'dashboard' 
  | 'live-stream'
  | 'devices' 
  | 'logs' 
  | 'workers' 
  | 'shifts' 
  | 'gatepasses' 
  | 'reports' 
  | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  logsCount: number;
  devicesCount: number;
  workersCount: number;
  gatePassesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  logsCount,
  devicesCount,
  workersCount,
  gatePassesCount,
}) => {
  const menuItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'لوحة العمليات',
      icon: LayoutDashboard,
    },
    {
      id: 'live-stream' as ActiveTab,
      label: 'البصمات الحية (مباشر)',
      icon: Radio,
      badge: 'Live',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    },
    {
      id: 'devices' as ActiveTab,
      label: 'أجهزة البصمة',
      icon: HardDrive,
      badge: `${devicesCount}`,
    },
    {
      id: 'logs' as ActiveTab,
      label: 'سجل الحركات',
      icon: Fingerprint,
      badge: logsCount > 0 ? `${logsCount}` : undefined,
    },
    {
      id: 'workers' as ActiveTab,
      label: 'شؤون العاملين',
      icon: Users,
      badge: workersCount > 0 ? `${workersCount}` : undefined,
    },
    {
      id: 'shifts' as ActiveTab,
      label: 'مواعيد العمل والورديات',
      icon: CalendarClock,
    },
    {
      id: 'gatepasses' as ActiveTab,
      label: 'أذونات وتصاريح الخروج',
      icon: DoorOpen,
      badge: gatePassesCount > 0 ? `${gatePassesCount}` : undefined,
    },
    {
      id: 'reports' as ActiveTab,
      label: 'التقارير والغياب اليومي',
      icon: FileSpreadsheet,
    },
    {
      id: 'settings' as ActiveTab,
      label: 'إعدادات النظام',
      icon: Settings,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 select-none">
      {/* Menu Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer text-right ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="text-xs">{item.label}</span>
              </div>

              {item.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  item.badgeColor 
                    ? item.badgeColor 
                    : isActive 
                      ? 'bg-blue-700 text-white' 
                      : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800/80 text-[10px] text-slate-400 bg-slate-950/40">
        <div className="flex items-center justify-between font-mono">
          <span title="مطور النظام">المطور: Muhammad Abdullah</span>
          <span className="text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">V 1.0.0</span>
        </div>
      </div>
    </aside>
  );
};
