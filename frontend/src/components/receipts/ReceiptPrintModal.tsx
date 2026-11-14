import React from 'react';
import { Receipt } from '../../api/receipts';

interface ReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: Receipt | null;
  companyName?: string;
}

export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  isOpen,
  onClose,
  receipt,
  companyName = 'DawaCore Pharmacy',
}) => {
  if (!isOpen || !receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  const paymentMethodLabel =
    receipt.paymentMethod === 'CASH'
      ? 'نقداً (Cash)'
      : receipt.paymentMethod === 'BANK_TRANSFER'
      ? 'تحويل بنكي (Bank Transfer)'
      : 'شيك بنكي (Cheque)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" dir="rtl">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Modal Toolbar (hidden on print) */}
        <div className="flex items-center justify-between bg-slate-900 px-6 py-3.5 text-white print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-lg">🖨️</span>
            <span className="text-xs font-black">معاينة وطباعة سند القبض</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer"
            >
              <span>طباعة السند</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Voucher Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-white print:p-0 print:m-0 text-slate-800 font-sans" id="printable-receipt">
          {/* Header */}
          <div className="border-b-2 border-slate-800 pb-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900">{companyName}</h1>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  الفرع: {receipt.branch?.name || 'الفرع الرئيسي'}
                </p>
              </div>

              <div className="text-center border-2 border-emerald-800 rounded-xl px-4 py-1.5 bg-emerald-50">
                <h2 className="text-base font-black text-emerald-900">سند قبض إيرادات</h2>
                <p className="text-[10px] text-emerald-700 font-mono font-bold">RECEIPT VOUCHER</p>
              </div>

              <div className="text-left font-mono text-xs space-y-1">
                <div>
                  <span className="text-slate-400 font-sans text-[11px] font-bold">رقم السند: </span>
                  <strong className="text-emerald-700 font-black">{receipt.receiptNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-sans text-[11px] font-bold">التاريخ: </span>
                  <span className="font-bold">{new Date(receipt.date).toLocaleDateString('ar-EG')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Amount Box */}
          <div className="rounded-xl border-2 border-emerald-700 bg-emerald-50/60 p-4 mb-6 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-900 block mb-0.5">المبلغ المقبوض:</span>
              <span className="text-2xl font-black font-mono text-emerald-800">
                {Number(receipt.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
                <span className="text-xs font-sans">جنيه</span>
              </span>
            </div>
            <div className="text-left">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-emerald-700 text-white">
                {receipt.receivedTo === 'BANK' ? '🏦 مودع بالبنك' : '💵 مودع بالخزينة'}
              </span>
            </div>
          </div>

          {/* Details Table */}
          <div className="space-y-3.5 text-xs">
            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-32 font-black text-slate-600 shrink-0">استلمنا من السيد / السادة:</span>
              <span className="font-bold text-slate-900 flex-1">
                {receipt.receivedFrom || 'نقدية إيرادات متنوعة'}
              </span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-32 font-black text-slate-600 shrink-0">نوع الإيراد / الغرض:</span>
              <span className="font-bold text-slate-900 flex-1">{receipt.receiptType}</span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-32 font-black text-slate-600 shrink-0">الحساب المقيد له (الدائن):</span>
              <span className="font-mono font-bold text-slate-800 flex-1">
                {receipt.account ? `${receipt.account.code} - ${receipt.account.name}` : 'إيرادات عامة'}
              </span>
            </div>

            <div className="flex border-b border-slate-200 pb-2">
              <span className="w-32 font-black text-slate-600 shrink-0">طريقة التحصيل:</span>
              <span className="font-bold text-slate-800 flex-1">
                {paymentMethodLabel}
                {receipt.referenceNo && (
                  <span className="mr-2 text-slate-500 font-mono">
                    (رقم الإشعار / الشيك: {receipt.referenceNo})
                  </span>
                )}
              </span>
            </div>

            {receipt.description && (
              <div className="flex border-b border-slate-200 pb-2">
                <span className="w-32 font-black text-slate-600 shrink-0">البيان / التفاصيل:</span>
                <span className="font-medium text-slate-700 flex-1 leading-relaxed">
                  {receipt.description}
                </span>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-12 mt-8 border-t border-slate-300 text-center text-xs">
            <div className="space-y-6">
              <span className="font-bold text-slate-600 block">المستلم / المودع</span>
              <div className="border-b border-slate-400 border-dashed w-32 mx-auto"></div>
            </div>

            <div className="space-y-6">
              <span className="font-bold text-slate-600 block">أمين الصندوق / المحاسب</span>
              <div className="font-bold text-slate-800 text-[11px]">
                {receipt.creator?.name || 'المحاسب'}
              </div>
            </div>

            <div className="space-y-6">
              <span className="font-bold text-slate-600 block">اعتماد الإدارة</span>
              <div className="border-b border-slate-400 border-dashed w-32 mx-auto"></div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>نظام DawaCore ERP & POS المحاسبي</span>
            <span>تاريخ الطباعة: {new Date().toLocaleString('ar-EG')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
