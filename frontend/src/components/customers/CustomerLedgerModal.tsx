import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customersApi, CustomerTransaction } from '../../api/customers';
import { apiFetch } from '../../api/http';
import { CustomerPaymentModal } from './CustomerPaymentModal';
import { X, Download, Calendar, Wallet, FileText, ArrowDownLeft, ArrowUpRight, Banknote } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
}

const typeConfig: Record<string, { label: string; color: string; icon?: any }> = {
  SALE: { label: 'فاتورة مبيعات آجل', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  PAYMENT: { label: 'سند تحصيل / سداد', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RETURN: { label: 'مرتجع مبيعات', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  OPENING_BALANCE: { label: 'رصيد افتتاحي سابق', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  ADJUSTMENT: { label: 'تسوية حساب', color: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export const CustomerLedgerModal: React.FC<Props> = ({ isOpen, onClose, customerId, customerName }) => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customer-ledger', customerId, fromDate, toDate],
    queryFn: () => customersApi.getLedger(customerId, fromDate || undefined, toDate || undefined),
    enabled: isOpen && !!customerId,
  });

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      const params = new URLSearchParams();
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      const url = `/api/customers/${customerId}/ledger/pdf${params.toString() ? `?${params.toString()}` : ''}`;

      const res = await apiFetch(url);
      if (!res.ok) throw new Error('فشل تنزيل ملف PDF');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `كشف_حساب_${customerName.replace(/\s+/g, '_')}_${fromDate || 'بداية'}_${toDate || 'اليوم'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحميل ملف PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (!isOpen) return null;

  const transactions: CustomerTransaction[] = data?.transactions || [];
  const totalDebt = Number(data?.totalDebt || data?.customer?.currentDebt || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:p-0 print:static print:bg-transparent" dir="rtl">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl p-6 overflow-y-auto print:max-w-full print:max-h-none print:shadow-none print:border-none print:p-0 print:overflow-visible">
        {/* ترويسة رسمية للطباعة الورقية */}
        <div className="hidden print:block mb-4 text-center border-b-2 border-slate-800 pb-3">
          <h1 className="text-xl font-black text-slate-900">مجموعة صيدليات داواكور العالمية</h1>
          <h2 className="text-sm font-bold text-slate-700 mt-0.5">كشف حساب العميل التفصيلي (Customer Ledger)</h2>
          <div className="mt-2 text-xs text-slate-600 flex justify-between px-2">
            <span>العميل: <strong className="font-bold text-black">{customerName}</strong> {data?.customer?.phone && `(${data.customer.phone})`}</span>
            {data?.customer?.branch?.name && <span>الفرع: <strong className="text-black">{data.customer.branch.name}</strong></span>}
            <span>الفترة: <strong className="font-mono text-black">{fromDate || 'البداية'}</strong> إلى <strong className="font-mono text-black">{toDate || 'اليوم'}</strong></span>
          </div>
        </div>

        <div className="flex justify-between items-center border-b border-slate-100 pb-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600 border border-teal-100">
              <Wallet size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">كشف حساب العميل التفصيلي (Ledger)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                العميل: <strong className="text-slate-700">{customerName}</strong>
                {data?.customer?.phone && <span className="font-mono mr-2">({data.customer.phone})</span>}
                {data?.customer?.branch?.name && <span className="text-teal-700 mr-2">📍 {data.customer.branch.name}</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* فلاتر التاريخ والملخص */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 bg-slate-50 p-3 rounded-xl border border-slate-200 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Calendar size={14} className="text-teal-600" />
              <span>من تاريخ:</span>
            </div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
            />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <span>إلى تاريخ:</span>
            </div>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
            />
            {(fromDate || toDate) && (
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="text-xs text-teal-600 hover:text-teal-800 underline"
              >
                مسح الفترة
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">إجمالي المديونية الحالية:</span>
              <span className="text-base font-black font-mono text-rose-600">
                {totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })} <small className="text-[10px] text-slate-500">ج.س</small>
              </span>
            </div>
            {totalDebt > 0 && (
              <button
                type="button"
                onClick={() => setIsPaymentOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Banknote size={15} />
                <span>قبض / سداد</span>
              </button>
            )}
          </div>
        </div>

        {/* جدول الحركات */}
        <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">التاريخ والوقت</th>
                <th className="py-2.5 px-3">نوع الحركة</th>
                <th className="py-2.5 px-3">البيان والتفاصيل</th>
                <th className="py-2.5 px-3">رقم المرجع</th>
                <th className="py-2.5 px-3">المبلغ (ج.س)</th>
                <th className="py-2.5 px-3">الرصيد بعد الحركة (ج.س)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>جاري تحميل كشف الحساب...</span>
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                    <span>لا توجد حركات مسجلة لهذا العميل في الفترة المحددة</span>
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const badge = typeConfig[t.type] || { label: t.type, color: 'bg-slate-50 text-slate-700 border-slate-200' };
                  const isPositive = Number(t.amount) > 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-slate-600 font-mono">
                        {new Date(t.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {t.description || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {t.referenceId || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        <span className={isPositive ? 'text-rose-600' : 'text-emerald-600'}>
                          {isPositive ? '+' : ''}{Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800 bg-slate-50/50">
                        {Number(t.balanceAfter).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!isLoading && transactions.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                <tr>
                  <td colSpan={4} className="py-3 px-3 text-slate-700 text-left">
                    الرصيد النهائي المستحق:
                  </td>
                  <td colSpan={2} className="py-3 px-3 font-mono text-base text-rose-600">
                    {totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.س
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex justify-between items-center gap-3 pt-4 border-t border-slate-100 mt-4 print:hidden">
          <span className="text-xs text-slate-400">
            عدد الحركات: {transactions.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors"
            >
              إغلاق
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="px-4 py-2 rounded-lg bg-[#582949] text-white hover:bg-[#481D3E] text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
            >
              <FileText size={14} /> {isDownloadingPdf ? 'جارٍ التحميل...' : 'تنزيل PDF'}
            </button>
            <button
              onClick={() => window.print()}
              className="px-5 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Download size={14} /> طباعة كشف الحساب
            </button>
          </div>
        </div>
      </div>

      <CustomerPaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        customerId={customerId}
        customerName={customerName}
        customerPhone={data?.customer?.phone}
        currentDebt={totalDebt}
        branchId={data?.customer?.branchId}
        onSuccess={() => {
          refetch();
        }}
      />
    </div>
  );
};
