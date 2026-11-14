import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Landmark, Wallet, X } from 'lucide-react';
import {
  supplierDocumentsApi,
  SupplierPaymentResponse,
} from '../../api/supplier-documents';

interface SupplierPaymentModalProps {
  isOpen: boolean;
  supplier: { id: string; name: string; branchId: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `supplier-payment-${crypto.randomUUID()}`;
  }
  return `supplier-payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({
  isOpen,
  supplier,
  onClose,
  onSaved,
}) => {
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedPayment, setSavedPayment] = useState<SupplierPaymentResponse | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMethod('CASH');
    setReferenceNo('');
    setNotes('');
    setAmounts({});
    setIdempotencyKey(newIdempotencyKey());
    setError('');
    setSavedPayment(null);
  }, [isOpen, supplier?.id]);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['supplier-outstanding-invoices', supplier?.id, supplier?.branchId],
    queryFn: () => supplierDocumentsApi.getOutstandingInvoices(supplier!.id, supplier!.branchId),
    enabled: isOpen && !!supplier?.id && !!supplier?.branchId,
    refetchOnWindowFocus: false,
  });

  const allocations = useMemo(
    () =>
      Object.entries(amounts)
        .map(([purchaseOrderId, value]) => ({ purchaseOrderId, amount: Number(value) }))
        .filter((row) => Number.isFinite(row.amount) && row.amount > 0),
    [amounts],
  );
  const total = allocations.reduce((sum, row) => sum + row.amount, 0);

  if (!isOpen || !supplier) return null;

  const updateAmount = (invoiceId: string, value: string, remaining: number) => {
    const normalized = value === '' ? '' : String(Math.min(Math.max(Number(value) || 0, 0), remaining));
    setAmounts((current) => ({ ...current, [invoiceId]: normalized }));
    setError('');
  };

  const submit = async () => {
    if (!allocations.length || total <= 0) {
      setError('أدخل مبلغاً على فاتورة واحدة على الأقل');
      return;
    }
    if (method === 'BANK_TRANSFER' && !referenceNo.trim()) {
      setError('رقم مرجع التحويل البنكي مطلوب');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const payment = await supplierDocumentsApi.createPayment(supplier.id, {
        branchId: supplier.branchId,
        method,
        amount: Number(total.toFixed(2)),
        idempotencyKey,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        allocations: allocations.map((row) => ({
          purchaseOrderId: row.purchaseOrderId,
          amount: Number(row.amount.toFixed(2)),
        })),
      });
      setSavedPayment(payment);
      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'فشل تسجيل سداد المورد');
    } finally {
      setIsSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!savedPayment) return;
    try {
      await supplierDocumentsApi.downloadPaymentPdf(savedPayment.id, savedPayment.paymentNumber);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'فشل تنزيل سند السداد');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" dir="rtl">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div>
            <h2 className="text-base font-bold">سداد دفعة للمورد</h2>
            <p className="mt-1 text-xs text-slate-300">{supplier.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>

        {savedPayment ? (
          <div className="space-y-5 p-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-900">تم تسجيل سداد المورد بنجاح</h3>
              <p className="mt-1 font-mono text-sm text-emerald-800">{savedPayment.paymentNumber}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">المبلغ</p>
                <p className="mt-1 font-bold">{savedPayment.amount.toLocaleString()} {savedPayment.company.currency}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">رقم القيد</p>
                <p className="mt-1 font-mono font-bold">{savedPayment.journalEntryNumber}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">المتبقي للمورد</p>
                <p className="mt-1 font-bold text-rose-700">{savedPayment.supplier.currentDebt.toLocaleString()} {savedPayment.company.currency}</p>
              </div>
            </div>
            {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">إغلاق</button>
              <button onClick={downloadPdf} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">
                <Download className="h-4 w-4" />
                تنزيل سند PDF
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMethod('CASH')}
                className={`flex items-center gap-3 rounded-xl border p-4 text-right ${method === 'CASH' ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-200'}`}
              >
                <Wallet className="h-5 w-5" />
                <span><strong className="block text-sm">نقداً من الخزنة</strong><small>يتطلب وردية مفتوحة ورصيداً كافياً</small></span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('BANK_TRANSFER')}
                className={`flex items-center gap-3 rounded-xl border p-4 text-right ${method === 'BANK_TRANSFER' ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-200'}`}
              >
                <Landmark className="h-5 w-5" />
                <span><strong className="block text-sm">تحويل بنكي</strong><small>يسجل التحويل المنفذ ومرجعه</small></span>
              </button>
            </div>

            {method === 'BANK_TRANSFER' && (
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">رقم مرجع التحويل *</label>
                <input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} maxLength={120} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">توزيع الدفعة على الفواتير الآجلة</h3>
                <span className="text-xs text-slate-500">رصيد المورد المسجل {Number(data?.supplier.currentDebt || 0).toLocaleString()}</span>
              </div>
              {isLoading ? (
                <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">جاري جلب الفواتير...</div>
              ) : loadError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError instanceof Error ? loadError.message : 'فشل جلب الفواتير'}</div>
              ) : !data?.invoices.length ? (
                <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">لا توجد فواتير آجلة قابلة للسداد</div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-right">الفاتورة</th>
                        <th className="px-3 py-2 text-right">التاريخ</th>
                        <th className="px-3 py-2 text-right">المتبقي</th>
                        <th className="px-3 py-2 text-right">مبلغ السداد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((invoice) => (
                        <tr key={invoice.id} className="border-t border-slate-100">
                          <td className="px-3 py-3">
                            <strong>{invoice.invoiceNumber || invoice.orderNumber}</strong>
                            {invoice.blockedReason && (
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                                <AlertTriangle className="h-3 w-3" /> {invoice.blockedReason}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3">{invoice.receivedAt ? new Date(invoice.receivedAt).toLocaleDateString('ar-EG') : '—'}</td>
                          <td className="px-3 py-3 font-mono font-bold">{invoice.remaining.toLocaleString()}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max={invoice.remaining}
                                step="0.01"
                                disabled={!invoice.eligible}
                                value={amounts[invoice.id] || ''}
                                onChange={(event) => updateAmount(invoice.id, event.target.value, invoice.remaining)}
                                className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 font-mono disabled:bg-slate-100"
                              />
                              {invoice.eligible && (
                                <button type="button" onClick={() => updateAmount(invoice.id, String(invoice.remaining), invoice.remaining)} className="text-[11px] font-bold text-teal-700 hover:underline">
                                  كامل
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">البيان أو الملاحظات</label>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 p-4 text-white">
              <div>
                <p className="text-xs text-slate-300">إجمالي السداد</p>
                <p className="text-xl font-bold">{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              {error && <p className="max-w-md text-sm text-rose-300">{error}</p>}
              <div className="flex gap-2">
                <button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 text-sm">إلغاء</button>
                <button
                  onClick={submit}
                  disabled={isSaving || isLoading || total <= 0}
                  className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? 'جاري التثبيت...' : 'تسجيل السداد'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
