import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { medicinesApi, Medicine, UnitType } from '../api/medicines';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import { MedicineFormModal } from '../components/medicines/MedicineFormModal';
import { OdooImportModal } from '../components/medicines/OdooImportModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { BarcodeLabelModal } from '../components/common/BarcodeLabelModal';
import { useBusinessTerminology } from '../hooks/useBusinessTerminology';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Package,
  Layers,
  Sparkles,
  Tag,
  Boxes,
  RotateCcw,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const MedicinesPage: React.FC = () => {
  const navigate = useNavigate();
  const terms = useBusinessTerminology();
  const isPharmacy = terms.type === 'PHARMACY';
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [page, setPage] = useState(1);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOdooImportOpen, setIsOdooImportOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [medicineToDelete, setMedicineToDelete] = useState<Medicine | null>(null);
  const [labelMedicine, setLabelMedicine] = useState<Medicine | null>(null);

  const queryClient = useQueryClient();

  // Queries
  const { data: categoriesData = [] } = useQuery({
    queryKey: ['medicines-categories'],
    queryFn: medicinesApi.getCategories,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['medicines', { search, category, page }],
    queryFn: () =>
      medicinesApi.getAll({
        search: search || undefined,
        category: category === 'ALL' ? undefined : category,
        page,
        limit: 12,
      }),
  });

  // Mutations
  const createOrUpdateMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingMedicine) {
        return medicinesApi.update(editingMedicine.id, payload);
      }
      return medicinesApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      queryClient.invalidateQueries({ queryKey: ['medicines-categories'] });
      setIsModalOpen(false);
      setEditingMedicine(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'فشل حفظ الصنف';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => medicinesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      setIsDeleteDialogOpen(false);
      setMedicineToDelete(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'لا يمكن حذف الصنف لوجود تشغيلات أو حركات مرتبطة';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });

  const handleCopyBarcode = (bCode: string) => {
    navigator.clipboard.writeText(bCode);
    setCopiedBarcode(bCode);
    setTimeout(() => setCopiedBarcode(null), 2000);
  };

  const getUnitTypeBadge = (u: any) => {
    let label = u.label || terms.units.PIECE;
    let color = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

    if (u.label) {
      label = u.multiplier > 1 ? `${u.label} (${u.multiplier})` : u.label;
      if (u.unitType === 'BOX') {
        color = 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300';
      } else if (u.unitType === 'STRIP') {
        color = 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300';
      }
    } else if (u.unitType === 'BOX') {
      label = `${terms.units.BOX} (${u.multiplier} ${terms.units.baseUnitPlural})`;
      color = 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300';
    } else if (u.unitType === 'STRIP') {
      label = `${terms.units.STRIP} (${u.multiplier} ${terms.units.baseUnitPlural})`;
      color = 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300';
    }

    return (
      <span
        key={u.id || u.unitType}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border ${color}`}
      >
        <span>{label}:</span>
        <span className="font-mono font-bold text-slate-900 dark:text-white">
          {Number(u.price).toFixed(2)} ج.م
        </span>
        {u.isDefault && (
          <span className="text-[10px] bg-teal-600 text-white px-1 rounded">افتراضي</span>
        )}
      </span>
    );
  };

  const columns = [
    {
      header: 'كود وباركود الصنف',
      accessor: (item: Medicine) => (
        <div>
          <span className="font-mono font-bold text-teal-700 dark:text-teal-400 text-xs block">
            {item.code}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {item.barcode}
            </span>
            <button
              onClick={() => handleCopyBarcode(item.barcode)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition text-slate-400"
              title="نسخ الباركود"
            >
              {copiedBarcode === item.barcode ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      ),
    },
    {
      header: isPharmacy ? 'الاسم التجاري والعلمي' : 'اسم الصنف',
      accessor: (item: Medicine) => (
        <div className="max-w-xs">
          <div className="font-bold text-sm text-slate-800 dark:text-white leading-tight">
            {item.tradeName}
          </div>
          <>{isPharmacy && <div className="text-xs text-slate-400 leading-snug mt-0.5 truncate">
            {item.scientificName}
          </div>}</>
        </div>
      ),
    },
    {
      header: terms.categoryLabel,
      accessor: (item: Medicine) => (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-50 dark:bg-pink-950/40 text-[#582949] dark:text-pink-300 border border-pink-200 dark:border-pink-900/50">
          <Tag className="w-3 h-3" />
          {item.category}
        </span>
      ),
    },
    {
      header: 'وحدات القياس والتسعير',
      accessor: (item: Medicine) => (
        <div className="flex flex-wrap gap-1.5 max-w-sm">
          {item.units.map(getUnitTypeBadge)}
        </div>
      ),
    },
    {
      header: 'إجمالي المخزون (الوحدة الأساسية)',
      accessor: (item: Medicine) => {
        const isLow = item.totalStockInBase <= item.minStockLevel;
        return (
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={`font-mono text-base font-bold ${
                  item.totalStockInBase === 0
                    ? 'text-slate-400'
                    : isLow
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {item.totalStockInBase.toLocaleString()} {item.isWeighed ? 'جرام' : 'وحدة'}
              </span>
              {isLow && item.totalStockInBase > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded border border-rose-200 font-bold">
                  حد الطلب
                </span>
              )}
              {item.totalStockInBase === 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">
                  نفد الرصيد
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 block">
              حد الطلب الأدنى: {item.minStockLevel}
            </span>
          </div>
        );
      },
    },
    {
      header: 'إجراءات',
      accessor: (item: Medicine) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setLabelMedicine(item)}
            className="p-1.5 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition"
            title="طباعة ملصق باركود حراري"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setEditingMedicine(item);
              setIsModalOpen(true);
            }}
            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
            title="تعديل بيانات الدواء والوحدات"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setMedicineToDelete(item);
              setIsDeleteDialogOpen(true);
            }}
            className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
            title="حذف الصنف"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title={terms.catalogPageTitle}
        subtitle={terms.catalogPageSubtitle}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsOdooImportOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-[#582949] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#481D3E] transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-300" />
              <span>استيراد من Odoo / Excel</span>
            </button>
            <button
              onClick={() => {
                setEditingMedicine(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-[#00A8A8] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#009292] transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{terms.addNewItemButton}</span>
            </button>
          </div>
        }
      />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">إجمالي الأصناف المسجلة</div>
            <div className="text-2xl font-black text-slate-800 dark:text-white mt-0.5">
              {data?.total || 0}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-pink-50 dark:bg-pink-900/30 text-[#582949] dark:text-pink-400 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">{terms.categoryLabel}</div>
            <div className="text-2xl font-black text-slate-800 dark:text-white mt-0.5">
              {categoriesData.length}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">أصناف تحت حد الطلب</div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">
              {data?.items.filter((i) => i.isLowStock).length || 0}
            </div>
          </div>
        </div>

        <div
          onClick={() => navigate('/batches')}
          className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center gap-4 cursor-pointer hover:border-teal-500 transition"
        >
          <div className="p-3 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-xl">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-semibold">إدارة التشغيلات والصلاحية</div>
            <div className="text-xs font-bold text-teal-600 mt-1 flex items-center gap-1">
              <span>عرض الدفعات FEFO</span>
              <span>←</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
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
            placeholder={isPharmacy ? 'بحث بالاسم التجاري، العلمي، كود الصنف أو مسح الباركود...' : 'بحث باسم الصنف، كود الصنف أو مسح الباركود...'}
            className="w-full pl-4 pr-10 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none transition"
          />
        </div>

        <div className="sm:w-64">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none transition cursor-pointer"
          >
            <option value="ALL">جميع التصنيفات</option>
            {categoriesData.map((c) => (
              <option key={c} value={c}>
                {c}
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
              الصفحة {page} من {data.totalPages} ({data.total} صنف مسجل)
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

      {/* Create / Edit Modal */}
      <MedicineFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingMedicine(null);
        }}
        onSubmit={(payload) => createOrUpdateMutation.mutate(payload)}
        medicine={editingMedicine}
        categories={categoriesData}
        isLoading={createOrUpdateMutation.isPending}
        onOpenExisting={(med) => {
          setEditingMedicine(med);
        }}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setMedicineToDelete(null);
        }}
        onConfirm={() => {
          if (medicineToDelete) {
            deleteMutation.mutate(medicineToDelete.id);
          }
        }}
        title={isPharmacy ? 'حذف صنف دوائي' : 'حذف صنف'}
        message={`هل أنت متأكد من رغبتك في حذف الصنف (${medicineToDelete?.tradeName})؟ لن يتم الحذف إذا كانت هناك فواتير أو تشغيلات مرتبطة به.`}
        confirmText="حذف الصنف"
        cancelText="إلغاء"
        variant="danger"
      />

      {/* Barcode Label Print Modal */}
      <BarcodeLabelModal
        isOpen={!!labelMedicine}
        onClose={() => setLabelMedicine(null)}
        item={
          labelMedicine
            ? {
                tradeName: labelMedicine.tradeName,
                scientificName: labelMedicine.scientificName,
                barcode: labelMedicine.barcode,
                defaultPrice: Number(labelMedicine.units?.[0]?.price || 0),
                units: labelMedicine.units,
              }
            : null
        }
      />

      {/* Odoo / Excel Bulk Import Modal */}
      <OdooImportModal
        isOpen={isOdooImportOpen}
        onClose={() => setIsOdooImportOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['medicines'] });
          queryClient.invalidateQueries({ queryKey: ['medicines-categories'] });
          queryClient.invalidateQueries({ queryKey: ['batches'] });
        }}
      />
    </div>
  );
};
