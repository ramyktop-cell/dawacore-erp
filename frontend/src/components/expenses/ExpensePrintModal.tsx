import React, { useState, useEffect, useRef } from 'react';
import { Expense, expensesApi } from '../../api/expenses';

interface ExpensePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  companyName?: string;
}

export const ExpensePrintModal: React.FC<ExpensePrintModalProps> = ({
  isOpen,
  onClose,
  expense,
  companyName,
}) => {
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) {
        window.URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    if (activeBlobUrlRef.current) {
      window.URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setErrorMessage(null);
    onClose();
  };

  if (!isOpen || !expense) return null;

  const displayCompanyName =
    companyName ||
    (expense as any).company?.name ||
    'مجموعة صيدليات داواكور';

  const handleOpenPdfForPrint = async () => {
    try {
      setIsLoadingPdf(true);
      setErrorMessage(null);
      const blob = await expensesApi.getExpensePdfBlob(expense.id);
      if (activeBlobUrlRef.current) {
        window.URL.revokeObjectURL(activeBlobUrlRef.current);
      }
      const url = window.URL.createObjectURL(blob);
      activeBlobUrlRef.current = url;
      const opened = window.open(url, '_blank');
      if (!opened) {
        // Popup was blocked by browser - fallback to direct download
        await expensesApi.downloadExpenseVoucherPdf(expense.id, expense.expenseNumber);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'تعذر فتح ملف PDF للطباعة');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      setErrorMessage(null);
      await expensesApi.downloadExpenseVoucherPdf(expense.id, expense.expenseNumber);
    } catch (err: any) {
      setErrorMessage(err.message || 'تعذر تنزيل ملف PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const paymentMethodLabel =
    expense.paymentMethod === 'CASH'
      ? 'نقداً (Cash)'
      : expense.paymentMethod === 'BANK_TRANSFER'
      ? 'تحويل بنكي (Bank Transfer)'
      : 'شيك بنكي (Cheque)';

  const statusBadge =
    expense.status === 'APPROVED'
      ? { text: 'معتمد', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
      : expense.status === 'REJECTED'
      ? { text: 'مرفوض', bg: 'bg-rose-100 text-rose-800 border-rose-300' }
      : { text: 'قيد الاعتماد', bg: 'bg-amber-100 text-amber-800 border-amber-300' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" dir="rtl">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Modal Toolbar */}
        <div className="flex items-center justify-between bg-slate-900 px-6 py-3.5 text-white">
          <div className="flex items-center gap-2">
            <span className="text-lg">📄</span>
            <span className="text-xs font-black">معاينة وطباعة سند الصرف</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenPdfForPrint}
              disabled={isLoadingPdf || isDownloadingPdf}
              className="flex items-center gap-1.5 rounded-lg bg-[#582949] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#481D3E] transition cursor-pointer disabled:opacity-50"
            >
              <span>{isLoadingPdf ? 'جاري فتح PDF...' : 'فتح PDF للطباعة 🖨️'}</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isLoadingPdf || isDownloadingPdf}
              className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800 transition cursor-pointer disabled:opacity-50"
            >
              <span>{isDownloadingPdf ? 'جاري التنزيل...' : 'تنزيل PDF 📥'}</span>
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-700 font-bold flex items-center justify-between">
            <span>⚠️ {errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800">✕</button>
          </div>
        )}

        {/* Voucher Preview Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-white text-slate-800 font-sans">
          {/* Header */}
          <div className="border-b-2 border-slate-800 pb-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900">{displayCompanyName}</h1>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  الفرع: {expense.branch?.name || 'الفرع الرئيسي'}
                </p>
              </div>

              <div className="text-center border-2 border-[#582949] rounded-xl px-4 py-1.5 bg-pink-50">
                <h2 className="text-base font-black text-[#582949]">سند صرف نقدية / بنك</h2>
                <p className="text-[10px] text-pink-700 font-mono font-bold">PAYMENT VOUCHER</p>
              </div>

              <div className="text-left font-mono text-xs space-y-1">
                <div>
                  <span className="text-slate-400 font-sans text-[11px] font-bold">رقم السند: </span>
                  <strong className="text-[#582949] font-black">{expense.expenseNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-sans text-[11px] font-bold">التاريخ: </span>
                  <span className="font-bold">{new Date(expense.date).toLocaleDateString('ar-EG')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Status Badge Banner */}
          <div className={`mb-4 px-4 py-2 rounded-lg border text-xs font-bold flex items-center justify-between ${statusBadge.bg}`}>
            <span>حالة السند: {statusBadge.text}</span>
            {expense.status === 'PENDING' && (
              <span className="text-[11px] opacity-80">مسودة قيد المراجعة - لا يعتد بها كإثبات صرف نهائي</span>
            )}
            {expense.status === 'APPROVED' && (
              <span className="text-[11px] opacity-80">سند معتمد رسمياً ومصرح بالصرف</span>
            )}
            {expense.status === 'REJECTED' && (
              <span className="text-[11px] opacity-80">سند مرفوض وغير معتمد محاسبياً</span>
            )}
          </div>

          {/* Amount Box */}
          <div className="rounded-xl border-2 border-[#582949] bg-pink-50/50 p-4 mb-6 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[#582949] block mb-0.5">المبلغ المنصرف:</span>
              <span className="text-2xl font-black font-mono text-[#582949]">
                {Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
                <span className="text-xs font-sans">جنيه</span>
              </span>
            </div>
            <div className="text-left">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-[#582949] text-white">
                {expense.paidFrom === 'BANK' ? '🏦 صادر من البنك' : '💵 صادر من الخزينة'}
              </span>
            </div>
          </div>

          {/* Details Table */}
          <div className="space-y-3.5 text-xs">
            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-36 font-black text-slate-600 shrink-0">اصرفوا إلى السيد / الجهة:</span>
              <span className="font-bold text-slate-900 flex-1">
                {expense.paidTo || 'غير محدد'}
              </span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-36 font-black text-slate-600 shrink-0">نوع السند / التصنيف:</span>
              <span className="font-bold text-slate-900 flex-1">
                {expense.expenseType}
                {expense.category === 'LIABILITY' && (
                  <span className="mr-2 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                    سداد التزام / مورد
                  </span>
                )}
                {(expense.category === 'EXPENSE' || (expense.category as string) === 'OPERATING') && (
                  <span className="mr-2 text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    مصروف تشغيلي
                  </span>
                )}
              </span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-36 font-black text-slate-600 shrink-0">الحساب المقيد عليه (المدين):</span>
              <span className="font-mono font-bold text-slate-800 flex-1">
                {expense.account ? `${expense.account.code} - ${expense.account.name}` : 'غير محدد'}
              </span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-36 font-black text-slate-600 shrink-0">طريقة الصرف:</span>
              <span className="font-bold text-slate-800 flex-1">
                {paymentMethodLabel}
                {expense.referenceNo && (
                  <span className="mr-2 text-slate-500 font-mono">
                    (رقم الشيك / الإشعار: {expense.referenceNo})
                  </span>
                )}
              </span>
            </div>

            {expense.description && (
              <div className="flex border-b border-slate-200 pb-2">
                <span className="w-36 font-black text-slate-600 shrink-0">البيان / الغرض:</span>
                <span className="font-medium text-slate-700 flex-1 leading-relaxed">
                  {expense.description}
                </span>
              </div>
            )}

            {expense.status === 'REJECTED' && expense.rejectionReason && (
              <div className="flex border-b border-rose-200 pb-2 text-rose-800">
                <span className="w-36 font-black text-rose-600 shrink-0">سبب الرفض:</span>
                <span className="font-medium flex-1 leading-relaxed">
                  {expense.rejectionReason}
                </span>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-12 mt-8 border-t border-slate-300 text-center text-xs">
            <div className="space-y-6">
              <span className="font-bold text-slate-600 block">المستلم / المستفيد</span>
              <div className="border-b border-slate-400 border-dashed w-32 mx-auto"></div>
            </div>

            <div className="space-y-6">
              <span className="font-bold text-slate-600 block">المحاسب / الصندوق</span>
              <div className="font-bold text-slate-800 text-[11px]">
                {expense.creator?.name || 'المحاسب'}
              </div>
            </div>

            <div className="space-y-6">
              <span className="font-bold text-slate-600 block">اعتماد المدير</span>
              <div className="border-b border-slate-400 border-dashed w-32 mx-auto"></div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>نظام DawaCore ERP & POS المحاسبي</span>
            <span>تاريخ العرض: {new Date().toLocaleString('ar-EG')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
