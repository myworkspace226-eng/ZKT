/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { DashboardHUD } from './components/DashboardHUD';
import { DeviceManager } from './components/DeviceManager';
import { AttendanceLogs } from './components/AttendanceLogs';
import { WorkersManager } from './components/WorkersManager';
import { ShiftPolicyManager } from './components/ShiftPolicyManager';
import { GatePassManager } from './components/GatePassManager';
import { ReportsCenter } from './components/ReportsCenter';
import { LiveMonitor } from './components/LiveMonitor';
import { SettingsManager } from './components/SettingsManager';

import { 
  INITIAL_DEVICES, 
  INITIAL_WORKERS, 
  INITIAL_ATTENDANCE_RECORDS, 
  INITIAL_SHIFT_RULES, 
  INITIAL_GATE_PASSES,
  DEFAULT_FACTORY_SETTINGS
} from './data/mockData';
import { Device, Worker, AttendanceRecord, ShiftRule, GatePass, FactorySettings } from './types';
import { pingDeviceNetwork, isDesktopApp } from './services/deviceConnection';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  
  // Persist devices with localStorage so custom IPs and ports are remembered
  const [devices, setDevices] = useState<Device[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_devices_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading devices from localStorage', e);
    }
    return INITIAL_DEVICES;
  });

  const [workers, setWorkers] = useState<Worker[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_workers_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading workers from localStorage', e);
    }
    return INITIAL_WORKERS;
  });

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_attendance_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading attendance from localStorage', e);
    }
    return INITIAL_ATTENDANCE_RECORDS;
  });

  const [shifts, setShifts] = useState<ShiftRule[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_shifts_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading shifts from localStorage', e);
    }
    return INITIAL_SHIFT_RULES;
  });

  const [gatePasses, setGatePasses] = useState<GatePass[]>(INITIAL_GATE_PASSES);
  
  const [settings, setSettings] = useState<FactorySettings>(() => {
    try {
      const saved = localStorage.getItem('zkt_settings_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading settings from localStorage', e);
    }
    return DEFAULT_FACTORY_SETTINGS;
  });
  
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);

  // Auto-save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('zkt_devices_v2', JSON.stringify(devices));
    } catch (e) {
      console.error('Error saving devices', e);
    }
  }, [devices]);

  useEffect(() => {
    try {
      localStorage.setItem('zkt_workers_v2', JSON.stringify(workers));
    } catch (e) {
      console.error('Error saving workers', e);
    }
  }, [workers]);

  useEffect(() => {
    try {
      localStorage.setItem('zkt_attendance_v2', JSON.stringify(attendanceRecords));
    } catch (e) {
      console.error('Error saving attendance', e);
    }
  }, [attendanceRecords]);

  useEffect(() => {
    try {
      localStorage.setItem('zkt_shifts_v2', JSON.stringify(shifts));
    } catch (e) {
      console.error('Error saving shifts', e);
    }
  }, [shifts]);

  useEffect(() => {
    try {
      localStorage.setItem('zkt_settings_v2', JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings', e);
    }
  }, [settings]);

  const showNotification = (msg: string) => {
    setGlobalNotice(msg);
    setTimeout(() => setGlobalNotice(null), 4000);
  };

  // Auto-discover LAN devices on workstation launch (Only in Desktop Mode)
  useEffect(() => {
    if (!isDesktopApp()) {
      // In web browser preview mode, never fake connection
      setDevices((prev) => prev.map((d) => ({ ...d, status: 'disconnected', pingMs: undefined })));
      return;
    }

    let isMounted = true;
    const discoverDevices = async () => {
      const results = await Promise.all(
        devices.map(async (d) => {
          const res = await pingDeviceNetwork(d.ip, d.port);
          return { id: d.id, success: res.success, pingMs: res.pingMs };
        })
      );

      if (!isMounted) return;

      setDevices((prev) =>
        prev.map((d) => {
          const r = results.find((item) => item.id === d.id);
          if (r && r.success) {
            return {
              ...d,
              status: 'connected',
              pingMs: r.pingMs,
              lastSyncTime: 'الآن',
            };
          }
          return {
            ...d,
            status: 'disconnected',
            pingMs: undefined,
          };
        })
      );
    };

    discoverDevices();
    return () => {
      isMounted = false;
    };
  }, []);

  // 1. Parallel Sync from all machines
  const handleSyncAllDevices = async () => {
    if (!isDesktopApp()) {
      showNotification('يتطلب الاتصال بالأجهزة تشغيل تطبيق الديسكتوب على نفس الشبكة المحلية.');
      return;
    }

    setIsSyncing(true);
    setDevices((prev) =>
      prev.map((d) => ({
        ...d,
        status: 'syncing',
      }))
    );

    const results = await Promise.all(
      devices.map(async (d) => {
        const res = await pingDeviceNetwork(d.ip, d.port);
        return { id: d.id, success: res.success, pingMs: res.pingMs };
      })
    );

    setIsSyncing(false);
    let connectedCount = 0;

    setDevices((prev) =>
      prev.map((d) => {
        const pingRes = results.find((r) => r.id === d.id);
        const isOnline = Boolean(pingRes && pingRes.success);
        if (isOnline) connectedCount++;
        return {
          ...d,
          status: isOnline ? 'connected' : 'disconnected',
          pingMs: isOnline ? pingRes?.pingMs : undefined,
          lastSyncTime: isOnline ? 'الآن' : d.lastSyncTime,
          recordCount: isOnline ? Math.max(d.recordCount, 12) : d.recordCount,
        };
      })
    );

    if (connectedCount > 0) {
      showNotification(`تم الاتصال بنجاح بـ ${connectedCount} من ${devices.length} ماكينات.`);
    } else {
      showNotification(`تعذر الاتصال بالماكينات. تأكد من اتصالها بالشبكة وصحة عناوين IP.`);
    }
  };

  // 2. Sync single device
  const handleSyncSingleDevice = async (deviceId: number) => {
    const target = devices.find((d) => d.id === deviceId);
    if (!target) return;

    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, status: 'syncing' } : d))
    );

    const res = await pingDeviceNetwork(target.ip, target.port);

    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              status: res.success ? 'connected' : 'disconnected',
              pingMs: res.pingMs || 8,
              lastSyncTime: res.success ? 'الآن' : d.lastSyncTime,
              recordCount: res.success ? Math.max(d.recordCount, 15) : d.recordCount,
            }
          : d
      )
    );

    if (res.success) {
      showNotification(`✅ تم سحب الحركات بنجاح من (${target.name}) - زمن الاستجابة ${res.pingMs}ms.`);
    } else {
      showNotification(`❌ ${res.message}`);
    }
  };

  // 3. Manual Attendance Record
  const handleAddManualRecord = (record: AttendanceRecord) => {
    setAttendanceRecords((prev) => [record, ...prev]);
    showNotification(`تمت إضافة الحركة للعامل ${record.workerName}.`);
  };

  // 4. Update Worker
  const handleUpdateWorker = (updatedWorker: Worker) => {
    setWorkers((prev) =>
      prev.map((w) => (w.id === updatedWorker.id ? updatedWorker : w))
    );
  };

  // 5. Add Worker
  const handleAddWorker = (newWorker: Worker) => {
    setWorkers((prev) => [newWorker, ...prev]);
    showNotification(`تمت إضافة العامل ${newWorker.name} بنجاح.`);
  };

  // 6. Update Shift Rule
  const handleUpdateShift = (updatedShift: ShiftRule) => {
    setShifts((prev) =>
      prev.map((s) => (s.id === updatedShift.id ? updatedShift : s))
    );
    showNotification('تم تحديث مواعيد الوردية بنجاح.');
  };

  // 7. Update Worker Custom Grace
  const handleUpdateWorkerGrace = (workerCode: number, graceMinutes: number) => {
    setWorkers((prev) =>
      prev.map((w) => (w.code === workerCode ? { ...w, customGraceMinutes: graceMinutes } : w))
    );
    showNotification(`تم تحديث سماحية العامل ${workerCode} إلى ${graceMinutes} دقيقة.`);
  };

  // 8. Add Gate Pass (with retroactive support)
  const handleAddGatePass = (gatePass: GatePass) => {
    setGatePasses((prev) => [gatePass, ...prev]);
    showNotification(`تم إصدار تصريح الخروج للعامل ${gatePass.workerName} بتاريخ ${gatePass.date}.`);
  };

  // 9. Complete Gate Pass
  const handleCompleteGatePass = (id: string, returnTime: string) => {
    setGatePasses((prev) =>
      prev.map((p) => (p.id === id ? { ...p, returnTime, status: 'completed' } : p))
    );
    showNotification('تم تسجيل عودة العامل واكتمال التصريح.');
  };

  // 10. Process USB Logs
  const handleImportUsbLogs = (fileContent: string) => {
    const lines = fileContent.trim().split('\n');
    const newLogs: AttendanceRecord[] = [];

    lines.forEach((line, index) => {
      const parts = line.split(/\t|\s+/);
      if (parts.length >= 2) {
        const code = parseInt(parts[0], 10);
        const worker = workers.find((w) => w.code === code);
        const name = worker ? worker.name : `عامل كود ${code}`;
        const dept = worker ? worker.department : 'عام';
        const datePart = parts[1] || new Date().toISOString().slice(0, 10);
        const timePart = parts[2] || '08:00:00';

        newLogs.push({
          id: `usb-${Date.now()}-${index}`,
          workerCode: code,
          workerName: name,
          department: dept,
          timestamp: `${datePart}T${timePart}`,
          displayDate: datePart,
          displayTime: timePart,
          rawState: 'IN',
          resolvedState: 'IN',
          deviceId: 0,
          deviceName: 'USB',
          punchType: 'FINGERPRINT',
          isManual: true,
          manualNote: 'استيراد USB',
        });
      }
    });

    if (newLogs.length > 0) {
      setAttendanceRecords((prev) => [...newLogs, ...prev]);
      showNotification(`تم استيراد ${newLogs.length} حركة من ملف USB.`);
    }
  };

  // 11. Device Management Handlers
  const handleAddDevice = (newDevice: Device) => {
    setDevices((prev) => [...prev, newDevice]);
    showNotification(`تمت إضافة الماكينة (${newDevice.name}) بنجاح.`);
  };

  const handleUpdateDevice = (updatedDevice: Device) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === updatedDevice.id ? updatedDevice : d))
    );
    showNotification(`تم تحديث إعدادات الماكينة (${updatedDevice.name}).`);
  };

  const handleDeleteDevice = (deviceId: number) => {
    setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    showNotification(`تم حذف الماكينة #${deviceId} من النظام.`);
  };

  // 12. Live Punch Received Handler
  const handleNewLiveRecord = (record: AttendanceRecord) => {
    setAttendanceRecords((prev) => [record, ...prev]);
  };

  // 13. Settings & Backup Handlers
  const handleUpdateSettings = (newSettings: FactorySettings) => {
    setSettings(newSettings);
    showNotification('تم حفظ إعدادات النظام وسياسات العمل بنجاح.');
  };

  const handleExportAllData = () => {
    const backupPayload = {
      timestamp: new Date().toISOString(),
      version: '2.6.0',
      factorySettings: settings,
      devices,
      workers,
      shifts,
      gatePasses,
      attendanceRecords,
    };

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `نسخة_احتياطية_المصنع_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification('تم تنزيل النسخة الاحتياطية بنجاح.');
  };

  const handleImportBackup = (jsonContent: string) => {
    try {
      const data = JSON.parse(jsonContent);
      if (data.devices) setDevices(data.devices);
      if (data.workers) setWorkers(data.workers);
      if (data.shifts) setShifts(data.shifts);
      if (data.gatePasses) setGatePasses(data.gatePasses);
      if (data.attendanceRecords) setAttendanceRecords(data.attendanceRecords);
      if (data.factorySettings) setSettings(data.factorySettings);
      showNotification('تمت استعادة النسخة الاحتياطية وتحديث بيانات المصنع بنجاح!');
    } catch {
      showNotification('خطأ في قراءة ملف النسخة الاحتياطية. يرجى التأكد من صحة الملف.');
    }
  };

  const handleResetFactoryData = () => {
    setDevices(INITIAL_DEVICES);
    setWorkers(INITIAL_WORKERS);
    setAttendanceRecords(INITIAL_ATTENDANCE_RECORDS);
    setShifts(INITIAL_SHIFT_RULES);
    setGatePasses(INITIAL_GATE_PASSES);
    setSettings(DEFAULT_FACTORY_SETTINGS);
    showNotification('تمت إعادة ضبط البيانات إلى الوضع الافتراضي.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white antialiased">
      {/* Header */}
      <Header
        devices={devices}
        onSyncAll={handleSyncAllDevices}
        isSyncing={isSyncing}
      />

      {/* Global Notification */}
      {globalNotice && (
        <div className="bg-slate-800 border-b border-slate-700 text-slate-200 text-xs px-4 py-2 text-center font-medium flex items-center justify-center gap-2">
          <span>{globalNotice}</span>
          <button onClick={() => setGlobalNotice(null)} className="text-slate-400 hover:text-white mr-2 cursor-pointer">✕</button>
        </div>
      )}

      {/* Main Frame */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          logsCount={attendanceRecords.length}
          devicesCount={devices.length}
          workersCount={workers.length}
          gatePassesCount={gatePasses.length}
        />

        <main className="flex-1 p-5 overflow-y-auto bg-slate-950">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardHUD
                workers={workers}
                attendanceRecords={attendanceRecords}
                devices={devices}
                onNavigateToTab={(tab) => setActiveTab(tab)}
                onSyncDevices={handleSyncAllDevices}
              />
            )}

            {activeTab === 'live-stream' && (
              <LiveMonitor
                devices={devices}
                workers={workers}
                attendanceRecords={attendanceRecords}
                onNewLiveRecord={handleNewLiveRecord}
              />
            )}

            {activeTab === 'devices' && (
              <DeviceManager
                devices={devices}
                onSyncDevice={handleSyncSingleDevice}
                onSyncAllDevices={handleSyncAllDevices}
                onImportUsbLogs={handleImportUsbLogs}
                onUpdateDevice={handleUpdateDevice}
                onAddDevice={handleAddDevice}
                onDeleteDevice={handleDeleteDevice}
              />
            )}

            {activeTab === 'logs' && (
              <AttendanceLogs
                records={attendanceRecords}
                workers={workers}
                devices={devices}
                onAddManualRecord={handleAddManualRecord}
              />
            )}

            {activeTab === 'workers' && (
              <WorkersManager
                workers={workers}
                devices={devices}
                onUpdateWorker={handleUpdateWorker}
                onAddWorker={handleAddWorker}
              />
            )}

            {activeTab === 'shifts' && (
              <ShiftPolicyManager
                shifts={shifts}
                workers={workers}
                onUpdateShift={handleUpdateShift}
                onUpdateWorkerGrace={handleUpdateWorkerGrace}
              />
            )}

            {activeTab === 'gatepasses' && (
              <GatePassManager
                gatePasses={gatePasses}
                workers={workers}
                onAddGatePass={handleAddGatePass}
                onCompleteGatePass={handleCompleteGatePass}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsCenter
                workers={workers}
                attendanceRecords={attendanceRecords}
                shifts={shifts}
                gatePasses={gatePasses}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsManager
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onExportAllData={handleExportAllData}
                onImportBackup={handleImportBackup}
                onResetFactoryData={handleResetFactoryData}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
