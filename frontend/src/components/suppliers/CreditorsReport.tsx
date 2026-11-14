import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supplierDocumentsApi } from '../../api/supplier-documents';
import { Download, Calendar, Search, RefreshCw, AlertCircle, FileText, X, Layers, List } from 'lucide-react';

interface CreditorsReportProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenStatement: (supplierId: string, supplierName: string) => void;
  branchId?: string;
}

export const CreditorsReport: React.FC<CreditorsReportProps> = ({
  isOpen,
  onClose,
  onOpenStatement,
  branchId,
}) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [reportType, setReportType] = useState<'summary' | 'detailed'>('summary');
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['creditors-report', from, to, branchId, search, reportType],
    queryFn: () => supplierDocumentsApi.getCreditorsReport({ from, to, branchId, search, type: reportType }),
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const handleDownloadPdf = async (typeToDownload: 'summary' | 'detailed') => {
    try {
      setIsDownloading(true);
      setErrorMsg(null);
      await supplierDocumentsApi.downloadCreditorsReportPdf({ from, to, branchId, search, type: typeToDownload });
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر تنزيل تقرير الدائنين بصيغة PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const summary = data?.summary;
  const currency = data?.company?.currency || 'ج.س';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" dir="rtl">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="text-xl">📊</span>
            <div>
              <h2 className="text-base font-black">تقرير أرصدة الدائنين والموردين (Creditors Report)</h2>
              <p className="text-xs text-slate-300">
                متابعة استحقاقات وسدادات الموردين ورصيد الإقفال ومطابقتها مع الأرصدة القائمة — {data?.branch?.name || 'كافة الفروع'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
              <button
                onClick={() => handleDownloadPdf('summary')}
                disabled={isDownloading || isLoading}
                className="flex items-center gap-1 rounded-md bg-teal-600 hover:bg-teal-700 px-2.5 py-1.5 font-bold text-white transition disabled:opacity-50 cursor-pointer"
                title="تنزيل تقرير ملخص بصيغة PDF"
              >
                <Download className="w-3 h-3" />
                <span>PDF ملخص</span>
              </button>
              <button
                onClick={() => handleDownloadPdf('detailed')}
                disabled={isDownloading || isLoading}
                className="flex items-center gap-1 rounded-md bg-purple-700 hover:bg-purple-800 px-2.5 py-1.5 font-bold text-white transition disabled:opacity-50 cursor-pointer ml-1"
                title="تنزيل تقرير مفصل بالحركات لكل مورد"
              >
                <Layers className="w-3 h-3" />
                <span>PDF مفصل بالحركات</span>
              </button>
            </div>
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px]">
              <input
                type="text"
                placeholder="بحث باسم المورد أو الهاتف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            </div>

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

            <div className="flex items-center bg-slate-200 rounded-lg p-0.5 border border-slate-300">
              <button
                type="button"
                onClick={() => setReportType('summary')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                  reportType === 'summary' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3 h-3" />
                <span>ملخص</span>
              </button>
              <button
                type="button"
                onClick={() => setReportType('detailed')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                  reportType === 'detailed' ? 'bg-white text-purple-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>مفصل بالحركات</span>
              </button>
            </div>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer transition"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 font-bold">جاري تحميل بيانات تقرير الدائنين...</div>
          ) : !data ? (
            <div className="py-16 text-center text-slate-500 font-bold">لا تتوفر بيانات للعرض</div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="bg-rose-50/70 border border-rose-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-rose-600 block mb-1">إجمالي الاستحقاق (دائن)</span>
                  <p className="text-sm font-bold text-rose-700 font-mono">
                    {summary?.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                  </p>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-emerald-600 block mb-1">إجمالي السداد (مدين)</span>
                  <p className="text-sm font-bold text-emerald-700 font-mono">
                    {summary?.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                  </p>
                </div>

                <div className="bg-teal-50/70 border border-teal-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-teal-700 block mb-1">صافي حركة الفترة</span>
                  <p className="text-sm font-bold text-teal-800 font-mono">
                    {summary?.totalPeriodNetMovement.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                  </p>
                </div>

                <div className="bg-purple-50/70 border border-purple-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-purple-700 block mb-1">إجمالي رصيد الإقفال</span>
                  <p className="text-sm font-bold text-purple-900 font-mono">
                    {summary?.totalClosingBalance !== null
                      ? `${summary?.totalClosingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`
                      : 'غير متحقق كلياً'}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-600 block mb-1">الرصيد المسجل حالياً</span>
                  <p className="text-sm font-bold text-slate-800 font-mono">
                    {summary?.totalRecordedDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                  </p>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    !summary?.canCompareTotal
                      ? 'bg-slate-100 border-slate-300 text-slate-700'
                      : Math.abs(summary?.totalVariance || 0) > 0.01
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}
                >
                  <span className="text-[11px] font-bold block mb-1">فرق المطابقة الإجمالي</span>
                  <p className="text-sm font-bold font-mono">
                    {summary?.canCompareTotal && summary?.totalVariance !== null
                      ? `${summary?.totalVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`
                      : '— (محجوب)'}
                  </p>
                  <span className="text-[10px] block mt-0.5 opacity-80">
                    {!summary?.canCompareTotal ? 'لاختلاف الفترة أو نقص الإثبات' : `أرصدة غير مطابقة: ${summary?.incompleteCount || 0}`}
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-900 text-white font-bold">
                    <tr>
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">اسم المورد</th>
                      <th className="p-3">الشركة / الهاتف</th>
                      <th className="p-3 text-center">الفرع</th>
                      <th className="p-3 text-center text-rose-300">استحقاق (دائن)</th>
                      <th className="p-3 text-center text-emerald-300">سداد (مدين)</th>
                      <th className="p-3 text-center text-teal-300">صافي الحركة</th>
                      <th className="p-3 text-center text-purple-300">رصيد الإقفال</th>
                      <th className="p-3 text-center">الرصيد المسجل</th>
                      <th className="p-3 text-center">فرق المطابقة</th>
                      <th className="p-3 text-center w-28">كشف الحساب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {data.suppliers.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400 font-bold">
                          لا يوجد موردون دائنون يطابقون شروط البحث
                        </td>
                      </tr>
                    ) : (
                      data.suppliers.map((s, idx) => {
                        const hasVariance = s.variance !== null && Math.abs(s.variance) > 0.01;
                        return (
                          <React.Fragment key={s.id}>
                            <tr className="hover:bg-slate-50 transition">
                              <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="p-3 font-bold text-slate-800">{s.name}</td>
                              <td className="p-3 text-slate-600">
                                <div>{s.companyName || '—'}</div>
                                <div className="text-[10px] font-mono text-slate-400">{s.phone}</div>
                              </td>
                              <td className="p-3 text-center text-slate-600">{s.branchName || '—'}</td>
                              <td className="p-3 text-center font-mono font-bold text-rose-600">
                                {s.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-emerald-600">
                                {s.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-teal-700">
                                {s.periodNetMovement.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-center font-mono font-black text-purple-900">
                                {s.isClosingBalanceProven && s.closingBalance !== null ? (
                                  s.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })
                                ) : (
                                  <span className="text-amber-600 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded">غير متحقق</span>
                                )}
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-slate-800">
                                {s.recordedCurrentDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-center font-mono font-bold">
                                {s.canCompareWithCurrent && s.variance !== null ? (
                                  <span className={hasVariance ? 'text-amber-600' : 'text-emerald-600'}>
                                    {s.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]" title={s.varianceSuppressedReason || ''}>—</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => onOpenStatement(s.id, s.name)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold transition cursor-pointer"
                                  title="عرض كشف الحساب التفصيلي"
                                >
                                  <FileText className="w-3 h-3 text-teal-600" />
                                  <span>كشف الحساب</span>
                                </button>
                              </td>
                            </tr>
                            {/* حركات المورد في وضع التقرير المفصل */}
                            {reportType === 'detailed' && s.items && s.items.length > 0 && (
                              <tr className="bg-slate-50/60">
                                <td colSpan={11} className="p-3 pr-10">
                                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                    <div className="bg-slate-100 px-3 py-1 font-bold text-[11px] text-slate-700">
                                      حركات المورد خلال الفترة المحددة ({s.items.length} حركة)
                                    </div>
                                    <table className="w-full text-[11px] text-right">
                                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                                        <tr>
                                          <th className="p-2 w-24">تاريخ العملية</th>
                                          <th className="p-2 w-28">نوع العملية</th>
                                          <th className="p-2 w-28">رقم العملية</th>
                                          <th className="p-2">البيان / الأصناف</th>
                                          <th className="p-2 w-20 text-center">مدين</th>
                                          <th className="p-2 w-20 text-center">دائن</th>
                                          <th className="p-2 w-24 text-center">الرصيد بعد العملية</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {s.items.map((it, iIdx) => (
                                          <tr key={iIdx}>
                                            <td className="p-2 font-mono text-slate-600">{it.date}</td>
                                            <td className="p-2 font-bold text-slate-700">{it.operationType || '—'}</td>
                                            <td className="p-2 font-mono font-bold text-slate-700">{it.operationNumber || it.documentNumber}</td>
                                            <td className="p-2 text-slate-800">
                                              <span>{it.description}</span>
                                              {it.itemsDetails && it.itemsDetails.length > 0 && (
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                  الأصناف: {it.itemsDetails.map(x => `${x.tradeName} (${x.quantity} ${x.unitType})`).join(' | ')}
                                                </div>
                                              )}
                                            </td>
                                            <td className="p-2 text-center font-mono text-emerald-600 font-bold">
                                              {it.debit > 0 ? it.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                                            </td>
                                            <td className="p-2 text-center font-mono text-rose-600 font-bold">
                                              {it.credit > 0 ? it.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                                            </td>
                                            <td className="p-2 text-center font-mono font-bold text-purple-900">
                                              {it.balance !== null ? it.balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) : 'غير متحقق'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
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
