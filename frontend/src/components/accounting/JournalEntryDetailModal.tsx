import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Calendar,
  FileText,
  BookOpen,
  ExternalLink,
  Leaf,
  CheckCircle2,
  AlertCircle,
  Hash,
  Building2,
  User,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { journalApi, JournalEntryItem } from '../../api/journal';
import { getSourceLink } from '../../utils/journal-links';

interface JournalEntryDetailModalProps {
  entryId: string | null;
  onClose: () => void;
}

const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  SALE: { label: 'مبيعات ونقاط بيع (SALE)', className: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  PURCHASE: { label: 'مشتريات وتوريد (PURCHASE)', className: 'bg-amber-50 text-amber-800 border-amber-300' },
  SALE_RETURN: { label: 'مرتجع مبيعات (SALE RETURN)', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  PURCHASE_RETURN: { label: 'مرتجع مشتريات (PURCHASE RETURN)', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  EXPENSE: { label: 'سند صرف مصروفات (EXPENSE)', className: 'bg-orange-50 text-orange-800 border-orange-300' },
  SHIFT_DIFFERENCE: { label: 'فروقات إغلاق وردية (SHIFT)', className: 'bg-blue-50 text-blue-800 border-blue-300' },
  STOCK_COUNT: { label: 'تسوية جرد مخزني (STOCK COUNT)', className: 'bg-purple-50 text-purple-800 border-purple-300' },
  RECEIPT_VOUCHER: { label: 'سند قبض نقدية', className: 'bg-teal-50 text-teal-800 border-teal-300' },
  MANUAL: { label: 'قيد يومية تسوية يدوي', className: 'bg-slate-100 text-slate-800 border-slate-300' },
};

export const JournalEntryDetailModal: React.FC<JournalEntryDetailModalProps> = ({ entryId, onClose }) => {
  const { data, isLoading, error } = useQuery<JournalEntryItem>({
    queryKey: ['journal-entry', entryId],
    queryFn: () => journalApi.getEntry(entryId!),
    enabled: !!entryId,
  });

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!entryId) return null;

  const fmt = (val?: number | string) => {
    const num = Number(val || 0);
    if (Math.abs(num) < 0.005) return '-';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const sourceInfo = data?.source
    ? SOURCE_CONFIG[data.source] || {
        label: data.source,
        className: 'bg-slate-100 text-slate-800 border-slate-300',
      }
    : null;

  // استخراج مرجع الفاتورة بدقة (يدعم استخراج INV من الوصف إذا كان المرجع UUID)
  const resolvedRefKey = (() => {
    if (!data?.referenceId) return null;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.referenceId);
    const invoiceNumberMatch = data.description?.match(/INV-[\w-]+/);
    if (isUUID && invoiceNumberMatch) {
      return invoiceNumberMatch[0];
    }
    return data.referenceId;
  })();

  const sourceLink = data && resolvedRefKey ? getSourceLink(data.source, resolvedRefKey) : null;

  const totalDebit = data?.lines?.reduce((s, l) => s + Number(l.debit || 0), 0) || 0;
  const totalCredit = data?.lines?.reduce((s, l) => s + Number(l.credit || 0), 0) || 0;
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─── */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-start bg-slate-50/80">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-[#582949]/10 text-[#582949]">
                <BookOpen className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900 font-mono tracking-tight">
                    {data?.entryNumber || 'جاري تحميل تفاصيل القيد...'}
                  </h3>
                  {data && (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        isBalanced
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-rose-50 text-rose-800 border-rose-300'
                      }`}
                    >
                      {isBalanced ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>قيد متزن</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>غير متزن</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
                {data && (
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                    {sourceInfo && (
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${sourceInfo.className}`}>
                        {sourceInfo.label}
                      </span>
                    )}
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(data.date).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {data.branch?.name && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {data.branch.name}
                      </span>
                    )}
                    {data.createdBy && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {data.createdBy}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/70 transition"
            title="إغلاق (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── Body ─── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading && (
            <div className="text-center py-16 text-slate-500 space-y-3">
              <div className="w-8 h-8 border-3 border-[#582949] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold animate-pulse">جاري جلب سطور القيد المحاسبي المزدوج...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-16 bg-rose-50/50 rounded-2xl border border-rose-200 p-6 space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
              <p className="text-sm font-bold text-rose-800">تعذر تحميل تفاصيل القيد المطلوب</p>
              <p className="text-xs text-rose-600">قد يكون رقم القيد غير متاح أو تم نقله.</p>
            </div>
          )}

          {data && (
            <>
              {/* ─── بطاقة تفاصيل البيان والمرجع ─── */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-[#582949] mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-700">البيان المحاسبي: </span>
                    <span className="text-slate-900 font-medium">{data.description || 'لا يوجد بيان مسجل'}</span>
                  </div>
                </div>

                {resolvedRefKey && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-slate-400" />
                      المستند المرجعي:
                    </span>
                    {sourceLink ? (
                      <Link
                        to={sourceLink.href}
                        onClick={onClose}
                        className="inline-flex items-center gap-1.5 font-mono font-bold text-[#582949] bg-[#582949]/10 hover:bg-[#582949] hover:text-white px-2.5 py-1 rounded-lg border border-[#582949]/20 transition shadow-sm group"
                        title="فتح المستند الأصلي المرتبط بالقيد"
                      >
                        <span>{sourceLink.icon}</span>
                        <span>{resolvedRefKey}</span>
                        <ExternalLink className="w-3 h-3 text-[#582949] group-hover:text-white transition-colors" />
                      </Link>
                    ) : (
                      <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {resolvedRefKey}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ─── جدول سطور القيد ─── */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-[#582949] text-white font-bold">
                    <tr>
                      <th className="py-2.5 px-3 w-28 border-l border-white/20">كود الحساب</th>
                      <th className="py-2.5 px-3 border-l border-white/20">اسم الحساب والشرح</th>
                      <th className="py-2.5 px-3 w-16 text-center border-l border-white/20">المستوى</th>
                      <th className="py-2.5 px-3 w-32 text-left border-l border-white/20">مدين (ر.س)</th>
                      <th className="py-2.5 px-3 w-32 text-left">دائن (ر.س)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {data.lines.map((line) => {
                      const debitNum = Number(line.debit || 0);
                      const creditNum = Number(line.credit || 0);
                      return (
                        <tr key={line.id} className="hover:bg-purple-50/50 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-[#582949] border-l border-slate-100">
                            {line.account?.code || '-'}
                          </td>
                          <td className="py-2.5 px-3 font-sans border-l border-slate-100">
                            <span className="font-bold text-slate-800">{line.account?.name || '-'}</span>
                            {(line.notes || line.description) && (
                              <span className="text-slate-400 mr-2 text-[11px] font-normal">
                                ({line.notes || line.description})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center border-l border-slate-100 font-sans">
                            {line.account?.isLeaf ? (
                              <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold">
                                <Leaf className="w-3 h-3 text-emerald-600" />
                                فرعي
                              </span>
                            ) : (
                              <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold">
                                رئيسي
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-blue-700 text-left border-l border-slate-100">
                            {debitNum > 0 ? fmt(debitNum) : '-'}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-indigo-700 text-left">
                            {creditNum > 0 ? fmt(creditNum) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black border-t-2 border-slate-300 font-mono">
                    <tr>
                      <td colSpan={3} className="py-3 px-3 text-center font-sans text-xs border-l border-slate-200">
                        إجمالي القيد المزدوج:
                      </td>
                      <td className="py-3 px-3 text-blue-800 text-left border-l border-slate-200">
                        {fmt(totalDebit)}
                      </td>
                      <td className="py-3 px-3 text-indigo-800 text-left">
                        {fmt(totalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {data?.lines ? `${data.lines.length} أطراف قيد مسجلة` : ''}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
