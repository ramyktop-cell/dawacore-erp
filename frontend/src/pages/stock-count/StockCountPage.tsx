import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { stockCountApi, StockCount } from '../../api/stock-count';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable } from '../../components/common/DataTable';
import { StartCountModal } from '../../components/stock-count/StartCountModal';
import { Plus, Eye, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export const StockCountPage: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['stock-counts', { page, status: statusFilter }],
    queryFn: () =>
      stockCountApi.getAll({
        page,
        limit: 10,
        status: statusFilter || undefined,
      }),
  });

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
      DRAFT: { label: 'مسودة', color: 'bg-slate-100 text-slate-700', icon: <Clock size={12} /> },
      IN_PROGRESS: { label: 'جاري العد', color: 'bg-amber-100 text-amber-700', icon: <Clock size={12} /> },
      RECONCILED: { label: 'بانتظار الاعتماد', color: 'bg-blue-100 text-blue-700', icon: <AlertTriangle size={12} /> },
      APPROVED: { label: 'معتمد', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={12} /> },
      CANCELLED: { label: 'ملغي', color: 'bg-rose-100 text-rose-700', icon: <XCircle size={12} /> },
    };
    const badge = badges[status] || badges.DRAFT;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
        {badge.icon}
        {badge.label}
      </span>
    );
  };

  const columns = [
    {
      header: 'رقم المحضر',
      accessor: (item: StockCount) => (
        <span className="font-mono font-bold text-violet-700">{item.countNumber}</span>
      ),
    },
    {
      header: 'الفرع',
      accessor: (item: StockCount) => item.branch?.name || '-',
    },
    {
      header: 'نوع الجرد',
      accessor: (item: StockCount) => (
        <span className="text-xs px-2 py-0.5 rounded bg-slate-100">
          {item.countType === 'FULL' ? 'شامل' : 'جزئي'}
        </span>
      ),
    },
    {
      header: 'عدد الأصناف',
      accessor: (item: StockCount) => item._count?.items || 0,
    },
    {
      header: 'قيمة العجز',
      accessor: (item: StockCount) => (
        <span className={Number(item.totalShortage) > 0 ? 'text-rose-600 font-semibold font-mono' : 'text-slate-400 font-mono'}>
          {Number(item.totalShortage).toLocaleString()} ج.س
        </span>
      ),
    },
    {
      header: 'قيمة الفائض',
      accessor: (item: StockCount) => (
        <span className={Number(item.totalSurplus) > 0 ? 'text-emerald-600 font-semibold font-mono' : 'text-slate-400 font-mono'}>
          {Number(item.totalSurplus).toLocaleString()} ج.س
        </span>
      ),
    },
    {
      header: 'الحالة',
      accessor: (item: StockCount) => getStatusBadge(item.status),
    },
    {
      header: 'التاريخ',
      accessor: (item: StockCount) => new Date(item.startedAt).toLocaleDateString('ar-EG'),
    },
    {
      header: 'الإجراءات',
      accessor: (item: StockCount) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/stock-count/${item.id}`);
          }}
          className="p-1.5 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors cursor-pointer"
          title="عرض التفاصيل ومتابعة الجرد"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  return (
    <div className="p-6" dir="rtl">
      <PageHeader
        title="الجرد الدوري والمطابقة المخزنية"
        subtitle="إدارة وتتبع محاضر الجرد، حظر تضارب المخزون، واعتماد التسويات المحاسبية"
        action={
          <button
            onClick={() => setIsStartModalOpen(true)}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-medium cursor-pointer"
          >
            <Plus size={18} /> بدء جرد جديد
          </button>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white cursor-pointer"
        >
          <option value="">جميع الحالات</option>
          <option value="IN_PROGRESS">جاري العد</option>
          <option value="RECONCILED">بانتظار الاعتماد</option>
          <option value="APPROVED">معتمد</option>
          <option value="CANCELLED">ملغي</option>
        </select>
      </div>

      <div className="mt-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable data={data?.items || []} columns={columns} isLoading={isLoading} />

        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100">
          <span className="text-sm text-slate-500">إجمالي المحاضر: {data?.total || 0}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 text-sm rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50 cursor-pointer"
            >
              السابق
            </button>
            <span className="px-3 py-1 text-sm">{page}</span>
            <button
              disabled={!data?.items || data.items.length < 10}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 text-sm rounded border border-slate-300 disabled:opacity-50 hover:bg-slate-50 cursor-pointer"
            >
              التالي
            </button>
          </div>
        </div>
      </div>

      <StartCountModal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        onSuccess={(stockCountId: string) => {
          queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
          navigate(`/stock-count/${stockCountId}`);
        }}
      />
    </div>
  );
};
