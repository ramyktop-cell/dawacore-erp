import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customersApi } from '../../api/customers';
import { apiFetch } from '../../api/http';
import { shiftsApi } from '../../api/shifts';
import { getCurrentUser } from '../../utils/permissions';
import { ThermalPrinterService } from '../../services/printer.service';
import { X, CheckCircle, Printer, Download, Banknote, CreditCard, Smartphone, FileText, ArrowDownLeft } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  currentDebt: number;
  branchId?: string;
  shiftId?: string;
  onSuccess?: (voucher: any) => void;
}

export const CustomerPaymentModal: React.FC<Props> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
  customerPhone,
  currentDebt,
  branchId,
  shiftId,
  onSuccess,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'CHECK'>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedVoucher, setCompletedVoucher] = useState<any | null>(null);
  const currentUser = getCurrentUser();
  const { data: currentShift } = useQuery({
    queryKey: ['active-shift', branchId, currentUser?.id],
    queryFn: () => shiftsApi.getActive(branchId, currentUser?.id),
    enabled: isOpen && !!branchId && !shiftId,
  });
  const effectiveShiftId = shiftId || currentShift?.id;

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const remainingDebt = Math.max(0, currentDebt - numAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      alert('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }
    if (numAmount > currentDebt) {
      alert('المبلغ لا يمكن أن يتجاوز مديونية العميل الحالية');
      return;
    }
    if (paymentMethod === 'CASH' && (!branchId || !effectiveShiftId)) {
      alert('التحصيل النقدي يتطلب وردية مفتوحة للمستخدم في فرع العميل');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await customersApi.recordPayment(customerId, {
        amount: numAmount,
        paymentMethod,
        branchId,
        shiftId: effectiveShiftId,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setCompletedVoucher(res);
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || 'فشل تسجيل سند القبض، يرجى المحاولة لاحقاً');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintReceipt = () => {
    if (completedVoucher) ThermalPrinterService.printHtmlDocument(ThermalPrinterService.buildCustomerPaymentHtml(completedVoucher));
  };

  const handleDownloadPdf = async () => {
    if (!completedVoucher?.receiptNumber) return;
    try {
      const url = customersApi.getReceiptPdfUrl(completedVoucher.receiptNumber);
      const res = await apiFetch(url);
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || `فشل تنزيل ملف PDF (${res.status})`);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `سند_قبض_${completedVoucher.receiptNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e: any) {
      alert(`خطأ أثناء تحميل الملف: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-sans" dir="rtl">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 transition-all">
        
        {/* ترويسة النافذة */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-linear-to-r from-teal-700 to-teal-800 px-6 py-4 text-white print:hidden">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/10 rounded-lg">
              <ArrowDownLeft size={20} className="text-teal-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">سند قبض مديونية (Receipt Voucher)</h2>
              <p className="text-xs text-teal-200">تحصيل دفعة نقدية أو بنكية من حساب العميل</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-teal-200 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* جسم النافذة: عند النجاح vs عند الإدخال */}
        {completedVoucher ? (
          <div className="p-6 space-y-6">
            {/* بطاقة النجاح */}
            <div className="text-center space-y-3">
              <div className="inline-flex p-3 rounded-full bg-emerald-100 text-emerald-600 mb-1">
                <CheckCircle size={42} />
              </div>
              <h3 className="text-xl font-black text-slate-800">تم تسجيل سند القبض بنجاح!</h3>
              <div className="inline-block px-4 py-1.5 bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-200 text-sm">
                رقم السند: {completedVoucher.receiptNumber}
              </div>
            </div>

            {/* تفاصيل السند المحصل */}
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">العميل:</span>
                <span className="font-bold text-slate-800">{completedVoucher.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">المبلغ المدفوع:</span>
                <span className="font-mono font-black text-emerald-600 text-sm">
                  {Number(completedVoucher.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.س
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">طريقة السداد:</span>
                <span className="font-bold text-slate-700">
                  {completedVoucher.paymentMethod === 'CARD' ? 'بطاقة بنكية' :
                   completedVoucher.paymentMethod === 'TRANSFER' ? 'تحويل بنكي / بنكك' :
                   completedVoucher.paymentMethod === 'CHECK' ? 'شيك بنكي' : 'نقداً'}
                </span>
              </div>
              {completedVoucher.referenceNo && (
                <div className="flex justify-between">
                  <span className="text-slate-500">رقم المرجع:</span>
                  <span className="font-mono font-bold text-slate-800">{completedVoucher.referenceNo}</span>
                </div>
              )}
              <div className="pt-2 border-t border-teal-200/60 flex justify-between">
                <span className="text-slate-600 font-medium">المديونية المتبقية:</span>
                <span className={`font-mono font-black ${completedVoucher.remainingDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {Number(completedVoucher.remainingDebt).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.س
                </span>
              </div>
            </div>

            {/* أزرار الإجراءات بعد السداد */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 print:hidden">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold shadow-md transition"
              >
                <Printer size={16} />
                طباعة إيصال حراري
              </button>
              <button
                onClick={handleDownloadPdf}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-[#009E9E] hover:bg-[#008A8A] text-white rounded-xl text-sm font-bold shadow-md transition"
              >
                <Download size={16} />
                تنزيل سند رسمي PDF
              </button>
              <button
                onClick={onClose}
                className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition"
              >
                تم
              </button>
            </div>

            {/* قسم مخصص للطباعة الورقية فقط (Print View) */}
            <div className="hidden print:block text-slate-900 p-2 space-y-3 font-mono text-center text-xs">
              <div className="font-bold text-sm">مجموعة صيدليات داواكور العالمية</div>
              <div>سند قبض نقدي / بنكي</div>
              <div className="border-b border-dashed border-slate-400 pb-2">
                <div>رقم السند: {completedVoucher.receiptNumber}</div>
                <div>التاريخ: {new Date(completedVoucher.createdAt).toLocaleString('ar-EG')}</div>
              </div>
              <div className="text-right space-y-1 py-2">
                <div>العميل: {completedVoucher.customerName}</div>
                <div>المديونية السابقة: {Number(completedVoucher.previousDebt).toFixed(2)} ج.س</div>
                <div className="font-bold text-sm">المبلغ المقبوض: {Number(completedVoucher.amount).toFixed(2)} ج.س</div>
                <div>المتبقي بعد السداد: {Number(completedVoucher.remainingDebt).toFixed(2)} ج.س</div>
                <div>طريقة الدفع: {completedVoucher.paymentMethod}</div>
              </div>
              <div className="border-t border-dashed border-slate-400 pt-2 text-[10px] text-slate-600">
                شكراً لتعاملكم معنا - نسعد بخدمتكم دائماً
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* بطاقة معلومات العميل والمديونية الحالية */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-3.5">
              <div>
                <p className="text-xs text-slate-500 font-medium">العميل</p>
                <p className="font-bold text-slate-800 text-sm">{customerName}</p>
                {customerPhone && <p className="text-xs text-slate-400 font-mono">{customerPhone}</p>}
              </div>
              <div className="text-left">
                <p className="text-xs text-slate-500 font-medium">المديونية المستحقة</p>
                <p className="text-base font-black font-mono text-rose-600">
                  {currentDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs">ج.س</span>
                </p>
              </div>
            </div>

            {/* حقل المبلغ مع أزرار الإكمال السريع */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700">المبلغ المقبوض (ج.س) *</label>
                {currentDebt > 0 && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAmount((currentDebt / 2).toFixed(2))}
                      className="text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2 py-0.5 rounded cursor-pointer transition"
                    >
                      نصف المبلغ
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmount(currentDebt.toFixed(2))}
                      className="text-[11px] font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 border border-teal-300 px-2 py-0.5 rounded cursor-pointer transition"
                    >
                      كامل المديونية
                    </button>
                  </div>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-right font-mono text-lg font-black text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
                autoFocus
              />
            </div>

            {/* طريقة القبض / الدفع */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">طريقة القبض</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'CASH', label: 'نقداً', icon: Banknote },
                  { id: 'TRANSFER', label: 'بنكك / تحويل', icon: Smartphone },
                  { id: 'CARD', label: 'بطاقة', icon: CreditCard },
                  { id: 'CHECK', label: 'شيك', icon: FileText },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = paymentMethod === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPaymentMethod(item.id as any)}
                      className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50 text-teal-800 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon size={16} className={isSelected ? 'text-teal-600' : 'text-slate-400'} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* رقم المرجع البنكي أو رقم الشيك إن لم يكن نقدي */}
            {paymentMethod !== 'CASH' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {paymentMethod === 'CHECK' ? 'رقم الشيك وتاريخ الاستحقاق' : 'رقم الإشعار / مرجع التحويل البنكي'}
                </label>
                <input
                  type="text"
                  placeholder={paymentMethod === 'CHECK' ? 'مثال: شيك 984521 - بنك الخرطوم' : 'مثال: TXN-99882312'}
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-800 focus:border-teal-600 focus:outline-none font-mono"
                />
              </div>
            )}

            {/* الملاحظات / البيان */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">البيان / ملاحظات السند</label>
              <input
                type="text"
                placeholder="سداد دفعة من الحساب / تسوية فاتورة آجل..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
              />
            </div>

            {/* بطاقة الحساب التقديري */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs flex justify-between items-center">
              <span className="text-slate-600">المتبقي بعد السداد:</span>
              <span className={`font-mono font-black text-sm ${remainingDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {remainingDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.س
              </span>
            </div>

            {/* أزرار الإرسال والإلغاء */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting || numAmount <= 0}
                className="flex-1 py-3 px-4 bg-teal-700 hover:bg-teal-800 active:scale-[0.99] text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'جاري الإصدار والتسجيل...' : 'تأكيد وإصدار سند القبض 💵'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
