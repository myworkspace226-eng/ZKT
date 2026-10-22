import React, { useState } from 'react';
import { 
  HardDrive, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Usb, 
  Plus,
  Edit2,
  Trash2,
  Activity,
  CheckCircle2, 
  AlertTriangle,
  X,
  Server,
  Key,
  ShieldAlert,
  UploadCloud,
  DownloadCloud,
  Globe,
  DatabaseZap,
  RotateCcw,
  Unplug,
  Power
} from 'lucide-react';
import { Device, Worker } from '../types';
import { 
  pingDeviceNetwork, 
  disconnectDevice,
  isDesktopApp, 
  pullDeviceUsers, 
  uploadUserToDevice,
  clearDeviceAttendanceLog
} from '../services/deviceConnection';

interface DeviceManagerProps {
  devices: Device[];
  workers?: Worker[];
  onSyncDevice: (deviceId: number) => void;
  onSyncAllDevices: () => void;
  onImportUsbLogs: (fileContent: string) => void;
  onUpdateDevice: (device: Device) => void;
  onAddDevice: (device: Device) => void;
  onDeleteDevice: (deviceId: number) => void;
  onImportWorkers?: (workers: Worker[]) => void;
  onResetMockData?: () => void;
}

export const DeviceManager: React.FC<DeviceManagerProps> = ({
  devices,
  workers = [],
  onSyncDevice,
  onSyncAllDevices,
  onImportUsbLogs,
  onUpdateDevice,
  onAddDevice,
  onDeleteDevice,
  onImportWorkers,
  onResetMockData,
}) => {
  const [testingDeviceId, setTestingDeviceId] = useState<number | null>(null);
  const [showUsbModal, setShowUsbModal] = useState<boolean>(false);
  const [usbContent, setUsbContent] = useState<string>('');
  const [notification, setNotification] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingDevice, setEditingDevice] = useState<Partial<Device>>({
    id: 1,
    name: '',
    ip: '192.168.1.',
    port: 4370,
    commKey: 0,
    model: 'MB2000',
    serialNumber: '',
    department: 'عام',
    status: 'disconnected',
    userCount: 0,
    fpCount: 0,
    faceCount: 0,
    recordCount: 0,
    lastSyncTime: 'لم تتم المزامنة',
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Secure Memory Wipe State
  const [deviceToWipe, setDeviceToWipe] = useState<Device | null>(null);
  const [wipeConfirmText, setWipeConfirmText] = useState<string>('');
  const [isWiping, setIsWiping] = useState<boolean>(false);
  const [acknowledgedBackup, setAcknowledgedBackup] = useState<boolean>(false);

  const handleExecuteWipeMemory = async () => {
    if (!deviceToWipe) return;

    if (!isDesktopApp()) {
      setNotification({
        type: 'error',
        message: 'تفريغ ذاكرة الماكينة عبر الشبكة متاح داخل تطبيق الديسكتوب فقط.',
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    setIsWiping(true);
    try {
      const res = await clearDeviceAttendanceLog(deviceToWipe.ip, deviceToWipe.port);
      if (res.success) {
        onUpdateDevice({
          ...deviceToWipe,
          recordCount: 0,
          lastSyncTime: 'الآن',
        });
        setNotification({
          type: 'success',
          message: `✅ ${res.message || `تم تفريغ ذاكرة حركات (${deviceToWipe.name}) بنجاح!`}`,
        });
        setDeviceToWipe(null);
        setWipeConfirmText('');
        setAcknowledgedBackup(false);
      } else {
        setNotification({
          type: 'error',
          message: `❌ ${res.error || res.message || 'تعذر تفريغ ذاكرة الماكينة'}`,
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: `❌ خطأ في الاتصال: ${err?.message || String(err)}`,
      });
    } finally {
      setIsWiping(false);
      setTimeout(() => setNotification(null), 6000);
    }
  };


  const handleConnectDevice = async (device: Device) => {
    setTestingDeviceId(device.id);
    const res = await pingDeviceNetwork(device.ip, device.port);
    setTestingDeviceId(null);

    if (res.success) {
      onUpdateDevice({
        ...device,
        status: 'connected',
        pingMs: res.pingMs || 6,
        lastSyncTime: 'الآن',
      });
      setNotification({
        type: 'success',
        message: `✅ تم الاتصال بنجاح بالماكينة (${device.name}) - زمن الاستجابة ${res.pingMs || 6}ms`,
      });
    } else {
      onUpdateDevice({
        ...device,
        status: 'disconnected',
        pingMs: undefined,
      });
      setNotification({
        type: 'error',
        message: `❌ ${res.message}`,
      });
    }
    setTimeout(() => setNotification(null), 6000);
  };

  const handleDisconnectDevice = async (device: Device) => {
    setTestingDeviceId(device.id);
    try {
      await disconnectDevice(device.ip, device.port);
      onUpdateDevice({
        ...device,
        status: 'disconnected',
        pingMs: undefined,
      });
      setNotification({
        type: 'success',
        message: `🔌 تم إلغاء الاتصال بماكينة (${device.name}) بنجاح وإغلاق المقبس.`,
      });
    } catch {
      onUpdateDevice({
        ...device,
        status: 'disconnected',
        pingMs: undefined,
      });
      setNotification({
        type: 'success',
        message: `🔌 تم فصل الاتصال بالماكينة (${device.name}).`,
      });
    } finally {
      setTestingDeviceId(null);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleTestPing = handleConnectDevice;

  const handleQuickUploadUsers = async (device: Device) => {
    if (!isDesktopApp()) {
      setNotification({
        type: 'error',
        message: 'رفع بيانات العمال إلى الماكينة عبر الشبكة متاح داخل تطبيق الديسكتوب فقط.',
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    setNotification({
      type: 'success',
      message: `جاري الاتصال بماكينة (${device.name}) ورفع بيانات العمال...`,
    });

    const targetWorkers = workers || [];
    if (targetWorkers.length === 0) {
      setNotification({
        type: 'error',
        message: 'لا يوجد عمال مسجلون في النظام لإرسالهم للماكينة.',
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    let successCount = 0;
    for (const w of targetWorkers) {
      const res = await uploadUserToDevice(device.ip, device.port, {
        code: w.code,
        name: w.name,
        id: w.id,
      });
      if (res.success) {
        successCount++;
      } else {
        if (successCount === 0) {
          onUpdateDevice({
            ...device,
            status: 'disconnected',
            pingMs: undefined,
          });
          setNotification({
            type: 'error',
            message: `❌ فشل الاتصال بماكينة (${device.name}): ${res.error || 'الماكينة غير متصلة على الشبكة'}.`,
          });
          setTimeout(() => setNotification(null), 6000);
          return;
        }
      }
    }

    onUpdateDevice({
      ...device,
      status: 'connected',
      userCount: Math.max(device.userCount, successCount),
      lastSyncTime: 'الآن',
    });
    setNotification({
      type: 'success',
      message: `✅ تم رفع وتثبيت بيانات (${successCount}) عامل إلى ماكينة (${device.name}) بنجاح!`,
    });
    setTimeout(() => setNotification(null), 6000);
  };

  const handleQuickDownloadUsers = async (device: Device) => {
    if (!isDesktopApp()) {
      setNotification({
        type: 'error',
        message: 'سحب قائمة العمال من ذاكرة الماكينة متاح داخل تطبيق الديسكتوب فقط.',
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    setNotification({
      type: 'success',
      message: `جاري الاتصال بماكينة (${device.name}) وقراءة ذاكرة المستخدمين...`,
    });

    const res = await pullDeviceUsers(device.ip, device.port);
    if (res.success) {
      onUpdateDevice({
        ...device,
        status: 'connected',
        userCount: res.users.length,
        lastSyncTime: 'الآن',
      });

      if (onImportWorkers && res.users.length > 0) {
        const newWorkers: Worker[] = res.users.map((u, i) => {
          const userCode = Number(u.userId) || 1000 + i;
          const cleanName = u.name ? u.name.trim() : '';
          const isEnglish = /^[A-Za-z\s.'-]+$/.test(cleanName) && cleanName.length > 2;

          return {
            id: `w-zkt-${device.id}-${u.userId}-${i}`,
            code: userCode,
            name: cleanName || `عامل كود #${userCode}`,
            department: device.department || 'إنتاج',
            line: 'خط 1',
            jobTitle: isEnglish ? 'فني تشغيل (بنغال)' : 'عامل تشغيل',
            nationality: isEnglish ? 'بنغلاديشي' : 'مصري',
            shiftId: isEnglish ? 'bangladeshi' : 'standard',
            customGraceMinutes: 15,
            isActive: true,
            assignedDeviceIds: [device.id],
            hasFingerprint: true,
            hasFace: false,
            joinDate: new Date().toISOString().slice(0, 10),
            isNameSyncedToDevice: Boolean(cleanName),
            enrolledOnDeviceName: device.name,
          };
        });
        onImportWorkers(newWorkers);
      }

      setNotification({
        type: 'success',
        message: `✅ تم سحب (${res.users.length}) مستخدم بنجاح من ذاكرة (${device.name}) وتحديث السجلات!`,
      });
    } else {
      onUpdateDevice({
        ...device,
        status: 'disconnected',
        pingMs: undefined,
      });
      setNotification({
        type: 'error',
        message: `❌ فشل سحب العمال من (${device.name}): ${res.error || res.message}`,
      });
    }
    setTimeout(() => setNotification(null), 6000);
  };

  const handleOpenAdd = () => {
    const nextId = devices.length > 0 ? Math.max(...devices.map((d) => d.id)) + 1 : 1;
    setEditingDevice({
      id: nextId,
      name: `ماكينة ${nextId}`,
      ip: `192.168.1.${250 + nextId}`,
      port: 4370,
      commKey: 0,
      model: 'MB2000',
      serialNumber: `ZKT${Date.now().toString().slice(-8)}`,
      department: 'خط إنتاج',
      status: 'disconnected',
      userCount: 0,
      fpCount: 0,
      faceCount: 0,
      recordCount: 0,
      lastSyncTime: 'لم تتم المزامنة',
    });
    setModalMode('add');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (device: Device) => {
    setEditingDevice({ ...device });
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleSaveDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice.name || !editingDevice.ip) return;

    if (modalMode === 'add') {
      onAddDevice(editingDevice as Device);
      setNotification({
        type: 'success',
        message: `تمت إضافة الماكينة (${editingDevice.name}) بنجاح.`,
      });
    } else {
      onUpdateDevice(editingDevice as Device);
      setNotification({
        type: 'success',
        message: `تم تحديث إعدادات الماكينة (${editingDevice.name}) بنجاح.`,
      });
    }

    setIsModalOpen(false);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleDeleteConfirmed = () => {
    if (confirmDeleteId === null) return;
    const deviceToDelete = devices.find((d) => d.id === confirmDeleteId);
    onDeleteDevice(confirmDeleteId);
    setConfirmDeleteId(null);
    setNotification({
      type: 'success',
      message: `تم حذف الماكينة (${deviceToDelete?.name || confirmDeleteId}) من النظام.`,
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleProcessUsb = () => {
    if (!usbContent.trim()) return;
    onImportUsbLogs(usbContent);
    setShowUsbModal(false);
    setUsbContent('');
    setNotification({
      type: 'success',
      message: 'تم استيراد الحركات من ملف الـ USB بنجاح.',
    });
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {notification && (
        <div className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
          notification.type === 'error'
            ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-500 hover:text-white">✕</button>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span>أجهزة البصمة</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 font-mono border border-blue-500/30">
              {devices.length} ماكينات
            </span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة ماكينة جديدة</span>
          </button>

          <button
            onClick={() => setShowUsbModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            <Usb className="w-3.5 h-3.5 text-amber-400" />
            <span>استيراد ملف USB</span>
          </button>

          {onResetMockData && (
            <button
              onClick={onResetMockData}
              title="تصفير الأرقام التجريبية وإعادة فحص الماكينات الفعلية"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>تصفير الذاكرة المؤقتة</span>
            </button>
          )}

          <button
            onClick={onSyncAllDevices}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>سحب متزامن للكل</span>
          </button>
        </div>
      </div>

      {/* Grid of Devices */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {devices.map((device) => {
          const isTesting = testingDeviceId === device.id;
          const isConnected = device.status === 'connected';

          return (
            <div
              key={device.id}
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 hover:border-slate-700 transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-blue-400">
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{device.name}</span>
                        <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400 font-mono">
                          #{device.id}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{device.department}</div>
                    </div>
                  </div>

                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                    isConnected 
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {isConnected ? 'متصل' : 'غير متصل'}
                  </span>
                </div>

                {/* Connection Specs */}
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80 font-mono text-[11px] grid grid-cols-2 gap-2 text-slate-300 mt-3">
                  <div>
                    IP: <span className="text-blue-400 font-bold">{device.ip}</span>
                  </div>
                  <div>
                    البورت: <span className="text-amber-400 font-bold">{device.port}</span>
                  </div>
                  <div>
                    الطراز: <span className="text-slate-400">{device.model}</span>
                  </div>
                  <div>
                    CommKey: <span className="text-slate-400">{device.commKey ?? 0}</span>
                  </div>
                  <div className="col-span-2 truncate text-[10px] text-slate-400">
                    SN: {device.serialNumber || 'N/A'}
                  </div>
                </div>

                {/* Counters */}
                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono mt-2.5">
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">مستخدم</span>
                    <span className="text-white font-bold">{device.userCount}</span>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">بصمة</span>
                    <span className="text-white font-bold">{device.fpCount}</span>
                  </div>
                  <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">سجل</span>
                    <span className="text-white font-bold">{device.recordCount}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-xs">
                <div className="flex items-center gap-1">
                  {device.status === 'connected' ? (
                    <button
                      onClick={() => handleDisconnectDevice(device)}
                      disabled={isTesting}
                      className="p-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-800/50 transition-colors cursor-pointer text-[11px] flex items-center gap-1 font-medium"
                      title="قطع الاتصال بالماكينة وإغلاق المقبس"
                    >
                      <Unplug className="w-3.5 h-3.5 text-rose-400" />
                      <span>إلغاء الاتصال</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnectDevice(device)}
                      disabled={isTesting}
                      className="p-1.5 rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 hover:text-emerald-200 border border-emerald-800/50 transition-colors cursor-pointer text-[11px] flex items-center gap-1 font-medium"
                      title="فتح الاتصال بالماكينة عبر المنفذ 4370"
                    >
                      <Power className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
                      <span>{isTesting ? 'جاري الاتصال...' : 'اتصال'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => onSyncDevice(device.id)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-[11px] flex items-center gap-1"
                    title="سحب الحركات"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                    <span>سحب حركات</span>
                  </button>

                  <button
                    onClick={() => handleQuickUploadUsers(device)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-[11px] flex items-center gap-1"
                    title="رفع بيانات وبصمات المستخدمين لهذه الماكينة"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                    <span>رفع عمال</span>
                  </button>

                  <button
                    onClick={() => handleQuickDownloadUsers(device)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-[11px] flex items-center gap-1"
                    title="سحب المستخدمين والبصمات من هذه الماكينة"
                  >
                    <DownloadCloud className="w-3.5 h-3.5 text-amber-400" />
                    <span>سحب عمال</span>
                  </button>

                  <button
                    onClick={() => {
                      setDeviceToWipe(device);
                      setWipeConfirmText('');
                      setAcknowledgedBackup(false);
                    }}
                    className="p-1.5 rounded bg-slate-800 hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 border border-slate-700/60 hover:border-rose-700/50 transition-colors cursor-pointer text-[11px] flex items-center gap-1"
                    title="تفريغ ذاكرة حركات الماكينة بأمان لتسريعها (CMD_CLEAR_ATTLOG)"
                  >
                    <DatabaseZap className="w-3.5 h-3.5 text-rose-400" />
                    <span>تفريغ الذاكرة</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(device)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-400 transition-colors cursor-pointer"
                    title="تعديل الماكينة"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setConfirmDeleteId(device.id)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-rose-600/30 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer"
                    title="حذف الماكينة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Device Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  {modalMode === 'add' ? 'إضافة ماكينة بصمة جديدة' : `تعديل إعدادات الماكينة #${editingDevice.id}`}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">رقم الماكينة (ID)</label>
                  <input
                    type="number"
                    min="1"
                    max="255"
                    value={editingDevice.id || ''}
                    onChange={(e) => setEditingDevice({ ...editingDevice, id: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">اسم الماكينة / الموقع</label>
                  <input
                    type="text"
                    value={editingDevice.name || ''}
                    onChange={(e) => setEditingDevice({ ...editingDevice, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    placeholder="مثال: إنتاج سيدات 1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">عنوان IP أو Domain</label>
                  <input
                    type="text"
                    value={editingDevice.ip || ''}
                    onChange={(e) => setEditingDevice({ ...editingDevice, ip: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    placeholder="192.168.1.251 أو دومين خارجي"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">منفذ الاتصال (Port)</label>
                  <input
                    type="number"
                    value={editingDevice.port || 4370}
                    onChange={(e) => setEditingDevice({ ...editingDevice, port: parseInt(e.target.value, 10) || 4370 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">طراز الماكينة (Model)</label>
                  <select
                    value={editingDevice.model || 'MB2000'}
                    onChange={(e) => setEditingDevice({ ...editingDevice, model: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                  >
                    <option value="MB2000">MB2000 (وجه وبصمة)</option>
                    <option value="MB2000/ID">MB2000/ID (وجه وبصمة وكارت)</option>
                    <option value="K40 Pro/ID">K40 Pro/ID (بصمة وكارت)</option>
                    <option value="iClock 880">iClock 880 (سعة عالية)</option>
                    <option value="SilkBio-101">SilkBio-101 (حريري)</option>
                    <option value="ZKTeco Other">موديل آخر</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <Key className="w-3 h-3 text-amber-400" />
                    <span>كلمة سر الاتصال (CommKey)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingDevice.commKey ?? 0}
                    onChange={(e) => setEditingDevice({ ...editingDevice, commKey: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">القسم التابع له</label>
                  <input
                    type="text"
                    value={editingDevice.department || ''}
                    onChange={(e) => setEditingDevice({ ...editingDevice, department: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    placeholder="إنتاج، مخازن، إداري..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">الرقم التسلسلي (SN)</label>
                  <input
                    type="text"
                    value={editingDevice.serialNumber || ''}
                    onChange={(e) => setEditingDevice({ ...editingDevice, serialNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    placeholder="سيريال الماكينة"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                >
                  {modalMode === 'add' ? 'إضافة الماكينة' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">تأكيد حذف الماكينة</h3>
            </div>
            <p className="text-xs text-slate-300">
              هل أنت متأكد من رغبتك في إزالة الماكينة رقم <span className="font-mono font-bold text-white">#{confirmDeleteId}</span> من النظام؟
            </p>
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteConfirmed}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
              >
                نعم، احذف الماكينة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USB Logs Modal */}
      {showUsbModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Usb className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">استيراد حركات البصمة من فلاشة USB</h3>
              </div>
              <button onClick={() => setShowUsbModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-300">
                الصق محتوى ملف الحركات النصي المسحوب من الماكينة (مثل <code className="font-mono text-amber-400">1_attlog.dat</code>):
              </p>
              <textarea
                value={usbContent}
                onChange={(e) => setUsbContent(e.target.value)}
                placeholder="مثال:&#10;1 2026-10-18 07:55:00 1 0&#10;2 2026-10-18 08:02:10 1 0"
                rows={7}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 font-mono text-white text-xs focus:border-blue-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowUsbModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleProcessUsb}
                disabled={!usbContent.trim()}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
              >
                استيراد الحركات الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Clear Memory Modal (CMD_CLEAR_ATTLOG) */}
      {deviceToWipe && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/60 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">تفريغ ذاكرة حركات الماكينة بأمان</h3>
                  <p className="text-[11px] text-slate-400">{deviceToWipe.name} ({deviceToWipe.ip})</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setDeviceToWipe(null);
                  setWipeConfirmText('');
                  setAcknowledgedBackup(false);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 text-amber-200/90 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>تأكيد أمان البيانات والحسابات:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 pr-1">
                  <li>يقوم هذا الخيار بإرسال أمر ZKTeco القياسي <code className="text-amber-300 font-mono">CMD_CLEAR_ATTLOG</code> لمسح سجلات الحركات السابقة فقط.</li>
                  <li><strong className="text-emerald-400">لن يتم مسح أي عامل أو بصمة إصبع أو بصمة وجه أو كود موظف أو كلمة سر</strong> (بيانات العمال تبقى كاملة 100% في الماكينة).</li>
                  <li>يساعد هذا الإجراء على تسريع استجابة الماكينة ومنع ظهور رسالة "الذاكرة ممتلئة".</li>
                  <li>جميع الحركات التي تم سحبها مسبقاً محفوظة بأمان في قاعدة بيانات البرنامج وأرشيفه.</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 text-[11px] space-y-1">
                <div className="text-slate-400">الماكينة المستهدفة: <span className="text-white font-bold">{deviceToWipe.name}</span></div>
                <div className="text-slate-400 font-mono">عنوان الاتصال: <span className="text-blue-400">{deviceToWipe.ip}:{deviceToWipe.port}</span></div>
                <div className="text-slate-400 font-mono">عدد الحركات الحالية في الماكينة: <span className="text-amber-400 font-bold">{deviceToWipe.recordCount.toLocaleString('ar-EG')} سجل</span></div>
              </div>

              <label className="flex items-start gap-2 p-2.5 rounded bg-slate-950 border border-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledgedBackup}
                  onChange={(e) => setAcknowledgedBackup(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-rose-600 focus:ring-0"
                />
                <span className="text-[11px] text-slate-300">
                  أقر بأنني قمت بسحب الحركات أو لدي نسخة احتياطية منها، وأرغب في تفريغ سجلات الحركات القديمة من ذاكرة الماكينة.
                </span>
              </label>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  للتأكيد، اكتب كلمة <strong className="text-rose-400 font-bold">"مسح"</strong> في الحقل التالي:
                </label>
                <input
                  type="text"
                  value={wipeConfirmText}
                  onChange={(e) => setWipeConfirmText(e.target.value)}
                  placeholder='اكتب "مسح" لتفعيل زر التأكيد'
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-xs focus:outline-none focus:border-rose-500 font-mono text-center"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDeviceToWipe(null);
                  setWipeConfirmText('');
                  setAcknowledgedBackup(false);
                }}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleExecuteWipeMemory}
                disabled={!acknowledgedBackup || wipeConfirmText.trim() !== 'مسح' || isWiping}
                className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isWiping ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري تفريغ الذاكرة بأمان...</span>
                  </>
                ) : (
                  <>
                    <DatabaseZap className="w-3.5 h-3.5" />
                    <span>تأكيد تفريغ الذاكرة الآن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
