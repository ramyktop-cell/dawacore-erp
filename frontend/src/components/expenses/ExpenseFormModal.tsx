import React, { useState, useEffect } from 'react';
import { expensesApi, CreateExpenseInput } from '../../api/expenses';
import { accountsApi, AccountNode } from '../../api/accounts';

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyId: string;
  branchId: string;
  shiftId?: string;
}

const COMMON_EXPENSE_TYPES = [
  'نثريات وضيافة صيدلية',
  'فواتير كهرباء ومياه',
  'إيجار مقر أو مستودع',
  'أدوات مكتبية ومطبوعات',
  'صيانة وتصليح معدات',
  'إنترنت وهاتف',
  'نظافة ومطهرات',
  'وقود ونقليات',
  'رسوم ورخص حكومية',
  'أخرى',
];

const COMMON_LIABILITY_TYPES = [
  'سداد دفعة حساب مورد أدوية',
  'سداد قسط أو تمويل بنكي',
  'سحب جاري شريك / توزيع أرباح',
  'سداد مستحقات تأمينات وضريبة',
  'رد أمانة أو تأمين عميل',
  'سداد التزامات أخرى',
];

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  companyId,
  branchId,
  shiftId,
}) => {
  const [category, setCategory] = useState<'EXPENSE' | 'LIABILITY'>('EXPENSE');
  const [expenseType, setExpenseType] = useState(COMMON_EXPENSE_TYPES[0]);
  const [customType, setCustomType] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paidFrom, setPaidFrom] = useState<'CASH' | 'BANK'>('CASH');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState('');

  const [accounts, setAccounts] = useState<AccountNode[]>([]);
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
          // ترشيح الحساب الافتراضي بحسب التصنيف
          filterAndSetDefaultAccount(data, category);
        })
        .catch((err) => {
          if (cancelled) return;
          setError('تعذر تحميل الحسابات المحاسبية؛ أعد فتح النافذة للمحاولة');
          console.error('Failed to load leaf accounts:', err);
        })
        .finally(() => {
          if (!cancelled) setLoadingAccounts(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, companyId]);

  const filterAndSetDefaultAccount = (allAccounts: AccountNode[], cat: 'EXPENSE' | 'LIABILITY') => {
    if (cat === 'EXPENSE') {
      const expAccs = allAccounts.filter((acc) => acc.type === 'EXPENSE' || acc.code.startsWith('5'));
      if (expAccs.length > 0) setAccountId(expAccs[0].id);
      else if (allAccounts.length > 0) setAccountId(allAccounts[0].id);
    } else {
      const liabAccs = allAccounts.filter(
        (acc) => acc.type === 'LIABILITY' || acc.type === 'EQUITY' || acc.code.startsWith('2') || acc.code.startsWith('3')
      );
      if (liabAccs.length > 0) setAccountId(liabAccs[0].id);
      else if (allAccounts.length > 0) setAccountId(allAccounts[0].id);
    }
  };

  const handleCategoryChange = (newCat: 'EXPENSE' | 'LIABILITY') => {
    setCategory(newCat);
    if (newCat === 'EXPENSE') {
      setExpenseType(COMMON_EXPENSE_TYPES[0]);
    } else {
      setExpenseType(COMMON_LIABILITY_TYPES[0]);
    }
    filterAndSetDefaultAccount(accounts, newCat);
  };

  if (!isOpen) return null;

  const currentAccountsList = accounts.filter((acc) => {
    if (category === 'EXPENSE') {
      return acc.type === 'EXPENSE' || acc.code.startsWith('5');
    } else {
      return (
        acc.type === 'LIABILITY' ||
        acc.type === 'EQUITY' ||
        acc.code.startsWith('2') ||
        acc.code.startsWith('3')
      );
    }
  });

  const displayAccounts = currentAccountsList.length > 0 ? currentAccountsList : accounts;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !branchId) {
      setError('يجب ربط المستخدم بشركة وفرع صحيحين قبل تسجيل الصرف');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }
    if (!accountId) {
      setError('يرجى تحديد الحساب المحاسبي المدين من الشجرة');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const finalType = expenseType === 'أخرى' && customType.trim() ? customType.trim() : expenseType;

      const payload: CreateExpenseInput = {
        companyId,
        branchId,
        shiftId: paidFrom === 'CASH' ? shiftId : undefined,
        expenseType: finalType,
        category,
        paidTo: paidTo.trim() || undefined,
        accountId,
        amount: Number(amount),
        paidFrom,
        paymentMethod,
        referenceNo: referenceNo.trim() || undefined,
        description: description.trim() || undefined,
        attachment: attachment.trim() || undefined,
      };

      await expensesApi.create(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء حفظ سند الصرف');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" dir="rtl">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between bg-[#582949] px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl shadow-inner">
              📤
            </span>
            <div>
              <h3 className="text-base font-black">إصدار سند صرف / مدفوعات جديد</h3>
              <p className="text-[11px] text-pink-200 font-medium">
                صرف مصروفات تشغيلية أو سداد التزامات ومستحقات من الخزنة أو البنك
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

          {/* 1. تبويب تصنيف السند: مصروف تشغيلي أم سداد التزام */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              نوع الصرف / السند *
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleCategoryChange('EXPENSE')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-black text-xs transition cursor-pointer ${
                  category === 'EXPENSE'
                    ? 'bg-[#582949] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>💼</span>
                <span>مصروف تشغيلي / عمومي</span>
              </button>

              <button
                type="button"
                onClick={() => handleCategoryChange('LIABILITY')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-black text-xs transition cursor-pointer ${
                  category === 'LIABILITY'
                    ? 'bg-[#582949] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🤝</span>
                <span>سداد التزام / مورد / جهة خارجية</span>
              </button>
            </div>
          </div>

          {/* 2. جهة الصرف: الخزنة أو البنك */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              جهة الصرف (من أين سيخرج المبلغ؟) *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPaidFrom('CASH');
                  if (paymentMethod === 'BANK_TRANSFER') setPaymentMethod('CASH');
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-black transition cursor-pointer ${
                  paidFrom === 'CASH'
                    ? 'border-[#582949] bg-pink-50 text-[#582949] shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-lg">💵</span>
                <span>الخزينة / الصندوق النقدي (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaidFrom('BANK');
                  if (paymentMethod === 'CASH') setPaymentMethod('BANK_TRANSFER');
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-black transition cursor-pointer ${
                  paidFrom === 'BANK'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-lg">🏦</span>
                <span>الحساب البنكي (Bank Account)</span>
              </button>
            </div>

            {paidFrom === 'CASH' && shiftId && (
              <p className="mt-1.5 text-[11px] font-bold text-amber-700 bg-amber-50/70 border border-amber-200 rounded-lg p-2">
                💡 تنبيه: سيتم خصم هذا المصروف مباشرة من درج الوردية النشطة ويُسجل كحركة نقدية خارجة (Cash Out).
              </p>
            )}
          </div>

          {/* 3. المبلغ وطريقة الدفع */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1">
                المبلغ المنصرف *
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
                  className="w-full rounded-xl border-2 border-slate-300 px-3.5 py-2.5 text-base font-mono font-black text-slate-900 focus:border-[#582949] focus:outline-none pr-3 pl-12"
                />
                <span className="absolute left-3 top-3 text-xs font-black text-slate-400">ج.س</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                طريقة الدفع
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold bg-white focus:border-[#582949] focus:outline-none"
              >
                <option value="CASH">نقداً (Cash)</option>
                <option value="BANK_TRANSFER">تحويل بنكي (Bank Transfer)</option>
                <option value="CHEQUE">شيك بنكي (Cheque)</option>
              </select>
            </div>
          </div>

          {/* 4. نوع الصرف والمستفيد */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {category === 'EXPENSE' ? 'نوع المصروف *' : 'نوع الالتزام / السداد *'}
              </label>
              <select
                value={expenseType}
                onChange={(e) => setExpenseType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold bg-white focus:border-[#582949] focus:outline-none"
              >
                {(category === 'EXPENSE' ? COMMON_EXPENSE_TYPES : COMMON_LIABILITY_TYPES).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                المدفوع له / المستفيد (اختياري)
              </label>
              <input
                type="text"
                placeholder="اسم المورد، الموظف، أو الجهة المستلمة"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
          </div>

          {expenseType === 'أخرى' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اكتب نوع الصرف يدوياً *
              </label>
              <input
                type="text"
                required
                placeholder="اكتب نوع المصروف أو الالتزام بالتفصيل"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
          )}

          {/* 5. الحساب المحاسبي المدين */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              الحساب المحاسبي المدين (شجرة الحسابات) *
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={loadingAccounts}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold bg-white focus:border-[#582949] focus:outline-none"
            >
              {loadingAccounts ? (
                <option value="">جاري تحميل شجرة الحسابات...</option>
              ) : displayAccounts.length === 0 ? (
                <option value="">لا توجد حسابات مطابقة</option>
              ) : (
                displayAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))
              )}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              يُنشئ النظام قيداً مزدوجاً: من حـ/ الحساب المختار أعلاه إلى حـ/ {paidFrom === 'BANK' ? 'البنك (1102)' : 'الخزينة (1101)'}.
            </p>
          </div>

          {/* 6. المرجع والمرفق والبيان */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم الشيك / رقم الحوالة / المرجع
              </label>
              <input
                type="text"
                placeholder="مثال: CHQ-5520 أو إشعار بنك رقم 129"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono focus:border-[#582949] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رابط صورة الفاتورة / الإيصال الورقي
              </label>
              <input
                type="text"
                placeholder="رابط المرفق أو المسار"
                value={attachment}
                onChange={(e) => setAttachment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-[#582949] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              البيان / تفاصيل الصرف
            </label>
            <textarea
              rows={2}
              placeholder="اكتب شرحاً وافياً لسبب الصرف وتفاصيله..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-medium focus:border-[#582949] focus:outline-none"
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
              className="flex items-center gap-1.5 rounded-xl bg-[#582949] px-6 py-2.5 font-black text-white hover:bg-[#481D3E] shadow transition disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'جاري الحفظ...' : '💾 حفظ وترحيل سند الصرف'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
