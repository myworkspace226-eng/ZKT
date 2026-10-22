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
import { pingDeviceNetwork, pullDeviceAttendanceLogs, isDesktopApp } from './services/deviceConnection';

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

  // Clean up any fake mock counts from previous version
  useEffect(() => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.userCount === 38 && d.fpCount === 72 && d.recordCount === 154) {
          return {
            ...d,
            status: 'disconnected',
            userCount: 0,
            fpCount: 0,
            faceCount: 0,
            recordCount: 0,
            lastSyncTime: 'لم تتم المزامنة بعد',
            pingMs: undefined,
          };
        }
        return d;
      })
    );
  }, []);

  const handleResetMockData = () => {
    localStorage.removeItem('zkt_devices_v2');
    setDevices(INITIAL_DEVICES.map((d) => ({
      ...d,
      status: 'disconnected',
      userCount: 0,
      fpCount: 0,
      faceCount: 0,
      recordCount: 0,
      lastSyncTime: 'لم تتم المزامنة بعد',
      pingMs: undefined,
    })));
    showNotification('تمت تصفية الذاكرة المؤقتة وإعادة ضبط بيانات الماكينات لحالتها الطبيعية.');
  };

  // Auto-discover LAN devices on workstation launch (Only in Desktop Mode)
  useEffect(() => {
    if (!isDesktopApp()) {
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

  // 1. Parallel Sync from all machines (Real ZKTeco Communication)
  const handleSyncAllDevices = async () => {
    if (!isDesktopApp()) {
      showNotification('سحب الحركات التلقائي عبر الشبكة متاح داخل تطبيق الديسكتوب. في المتصفح يمكنك استخدام "استيراد ملف USB".');
      return;
    }

    setIsSyncing(true);
    setDevices((prev) =>
      prev.map((d) => ({
        ...d,
        status: 'syncing',
      }))
    );

    let connectedCount = 0;
    let totalImported = 0;
    // Build an indexed key set of existing records for O(1) lightning-fast duplicate checking
    const existingKeys = new Set(
      attendanceRecords.map((ar) => `${ar.workerCode}_${ar.displayDate}_${ar.displayTime}_${ar.deviceId}`)
    );
    const allNewRecords: AttendanceRecord[] = [];

    // Query devices sequentially to keep socket communication stable
    for (const d of devices) {
      const res = await pullDeviceAttendanceLogs(d.ip, d.port);
      if (res.success) {
        connectedCount++;
        const pulledRecords: AttendanceRecord[] = res.records.map((r, i) => {
          const matchedWorker = workers.find((w) => String(w.code) === String(r.userId));
          const dateObj = new Date(r.recordTime);
          const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const timeStr = !isNaN(dateObj.getTime()) ? dateObj.toTimeString().slice(0, 5) : '08:00';
          const punchState: 'IN' | 'OUT' = r.type === 1 ? 'OUT' : 'IN';

          return {
            id: `REC-${d.id}-${r.userId}-${dateStr}-${timeStr.replace(':', '')}-${i}`,
            workerCode: Number(r.userId) || 1000 + i,
            workerName: matchedWorker ? matchedWorker.name : `عامل كود #${r.userId}`,
            department: matchedWorker ? matchedWorker.department : d.department,
            timestamp: !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateStr}T${timeStr}:00`,
            displayDate: dateStr,
            displayTime: timeStr,
            rawState: punchState,
            resolvedState: punchState,
            deviceId: d.id,
            deviceName: d.name,
            punchType: 'FINGERPRINT',
          };
        });

        const newForThisDevice: AttendanceRecord[] = [];
        for (const pr of pulledRecords) {
          const key = `${pr.workerCode}_${pr.displayDate}_${pr.displayTime}_${pr.deviceId}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            newForThisDevice.push(pr);
          }
        }

        allNewRecords.push(...newForThisDevice);
        totalImported += newForThisDevice.length;

        const totalRecordCount = res.deviceInfo?.logCounts ?? res.records.length;
        const totalUserCount = res.deviceInfo?.userCounts ?? d.userCount;

        setDevices((prev) =>
          prev.map((dev) =>
            dev.id === d.id
              ? {
                  ...dev,
                  status: 'connected',
                  pingMs: res.pingMs || 8,
                  lastSyncTime: 'الآن',
                  recordCount: totalRecordCount,
                  userCount: totalUserCount,
                }
              : dev
          )
        );
      } else {
        setDevices((prev) =>
          prev.map((dev) =>
            dev.id === d.id
              ? {
                  ...dev,
                  status: 'disconnected',
                  pingMs: undefined,
                }
              : dev
          )
        );
      }
    }

    if (allNewRecords.length > 0) {
      setAttendanceRecords((prev) => [...allNewRecords, ...prev]);
    }

    setIsSyncing(false);

    if (connectedCount > 0) {
      showNotification(`✅ تم الاتصال بـ ${connectedCount} من ${devices.length} ماكينات، وسحب ${totalImported} حركة جديدة إلى السجلات.`);
    } else {
      showNotification(`❌ تعذر الاتصال بالماكينات. تأكد أن كابلات الشبكة موصولة وأن الكمبيوتر على نفس الراوتر (LAN).`);
    }
  };

  // 2. Sync single device (Pull Real ZKTeco Attendance Records)
  const handleSyncSingleDevice = async (deviceId: number) => {
    const target = devices.find((d) => d.id === deviceId);
    if (!target) return;

    if (!isDesktopApp()) {
      showNotification(`سحب الحركات التلقائي عبر الشبكة (Port 4370) متاح داخل تطبيق الديسكتوب. في المتصفح يمكنك استخدام "استيراد ملف USB".`);
      return;
    }

    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, status: 'syncing' } : d))
    );

    const res = await pullDeviceAttendanceLogs(target.ip, target.port);

    if (res.success) {
      const pulledRecords: AttendanceRecord[] = res.records.map((r, i) => {
        const matchedWorker = workers.find((w) => String(w.code) === String(r.userId));
        const dateObj = new Date(r.recordTime);
        const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const timeStr = !isNaN(dateObj.getTime()) ? dateObj.toTimeString().slice(0, 5) : '08:00';
        const punchState: 'IN' | 'OUT' = r.type === 1 ? 'OUT' : 'IN';

        return {
          id: `REC-${target.id}-${r.userId}-${dateStr}-${timeStr.replace(':', '')}-${i}`,
          workerCode: Number(r.userId) || 1000 + i,
          workerName: matchedWorker ? matchedWorker.name : `عامل كود #${r.userId}`,
          department: matchedWorker ? matchedWorker.department : target.department,
          timestamp: !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateStr}T${timeStr}:00`,
          displayDate: dateStr,
          displayTime: timeStr,
          rawState: punchState,
          resolvedState: punchState,
          deviceId: target.id,
          deviceName: target.name,
          punchType: 'FINGERPRINT',
        };
      });

      const existingKeys = new Set(
        attendanceRecords.map((ar) => `${ar.workerCode}_${ar.displayDate}_${ar.displayTime}_${ar.deviceId}`)
      );
      const newRecords = pulledRecords.filter((pr) => {
        const key = `${pr.workerCode}_${pr.displayDate}_${pr.displayTime}_${pr.deviceId}`;
        return !existingKeys.has(key);
      });

      if (newRecords.length > 0) {
        setAttendanceRecords((prev) => [...newRecords, ...prev]);
      }

      const totalRecordCount = res.deviceInfo?.logCounts ?? res.records.length;
      const totalUserCount = res.deviceInfo?.userCounts ?? target.userCount;

      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? {
                ...d,
                status: 'connected',
                pingMs: res.pingMs || 8,
                lastSyncTime: 'الآن',
                recordCount: totalRecordCount,
                userCount: totalUserCount,
              }
            : d
        )
      );

      if (res.records.length === 0) {
        showNotification(`ℹ️ تم الاتصال بـ (${target.name}) بنجاح ولكن لا توجد حركات مخزنة في ذاكرة الجهاز.`);
      } else if (newRecords.length > 0) {
        showNotification(`✅ تم سحب ${newRecords.length} حركة جديدة بنجاح من (${target.name}) وتحديث السجلات!`);
      } else {
        showNotification(`ℹ️ تم الاتصال بـ (${target.name}) وسحب ${res.records.length} حركة (جميعها محفوظة مسبقاً).`);
      }
    } else {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? {
                ...d,
                status: 'disconnected',
                pingMs: undefined,
              }
            : d
        )
      );
      showNotification(`❌ فشل سحب الحركات من (${target.name}): ${res.error || res.message}`);
    }
  };

  // 3. Attendance Records Handlers
  const handleAddManualRecord = (record: AttendanceRecord) => {
    setAttendanceRecords((prev) => [record, ...prev]);
    showNotification(`تمت إضافة الحركة للعامل ${record.workerName}.`);
  };

  const handleUpdateRecord = (updatedRecord: AttendanceRecord) => {
    setAttendanceRecords((prev) =>
      prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
    );
    showNotification(`✅ تم تعديل بصمة العامل (${updatedRecord.workerName}) بنجاح.`);
  };

  const handleDeleteRecord = (recordId: string) => {
    setAttendanceRecords((prev) => prev.filter((r) => r.id !== recordId));
    showNotification('🗑️ تم حذف الحركة من السجلات بنجاح.');
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

  const handleUpdateGatePass = (updatedGatePass: GatePass) => {
    setGatePasses((prev) =>
      prev.map((p) => (p.id === updatedGatePass.id ? updatedGatePass : p))
    );
    showNotification(`✅ تم تحديث تصريح الخروج للعامل (${updatedGatePass.workerName}) بنجاح.`);
  };

  const handleDeleteGatePass = (id: string) => {
    setGatePasses((prev) => prev.filter((p) => p.id !== id));
    showNotification('🗑️ تم حذف التصريح من السجلات بنجاح.');
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
      version: '1.0.0',
      developer: 'Muhammad Abdullah',
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
                onSyncAll={handleSyncAllDevices}
                isSyncing={isSyncing}
              />
            )}

            {activeTab === 'devices' && (
              <DeviceManager
                devices={devices}
                workers={workers}
                onSyncDevice={handleSyncSingleDevice}
                onSyncAllDevices={handleSyncAllDevices}
                onImportUsbLogs={handleImportUsbLogs}
                onUpdateDevice={handleUpdateDevice}
                onAddDevice={handleAddDevice}
                onDeleteDevice={handleDeleteDevice}
                onImportWorkers={(newWorkers) => {
                  setWorkers((prev) => {
                    const updated = [...prev];
                    const codeToIdx = new Map(updated.map((w, idx) => [w.code, idx]));
                    const trulyNew: Worker[] = [];

                    for (const nw of newWorkers) {
                      if (codeToIdx.has(nw.code)) {
                        const idx = codeToIdx.get(nw.code)!;
                        const existing = updated[idx];

                        // Point 9: Auto-link worker to the machine pulled from
                        const mergedDeviceIds = Array.from(
                          new Set([...(existing.assignedDeviceIds || []), ...(nw.assignedDeviceIds || [])])
                        );

                        // Point 8: Protect existing known name, only update if new name is a real valid non-placeholder name
                        const hasRealName = Boolean(
                          nw.name && 
                          !nw.name.startsWith('عامل كود #') && 
                          !nw.name.startsWith('عامل كود') &&
                          nw.name.trim().length > 1
                        );
                        const finalName = hasRealName ? nw.name.trim() : existing.name;

                        // Point 7: Bengali workers auto-detection (Latin/English characters)
                        const isEnglishName = /^[A-Za-z\s.'-]+$/.test(finalName) && finalName.length > 2;

                        updated[idx] = {
                          ...existing,
                          name: finalName,
                          assignedDeviceIds: mergedDeviceIds,
                          enrolledOnDeviceName: nw.enrolledOnDeviceName || existing.enrolledOnDeviceName,
                          nationality: isEnglishName ? 'بنغلاديشي' : (existing.nationality || 'مصري'),
                          shiftId: isEnglishName ? 'bangladeshi' : (existing.shiftId || 'standard'),
                          isNameSyncedToDevice: true,
                          hasFingerprint: true,
                        };
                      } else {
                        // Brand new worker from machine
                        const isEnglishName = /^[A-Za-z\s.'-]+$/.test(nw.name) && nw.name.length > 2;
                        trulyNew.push({
                          ...nw,
                          nationality: isEnglishName ? 'بنغلاديشي' : (nw.nationality || 'مصري'),
                          shiftId: isEnglishName ? 'bangladeshi' : (nw.shiftId || 'standard'),
                          assignedDeviceIds: nw.assignedDeviceIds || [],
                          enrolledOnDeviceName: nw.enrolledOnDeviceName,
                        });
                      }
                    }
                    return [...trulyNew, ...updated];
                  });
                  showNotification(`✅ تم سحب وتحديث بيانات ${newWorkers.length} عامل في قاعدة البيانات بنجاح.`);
                }}
                onResetMockData={handleResetMockData}
              />
            )}

            {activeTab === 'logs' && (
              <AttendanceLogs
                records={attendanceRecords}
                workers={workers}
                devices={devices}
                onAddManualRecord={handleAddManualRecord}
                onUpdateRecord={handleUpdateRecord}
                onDeleteRecord={handleDeleteRecord}
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
                onUpdateGatePass={handleUpdateGatePass}
                onDeleteGatePass={handleDeleteGatePass}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsCenter
                workers={workers}
                attendanceRecords={attendanceRecords}
                shifts={shifts}
                gatePasses={gatePasses}
                devices={devices}
                onSyncDevices={handleSyncAllDevices}
                isSyncing={isSyncing}
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
