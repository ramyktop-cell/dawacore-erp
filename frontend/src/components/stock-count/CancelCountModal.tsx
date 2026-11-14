import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export const CancelCountModal: React.FC<Props> = ({ isOpen, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="w-[480px] bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h2 className="text-xl font-bold text-slate-800">إلغاء محضر الجرد</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={18} className="text-rose-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-rose-800">
            <p className="font-bold mb-1">⚠️ تحذير رقابي</p>
            <p>سيتم إلغاء المحضر فوراً وفك تجميد بيع الأصناف، وتوثيق سبب وهوية الإلغاء في سجل التدقيق المالي.</p>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">سبب الإلغاء *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-600"
            placeholder="اكتب سبب إلغاء الجرد بدقة للمراجعة الرقابية..."
          />
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm cursor-pointer"
          >
            تراجع
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim()}
            className="px-6 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 text-sm font-medium cursor-pointer"
          >
            تأكيد الإلغاء وفك الحظر
          </button>
        </div>
      </div>
    </div>
  );
};
