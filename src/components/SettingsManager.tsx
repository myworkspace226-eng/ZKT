import React, { useState } from 'react';
import { 
  Settings, 
  Building2, 
  Clock, 
  Calendar, 
  ShieldCheck, 
  Database, 
  Download, 
  Upload, 
  Save, 
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Server
} from 'lucide-react';
import { FactorySettings } from '../types';

interface SettingsManagerProps {
  settings: FactorySettings;
  onUpdateSettings: (newSettings: FactorySettings) => void;
  onExportAllData: () => void;
  onImportBackup: (jsonContent: string) => void;
  onResetFactoryData: () => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  settings,
  onUpdateSettings,
  onExportAllData,
  onImportBackup,
  onResetFactoryData,
}) => {
  const [formData, setFormData] = useState<FactorySettings>({ ...settings });
  const [notification, setNotification] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setNotification('تم حفظ إعدادات النظام والمصنع بنجاح.');
    setTimeout(() => setNotification(null), 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onImportBackup(content);
        setNotification('تمت استعادة قاعدة البيانات والنسخة الاحتياطية بنجاح.');
        setTimeout(() => setNotification(null), 4000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 p-3 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-500 hover:text-white">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">إعدادات النظام وسياسات العمل</h2>
            <p className="text-[11px] text-slate-400">
              تخصيص هوية المصنع والفرع، مضاعفات الإضافي والجمعة والعطلات، والنسخ الاحتياطي
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>حفظ التعديلات</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Section 1: Factory Identity */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-xs pb-2 border-b border-slate-800">
            <Building2 className="w-4 h-4 text-blue-400" />
            <span>بيانات المصنع والمنشأة</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">اسم المصنع / الشركة</label>
              <input
                type="text"
                value={formData.factoryName}
                onChange={(e) => setFormData({ ...formData, factoryName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">اسم الفرع / الموقع</label>
              <input
                type="text"
                value={formData.branchName}
                onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                required
              />
            </div>
          </div>
        </div>


        {/* Section 3: Overtime & Friday Multipliers */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-xs pb-2 border-b border-slate-800">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>مضاعفات الإضافي والجمعة والعطلات الرسمية</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">مضاعف يوم الجمعة (اليوم بيومين)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={formData.fridayMultiplier}
                onChange={(e) => setFormData({ ...formData, fridayMultiplier: parseFloat(e.target.value) || 2.0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">مضاعف الإضافي النهاري (بعد الوردية)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={formData.regularOvertimeMultiplier}
                onChange={(e) => setFormData({ ...formData, regularOvertimeMultiplier: parseFloat(e.target.value) || 1.5 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">مضاعف السهر والمبيت الليلي</label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={formData.nightOvertimeMultiplier}
                onChange={(e) => setFormData({ ...formData, nightOvertimeMultiplier: parseFloat(e.target.value) || 2.0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Section 4: Backup & Data Safety */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-xs pb-2 border-b border-slate-800">
            <Database className="w-4 h-4 text-purple-400" />
            <span>النسخ الاحتياطي وإدارة البيانات</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-slate-300">
              تصدير قاعدة بيانات المصنع أو استعادة نسخة احتياطية:
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onExportAllData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>تصدير نسخة احتياطية (JSON)</span>
              </button>

              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>استعادة نسخة احتياطية</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط البيانات</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">تأكيد إعادة ضبط البيانات</h3>
            </div>
            <p className="text-xs text-slate-300">
              هل أنت متأكد من رغبتك في إعادة تعيين إعدادات وبيانات النظام الافتراضية؟
            </p>
            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  onResetFactoryData();
                  setShowResetConfirm(false);
                  setNotification('تمت إعادة ضبط البيانات بنجاح.');
                  setTimeout(() => setNotification(null), 4000);
                }}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer"
              >
                تأكيد إعادة الضبط
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
