import React, { useState, useEffect } from 'react';
import { receiptsApi, CreateReceiptInput } from '../../api/receipts';
import { accountsApi, AccountNode } from '../../api/accounts';

interface ReceiptFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyId: string;
  branchId: string;
  shiftId?: string;
}

const COMMON_RECEIPT_TYPES = [
  'إيرادات متنوعة وأخرى',
  'أرباح ودائع وعوائد بنكية',
  'بيع مخلفات وكراتين مسترجعة',
  'إيرادات خدمات طبية وصيدلانية',
  'توريد رأس مال / تمويل شريك',
  'إيراد إيجار أو استغلال مساحة',
  'فروقات وتسوية نقدية موجبة',
  'استرداد مبالغ وتأمينات مستردة',
  'أخرى',
];

export const ReceiptFormModal: React.FC<ReceiptFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  companyId,
  branchId,
  shiftId,
}) => {
  const [receiptType, setReceiptType] = useState(COMMON_RECEIPT_TYPES[0]);
  const [customType, setCustomType] = useState('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [receivedTo, setReceivedTo] = useState<'CASH' | 'BANK'>('CASH');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState('');

  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [accountFilter, setAccountFilter] = useState<'REVENUE' | 'ALL'>('REVENUE');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccounts([]);
    setAccountId('');
    setError(null);
    if (isOpen && companyId) {
      let cancelled = false;
      setLoadingAccounts(true);
      accountsApi
        .getAll({ companyId, isLeaf: true })
        .then((data) => {
          if (cancelled) return;
          setAccounts(data);
          // ترشيح الحسابات التلقائية للإيرادات (4xxx)
          const revAccs = data.filter((acc) => acc.type === 'REVENUE' || acc.code.startsWith('4'));
          if (revAccs.length > 0) {
            setAccountId(revAccs[0].id);
          } else if (data.length > 0) {
            setAccountId(data[0].id);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setError('تعذر تحميل الحسابات المحاسبية؛ يرجى التأكد من اتصال الخادم');
          console.error('Failed to load accounts:', err);
        })
        .finally(() => {
          if (!cancelled) setLoadingAccounts(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, companyId]);

  if (!isOpen) return null;

  const filteredAccounts =
    accountFilter === 'REVENUE'
      ? accounts.filter((a) => a.type === 'REVENUE' || a.type === 'EQUITY' || a.code.startsWith('4') || a.code.startsWith('3'))
      : accounts;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !branchId) {
      setError('يجب تحديد الشركة والفرع بشكل صحيح قبل تسجيل الإيراد');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }
    if (!accountId) {
      setError('يرجى تحديد الحساب المحاسبي الدائن من الشجرة');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const finalType = receiptType === 'أخرى' && customType.trim() ? customType.trim() : receiptType;

      const payload: CreateReceiptInput = {
        companyId,
        branchId,
        shiftId: receivedTo === 'CASH' ? shiftId : undefined,
        receiptType: finalType,
        receivedFrom: receivedFrom.trim() || undefined,
        accountId,
        amount: Number(amount),
        receivedTo,
        paymentMethod,
        referenceNo: referenceNo.trim() || undefined,
        description: description.trim() || undefined,
        attachment: attachment.trim() || undefined,
      };

      await receiptsApi.create(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء حفظ سند القبض');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" dir="rtl">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-800 to-teal-700 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl shadow-inner">
              📥
            </span>
            <div>
              <h3 className="text-base font-black">إصدار سند قبض / إيراد جديد</h3>
              <p className="text-[11px] text-teal-100 font-medium">
                إيداع إيرادات نقدية أو بنكية خارج عمليات البيع وتوليد القيد المحاسبي آلياً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-sans">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* 1. جهة الإيداع: الخزنة أو البنك */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              جهة الإيداع (أين تم استلام المبلغ؟) *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setReceivedTo('CASH');
                  if (paymentMethod === 'BANK_TRANSFER') setPaymentMethod('CASH');
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-black transition cursor-pointer ${
                  receivedTo === 'CASH'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-lg">💵</span>
                <span>الخزينة / الصندوق النقدي (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReceivedTo('BANK');
                  if (paymentMethod === 'CASH') setPaymentMethod('BANK_TRANSFER');
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-black transition cursor-pointer ${
                  receivedTo === 'BANK'
                    ? 'border-teal-600 bg-teal-50 text-teal-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-lg">🏦</span>
                <span>الحساب البنكي (Bank Deposit)</span>
              </button>
            </div>

            {receivedTo === 'CASH' && shiftId && (
              <p className="mt-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2">
                ✨ تنبيه: سيتم قيد الإيراد النقدي في درج الوردية النشطة للكاشير ورفع رصيد النقدية المتوقع بمقدار المبلغ.
              </p>
            )}
          </div>

          {/* 2. المبلغ وطريقة التحصيل */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1">
                المبلغ المقبوض *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full rounded-xl border-2 border-slate-300 px-3.5 py-2.5 text-base font-mono font-black text-slate-900 focus:border-emerald-600 focus:outline-none pr-3 pl-12"
                />
                <span className="absolute left-3 top-3 text-xs font-black text-slate-400">ج.س</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                طريقة القبض / الدفع
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold bg-white focus:border-emerald-600 focus:outline-none"
              >
                <option value="CASH">نقداً (Cash)</option>
                <option value="BANK_TRANSFER">تحويل بنكي / إيداع مباشر (Bank Transfer)</option>
                <option value="CHEQUE">شيك بنكي (Cheque)</option>
              </select>
            </div>
          </div>

          {/* 3. نوع الإيراد والمستلم منه */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الإيراد *
              </label>
              <select
                value={receiptType}
                onChange={(e) => setReceiptType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold bg-white focus:border-emerald-600 focus:outline-none"
              >
                {COMMON_RECEIPT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                المستلم منه / الطرف المودع (اختياري)
              </label>
              <input
                type="text"
                placeholder="اسم الشخص أو الجهة المودعة"
                value={receivedFrom}
                onChange={(e) => setReceivedFrom(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {receiptType === 'أخرى' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اكتب نوع الإيراد يدوياً *
              </label>
              <input
                type="text"
                required
                placeholder="مثال: بيع معدات تالفة أو أثاث قديم"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}

          {/* 4. الحساب المحاسبي الدائن */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-black text-slate-700">
                الحساب المحاسبي الدائن (شجرة الحسابات) *
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAccountFilter('REVENUE')}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    accountFilter === 'REVENUE' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  حسابات الإيرادات
                </button>
                <button
                  type="button"
                  onClick={() => setAccountFilter('ALL')}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    accountFilter === 'ALL' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  كافة الحسابات
                </button>
              </div>
            </div>

            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={loadingAccounts}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold bg-white focus:border-emerald-600 focus:outline-none"
            >
              {loadingAccounts ? (
                <option value="">جاري تحميل شجرة الحسابات...</option>
              ) : filteredAccounts.length === 0 ? (
                <option value="">لا توجد حسابات مطابقة</option>
              ) : (
                filteredAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))
              )}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              يُنشئ النظام قيداً مزدوجاً: من حـ/ {receivedTo === 'BANK' ? 'البنك (1102)' : 'الخزينة (1101)'} إلى حـ/ الحساب المختار أعلاه.
            </p>
          </div>

          {/* 5. رقم المرجع والبيان والمرفق */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم الإشعار / رقم الشيك / المرجع
              </label>
              <input
                type="text"
                placeholder="مثال: REF-99212 أو شيك رقم 4501"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رابط صورة الإشعار أو السند الورقي
              </label>
              <input
                type="text"
                placeholder="رابط المرفق أو المسار"
                value={attachment}
                onChange={(e) => setAttachment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              البيان / تفاصيل السند
            </label>
            <textarea
              rows={2}
              placeholder="اكتب شرحاً وافياً لسبب الإيراد وتفاصيله..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-medium focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-6 py-2.5 font-black text-white hover:bg-emerald-800 shadow transition disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'جاري الحفظ...' : '💾 حفظ وترحيل سند القبض'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
