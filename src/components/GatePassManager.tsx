import React, { useState } from 'react';
import { 
  DoorOpen, 
  Plus, 
  CheckCircle2, 
  FileSpreadsheet,
  Calendar,
  Clock,
  User,
  History,
  AlertCircle,
  X
} from 'lucide-react';
import { GatePass, Worker } from '../types';
import { exportToExcel } from '../utils/attendanceEngine';

interface GatePassManagerProps {
  gatePasses: GatePass[];
  workers: Worker[];
  onAddGatePass: (gatePass: GatePass) => void;
  onCompleteGatePass: (id: string, returnTime: string) => void;
}

export const GatePassManager: React.FC<GatePassManagerProps> = ({
  gatePasses,
  workers,
  onAddGatePass,
  onCompleteGatePass,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [selectedWorkerCode, setSelectedWorkerCode] = useState<number>(workers.length > 0 ? workers[0].code : 0);
  const [passDate, setPassDate] = useState<string>(todayStr);
  const [passType, setPassType] = useState<'temporary' | 'rest_of_day'>('temporary');
  const [passReason, setPassReason] = useState<'official_mission' | 'medical' | 'personal_with_deduction' | 'personal_excused'>('official_mission');
  const [reasonDetails, setReasonDetails] = useState<string>('');
  const [exitTime, setExitTime] = useState<string>('12:00');
  const [expectedReturnTime, setExpectedReturnTime] = useState<string>('14:30');
  const [approver, setApprover] = useState<string>('شؤون العاملين');

  const [completingPassId, setCompletingPassId] = useState<string | null>(null);
  const [returnInputTime, setReturnInputTime] = useState<string>('14:00');

  // Filter state
  const [dateFilter, setDateFilter] = useState<string>('all'); // 'all' or 'today' or specific

  const isSelectedDateRetroactive = passDate < todayStr;

  const handleCreatePass = (e: React.FormEvent) => {
    e.preventDefault();
    const worker = workers.find((w) => w.code === selectedWorkerCode);
    if (!worker) return;

    const newPass: GatePass = {
      id: `gp-${Date.now()}`,
      workerCode: worker.code,
      workerName: worker.name,
      department: worker.department,
      date: passDate,
      exitTime: exitTime,
      returnTime: passType === 'rest_of_day' ? undefined : (expectedReturnTime || undefined),
      type: passType,
      reason: passReason,
      reasonText: reasonDetails || (
        passReason === 'official_mission' ? 'مأمورية رسمية' :
        passReason === 'medical' ? 'كشف طبي وتأمين' :
        passReason === 'personal_excused' ? 'إذن شخصي معتمد' : 'إذن شخصي مخصوم'
      ),
      approvedBy: approver || 'شؤون العاملين',
      status: passType === 'rest_of_day' ? 'completed' : 'active',
      isRetroactive: isSelectedDateRetroactive,
    };

    onAddGatePass(newPass);
    setShowAddModal(false);
    setReasonDetails('');
    setPassDate(todayStr);
  };

  const handleSaveReturn = (id: string) => {
    onCompleteGatePass(id, returnInputTime);
    setCompletingPassId(null);
  };

  const filteredPasses = gatePasses.filter((p) => {
    if (dateFilter === 'today') return p.date === todayStr;
    if (dateFilter !== 'all') return p.date === dateFilter;
    return true;
  });

  const handleExport = () => {
    if (gatePasses.length === 0) return;
    const data = filteredPasses.map((p) => ({
      'كود العامل': p.workerCode,
      'اسم العامل': p.workerName,
      'القسم': p.department,
      'تاريخ التصريح': p.date,
      'أثر رجعي': p.isRetroactive ? 'نعم (متأخر من الأمن)' : 'في حينه',
      'وقت الخروج': p.exitTime,
      'وقت العودة': p.returnTime || (p.type === 'rest_of_day' ? 'مغادرة لآخر اليوم' : 'معلق'),
      'النوع': p.type === 'temporary' ? 'مؤقت وعودة' : 'مغادرة نهاية الوردية',
      'السبب': p.reasonText,
      'المعتمد': p.approvedBy,
      'الحالة': p.status === 'completed' ? 'معتمد ومنتهي' : 'ساري بالخارج',
    }));
    exportToExcel(data, 'أذونات_الخروج', `تصاريح_الخروج_${passDate}`);
  };

  const getReasonLabel = (reason: GatePass['reason']) => {
    switch (reason) {
      case 'official_mission':
        return 'مأمورية عمل';
      case 'medical':
        return 'كشف طبي / عيادة';
      case 'personal_excused':
        return 'شخصي معتمد (مدفوع)';
      case 'personal_with_deduction':
        return 'شخصي (مخصوم)';
      default:
        return 'إذن';
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <DoorOpen className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span>أذونات وتصاريح الخروج</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              ({filteredPasses.length})
            </span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Date Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                dateFilter === 'all' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({gatePasses.length})
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                dateFilter === 'today' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              تصاريح اليوم
            </button>
          </div>

          <button
            onClick={() => {
              if (workers.length > 0) setSelectedWorkerCode(workers[0].code);
              setPassDate(todayStr);
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إصدار إذن / تصريح خروج</span>
          </button>

          {gatePasses.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
          )}
        </div>
      </div>


      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {filteredPasses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold">كود</th>
                  <th className="py-2.5 px-3 font-semibold">العامل</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold">تاريخ التصريح</th>
                  <th className="py-2.5 px-3 font-semibold">النوع</th>
                  <th className="py-2.5 px-3 font-semibold text-center">الخروج</th>
                  <th className="py-2.5 px-3 font-semibold text-center">العودة</th>
                  <th className="py-2.5 px-3 font-semibold">السبب</th>
                  <th className="py-2.5 px-3 font-semibold">المعتمد</th>
                  <th className="py-2.5 px-3 font-semibold text-center">الحالة الإدارية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredPasses.map((pass) => (
                  <tr key={pass.id} className="hover:bg-slate-850 transition-colors">
                    <td className="py-2 px-3 font-bold text-white">{pass.workerCode}</td>
                    <td className="py-2 px-3 font-sans font-medium text-white">{pass.workerName}</td>
                    <td className="py-2 px-3 font-sans text-slate-400">{pass.department}</td>
                    <td className="py-2 px-3 text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span>{pass.date}</span>
                        {pass.isRetroactive && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-sans border border-amber-500/30">
                            أثر رجعي
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-300">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        pass.type === 'rest_of_day' 
                          ? 'bg-rose-950/40 text-rose-300 border border-rose-800/50' 
                          : 'bg-blue-950/40 text-blue-300 border border-blue-800/50'
                      }`}>
                        {pass.type === 'rest_of_day' ? 'مغادرة لآخر اليوم' : 'مؤقت وعودة'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-amber-400 font-bold">{pass.exitTime}</td>
                    <td className="py-2 px-3 text-center">
                      {pass.returnTime ? (
                        <span className="text-emerald-400 font-bold">{pass.returnTime}</span>
                      ) : pass.type === 'rest_of_day' ? (
                        <span className="text-slate-500 font-sans text-[11px]">نهاية اليوم</span>
                      ) : completingPassId === pass.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="time"
                            value={returnInputTime}
                            onChange={(e) => setReturnInputTime(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white"
                          />
                          <button
                            onClick={() => handleSaveReturn(pass.id)}
                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                            title="حفظ العودة"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCompletingPassId(pass.id)}
                          className="px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-sans transition-colors cursor-pointer"
                        >
                          تسجيل العودة
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-300">
                      <div className="text-xs">{pass.reasonText}</div>
                      <div className="text-[10px] text-slate-400">{getReasonLabel(pass.reason)}</div>
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-400">{pass.approvedBy}</td>
                    <td className="py-2 px-3 text-center font-sans">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        pass.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}>
                        {pass.status === 'completed' ? 'معتمد ومنتهي' : 'ساري بالخارج'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد أذونات أو تصاريح خروج مسجلة للتصفية المحددة.
          </div>
        )}
      </div>

      {/* Add Pass Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">إصدار تصريح خروج / إذن أمن</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePass} className="space-y-3.5 text-xs">
              {/* Date & Worker */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>تاريخ التصريح</span>
                  </label>
                  <input
                    type="date"
                    value={passDate}
                    onChange={(e) => setPassDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span>اختيار العامل</span>
                  </label>
                  <select
                    value={selectedWorkerCode}
                    onChange={(e) => setSelectedWorkerCode(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  >
                    {workers.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name} ({w.department})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pass Type & Times */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">نوع التصريح</label>
                  <select
                    value={passType}
                    onChange={(e) => setPassType(e.target.value as 'temporary' | 'rest_of_day')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  >
                    <option value="temporary">مؤقت (خروج وعودة)</option>
                    <option value="rest_of_day">مغادرة لآخر اليوم</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>وقت الخروج</span>
                  </label>
                  <input
                    type="time"
                    value={exitTime}
                    onChange={(e) => setExitTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>

                {passType === 'temporary' ? (
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>وقت العودة المتوقع</span>
                    </label>
                    <input
                      type="time"
                      value={expectedReturnTime}
                      onChange={(e) => setExpectedReturnTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">العودة</label>
                    <div className="p-2 rounded bg-slate-950/60 border border-slate-800 text-slate-500 text-center font-mono">
                      لا توجد عودة
                    </div>
                  </div>
                )}
              </div>

              {/* Reason & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">تصنيف السبب</label>
                  <select
                    value={passReason}
                    onChange={(e) => setPassReason(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  >
                    <option value="official_mission">مأمورية عمل رسمية</option>
                    <option value="medical">عيادة وتأمين صحي</option>
                    <option value="personal_excused">إذن شخصي معتمد (مدفوع)</option>
                    <option value="personal_with_deduction">إذن شخصي (يخصم من الوقت)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">المعتمد / المصرح</label>
                  <input
                    type="text"
                    value={approver}
                    onChange={(e) => setApprover(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    placeholder="شؤون العاملين / مدير المصنع"
                    required
                  />
                </div>
              </div>

              {/* Reason Details */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">تفاصيل السبب أو رقم دفتر الأمن</label>
                <input
                  type="text"
                  value={reasonDetails}
                  onChange={(e) => setReasonDetails(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  placeholder="مثال: تصريح دفتر الأمن رقم 45 - مأمورية لمخازن العاشر"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                >
                  حفظ واعتماد التصريح
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
