import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { batchesApi, Batch } from '../api/batches';
import { branchesApi } from '../api/branches';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import { BatchFormModal } from '../components/batches/BatchFormModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { BarcodeLabelModal } from '../components/common/BarcodeLabelModal';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Snowflake,
  CheckCircle2,
  Calendar,
  Building2,
  PackageCheck,
  RefreshCw,
  Printer,
} from 'lucide-react';

export const BatchesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<'ALL' | 'EXPIRING_SOON' | 'EXPIRED' | 'VALID'>('ALL');
  const [page, setPage] = useState(1);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<Batch | null>(null);
  const [labelBatch, setLabelBatch] = useState<Batch | null>(null);

  const queryClient = useQueryClient();

  // Queries
  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup-batches-page'],
    queryFn: () => branchesApi.getAll({ limit: 50 }),
  });
  const branches = branchesData?.items || [];

  const { data, isLoading } = useQuery({
    queryKey: ['batches', { search, branchId, expiryFilter, page }],
    queryFn: () =>
      batchesApi.getAll({
        search: search || undefined,
        branchId: branchId || undefined,
        expiryFilter,
        page,
        limit: 12,
      }),
  });

  // Mutations
  const createOrUpdateMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingBatch) {
        return batchesApi.update(editingBatch.id, payload);
      }
      return batchesApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      setIsModalOpen(false);
      setEditingBatch(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'فشل حفظ التشغيلة';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });

  const toggleFreezeMutation = useMutation({
    mutationFn: (id: string) => batchesApi.toggleFreeze(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      alert(res.message);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'فشل تحديث حالة تجميد التشغيلة';
      alert(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => batchesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setIsDeleteDialogOpen(false);
      setBatchToDelete(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'لا يمكن حذف التشغيلة لوجود مبيعات مرتبطة بها';
      alert(msg);
    },
  });

  const getExpiryBadge = (item: Batch) => {
    const expDate = new Date(item.expiryDate).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    if (item.isExpired) {
      return (
        <div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            منتهية الصلاحية
          </span>
          <span className="font-mono text-xs text-rose-700 block mt-1">{expDate}</span>
        </div>
      );
    }

    if (item.isExpiringSoon) {
      return (
        <div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5" />
            وشيكة الانتهاء ({item.daysRemaining} يوم)
          </span>
          <span className="font-mono text-xs text-amber-700 block mt-1">{expDate}</span>
        </div>
      );
    }

    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          صالحة ({item.daysRemaining} يوم)
        </span>
        <span className="font-mono text-xs text-slate-500 block mt-1">{expDate}</span>
      </div>
    );
  };

  const columns = [
    {
      header: 'رقم التشغيلة',
      accessor: (item: Batch) => (
        <div>
          <span className="font-mono font-bold text-sm text-[#582949] dark:text-pink-300 block">
            {item.batchNumber}
          </span>
          <span className="text-[11px] text-slate-400">
            أضيفت: {new Date(item.createdAt).toLocaleDateString('ar-EG')}
          </span>
        </div>
      ),
    },
    {
      header: 'الصنف الدوائي',
      accessor: (item: Batch) => (
        <div className="max-w-xs">
          <div className="font-bold text-sm text-slate-800 dark:text-white">
            {item.medicine?.tradeName || 'دواء غير محدد'}
          </div>
          <div className="text-xs text-slate-400 font-mono">
            {item.medicine?.barcode} • {item.medicine?.code}
          </div>
        </div>
      ),
    },
    {
      header: 'الفرع',
      accessor: (item: Batch) => (
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {item.branchName || 'الفرع الرئيسي'}
        </span>
      ),
    },
    {
      header: 'تاريخ الصلاحية (FEFO)',
      accessor: (item: Batch) => getExpiryBadge(item),
    },
    {
      header: 'الرصيد المتاح (الوحدة الأساسية)',
      accessor: (item: Batch) => (
        <div>
          <span
            className={`font-mono text-base font-bold ${
              item.quantityInBase <= 0 ? 'text-slate-400' : 'text-slate-800 dark:text-white'
            }`}
          >
            {item.quantityInBase.toLocaleString()} {item.medicine?.isWeighed ? 'جرام' : 'وحدة'}
          </span>
        </div>
      ),
    },
    {
      header: 'التكلفة والبيع',
      accessor: (item: Batch) => (
        <div className="text-xs font-mono">
          <div>
            <span className="text-slate-400">تكلفة: </span>
            <span className="font-bold text-slate-600 dark:text-slate-300">
              {item.costPrice.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-slate-400">بيع: </span>
            <span className="font-bold text-teal-600 dark:text-teal-400">
              {item.salePrice.toFixed(2)} ج.م
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'الحالة الرقابية',
      accessor: (item: Batch) =>
        item.isFrozen ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Snowflake className="w-3.5 h-3.5" />
            مجمدة / معزولة
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700">
            نشطة للبيع
          </span>
        ),
    },
    {
      header: 'إجراءات',
      accessor: (item: Batch) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setLabelBatch(item)}
            className="p-1.5 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition"
            title="طباعة ملصق باركود وصلاحية للتشغيلة"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleFreezeMutation.mutate(item.id)}
            className={`p-1.5 rounded-lg transition ${
              item.isFrozen
                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title={item.isFrozen ? 'فك تجميد التشغيلة وإعادتها للبيع' : 'تجميد التشغيلة وعزلها'}
          >
            <Snowflake className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setEditingBatch(item);
              setIsModalOpen(true);
            }}
            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
            title="تعديل التشغيلة"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setBatchToDelete(item);
              setIsDeleteDialogOpen(true);
            }}
            className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
            title="حذف التشغيلة"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const stats = data?.stats || {
    totalBatches: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    frozenCount: 0,
    totalUnitsInStock: 0,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="الدفعات وتواريخ الصلاحية FEFO (Batches & Expiry)"
        subtitle="متابعة تواريخ انتهاء الصلاحية وفق أولوية الصرف FEFO (الأقرب انتهاءً أولاً)، وعزل التشغيلات المعيبة"
        action={
          <button
            onClick={() => {
              setEditingBatch(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-[#00A8A8] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#009292] transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة تشغيلة ورصيد جديد</span>
          </button>
        }
      />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">إجمالي التشغيلات</div>
            <div className="text-2xl font-black text-slate-800 dark:text-white mt-0.5">
              {stats.totalBatches}
            </div>
          </div>
        </div>

        <div
          onClick={() => setExpiryFilter('EXPIRING_SOON')}
          className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 cursor-pointer transition ${
            expiryFilter === 'EXPIRING_SOON'
              ? 'border-amber-500 bg-amber-50/50'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-amber-400'
          }`}
        >
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">وشيكة الانتهاء (&lt; 90 يوم)</div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">
              {stats.expiringSoonCount}
            </div>
          </div>
        </div>

        <div
          onClick={() => setExpiryFilter('EXPIRED')}
          className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 cursor-pointer transition ${
            expiryFilter === 'EXPIRED'
              ? 'border-rose-500 bg-rose-50/50'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-rose-400'
          }`}
        >
          <div className="p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">منتهية الصلاحية</div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
              {stats.expiredCount}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
            <Snowflake className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">تشغيلات مجمدة / معزولة</div>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-0.5">
              {stats.frozenCount}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="بحث برقم التشغيلة، اسم الصنف الدوائي أو الباركود..."
            className="w-full pl-4 pr-10 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none transition"
          />
        </div>

        <div className="sm:w-56">
          <select
            value={expiryFilter}
            onChange={(e) => {
              setExpiryFilter(e.target.value as any);
              setPage(1);
            }}
            className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none transition cursor-pointer font-medium"
          >
            <option value="ALL">جميع التشغيلات</option>
            <option value="EXPIRING_SOON">وشيكة الانتهاء فقط (&lt; 90 يوم)</option>
            <option value="EXPIRED">منتهية الصلاحية فقط</option>
            <option value="VALID">صالحة (أكثر من 3 أشهر)</option>
          </select>
        </div>

        <div className="sm:w-56">
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setPage(1);
            }}
            className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none transition cursor-pointer font-medium"
          >
            <option value="">جميع الفروع</option>
            {branches.map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden p-4">
        <DataTable
          columns={columns}
          data={data?.items || []}
          isLoading={isLoading}
        />

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-4 mt-4 text-xs">
            <span className="text-slate-500">
              الصفحة {page} من {data.totalPages} ({data.total} تشغيلة مسجلة)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 font-bold"
              >
                السابق
              </button>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 font-bold"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Batch Modal */}
      <BatchFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingBatch(null);
        }}
        onSubmit={(payload) => createOrUpdateMutation.mutate(payload)}
        batch={editingBatch}
        isLoading={createOrUpdateMutation.isPending}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setBatchToDelete(null);
        }}
        onConfirm={() => {
          if (batchToDelete) {
            deleteMutation.mutate(batchToDelete.id);
          }
        }}
        title="حذف تشغيلة"
        message={`هل أنت متأكد من حذف التشغيلة (${batchToDelete?.batchNumber}) للصنف (${batchToDelete?.medicine?.tradeName})؟ لا يمكن التراجع إذا كانت هناك حركات بيع مرتبطة.`}
        confirmText="حذف التشغيلة"
        cancelText="إلغاء"
        variant="danger"
      />

      {/* Barcode Label Print Modal */}
      <BarcodeLabelModal
        isOpen={!!labelBatch}
        onClose={() => setLabelBatch(null)}
        item={
          labelBatch
            ? {
                tradeName: labelBatch.medicine?.tradeName || 'صنف دوائي',
                scientificName: labelBatch.medicine?.scientificName,
                barcode: labelBatch.medicine?.barcode || labelBatch.batchNumber,
                defaultPrice: Number(labelBatch.salePrice || 0),
                batchNumber: labelBatch.batchNumber,
                expiryDate: labelBatch.expiryDate,
              }
            : null
        }
      />
    </div>
  );
};
