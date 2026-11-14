import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accountingReportsApi, GeneralLedgerResponse } from '../../api/accounting-reports';
import { X, Download, Calendar, BookOpen, FileText, ArrowDownLeft, ArrowUpRight, Printer } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accountCode: string;
  accountName: string;
}

export const AccountLedgerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  accountId,
  accountCode,
  accountName,
}) => {
  const currentYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const { data, isLoading } = useQuery<GeneralLedgerResponse>({
    queryKey: ['account-ledger-modal', accountId, fromDate, toDate],
    queryFn: () =>
      accountingReportsApi.getGeneralLedger(accountId, {
        fromDate,
        toDate,
        limit: 500,
      }),
    enabled: isOpen && !!accountId,
  });

  if (!isOpen) return null;

  const entries = data?.entries || [];
  const openingNet = data?.openingBalance?.net || 0;
  const totalDebit = data?.totals?.totalDebit || 0;
  const totalCredit = data?.totals?.totalCredit || 0;
  const closingNet = data?.closingBalance?.net || 0;

  const fmt = (val?: number) => {
    if (val === undefined || val === null) return '-';
    if (Math.abs(val) < 0.005) return '-';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      await accountingReportsApi.downloadPdf(
        'general-ledger',
        { fromDate, toDate },
        accountId,
      );
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تنزيل كشف الحساب');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:p-0 print:static print:bg-transparent"
      dir="rtl"
    >
      <div className="w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl shadow-2xl p-6 overflow-y-auto print:max-w-full print:max-h-none print:shadow-none print:border-none print:p-0 print:overflow-visible">
        {/* ترويسة رسمية للطباعة الورقية */}
        <div className="hidden print:block mb-4 text-center border-b-2 border-slate-800 pb-3">
          <h1 className="text-xl font-black text-slate-900">مجموعة صيدليات داواكور العالمية</h1>
          <h2 className="text-sm font-bold text-slate-700 mt-0.5">
            كشف حساب الأستاذ العام التفصيلي (General Ledger)
          </h2>
          <div className="mt-2 text-xs text-slate-600 flex justify-between px-2">
            <span>
              الحساب: <strong className="font-mono text-black">{accountCode}</strong> —{' '}
              <strong className="font-bold text-black">{accountName}</strong>
            </span>
            <span>
              الفترة من: <strong className="font-mono text-black">{fromDate}</strong> إلى:{' '}
              <strong className="font-mono text-black">{toDate}</strong>
            </span>
          </div>
        </div>

        {/* ترويسة الواجهة */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <BookOpen size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">{accountName}</h2>
                <span className="font-mono text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {accountCode}
                </span>
                {data?.account?.type && (
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {data.account.type}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                كشف حساب الأستاذ العام التفصيلي والحركات المالية المسجلة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* فلاتر الفترة */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 bg-slate-50 p-3 rounded-xl border border-slate-200 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Calendar size={14} className="text-indigo-600" />
              <span>من تاريخ:</span>
            </div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
            />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <span>إلى تاريخ:</span>
            </div>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">عدد الحركات:</span>
            <span className="text-xs font-bold font-mono text-slate-700">{entries.length}</span>
          </div>
        </div>

        {/* بطاقة ملخص الأرصدة */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 block mb-1">الرصيد الافتتاحي</span>
            <span
              className={`text-sm font-black font-mono ${
                openingNet >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {fmt(openingNet)} <small className="text-[10px] font-normal">ج.س</small>
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 block mb-1">إجمالي المدين</span>
            <span className="text-sm font-black font-mono text-rose-600">
              +{fmt(totalDebit)} <small className="text-[10px] font-normal">ج.س</small>
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 block mb-1">إجمالي الدائن</span>
            <span className="text-sm font-black font-mono text-emerald-600">
              -{fmt(totalCredit)} <small className="text-[10px] font-normal">ج.س</small>
            </span>
          </div>
          <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-200">
            <span className="text-[11px] font-bold text-indigo-700 block mb-1">الرصيد الختامي</span>
            <span
              className={`text-sm font-black font-mono ${
                closingNet >= 0 ? 'text-indigo-800' : 'text-rose-700'
              }`}
            >
              {fmt(closingNet)} <small className="text-[10px] font-normal">ج.س</small>
            </span>
          </div>
        </div>

        {/* جدول الحركات */}
        <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">التاريخ</th>
                <th className="py-2.5 px-3">رقم القيد</th>
                <th className="py-2.5 px-3">البيان والتفاصيل</th>
                <th className="py-2.5 px-3 text-center">المصدر</th>
                <th className="py-2.5 px-3 text-left">مدين (ج.س)</th>
                <th className="py-2.5 px-3 text-left">دائن (ج.س)</th>
                <th className="py-2.5 px-3 text-left">الرصيد التراكمي (ج.س)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>جاري تحميل كشف الحساب...</span>
                    </div>
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                    <span>لا توجد حركات مسجلة لهذا الحساب خلال الفترة المحددة</span>
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 text-slate-600 font-mono">
                      {new Date(entry.date).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                      {entry.entryNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">
                      {entry.description || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                        {entry.source}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-left text-rose-600">
                      {Number(entry.debit) > 0 ? fmt(entry.debit) : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-left text-emerald-600">
                      {Number(entry.credit) > 0 ? fmt(entry.credit) : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-black text-left text-indigo-900 bg-slate-50/50">
                      {fmt(entry.runningBalance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && entries.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                <tr>
                  <td colSpan={4} className="py-3 px-3 text-slate-700 text-left">
                    الإجمالي العام:
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-rose-600 text-left">
                    {fmt(totalDebit)}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-emerald-600 text-left">
                    {fmt(totalCredit)}
                  </td>
                  <td className="py-3 px-3 font-mono text-sm text-indigo-900 text-left">
                    {fmt(closingNet)} ج.س
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* أزرار الإجراءات في التذييل */}
        <div className="flex justify-between items-center gap-3 pt-4 border-t border-slate-100 mt-4 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors"
          >
            إغلاق
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="px-4 py-2 rounded-lg bg-[#582949] text-white hover:bg-[#481D3E] text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
            >
              <FileText size={14} /> {isDownloadingPdf ? 'جارٍ التحميل...' : 'تنزيل PDF'}
            </button>
            <button
              onClick={() => window.print()}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Printer size={14} /> طباعة كشف الحساب
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
