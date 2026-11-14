import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supplierDocumentsApi } from '../../api/supplier-documents';
import { X, Download, Calendar, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle } from 'lucide-react';

interface SupplierStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string | null;
  supplierName?: string;
  branchId?: string;
}

export const SupplierStatementModal: React.FC<SupplierStatementModalProps> = ({
  isOpen,
  onClose,
  supplierId,
  supplierName = 'المورد',
  branchId,
}) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const downloadPayment = async (paymentId: string, paymentNumber: string) => {
    try {
      setErrorMsg(null);
      await supplierDocumentsApi.downloadPaymentPdf(paymentId, paymentNumber);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'فشل تنزيل سند السداد');
    }
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['supplier-statement', supplierId, from, to, branchId],
    queryFn: () => (supplierId ? supplierDocumentsApi.getStatement(supplierId, { from, to, branchId }) : null),
    enabled: isOpen && !!supplierId,
  });

  if (!isOpen || !supplierId) return null;

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      setErrorMsg(null);
      await supplierDocumentsApi.downloadStatementPdf(supplierId, { from, to, branchId }, supplierName);
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تنزيل كشف الحساب بصيغة PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const summary = data?.summary;
  const currency = data?.company?.currency || 'ج.س';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" dir="rtl">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="text-xl">📑</span>
            <div>
              <h2 className="text-base font-black">كشف حساب المورد التفصيلي</h2>
              <p className="text-xs text-slate-300">
                {data?.supplier?.name || supplierName} {data?.supplier?.companyName ? `(${data.supplier.companyName})` : ''} — {data?.branch?.name || 'كافة الفروع'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloading || isLoading}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloading ? 'جاري التنزيل...' : 'تنزيل PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-bold text-slate-700">من:</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700">إلى:</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
              />
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded cursor-pointer transition"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>

          {errorMsg && (
            <div className="text-rose-600 font-bold flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 font-bold">جاري تحميل بيانات كشف الحساب...</div>
          ) : !data ? (
            <div className="py-16 text-center text-slate-500 font-bold">لا تتوفر بيانات للعرض</div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 block mb-1">رصيد أول المدة</span>
                  <p className="text-sm font-bold text-slate-800 font-mono">
                    {summary?.isBeginningBalanceProven && summary?.beginningBalance !== null ? (
                      `${summary.beginningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`
                    ) : (
                      <span className="text-amber-600 text-xs font-bold">غير متحقق</span>
                    )}
                  </p>
                </div>

                <div className="bg-rose-50/60 border border-rose-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-rose-600 block mb-1">إجمالي الاستحقاق (دائن)</span>
                  <p className="text-sm font-bold text-rose-700 font-mono">
                    {summary?.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                  </p>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-emerald-600 block mb-1">إجمالي السداد (مدين)</span>
                  <p className="text-sm font-bold text-emerald-700 font-mono">
                    {summary?.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                  </p>
                </div>

                <div className="bg-teal-50/60 border border-teal-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-teal-700 block mb-1">صافي حركة الفترة</span>
                  <p className="text-sm font-bold text-teal-800 font-mono">
                    {summary?.netMovement.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                  </p>
                </div>

                <div className="bg-purple-50/60 border border-purple-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-purple-700 block mb-1">المتبقي الآجل للمورد</span>
                  <p className="text-sm font-bold text-purple-900 font-mono">
                    {summary?.isEndingBalanceProven && summary?.endingBalance !== null ? (
                      `${summary.endingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`
                    ) : (
                      <span className="text-amber-600 text-xs font-bold">غير متحقق</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Reconciliation Banner */}
              <div
                className={`p-3 rounded-xl border flex flex-wrap items-center justify-between text-xs font-bold ${
                  !summary?.canCompareWithCurrent
                    ? 'bg-slate-100 border-slate-300 text-slate-700'
                    : Math.abs(summary?.variance || 0) > 0.01
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {!summary?.canCompareWithCurrent ? (
                    <AlertCircle className="w-4 h-4 text-slate-500" />
                  ) : Math.abs(summary?.variance || 0) > 0.01 ? (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  )}
                  <span>
                    الرصيد المسجل حالياً ببطاقة المورد:{' '}
                    <strong className="font-mono text-sm">
                      {summary?.recordedCurrentDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
                      {currency}
                    </strong>
                  </span>
                </div>

                <div>
                  {!summary?.canCompareWithCurrent ? (
                    <span className="text-slate-600">
                      {summary?.varianceSuppressedReason || 'حُجب فرق المطابقة لاختلاف نطاق المقارنة'}
                    </span>
                  ) : summary?.variance !== null && Math.abs(summary.variance) > 0.01 ? (
                    <span>
                      فرق المطابقة مع الحركات المثبتة:{' '}
                      <strong className="font-mono text-amber-700">
                        {summary.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                      </strong>{' '}
                      (يتطلب تدقيق القيود التاريخية)
                    </span>
                  ) : (
                    <span>المطابقة: متطابق 100% مع الحركات المثبتة</span>
                  )}
                </div>
              </div>

              {/* Transactions Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-900 text-white font-bold">
                    <tr>
                      <th className="p-3 w-24 text-center">تاريخ العملية</th>
                      <th className="p-3 w-28 text-center">نوع العملية</th>
                      <th className="p-3 w-28 text-center">رقم العملية</th>
                      <th className="p-3">البيان / الأصناف</th>
                      <th className="p-3 w-24 text-center text-emerald-300">مدين</th>
                      <th className="p-3 w-24 text-center text-rose-300">دائن</th>
                      <th className="p-3 w-28 text-center">الرصيد بعد العملية</th>
                      <th className="p-3 w-14 text-center">تفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {data.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                          لا توجد حركات مسجلة للمورد خلال الفترة المحددة
                        </td>
                      </tr>
                    ) : (
                      data.items.map((row, idx) => {
                        const hasItems = row.itemsDetails && row.itemsDetails.length > 0;
                        const isExpanded = !!expandedRows[idx];

                        return (
                          <React.Fragment key={idx}>
                            <tr className={`hover:bg-slate-50 transition ${row.isSubRow ? 'bg-slate-50/60' : 'bg-white'}`}>
                              <td className="p-3 text-center text-slate-600 font-mono text-[11px]">{row.date}</td>
                              <td className="p-3 text-center font-bold text-slate-700 text-[11px]">{row.operationType || '—'}</td>
                              <td className="p-3 text-center font-bold font-mono text-slate-800 text-[11px]">{row.operationNumber || row.documentNumber}</td>
                              <td className="p-3 text-slate-800 font-medium">
                                <span className={row.isSubRow ? 'pr-2 text-slate-600' : 'font-bold'}>
                                  {row.description}
                                </span>
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-emerald-600">
                                {row.debit > 0 ? row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-rose-600">
                                {row.credit > 0 ? row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                              </td>
                              <td className="p-3 text-center font-mono font-black text-slate-900">
                                {row.balance !== null ? (
                                  row.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })
                                ) : (
                                  <span className="text-amber-600 text-[10px] bg-amber-50 px-1 py-0.5 rounded">غير متحقق</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {row.supplierPaymentId ? (
                                  <button
                                    onClick={() => downloadPayment(row.supplierPaymentId!, row.operationNumber)}
                                    className="p-1 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded cursor-pointer"
                                    title="تنزيل سند سداد المورد"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                ) : hasItems ? (
                                  <button
                                    onClick={() => toggleRow(idx)}
                                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded cursor-pointer"
                                    title="عرض أصناف الفاتورة"
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            </tr>

                            {/* Collapsible Items Details Row */}
                            {hasItems && isExpanded && (
                              <tr className="bg-teal-50/40">
                                <td colSpan={8} className="p-3 px-6">
                                  <div className="bg-white border border-teal-200 rounded-lg p-3 text-[11px] space-y-1.5">
                                    <span className="font-bold text-teal-800 block mb-1">
                                      الأصناف المشتراة المشمولة بهذه الفاتورة:
                                    </span>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                      {row.itemsDetails!.map((it, itemIdx) => (
                                        <div key={itemIdx} className="bg-slate-50 p-2 rounded border border-slate-100 flex justify-between items-center">
                                          <span className="font-bold text-slate-800">{it.tradeName}</span>
                                          <span className="font-mono text-teal-700 font-bold">
                                            {it.quantity} {it.unitType}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
