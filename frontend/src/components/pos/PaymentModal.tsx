import { getCurrentUser } from '../../utils/permissions';
import { apiFetch, downloadReport } from '../../api/http';
import React, { useState, useEffect, useRef } from 'react';
import { usePosStore } from '../../stores/pos.store';
import { ThermalPrinterService } from '../../services/printer.service';
import { offlinePosEngine, offlinePosPreviewEnabled } from '../../services/offline-pos.service';
import { customersApi, Customer } from '../../api/customers';
import { CustomerLedgerModal } from '../customers/CustomerLedgerModal';

export type PaymentMethodType = 'CASH' | 'CARD' | 'TRANSFER' | 'CREDIT' | 'MIXED';

export const PaymentMethod = {
  CASH: 'CASH' as const,
  CARD: 'CARD' as const,
  TRANSFER: 'TRANSFER' as const,
  CREDIT: 'CREDIT' as const,
  MIXED: 'MIXED' as const,
};

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose }) => {
  const { items, getGrandTotal, discountTotal, branchId, cashierId, activeShiftId, clearCart, customer, setCustomer } = usePosStore();
  const grandTotal = getGrandTotal();

  // نوع العملية: مباشر أو على حساب عميل
  const [isCreditMode, setIsCreditMode] = useState<boolean>(!!customer);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customer?.id || '');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>(customer?.name || '');
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(customer || null);
  const [isLedgerOpen, setIsLedgerOpen] = useState<boolean>(false);

  // طرق الدفع: نقدي، بنكي، مختلط، آجل
  const [activeMethodTab, setActiveMethodTab] = useState<'CASH' | 'CARD' | 'MIXED' | 'CREDIT'>(
    customer ? 'CREDIT' : 'CARD'
  );
  const [cashAmount, setCashAmount] = useState<string>('0');
  const [cardAmount, setCardAmount] = useState<string>(grandTotal.toFixed(2));
  const [bankReference, setBankReference] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submitting = useRef(false);
  const [invoiceOutput, setInvoiceOutput] = useState<'PDF' | 'THERMAL'>('PDF');

  useEffect(() => {
    if (isOpen && offlinePosPreviewEnabled && offlinePosEngine.isEffectivelyOffline() && !customer) {
      setActiveMethodTab('CASH');
    }
  }, [isOpen, customer]);

  // مزامنة العميل المحدد من شاشة الـ POS
  useEffect(() => {
    if (customer) {
      setSelectedCustomer(customer);
      setSelectedCustomerId(customer.id);
      setCustomerSearchQuery(customer.name);
      setIsCreditMode(true);
      setActiveMethodTab('CREDIT');
    }
  }, [customer]);

  // تحديث القيم التلقائية بناءً على الطريقة المختارة
  useEffect(() => {
    if (activeMethodTab === 'CASH') {
      setCashAmount(grandTotal.toFixed(2));
      setCardAmount('0');
    } else if (activeMethodTab === 'CARD') {
      setCashAmount('0');
      setCardAmount(grandTotal.toFixed(2));
    } else if (activeMethodTab === 'CREDIT') {
      setCashAmount('0');
      setCardAmount('0');
    }
  }, [activeMethodTab, grandTotal]);

  // البحث عن العملاء الحقيقيين عبر الـ API
  useEffect(() => {
    const q = customerSearchQuery.trim();
    if (q.length >= 1 && (!selectedCustomer || selectedCustomer.name !== q)) {
      const timer = setTimeout(async () => {
        try {
          const res = await customersApi.getAll({ search: q, limit: 8 });
          setCustomersList(res.items || []);
        } catch (err) {
          console.error('Failed to search customers:', err);
        }
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setCustomersList([]);
    }
  }, [customerSearchQuery, selectedCustomer]);

  if (!isOpen) return null;

  const totalCash = parseFloat(cashAmount) || 0;
  const totalCard = parseFloat(cardAmount) || 0;
  const totalPaid = activeMethodTab === 'CREDIT' ? 0 : totalCash + totalCard;
  const remaining = activeMethodTab === 'CREDIT' ? 0 : Number((totalPaid - grandTotal).toFixed(2));

  // التحقق من صلاحية الحد الائتماني
  const currentDebt = Number(selectedCustomer?.currentDebt ?? 0);
  const creditLimit = Number(selectedCustomer?.creditLimit ?? 0);
  const isCreditLimitExceeded =
    isCreditMode &&
    selectedCustomer &&
    creditLimit > 0 &&
    currentDebt + grandTotal > creditLimit;

  const handleExecutePayment = async () => {
    if (submitting.current) return;
    if (!branchId || !cashierId || !activeShiftId || activeShiftId === 'OPEN_SHIFT') {
      alert('يجب تسجيل الدخول وفتح وردية فعالة قبل إتمام البيع');
      return;
    }
    if (isCreditMode && !selectedCustomerId) {
      alert('يرجى اختيار العميل أولاً لإتمام البيع الآجل!');
      return;
    }

    if (isCreditLimitExceeded) {
      alert('تجاوزت الفاتورة سقف الائتمان المتبقي للعميل!');
      return;
    }

    if (activeMethodTab !== 'CREDIT' && totalPaid < grandTotal) {
      alert('المبلغ المدفوع أقل من إجمالي الفاتورة المطلوب!');
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    try {
      const payments = [];
      if (activeMethodTab === 'CREDIT') {
        payments.push({ method: PaymentMethod.CREDIT, amount: grandTotal });
      } else {
        if (totalCash > 0) payments.push({ method: PaymentMethod.CASH, amount: totalCash });
        if (totalCard > 0) payments.push({ method: PaymentMethod.CARD, amount: totalCard, referenceNo: bankReference || undefined });
      }

      const totalAllDiscounts = Number(
        ((discountTotal || 0) + usePosStore.getState().getItemsDiscountTotal()).toFixed(2)
      );

      const payload = {
        branchId,
        cashierId,
        shiftId: activeShiftId,
        customerId: isCreditMode && selectedCustomerId ? selectedCustomerId : undefined,
        discountTotal: totalAllDiscounts.toString(),
        items: items.map((i) => ({
          medicineId: i.medicineId,
          unitType: i.unitType,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice).toString(),
        })),
        payments: payments.map((p) => ({
          ...p,
          amount: Number(p.amount).toString(),
        })),
      };

      if (offlinePosPreviewEnabled && offlinePosEngine.isEffectivelyOffline()) {
        if (activeMethodTab !== 'CASH') throw new Error('المعاينة الأوفلاين تدعم البيع النقدي فقط');
        const user = getCurrentUser();
        const receipt = {
          customerName: '',
          cashierName: user?.name || user?.username || '',
          paymentMethod: PaymentMethod.CASH,
          grandTotal: grandTotal.toFixed(2),
          paidAmount: totalPaid.toFixed(2),
          changeAmount: remaining.toFixed(2),
          items: items.map((item) => ({
            tradeName: item.tradeName,
            unitLabel: item.isWeighed ? 'كجم' : undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        };
        const saved = await offlinePosEngine.enqueueOfflineSale(payload, receipt);
        clearCart();
        onClose();
        try {
          await ThermalPrinterService.printInvoice({
            ...receipt,
            companyName: user?.companyName || undefined,
            branchName: user?.branchName || 'الفرع',
            invoiceNumber: saved.offlineInvoiceNumber,
          });
        } catch {
          alert(`الفاتورة ${saved.offlineInvoiceNumber} محفوظة. تعذرت الطباعة؛ يمكنك إعادة طباعتها من قائمة الفواتير الأوفلاين.`);
        }
        return;
      }

      const res = await apiFetch('/api/sales/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'فشلت عملية البيع');

      const issuingUser = getCurrentUser();
      // طباعة الفاتورة الحرارية
      try {
      if (invoiceOutput === 'PDF') await downloadReport(`/api/sales/invoices/${encodeURIComponent(data.data.saleId)}/pdf`);
      else await ThermalPrinterService.printInvoice({
        invoiceNumber: data.data?.invoiceNumber || `INV-${Date.now()}`,
        customerName: data.data?.customer?.name || selectedCustomer?.name || (activeMethodTab === 'CREDIT' ? 'اسم العميل غير متاح' : undefined),
        customerBalance: data.data?.customerBalance,
        remainingDebt: data.data?.invoiceRemainingAmount,
        showCustomerBalance: activeMethodTab === 'CREDIT',
        companyName: issuingUser?.companyName || undefined,
        branchName: issuingUser?.branchName || 'الصيدلية',
        cashierName: issuingUser?.name || issuingUser?.fullName || issuingUser?.username || 'غير محدد',
        paymentMethod: payments.length > 1 ? PaymentMethod.MIXED : payments[0]?.method,
        bankReference: payments.find(payment => payment.referenceNo)?.referenceNo,
        items: items.map((i) => ({
          tradeName: i.tradeName,
          unitLabel: i.isWeighed ? 'كجم' : undefined,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
        })),
        grandTotal: grandTotal.toFixed(2),
        paidAmount: totalPaid.toFixed(2),
        changeAmount: remaining.toFixed(2),
      });
      } catch (printError) { alert('تم حفظ الفاتورة، لكن تعذرت الطباعة. أعد طباعتها من شاشة فواتير المبيعات.'); }

      clearCart();
      onClose();
    } catch (err: any) {
      alert(`خطأ: ${err.message}`);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs font-sans" dir="rtl">
      <div className="w-[490px] rounded-2xl bg-white p-6 shadow-2xl transition-all">
        
        <label className="block text-sm mb-2">إخراج الفاتورة:
          <select value={invoiceOutput} onChange={event => setInvoiceOutput(event.target.value as 'PDF' | 'THERMAL')} className="border rounded p-1 mx-2">
            <option value="PDF">تنزيل PDF</option><option value="THERMAL">طباعة حرارية</option>
          </select>
        </label>
        {/* العنوان الأساسي */}
        <h2 className="mb-4 text-center text-2xl font-bold text-[#582949]">إتمام الدفع</h2>

        {/* بطاقة المبلغ المطلوب بالألوان المستخرجة */}
        <div className="mb-5 flex items-center justify-between rounded-xl border border-[#B3E5E5] bg-[#E8F7F7] px-6 py-3.5">
          <span className="text-3xl font-black font-mono text-[#009E9E]">{grandTotal.toFixed(2)}</span>
          <span className="text-sm font-bold text-slate-700">المطلوب (ج.س)</span>
        </div>

        {/* قسم تحديد نوع العملية (نقدي سريع أم على حساب عميل) */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <span className="mb-2 block text-xs font-bold text-slate-500">نوع العملية:</span>
          <div className="flex gap-6 text-sm font-bold">
            <label className="flex cursor-pointer items-center gap-2 text-slate-800">
              <input
                type="radio"
                name="operationType"
                checked={!isCreditMode}
                onChange={() => {
                  setIsCreditMode(false);
                  setSelectedCustomerId('');
                  setSelectedCustomer(null);
                  if (activeMethodTab === 'CREDIT') setActiveMethodTab('CARD');
                }}
                className="h-4 w-4 text-[#009E9E] focus:ring-[#009E9E]"
              />
              بيع مباشر (نقدي/سريع)
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-slate-800">
              <input
                type="radio"
                name="operationType"
                checked={isCreditMode}
                onChange={() => {
                  setIsCreditMode(true);
                  setActiveMethodTab('CREDIT');
                }}
                className="h-4 w-4 text-[#009E9E] focus:ring-[#009E9E]"
              />
              على حساب عميل (آجل)
            </label>
          </div>
        </div>

        {/* قائمة اختيار العميل عند تفعيل البيع الآجل */}
        {isCreditMode && (
          <div className="mb-4 rounded-xl border border-[#009E9E]/30 bg-teal-50/40 p-3 space-y-2">
            <label className="block text-xs font-bold text-slate-700">اختر العميل:</label>
            <input
              type="text"
              placeholder="ابحث باسم العميل أو رقم الهاتف..."
              value={customerSearchQuery}
              onChange={(e) => setCustomerSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#009E9E] focus:outline-none"
            />

            {customersList.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded-lg border bg-white divide-y text-xs">
                {customersList.map((cust) => (
                  <div
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomerId(cust.id);
                      setSelectedCustomer(cust);
                      setCustomer(cust);
                      setCustomerSearchQuery(cust.name);
                      setCustomersList([]);
                    }}
                    className="cursor-pointer p-2 hover:bg-teal-50"
                  >
                    <div className="font-bold text-slate-800">{cust.name}</div>
                    <div className="text-slate-500">{cust.phone}</div>
                  </div>
                ))}
              </div>
            )}

            {selectedCustomer && (
              <div className="mt-2 space-y-2">
                <div className="flex justify-between items-center rounded-lg bg-white p-2.5 text-[11px] font-bold border border-slate-200">
                  <span className="text-slate-600">
                    المديونية الحالية:{' '}
                    <span className={`font-mono font-black ${currentDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {currentDebt.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.س
                    </span>
                  </span>
                  <span className={isCreditLimitExceeded ? 'text-red-500 font-black' : 'text-[#009E9E]'}>
                    الحد الائتماني:{' '}
                    <span className="font-mono">{creditLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.س</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLedgerOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <span>📑</span> عرض كشف حساب العميل والمديونيات
                </button>
              </div>
            )}
          </div>
        )}

        {/* تبويبات طرق السداد */}
        <div className="mb-5 grid grid-cols-4 gap-2">
          {[
            { id: 'CASH', label: 'نقدي' },
            { id: 'CARD', label: 'بنكي' },
            { id: 'MIXED', label: 'مختلط' },
            { id: 'CREDIT', label: 'آجل' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              disabled={tab.id === 'CREDIT' && !isCreditMode}
              onClick={() => setActiveMethodTab(tab.id as any)}
              className={`rounded-xl py-2.5 text-xs font-bold transition-all ${
                activeMethodTab === tab.id
                  ? 'border-2 border-[#009E9E] bg-[#E8F7F7] text-[#009E9E] shadow-xs'
                  : 'border border-transparent bg-[#EEF2F6] text-slate-700 hover:bg-[#E2E8F0]'
              } ${tab.id === 'CREDIT' && !isCreditMode ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* حقول المبالغ (نقدي / بنكي / مرجع) */}
        <div className="space-y-3">
          {(activeMethodTab === 'CASH' || activeMethodTab === 'MIXED') && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">نقدي</label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-right font-mono text-base font-bold text-slate-800 focus:border-[#009E9E] focus:outline-none"
              />
            </div>
          )}

          {(activeMethodTab === 'CARD' || activeMethodTab === 'MIXED') && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">بنكي</label>
              <input
                type="number"
                value={cardAmount}
                onChange={(e) => setCardAmount(e.target.value)}
                className="w-full rounded-xl border-2 border-[#009E9E] px-4 py-2.5 text-left font-mono text-base font-bold text-[#009E9E] focus:outline-none"
              />
            </div>
          )}

          {(activeMethodTab === 'CARD' || activeMethodTab === 'MIXED') && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">مرجع البنك</label>
              <input
                type="text"
                placeholder="مرجع الدفع البنكي / رقم العملية"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-right text-xs focus:border-[#009E9E] focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* شريط المدفوع والمتبقي الإحصائي */}
        <div className="my-5 rounded-xl bg-[#F8FAFC] py-3 px-4 text-center text-sm font-bold text-slate-700">
          المدفوع: <span className="font-mono text-slate-900">{totalPaid.toFixed(2)}</span> |{' '}
          الباقي:{' '}
          <span className={`font-mono ${remaining >= 0 ? 'text-[#009E9E]' : 'text-red-500'}`}>
            {remaining.toFixed(2)}
          </span>
        </div>

        {/* الأزرار السفلية */}
        <div className="flex gap-3">
          <button
            disabled={isSubmitting}
            onClick={handleExecutePayment}
            className="flex-1 rounded-xl bg-[#009E9E] py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#008A8A] active:scale-[0.99] disabled:opacity-50"
          >
            {isSubmitting ? 'جارٍ المعالجة...' : 'إتمام وطباعة'}
          </button>
          
          <button
            onClick={onClose}
            className="w-28 rounded-xl bg-[#EEF2F6] py-3.5 text-sm font-bold text-slate-700 hover:bg-[#E2E8F0]"
          >
            إلغاء
          </button>
        </div>

        {/* نافذة كشف الحساب */}
        {selectedCustomer && (
          <CustomerLedgerModal
            isOpen={isLedgerOpen}
            onClose={() => setIsLedgerOpen(false)}
            customerId={selectedCustomer.id}
            customerName={selectedCustomer.name}
          />
        )}

      </div>
    </div>
  );
};
