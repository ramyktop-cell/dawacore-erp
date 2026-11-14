import React, { useState } from 'react';
import { expensesApi, Expense } from '../../api/expenses';

interface RejectExpenseModalProps {
  isOpen: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const RejectExpenseModal: React.FC<RejectExpenseModalProps> = ({
  isOpen,
  expense,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !expense) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('يرجى كتابة سبب رفض سند الصرف');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await expensesApi.reject(expense.id, reason.trim());
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء رفض السند');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between bg-rose-600 px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <span className="text-xl">⛔</span>
            <h3 className="text-base font-black">رفض سند الصرف</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-700">
              ⚠️ {error}
            </div>
          )}

          <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1 text-slate-600">
            <p><strong className="text-slate-800">رقم السند:</strong> {expense.expenseNumber}</p>
            <p><strong className="text-slate-800">البند:</strong> {expense.expenseType}</p>
            <p><strong className="text-slate-800">المبلغ:</strong> {Number(expense.amount).toLocaleString()} ج.س</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">سبب الرفض (إلزامي للتوضيح) *</label>
            <textarea
              rows={3}
              required
              placeholder="مثال: المصروف غير معتمد في الموازنة التقديرية أو تم الصرف مسبقاً..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:border-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-rose-600 px-6 py-2 text-xs font-black text-white hover:bg-rose-700 shadow transition disabled:opacity-50"
            >
              {submitting ? 'جاري الرفض...' : 'تأكيد الرفض'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};