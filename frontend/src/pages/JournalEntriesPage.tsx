import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { journalApi, JournalEntryItem } from '../api/journal';
import { PageHeader } from '../components/common/PageHeader';
import { getSourceLink } from '../utils/journal-links';
import {
  BookOpen,
  Calendar,
  Layers,
  Leaf,
  Search,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  FolderTree,
  X,
  ExternalLink,
} from 'lucide-react';

export const JournalEntriesPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['journal-entries', { source: sourceFilter, search, page }],
    queryFn: () =>
      journalApi.getAll({
        source: sourceFilter || undefined,
        search: search || undefined,
        page,
        limit: 10,
      }),
  });

  const { data: accountsData } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => journalApi.getAccounts(),
    enabled: isAccountsModalOpen,
  });

  const getSourceLabel = (src: string) => {
    switch (src) {
      case 'PURCHASE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            مشتريات وتوريد (PURCHASE)
          </span>
        );
      case 'SALE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            مبيعات وصرف (SALE)
          </span>
        );
      case 'SHIFT_DIFFERENCE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            تسوية صندوق وردية (SHIFT)
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            {src || 'قيد نظامي'}
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 pb-12">
      <PageHeader
        title="دفتر الأستاذ والقيود المحاسبية (General Ledger)"
        subtitle="سجل القيود المزدوجة المتولدة آلياً مع التوازن الرياضي وتحديث أرصدة الحسابات"
        action={
          <button
            onClick={() => setIsAccountsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-sm transition"
          >
            <FolderTree className="w-4 h-4" />
            شجرة الحسابات والأرصدة
          </button>
        }
      />

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px]">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="بحث برقم القيد أو البيان..."
              className="w-full px-3 py-1.5 pl-8 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-teal-500 bg-white min-w-[160px]"
          >
            <option value="">كافة المصادر</option>
            <option value="SALE">المبيعات (SALE)</option>
            <option value="PURCHASE">المشتريات (PURCHASE)</option>
            <option value="SHIFT_DIFFERENCE">فروقات الورديات (SHIFT)</option>
            <option value="MANUAL">يدوي (MANUAL)</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          إجمالي القيود المرحلة: <strong className="text-slate-800">{data?.total || 0}</strong>
        </div>
      </div>

      {/* Entries List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            جاري تحميل القيود المحاسبية...
          </div>
        ) : data?.items?.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            لا توجد قيود مسجلة تطابق التصفية
          </div>
        ) : (
          data?.items?.map((entry: JournalEntryItem) => {
            const totalDebit = entry.lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
            const totalCredit = entry.lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);

            return (
              <div
                key={entry.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition hover:shadow"
              >
                {/* Header */}
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-black text-teal-800 flex items-center gap-1.5 text-sm">
                      <BookOpen size={16} className="text-teal-600" />
                      {entry.entryNumber}
                    </span>
                    {getSourceLabel(entry.source)}
                    <span className="text-xs font-bold text-slate-800">{entry.description}</span>
                    {/* 🎯 مرجع قابل للنقر */}
                    {entry.referenceId && (() => {
                      // 🎯 استخراج رقم الفاتورة من الوصف (لو الـ referenceId = UUID)
                      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.referenceId);
                      const invoiceNumberMatch = entry.description?.match(/INV-[\w-]+/) || entry.description?.match(/INV-\d+-\d+/);

                      // الأولوية: invoiceNumber من الوصف → referenceId
                      const referenceKey = isUUID && invoiceNumberMatch
                        ? invoiceNumberMatch[0]
                        : entry.referenceId;

                      const sourceLink = getSourceLink(entry.source, referenceKey);

                      if (!sourceLink) {
                        return (
                          <span className="text-[11px] font-mono text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded">
                            مرجع: {entry.referenceId}
                          </span>
                        );
                      }

                      return (
                        <Link
                          to={sourceLink.href}
                          title={sourceLink.label}
                          className="group inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 hover:border-teal-400 px-2 py-0.5 rounded transition"
                        >
                          <span>{sourceLink.icon}</span>
                          <span>{isUUID && invoiceNumberMatch ? invoiceNumberMatch[0] : entry.referenceId}</span>
                          <ExternalLink size={11} className="text-teal-500 group-hover:text-teal-700 transition" />
                        </Link>
                      );
                    })()}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar size={13} />
                    {new Date(entry.date).toLocaleDateString('ar-SD', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {/* Lines Table */}
                <table className="w-full text-right text-xs">
                  <thead className="text-slate-500 border-b border-slate-100 font-bold bg-white">
                    <tr>
                      <th className="py-2.5 px-4 w-28">رقم الحساب</th>
                      <th className="py-2.5 px-4">اسم الحساب</th>
                      <th className="py-2.5 px-4 w-20 text-center">طرفي</th>
                      <th className="py-2.5 px-4 w-36">مدين (Debit)</th>
                      <th className="py-2.5 px-4 w-36">دائن (Credit)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entry.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-600">
                          {line.account?.code}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-800">
                          {line.account?.name}
                          {(line.notes || line.description) && (
                            <span className="text-slate-400 mr-2 font-normal">
                              ({line.notes || line.description})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {line.account?.isLeaf ? (
                            <span title="حساب طرفي يقبل الترحيل" className="inline-block">
                              <Leaf size={14} className="text-emerald-500 mx-auto" />
                            </span>
                          ) : (
                            <span className="text-rose-500 text-xs font-bold">رئيسي</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-emerald-700">
                          {Number(line.debit) > 0 ? `${Number(line.debit).toLocaleString()} ج.س` : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-teal-700">
                          {Number(line.credit) > 0 ? `${Number(line.credit).toLocaleString()} ج.س` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-black border-t border-slate-200">
                    <tr>
                      <td colSpan={3} className="py-2.5 px-4 text-left text-slate-600">
                        المجموع المتوازن:
                      </td>
                      <td className="py-2.5 px-4 text-emerald-800 font-mono text-xs">
                        {totalDebit.toLocaleString()} ج.س
                      </td>
                      <td className="py-2.5 px-4 text-teal-800 font-mono text-xs">
                        {totalCredit.toLocaleString()} ج.س
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Chart of Accounts & Balances */}
      {isAccountsModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[88vh] overflow-y-auto p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-teal-600" />
                دليل وشجرة الحسابات المالية وأرصدتها الحية
              </h3>
              <button
                onClick={() => setIsAccountsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 text-right">رقم الحساب</th>
                    <th className="p-2.5 text-right">اسم الحساب</th>
                    <th className="p-2.5 text-right">النوع</th>
                    <th className="p-2.5 text-center">طرفي</th>
                    <th className="p-2.5 text-right">الرصيد التراكمي (Balance)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accountsData?.map((acc: any) => (
                    <tr key={acc.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-bold text-teal-800">{acc.code}</td>
                      <td className="p-2.5 font-semibold text-slate-800">
                        {acc.name}
                        {acc.parent && (
                          <span className="text-[10px] text-slate-400 mr-2">
                            (تابع لـ {acc.parent.name})
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-600">{acc.type}</td>
                      <td className="p-2.5 text-center">
                        {acc.isLeaf ? (
                          <Leaf size={14} className="text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-[10px] text-slate-400">رئيسي</span>
                        )}
                      </td>
                      <td className="p-2.5 font-mono font-black text-slate-900">
                        {Number(acc.balance || 0).toLocaleString()} ج.س
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
