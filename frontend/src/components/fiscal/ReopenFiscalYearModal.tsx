import React, { useState } from 'react';
import { X, Unlock, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fiscalYearsApi, FiscalYearSummary } from '../../api/fiscal-years';

interface Props {
  fiscalYear: FiscalYearSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReopenFiscalYearModal: React.FC<Props> = ({
  fiscalYear,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!fiscalYear) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('يجب إدخال سبب إعادة الفتح');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await fiscalYearsApi.reopen({ year: fiscalYear.year, reason });
      onSuccess();
      onClose();
      setReason('');
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'فشل إعادة الفتح');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center">
              <Unlock className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                إعادة فتح السنة {fiscalYear.year}
              </h3>
              <p className="text-xs text-slate-500">
                للمشرفين فقط — يُسجَّل في سجل التدقيق
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">تحذير:</p>
              <p>
                إعادة الفتح ستحذف قيد الإقفال السنوي وتسمح بترحيل قيود جديدة.
                استخدم هذا الإجراء فقط عند الضرورة القصوى.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              سبب إعادة الفتح <span className="text-rose-600">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 outline-none resize-none"
              placeholder="مثال: تصحيح خطأ في قيد..."
            />
            <p className="text-[10px] text-slate-500 mt-1">
              {reason.length}/500 حرف
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-700 font-semibold">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex gap-2">
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Unlock className="w-3.5 h-3.5" />
            )}
            {loading ? 'جاري إعادة الفتح...' : 'تأكيد'}
          </button>
        </div>
      </div>
    </div>
  );
};
export default ReopenFiscalYearModal;
