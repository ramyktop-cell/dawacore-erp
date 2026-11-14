import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  FileText,
} from 'lucide-react';
import {
  fiscalYearsApi,
  FiscalYearSummary,
  ClosingEntryPreview,
} from '../../api/fiscal-years';

interface Props {
  fiscalYear: FiscalYearSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CloseFiscalYearModal: React.FC<Props> = ({
  fiscalYear,
  onClose,
  onSuccess,
}) => {
  const [preview, setPreview] = useState<ClosingEntryPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!fiscalYear) {
      setPreview(null);
      setError('');
      setNotes('');
      return;
    }

    setLoadingPreview(true);
    setError('');
    fiscalYearsApi
      .closePreview(fiscalYear.year)
      .then(setPreview)
      .catch((e) =>
        setError(e.response?.data?.message || e.message || 'فشل التحميل'),
      )
      .finally(() => setLoadingPreview(false));
  }, [fiscalYear]);

  if (!fiscalYear) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await fiscalYearsApi.close({
        year: fiscalYear.year,
        notes: notes || undefined,
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'فشل الإقفال');
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
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-amber-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-amber-200 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                إقفال السنة المالية {fiscalYear.year}
              </h3>
              <p className="text-xs text-slate-600">
                معاينة قيد الإقفال قبل التنفيذ
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loadingPreview && (
            <div className="text-center py-12 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              جاري حساب معاينة الإقفال...
            </div>
          )}

          {error && !loadingPreview && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700 font-semibold">
              ⚠️ {error}
            </div>
          )}

          {preview && !loadingPreview && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex items-center gap-1 text-xs text-emerald-700 mb-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    إجمالي الإيرادات
                  </div>
                  <div className="text-lg font-black text-emerald-800">
                    {fmt(preview.totalRevenue)}
                  </div>
                  <div className="text-[10px] text-emerald-600">ج.س</div>
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <div className="flex items-center gap-1 text-xs text-rose-700 mb-1">
                    <TrendingDown className="w-3.5 h-3.5" />
                    إجمالي المصروفات
                  </div>
                  <div className="text-lg font-black text-rose-800">
                    {fmt(preview.totalExpense)}
                  </div>
                  <div className="text-[10px] text-rose-600">ج.س</div>
                </div>

                <div
                  className={`border rounded-lg p-3 ${
                    preview.netIncome >= 0
                      ? 'bg-teal-50 border-teal-200'
                      : 'bg-orange-50 border-orange-200'
                  }`}
                >
                  <div
                    className={`flex items-center gap-1 text-xs mb-1 ${
                      preview.netIncome >= 0 ? 'text-teal-700' : 'text-orange-700'
                    }`}
                  >
                    {preview.netIncome >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {preview.netIncome >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
                  </div>
                  <div
                    className={`text-lg font-black ${
                      preview.netIncome >= 0 ? 'text-teal-800' : 'text-orange-800'
                    }`}
                  >
                    {fmt(Math.abs(preview.netIncome))}
                  </div>
                  <div className="text-[10px] text-slate-600">ج.س</div>
                </div>
              </div>

              {/* الحساب الطرفي */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                <span className="text-slate-600">حساب الأرباح المحتجزة:</span>
                <span className="font-bold text-slate-800 mr-2">
                  {preview.retainedEarningsAccount.code} —{' '}
                  {preview.retainedEarningsAccount.name}
                </span>
              </div>

              {/* الجدول */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  معاينة قيد الإقفال ({preview.lines.length} سطر)
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0">
                      <tr>
                        <th className="py-2 px-2">الحساب</th>
                        <th className="py-2 px-2 text-left">مدين</th>
                        <th className="py-2 px-2 text-left">دائن</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.lines.map((l, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-1.5 px-2">
                            <span className="font-mono text-slate-500">
                              {l.accountCode}
                            </span>{' '}
                            <span className="font-medium text-slate-800">
                              {l.accountName}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-emerald-700 text-left font-mono">
                            {l.debit > 0 ? fmt(l.debit) : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-teal-700 text-left font-mono">
                            {l.credit > 0 ? fmt(l.credit) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300 sticky bottom-0">
                      <tr>
                        <td className="py-2 px-2 text-slate-600">المجموع</td>
                        <td className="py-2 px-2 text-emerald-800 text-left font-mono">
                          {fmt(preview.totals.totalDebit)}
                        </td>
                        <td className="py-2 px-2 text-teal-800 text-left font-mono">
                          {fmt(preview.totals.totalCredit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Balance check */}
                <div
                  className={`mt-2 text-xs font-bold flex items-center gap-1.5 ${
                    preview.totals.isBalanced
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {preview.totals.isBalanced ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      القيد متوازن ✓
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      القيد غير متوازن!
                    </>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ملاحظات الإقفال (اختياري)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                  placeholder="أي ملاحظات حول الإقفال..."
                />
              </div>

              {/* Warning */}
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">تحذير نهائي:</p>
                  <p>
                    بعد الإقفال، لن تتمكن من الترحيل في السنة {fiscalYear.year}{' '}
                    إلا بإعادة فتحها (للمشرفين فقط).
                  </p>
                </div>
              </div>
            </>
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
            onClick={handleConfirm}
            disabled={loading || loadingPreview || !preview}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            {loading ? 'جاري الإقفال...' : 'تأكيد الإقفال'}
          </button>
        </div>
      </div>
    </div>
  );
};
export default CloseFiscalYearModal;
