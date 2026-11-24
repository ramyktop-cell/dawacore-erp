import React, { useState, useEffect } from 'react';
import { receiptsApi, Receipt, ReceiptStats } from '../api/receipts';
import { ReceiptFormModal } from '../components/receipts/ReceiptFormModal';
import { ReceiptPrintModal } from '../components/receipts/ReceiptPrintModal';
import { usePosStore } from '../stores/pos.store';
import { useAuthStore } from '../stores/auth.store';

export const ReceiptsPage: React.FC = () => {
  const { user } = useAuthStore();
  const pos = usePosStore();
  const companyId = user?.companyId || '';
  const branchId = user?.branchId || '';
  const activeShiftId =
    pos.cashierId === user?.id && pos.branchId === branchId ? pos.activeShiftId : null;

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [destinationFilter, setDestinationFilter] = useState<'ALL' | 'CASH' | 'BANK'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<Receipt | null>(null);

  const loadData = async () => {
    if (!companyId) {
      setReceipts([]);
      setStats(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [list, statsData] = await Promise.all([
        receiptsApi.getAll({
          companyId,
          branchId: branchId || undefined,
          receivedTo: destinationFilter !== 'ALL' ? destinationFilter : undefined,
        }),
        receiptsApi.getStats({ companyId, branchId: branchId || undefined }),
      ]);
      setReceipts(list);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load receipts data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId, branchId, destinationFilter]);

  const handleCancel = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء سند القبض؟ سيتم عكس الأثر المالي والخصم من الوردية إن وجدت.')) {
      return;
    }
    try {
      await receiptsApi.cancel(id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'فشل إلغاء سند القبض');
    }
  };

  const filteredReceipts = receipts.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.receiptNumber.toLowerCase().includes(query) ||
      item.receiptType.toLowerCase().includes(query) ||
      (item.account?.name && item.account.name.toLowerCase().includes(query)) ||
      (item.receivedFrom && item.receivedFrom.toLowerCase().includes(query)) ||
      (item.description && item.description.toLowerCase().includes(query)) ||
      (item.referenceNo && item.referenceNo.toLowerCase().includes(query))
    );
  });

  return (
    <div className="p-6 space-y-6 font-sans" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-700 shadow-inner">
            📥
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">سندات القبض والإيرادات المتنوعة</h1>
            <p className="text-xs font-bold text-slate-400">
              إيداع الإيرادات النقدية والبنكية خارج عمليات البيع وتوليد القيود المحاسبية وربط عهدة الخزينة والورديات
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-800 shadow-md transition cursor-pointer"
        >
          <span>➕</span>
          <span>إصدار سند قبض جديد</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">إجمالي المقبوضات المعتمدة</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-emerald-800">
              {Number(stats?.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">ج.س</span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold block mt-1">كافة الإيرادات خارج البيع</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">المقبوض بالخزينة / الصندوق</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-teal-700">
              {Number(stats?.cashAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">ج.س</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-bold block mt-1">💵 توريدات نقدية بالدرج/الخزنة</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">المقبوض بالحسابات البنكية</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-blue-700">
              {Number(stats?.bankAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">ج.س</span>
          </div>
          <span className="text-[10px] text-blue-600 font-bold block mt-1">🏦 تحويلات وإيداعات بنكية</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">إجمالي عدد السندات</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-slate-800">
              {stats?.count || 0}
            </span>
            <span className="text-xs font-bold text-slate-500">سند</span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold block mt-1">مرحلة ومقيدة محاسبياً</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setDestinationFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              destinationFilter === 'ALL'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الكل ({receipts.length})
          </button>
          <button
            onClick={() => setDestinationFilter('CASH')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              destinationFilter === 'CASH'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            💵 الخزينة / الصندوق
          </button>
          <button
            onClick={() => setDestinationFilter('BANK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              destinationFilter === 'BANK'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            🏦 الحساب البنكي
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="بحث برقم السند، النوع، الحساب، المستلم منه..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs focus:bg-white focus:border-emerald-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">رقم السند</th>
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">نوع الإيراد</th>
                <th className="py-3 px-4">المستلم منه</th>
                <th className="py-3 px-4">الحساب الدائن (الشجرة)</th>
                <th className="py-3 px-4">جهة الإيداع</th>
                <th className="py-3 px-4">المبلغ</th>
                <th className="py-3 px-4">المرجع / الشيك</th>
                <th className="py-3 px-4">البيان</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                    جاري تحميل سندات القبض...
                  </td>
                </tr>
              ) : filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                    لا توجد سندات قبض مسجلة مطابقة للبحث
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-mono font-black text-emerald-800">
                      {r.receiptNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(r.date).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{r.receiptType}</td>
                    <td className="py-3 px-4 text-slate-700">{r.receivedFrom || '—'}</td>
                    <td className="py-3 px-4">
                      {r.account ? (
                        <span className="font-mono font-bold text-slate-700">
                          {r.account.code} - {r.account.name}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${
                          r.receivedTo === 'BANK'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {r.receivedTo === 'BANK' ? '🏦 بنك' : '💵 خزينة'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-black text-sm text-emerald-700">
                      {Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {r.referenceNo || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={r.description}>
                      {r.description || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {r.status === 'APPROVED' ? 'معتمد ومقبوض' : 'ملغي'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedReceiptForPrint(r)}
                          title="معاينة وطباعة سند القبض"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 transition cursor-pointer"
                        >
                          🖨️
                        </button>
                        {r.status === 'APPROVED' && (
                          <button
                            type="button"
                            onClick={() => handleCancel(r.id)}
                            title="إلغاء سند القبض"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 transition cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <ReceiptFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => loadData()}
        companyId={companyId}
        branchId={branchId}
        shiftId={activeShiftId || undefined}
      />

      <ReceiptPrintModal
        isOpen={!!selectedReceiptForPrint}
        onClose={() => setSelectedReceiptForPrint(null)}
        receipt={selectedReceiptForPrint}
        companyName={user?.companyName || undefined}
      />
    </div>
  );
};
