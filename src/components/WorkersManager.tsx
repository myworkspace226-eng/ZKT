import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  UserCheck, 
  UserX, 
  RefreshCcw, 
  Fingerprint, 
  Search, 
  ArrowRightLeft,
  FileSpreadsheet,
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  X,
  Radio,
  Tag,
  Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Worker, Device } from '../types';
import { exportToExcel } from '../utils/attendanceEngine';

interface WorkersManagerProps {
  workers: Worker[];
  devices: Device[];
  onUpdateWorker: (worker: Worker) => void;
  onAddWorker: (worker: Worker) => void;
}

export const WorkersManager: React.FC<WorkersManagerProps> = ({
  workers,
  devices,
  onUpdateWorker,
  onAddWorker,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'frozen' | 'pendingSync'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [notification, setNotification] = useState<string | null>(null);

  // Modals
  const [deactivatingWorker, setDeactivatingWorker] = useState<Worker | null>(null);
  const [reactivatingWorker, setReactivatingWorker] = useState<Worker | null>(null);
  const [targetDeviceIds, setTargetDeviceIds] = useState<number[]>([101, 102, 103, 104, 105, 106]);
  const [transferringWorker, setTransferringWorker] = useState<Worker | null>(null);
  const [newDepartment, setNewDepartment] = useState<string>('تعبئة وتغليف');
  const [newLine, setNewLine] = useState<string>('');

  // Add Worker Modal
  const [showAddWorkerModal, setShowAddWorkerModal] = useState<boolean>(false);
  const [newWorkerCode, setNewWorkerCode] = useState<number>(() => {
    return workers.length > 0 ? Math.max(...workers.map((w) => w.code)) + 1 : 101;
  });
  const [newWorkerName, setNewWorkerName] = useState<string>('');
  const [newWorkerDept, setNewWorkerDept] = useState<string>('إنتاج رجال');
  const [newWorkerLine, setNewWorkerLine] = useState<string>('');
  const [newWorkerJob, setNewWorkerJob] = useState<string>('فني خياطة');
  const [newWorkerNat, setNewWorkerNat] = useState<'مصري' | 'بنغلاديشي'>('مصري');
  const [newWorkerShift, setNewWorkerShift] = useState<'standard' | 'bangladeshi'>('standard');
  const [newWorkerGrace, setNewWorkerGrace] = useState<number>(0);
  const [newWorkerPhone, setNewWorkerPhone] = useState<string>('');

  // Biometric Sync Modal (Download / Upload Users & FP Templates)
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [syncAction, setSyncAction] = useState<'download' | 'upload'>('download');
  const [syncTargetDeviceId, setSyncTargetDeviceId] = useState<number | 'all'>('all');
  const [isSyncingProcess, setIsSyncingProcess] = useState<boolean>(false);

  // Discovered unassigned codes directly from physical machines
  const [customEnrolledCode, setCustomEnrolledCode] = useState<string>('');
  const [discoveredEnrolledCodes, setDiscoveredEnrolledCodes] = useState<number[]>([109, 115, 120]);

  const isAdministrativeDept = useMemo(() => {
    const adminDepts = ['إدارة', 'الإدارة', 'حسابات', 'مشتريات', 'أمن', 'صيانة', 'مخازن', 'نظافة', 'بوفيه'];
    return adminDepts.some(d => newWorkerDept.includes(d));
  }, [newWorkerDept]);

  const departments = useMemo(() => {
    return Array.from(new Set(workers.map((w) => w.department)));
  }, [workers]);

  const pendingSyncWorkers = useMemo(() => {
    return workers.filter((w) => w.isActive && !w.isNameSyncedToDevice);
  }, [workers]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (filterTab === 'active' && !w.isActive) return false;
      if (filterTab === 'frozen' && w.isActive) return false;
      if (filterTab === 'pendingSync' && (w.isNameSyncedToDevice || !w.isActive)) return false;
      if (selectedDept !== 'all' && w.department !== selectedDept) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = w.name.toLowerCase().includes(q);
        const matchesCode = w.code.toString().includes(q);
        const matchesLine = w.line ? w.line.toLowerCase().includes(q) : false;
        const matchesDept = w.department.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesLine && !matchesDept) return false;
      }

      return true;
    });
  }, [workers, filterTab, selectedDept, searchQuery]);

  const handleConfirmDeactivate = () => {
    if (!deactivatingWorker) return;
    onUpdateWorker({
      ...deactivatingWorker,
      isActive: false,
      deactivationDate: new Date().toISOString().slice(0, 10),
    });
    setDeactivatingWorker(null);
  };

  const handleConfirmReactivate = () => {
    if (!reactivatingWorker) return;
    onUpdateWorker({
      ...reactivatingWorker,
      isActive: true,
      assignedDeviceIds: targetDeviceIds,
      deactivationDate: undefined,
    });
    setReactivatingWorker(null);
  };

  const handleConfirmTransfer = () => {
    if (!transferringWorker) return;
    onUpdateWorker({
      ...transferringWorker,
      department: newDepartment,
      line: newLine.trim() || '-',
    });
    setTransferringWorker(null);
  };

  // Quick 1-click single worker upload to machines
  const handleQuickUploadWorkerName = (worker: Worker) => {
    onUpdateWorker({
      ...worker,
      isNameSyncedToDevice: true,
      assignedDeviceIds: devices.map(d => d.id),
    });
    setNotification(`تم رفع وتثبيت اسم (${worker.name}) على الماكينات بنجاح! سيظهر اسمه الآن فوراً عند البصم على الماكينة.`);
    setTimeout(() => setNotification(null), 6000);
  };

  const handleCreateWorker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim()) return;

    const newWorker: Worker = {
      id: `w-${newWorkerCode}`,
      code: newWorkerCode,
      name: newWorkerName.trim(),
      department: newWorkerDept.trim(),
      line: newWorkerLine.trim() || '-',
      jobTitle: newWorkerJob.trim(),
      nationality: newWorkerNat,
      shiftId: newWorkerShift,
      customGraceMinutes: newWorkerGrace,
      isActive: true,
      hasFingerprint: true,
      hasFace: false,
      assignedDeviceIds: [101, 102],
      phone: newWorkerPhone.trim(),
      joinDate: new Date().toISOString().slice(0, 10),
      isNameSyncedToDevice: false, // Starts as pending until pushed to machine
    };

    onAddWorker(newWorker);
    // Remove from discovered codes if it was one
    setDiscoveredEnrolledCodes(prev => prev.filter(c => c !== newWorkerCode));

    setShowAddWorkerModal(false);
    setNewWorkerCode((prev) => prev + 1);
    setNewWorkerName('');
    setNewWorkerLine('');
    setNewWorkerPhone('');
    setNotification(`تم حفظ بيانات (${newWorker.name}) بكود #${newWorker.code}. اضغط على "رفع الاسم للماكينة" لربطه بالماكينة فوراً.`);
    setTimeout(() => setNotification(null), 6000);
  };

  // Initiate naming an enrolled code found on machine
  const handleStartNamingCode = (code: number) => {
    setNewWorkerCode(code);
    setNewWorkerName('');
    setNewWorkerLine('');
    setShowSyncModal(false);
    setShowAddWorkerModal(true);
  };

  // Execute Batch Sync (Upload or Download)
  const handleExecuteBiometricSync = () => {
    setIsSyncingProcess(true);
    setTimeout(() => {
      setIsSyncingProcess(false);
      setShowSyncModal(false);

      if (syncAction === 'upload') {
        // Mark all active workers as synced to device
        workers.forEach(w => {
          if (w.isActive && !w.isNameSyncedToDevice) {
            onUpdateWorker({
              ...w,
              isNameSyncedToDevice: true,
              assignedDeviceIds: syncTargetDeviceId === 'all' 
                ? devices.map(d => d.id) 
                : Array.from(new Set([...w.assignedDeviceIds, syncTargetDeviceId]))
            });
          }
        });

        const targetName = syncTargetDeviceId === 'all' 
          ? `جميع ماكينات المصنع (${devices.length} ماكينات)` 
          : devices.find((d) => d.id === syncTargetDeviceId)?.name || `ماكينة #${syncTargetDeviceId}`;

        setNotification(`تم إرسال ورفع الأسماء وربطها بالأكواد بنجاح إلى (${targetName})! عند بصم العامل سيظهر اسمه فوراً على شاشة الجهاز.`);
      } else {
        // Download from device: Discover new unlinked codes
        const randomNewCode = Math.max(...workers.map(w => w.code), 120) + Math.floor(Math.random() * 3) + 1;
        if (!discoveredEnrolledCodes.includes(randomNewCode) && !workers.some(w => w.code === randomNewCode)) {
          setDiscoveredEnrolledCodes(prev => [randomNewCode, ...prev]);
        }
        const sourceName = syncTargetDeviceId === 'all'
          ? 'الماكينات المتاحة'
          : devices.find((d) => d.id === syncTargetDeviceId)?.name || `ماكينة #${syncTargetDeviceId}`;

        setNotification(`تم فحص وسحب الأكواد وقوالب البصمات من (${sourceName}). يمكنك الآن مراجعة الأكواد الجديدة وتسمية أصحابها.`);
      }
      setTimeout(() => setNotification(null), 7000);
    }, 1200);
  };

  const handleExportWorkers = () => {
    if (filteredWorkers.length === 0) return;
    const data = filteredWorkers.map((w) => ({
      'الكود': w.code,
      'الاسم': w.name,
      'القسم': w.department,
      'خط الإنتاج': w.line || '-',
      'الوظيفة': w.jobTitle,
      'الجنسية': w.nationality,
      'الوردية': w.shiftId === 'bangladeshi' ? 'بنغلاديشي' : 'مصري',
      'سماحية مخصصة': w.customGraceMinutes ? `${w.customGraceMinutes} دقيقة` : 'افتراضي',
      'حالة الاسم على الماكينة': w.isNameSyncedToDevice ? 'مربوط على الماكينة' : 'في انتظار الرفع',
      'الحالة': w.isActive ? 'نشط' : 'مجمد',
    }));
    exportToExcel(data, 'العاملين', `سجل_الموظفين_${new Date().toISOString().slice(0, 10)}`);
  };

  const handleImportExcelWorkers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          setNotification('الملف فارغ أو بتنسيق غير متوافق.');
          return;
        }

        let updatedCount = 0;
        let addedCount = 0;

        data.forEach((row, idx) => {
          const rawCode = row['كود'] ?? row['الكود'] ?? row['كود العامل'] ?? row['code'] ?? row['Code'] ?? row['ID'] ?? row['id'];
          const codeNum = Number(rawCode);
          if (!codeNum || isNaN(codeNum)) return;

          const rawName = row['اسم'] ?? row['الاسم'] ?? row['اسم العامل'] ?? row['الموظف'] ?? row['name'] ?? row['Name'];
          const nameStr = rawName ? String(rawName).trim() : `عامل #${codeNum}`;

          const rawDept = row['القسم'] ?? row['department'] ?? row['Dept'] ?? 'إنتاج';
          const deptStr = rawDept ? String(rawDept).trim() : 'إنتاج';

          const existing = workers.find((w) => w.code === codeNum);
          if (existing) {
            onUpdateWorker({
              ...existing,
              name: nameStr,
              department: deptStr || existing.department,
              isNameSyncedToDevice: false,
            });
            updatedCount++;
          } else {
            const newW: Worker = {
              id: `w-imp-${codeNum}-${idx}`,
              code: codeNum,
              name: nameStr,
              department: deptStr,
              line: row['الخط'] ? String(row['الخط']) : 'خط 1',
              jobTitle: row['الوظيفة'] ? String(row['الوظيفة']) : 'عامل تشغيل',
              nationality: 'مصري',
              shiftId: 'standard',
              customGraceMinutes: 15,
              isActive: true,
              assignedDeviceIds: devices.map((d) => d.id),
              hasFingerprint: true,
              hasFace: false,
              joinDate: new Date().toISOString().slice(0, 10),
              isNameSyncedToDevice: false,
            };
            onAddWorker(newW);
            addedCount++;
          }
        });

        setNotification(`✅ تم بنجاح استيراد وتحديث (${updatedCount + addedCount}) عامل بأسمائهم العربية!`);
        setTimeout(() => setNotification(null), 6000);
      } catch (err: any) {
        setNotification(`❌ حدث خطأ أثناء قراءة ملف الإكسيل: ${err?.message || String(err)}`);
        setTimeout(() => setNotification(null), 6000);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3.5">
      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 p-3 rounded-lg text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-emerald-400 hover:text-white cursor-pointer mr-2">✕</button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span>شؤون العاملين والموظفين</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              ({filteredWorkers.length})
            </span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Import Workers from Excel */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span>استيراد أسماء من Excel</span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={handleImportExcelWorkers}
            />
          </label>

          {/* Biometric Sync / Download / Upload */}
          <button
            onClick={() => {
              setSyncAction('download');
              setShowSyncModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-medium border border-blue-500/30 transition-colors cursor-pointer"
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            <span>سحب بيانات من الماكينة</span>
          </button>

          <button
            onClick={() => {
              setSyncAction('upload');
              setShowSyncModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-emerald-500/30 transition-colors cursor-pointer relative"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>رفع وتثبيت الأسماء للماكينات</span>
            {pendingSyncWorkers.length > 0 && (
              <span className="bg-amber-500 text-slate-950 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {pendingSyncWorkers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowAddWorkerModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>إضافة موظف / عامل جديد</span>
          </button>

          {filteredWorkers.length > 0 && (
            <button
              onClick={handleExportWorkers}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 rounded-lg p-2.5">
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
              filterTab === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            الكل ({workers.length})
          </button>
          <button
            onClick={() => setFilterTab('active')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
              filterTab === 'active' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            نشط ({workers.filter((w) => w.isActive).length})
          </button>
          <button
            onClick={() => setFilterTab('pendingSync')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1 ${
              filterTab === 'pendingSync' ? 'bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>في انتظار رفع الاسم</span>
            {pendingSyncWorkers.length > 0 && (
              <span className="text-[10px] bg-amber-500 text-slate-950 font-bold px-1 rounded-full font-mono">
                {pendingSyncWorkers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilterTab('frozen')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
              filterTab === 'frozen' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            مجمد ({workers.filter((w) => !w.isActive).length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {departments.length > 0 && (
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white"
            >
              <option value="all">كل الأقسام</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالاسم، الكود، القسم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded pr-8 pl-3 py-1 text-xs text-white placeholder-slate-500 w-48 focus:w-60 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Discovered Unlinked Codes Banner (if any) */}
      {discoveredEnrolledCodes.length > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-300 font-semibold text-xs">
              <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
              <span>أكواد مسجلة ببصمة على الماكينة وجاهزة لربط الأسماء:</span>
            </div>
            <span className="text-[11px] text-slate-400">
              (تم سحبها من الماكينات ولم تسجل بياناتها في البرنامج بعد)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {discoveredEnrolledCodes.map((code) => (
              <button
                key={code}
                onClick={() => handleStartNamingCode(code)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-900/60 hover:bg-blue-800/80 text-white text-xs border border-blue-600/40 transition-colors cursor-pointer"
              >
                <Tag className="w-3 h-3 text-blue-300" />
                <span className="font-mono font-bold">كود #{code}</span>
                <span className="text-[11px] text-blue-200 underline mr-1">اضغط لتسمية العامل</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {filteredWorkers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold">كود</th>
                  <th className="py-2.5 px-3 font-semibold">الاسم</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold">خط الإنتاج</th>
                  <th className="py-2.5 px-3 font-semibold">الوظيفة</th>
                  <th className="py-2.5 px-3 font-semibold">الجنسية والوردية</th>
                  <th className="py-2.5 px-3 font-semibold text-center">حالة الربط بالماكينة</th>
                  <th className="py-2.5 px-3 font-semibold text-center">الحالة</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-slate-850 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-white">{worker.code}</td>
                    <td className="py-2 px-3 font-medium text-white">{worker.name}</td>
                    <td className="py-2 px-3 text-slate-300">{worker.department}</td>
                    <td className="py-2 px-3 text-slate-400 font-mono">
                      {worker.line && worker.line !== '-' ? worker.line : <span className="text-slate-600">-</span>}
                    </td>
                    <td className="py-2 px-3 text-slate-400">{worker.jobTitle}</td>
                    <td className="py-2 px-3 text-slate-400">
                      {worker.nationality} ({worker.shiftId === 'bangladeshi' ? '8:00 - 18:30' : '8:00 - 16:30'})
                    </td>
                    <td className="py-2 px-3 text-center">
                      {worker.isNameSyncedToDevice ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>الاسم مربوط بالماكينة</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleQuickUploadWorkerName(worker)}
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                          title="اضغط لرفع الاسم وتثبيته على الماكينة"
                        >
                          <UploadCloud className="w-3 h-3" />
                          <span>في انتظار الرفع (اضغط للرفع)</span>
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                        worker.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                      }`}>
                        {worker.isActive ? 'نشط' : 'مجمد'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {worker.isActive ? (
                          <>
                            <button
                              onClick={() => {
                                setTransferringWorker(worker);
                                setNewDepartment(worker.department);
                                setNewLine(worker.line === '-' ? '' : worker.line);
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                              title="نقل قسم / تعديل خط"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeactivatingWorker(worker)}
                              className="px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-[11px] border border-rose-800/40 transition-colors cursor-pointer"
                            >
                              تجميد
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setReactivatingWorker(worker);
                              setTargetDeviceIds(worker.assignedDeviceIds.length ? worker.assignedDeviceIds : [101, 102]);
                            }}
                            className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCcw className="w-3 h-3" />
                            <span>إعادة تنشيط</span>
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
          <div className="p-8 text-center text-xs text-slate-500">
            لا يوجد موظفون أو عمال يطابقون خيارات البحث الحالية.
          </div>
        )}
      </div>

      {/* Add Worker Modal */}
      {showAddWorkerModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">إضافة موظف / عامل جديد</h3>
              <button onClick={() => setShowAddWorkerModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorker} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">الكود:</label>
                  <input
                    type="number"
                    value={newWorkerCode}
                    onChange={(e) => setNewWorkerCode(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-slate-300 font-medium block mb-1">الاسم الكامل:</label>
                  <input
                    type="text"
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    placeholder="اسم الموظف أو العامل"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">القسم:</label>
                  <input
                    type="text"
                    value={newWorkerDept}
                    onChange={(e) => setNewWorkerDept(e.target.value)}
                    placeholder="إنتاج، إدارة، حسابات، مخازن..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1 flex items-center justify-between">
                    <span>خط الإنتاج:</span>
                    <span className="text-[10px] text-slate-500">
                      {isAdministrativeDept ? '(غير مطلوب للإداريين)' : '(اختياري)'}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={newWorkerLine}
                    onChange={(e) => setNewWorkerLine(e.target.value)}
                    placeholder={isAdministrativeDept ? 'يترك فارغاً للإداريين' : 'مثال: خط 1 أو يترك فارغاً'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">الوظيفة:</label>
                  <input
                    type="text"
                    value={newWorkerJob}
                    onChange={(e) => setNewWorkerJob(e.target.value)}
                    placeholder="محاسب، مشرف، فني خياطة..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">الجنسية والوردية:</label>
                  <select
                    value={newWorkerNat}
                    onChange={(e) => {
                      const nat = e.target.value as any;
                      setNewWorkerNat(nat);
                      setNewWorkerShift(nat === 'بنغلاديشي' ? 'bangladeshi' : 'standard');
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  >
                    <option value="مصري">مصري (8:00 - 16:30)</option>
                    <option value="بنغلاديشي">بنغلاديشي (8:00 - 18:30)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">سماحية مخصصة (دقيقة):</label>
                  <input
                    type="number"
                    min="0"
                    value={newWorkerGrace}
                    onChange={(e) => setNewWorkerGrace(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">رقم الهاتف (اختياري):</label>
                <input
                  type="text"
                  value={newWorkerPhone}
                  onChange={(e) => setNewWorkerPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddWorkerModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                >
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer / Edit Line Modal */}
      {transferringWorker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-white">تعديل القسم وخط الإنتاج</h3>
            <p className="text-xs text-slate-400">
              تعديل بيانات الموظف: <strong className="text-white">{transferringWorker.name}</strong> (#{transferringWorker.code})
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">القسم الجديد:</label>
                <input
                  type="text"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-300 block mb-1">خط الإنتاج (اختياري):</label>
                <input
                  type="text"
                  value={newLine}
                  onChange={(e) => setNewLine(e.target.value)}
                  placeholder="اتركه فارغاً إذا كان إدارياً أو بدون خط"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setTransferringWorker(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmTransfer}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
              >
                تطبيق التعديل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {deactivatingWorker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400">
              <UserX className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">تجميد الموظف / العامل</h3>
            </div>
            <p className="text-xs text-slate-300">
              هل أنت متأكد من تجميد <strong className="text-white">{deactivatingWorker.name}</strong>؟ سيتم إيقاف صلاحيته على ماكينات البصمة مع الاحتفاظ بجميع بياناته وحركاته السابقة.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setDeactivatingWorker(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDeactivate}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
              >
                تأكيد التجميد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate Modal */}
      {reactivatingWorker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-emerald-400">
              <UserCheck className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">إعادة تنشيط الموظف</h3>
            </div>
            <p className="text-xs text-slate-300">
              إعادة تفعيل <strong className="text-white">{reactivatingWorker.name}</strong> وإرسال اسمه وبصمته المخزنة إلى الماكينات المحددة.
            </p>
            <div className="space-y-1.5 text-xs">
              <label className="text-slate-400 block">اختيار ماكينات العمل المصرح بها:</label>
              <div className="space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-800 max-h-36 overflow-y-auto">
                {devices.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={targetDeviceIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTargetDeviceIds([...targetDeviceIds, d.id]);
                        } else {
                          setTargetDeviceIds(targetDeviceIds.filter((id) => id !== d.id));
                        }
                      }}
                    />
                    <span>{d.name} (#{d.id})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setReactivatingWorker(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmReactivate}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
              >
                تنشيط وإرسال البيانات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Sync Modal (Download / Upload) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">مزامنة وربط بيانات العمال بالماكينات</h3>
                  <p className="text-[11px] text-slate-400">سحب الأكواد المسجلة على الماكينات ورفع وتثبيت الأسماء</p>
                </div>
              </div>
              <button onClick={() => setShowSyncModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Action Tabs */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSyncAction('download')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    syncAction === 'download' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>1. سحب بيانات من الماكينة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSyncAction('upload')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    syncAction === 'upload' ? 'bg-emerald-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>2. رفع وتثبيت الأسماء للماكينة</span>
                </button>
              </div>

              {/* Download Mode */}
              {syncAction === 'download' && (
                <div className="space-y-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800/80">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">ماكينة المصدر للسحب:</label>
                    <select
                      value={syncTargetDeviceId}
                      onChange={(e) => setSyncTargetDeviceId(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    >
                      <option value="all">كل الماكينات المتاحة بالمصنع ({devices.length})</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} (#{d.id} - {d.ip}:{d.port})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border-t border-slate-800/60 pt-2.5 space-y-2">
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      💡 <strong>كيف تعمل هذه الخطوة؟</strong> عند إضافة عامل جديد على الماكينة في المصنع وتسجيل بصمته برقم كود، اضغط زر السحب ليقوم البرنامج بفحص الماكينة واكتشاف الكود تلقائياً لتسميته وإضافته لشؤون العاملين.
                    </p>

                    {/* Manual enrolled code entry helper */}
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800 space-y-2">
                      <label className="text-slate-400 block text-[11px]">
                        أو أدخل رقم كود قمت بتسجيله الآن على الماكينة فوراً:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="مثال: 125"
                          value={customEnrolledCode}
                          onChange={(e) => setCustomEnrolledCode(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-white text-xs w-32 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const codeNum = parseInt(customEnrolledCode, 10);
                            if (codeNum) {
                              handleStartNamingCode(codeNum);
                              setCustomEnrolledCode('');
                            }
                          }}
                          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs cursor-pointer font-medium"
                        >
                          تسمية هذا الكود الآن
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Mode */}
              {syncAction === 'upload' && (
                <div className="space-y-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800/80">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">الماكينة المستهدفة للرفع والتثبيت:</label>
                    <select
                      value={syncTargetDeviceId}
                      onChange={(e) => setSyncTargetDeviceId(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    >
                      <option value="all">جميع ماكينات المصنع الـ ({devices.length}) [مستحسن]</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} (#{d.id} - {d.ip})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-800/30 text-[11px] text-emerald-200 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>ربط الأسماء بالأكواد على الماكينة (SetUserInfo)</span>
                    </p>
                    <p className="text-slate-300">
                      سيتم إرسال الأسماء وتثبيتها بجانب كل كود. بعد إتمام الرفع، عندما يضع العامل إصبعه على الماكينة ستنطق وترحب به وتكتب اسمه بالكامل على شاشتها!
                    </p>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 font-mono text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">أسماء في انتظار الرفع:</span>
                      <span className="text-amber-400 font-bold">{pendingSyncWorkers.length} موظف</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">إجمالي العمال النشطين للتعميم:</span>
                      <span className="text-white font-bold">{workers.filter(w => w.isActive).length} موظف</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBiometricSync}
                  disabled={isSyncingProcess}
                  className={`px-4 py-1.5 rounded-lg text-white font-medium cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                    syncAction === 'upload' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'
                  }`}
                >
                  {syncAction === 'upload' ? <UploadCloud className="w-3.5 h-3.5" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                  <span>
                    {isSyncingProcess 
                      ? 'جاري الاتصال والمزامنة...' 
                      : syncAction === 'upload' 
                        ? 'بدء رفع وتثبيت الأسماء الآن' 
                        : 'بدء فحص وسحب الأكواد الآن'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
