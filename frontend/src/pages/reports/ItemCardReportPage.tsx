import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { branchesApi, Branch } from '../../api/branches';
import { itemCardApi, StockCardResponse, BranchStockItemLookup } from '../../api/item-card';
import { PageHeader } from '../../components/common/PageHeader';
import {
  Search,
  Calendar,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Building2,
  Clock,
  Filter,
  AlertCircle,
  FileText,
} from 'lucide-react';
import * as ExcelJS from 'exceljs';

const TRANSACTION_BADGES: Record<
  string,
  { label: string; bg: string; text: string; border: string; sign: 'in' | 'out' | 'none' }
> = {
  PURCHASE: {
    label: 'توريد شراء',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    sign: 'in',
  },
  SALE: {
    label: 'فاتورة مبيعات',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    sign: 'out',
  },
  SALE_RETURN: {
    label: 'مرتجع مبيعات',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    sign: 'in',
  },
  PURCHASE_RETURN: {
    label: 'مرتجع مشتريات',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800',
    sign: 'out',
  },
  TRANSFER_IN: {
    label: 'تحويل وارد',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    sign: 'in',
  },
  TRANSFER_OUT: {
    label: 'تحويل صادر',
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800',
    sign: 'out',
  },
  INVENTORY_ADJUSTMENT: {
    label: 'تسوية جردية',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-700',
    sign: 'none',
  },
  DAMAGE: {
    label: 'تالف / هالك',
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
    sign: 'out',
  },
  DAMAGED_RETURN: {
    label: 'مرتجع تالف',
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-800',
    sign: 'in',
  },
};

const formatQty = (v: number) => {
  if (v == null || isNaN(v)) return '0';
  return Number(v).toLocaleString('ar-EG', { maximumFractionDigits: 3 });
};

export const ItemCardReportPage: React.FC = () => {
  // نطاق التاريخ الافتراضي: أول الشهر الحالي حتى اليوم
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultTo = now.toISOString().split('T')[0];

  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedMedicineId, setSelectedMedicineId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);
  const [page, setPage] = useState<number>(1);

  // جلب الفروع
  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => branchesApi.getAll({ limit: 100 }),
  });

  const branches: Branch[] = branchesData?.items || branchesData || [];

  // تعيين أول فرع تلقائياً
  useEffect(() => {
    if (branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  // جلب قائمة الأصناف في الفرع المختار
  const { data: itemsLookup, isLoading: isLookupLoading } = useQuery({
    queryKey: ['branch-items-lookup', selectedBranchId, searchQuery],
    queryFn: () => itemCardApi.searchItems(selectedBranchId, searchQuery),
    enabled: !!selectedBranchId,
  });

  const items: BranchStockItemLookup[] = itemsLookup || [];

  // تعيين أول صنف تلقائياً عند تغيير الفرع إذا لم يكن محدداً
  useEffect(() => {
    if (items.length > 0 && !selectedMedicineId) {
      setSelectedMedicineId(items[0].id);
    }
  }, [items, selectedMedicineId]);

  // جلب كرت الصنف
  const {
    data: stockCard,
    isLoading: isLedgerLoading,
    isFetching,
    refetch,
    error,
  } = useQuery<StockCardResponse>({
    queryKey: ['item-stock-card', selectedBranchId, selectedMedicineId, fromDate, toDate, page],
    queryFn: () =>
      itemCardApi.getLedger({
        branchId: selectedBranchId,
        medicineId: selectedMedicineId,
        from: fromDate,
        to: toDate,
        page,
      }),
    enabled: !!selectedBranchId && !!selectedMedicineId,
  });

  // تعيين الفترات السريعة
  const handleQuickRange = (type: 'today' | 'week' | 'month' | 'year') => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (type === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (type === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    } else if (type === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    } else if (type === 'year') {
      const d = new Date(now.getFullYear(), 0, 1);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    }
    setPage(1);
  };

  // تصدير Excel
  const handleExportExcel = async () => {
    if (!stockCard) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('كرت حركة الصنف');
    worksheet.views = [{ rightToLeft: true }];

    worksheet.addRow(['تقرير كرت حركة المخزن (كارت الصنف)']);
    worksheet.addRow([`المخزن / الفرع: ${stockCard.branch.name} (${stockCard.branch.code})`]);
    worksheet.addRow([`الصنف: ${stockCard.medicine.tradeName} | الكود: ${stockCard.medicine.code}`]);
    worksheet.addRow([`الفترة: من ${stockCard.from} إلى ${stockCard.to} | الوحدة: ${stockCard.unit}`]);
    worksheet.addRow([]);

    worksheet.addRow([
      'الرصيد الافتتاحي (قبل الفترة)',
      stockCard.opening,
      'إجمالي الوارد',
      stockCard.incoming,
      'إجمالي المنصرف',
      stockCard.outgoing,
      'الرصيد الختامي',
      stockCard.closing,
    ]);
    worksheet.addRow([]);

    const headers = [
      '#',
      'التاريخ والوقت',
      'نوع العملية',
      'رقم المرجع / الفاتورة',
      'لمن الحركة (عميل / مورد / جهة)',
      'رقم الدفعة / التشغيلة',
      'الوارد (+)',
      'المنصرف (-)',
      'الرصيد بعد الحركة',
      'ملاحظات',
    ];
    worksheet.addRow(headers);

    stockCard.items.forEach((item, index) => {
      const badge = TRANSACTION_BADGES[item.transactionType] || { label: item.transactionType };
      worksheet.addRow([
        index + 1,
        new Date(item.createdAt).toLocaleString('ar-EG'),
        badge.label,
        item.referenceId || '-',
        item.partyName || '-',
        item.batchNumber || '-',
        item.incoming > 0 ? item.incoming : 0,
        item.outgoing > 0 ? item.outgoing : 0,
        item.balance,
        item.notes || '-',
      ]);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `كارت_صنف_${stockCard.medicine.code}_${stockCard.from}_${stockCard.to}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-16" dir="rtl">
      {/* إخفاء عناصر التحكم عند الطباعة */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-stock-card, #print-stock-card * {
            visibility: visible;
          }
          #print-stock-card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* رأس الصفحة */}
      <div className="no-print">
        <PageHeader
          title="كرت المخزن / حركة الصنف التفصيلية (Stock Movement Card)"
          subtitle="تتبع كرت حركة الصنف، الرصيد الافتتاحي، الوارد والمنصرف، وأطراف الحركات (العملاء والموردين والفروع) مع الرصيد التراكمي"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-teal-600' : ''}`} />
                <span>تحديث</span>
              </button>

              <button
                onClick={handleExportExcel}
                disabled={!stockCard || isFetching}
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 shadow-sm transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>

              <button
                onClick={handlePrint}
                disabled={!stockCard || isFetching}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-xl hover:bg-teal-700 shadow-sm transition-colors disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الكرت</span>
              </button>
            </div>
          }
        />
      </div>

      {/* شريط الفلاتر والاختيار */}
      <div className="no-print bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* المخزن / الفرع */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              المخزن / الفرع
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setSelectedMedicineId('');
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-slate-50 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* الصنف مع بحث */}
          <div className="md:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-teal-600" />
              الصنف المطلوب
            </label>
            <select
              value={selectedMedicineId}
              onChange={(e) => {
                setSelectedMedicineId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-slate-50 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
            >
              <option value="">-- اختر الصنف لعرض حركته --</option>
              {items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code ? `[${m.code}] ` : ''}
                  {m.tradeName}
                </option>
              ))}
            </select>
          </div>

          {/* من تاريخ */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              من تاريخ
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 p-2 text-sm bg-slate-50 focus:bg-white focus:border-teal-500 outline-none"
            />
          </div>

          {/* إلى تاريخ */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              إلى تاريخ
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 p-2 text-sm bg-slate-50 focus:bg-white focus:border-teal-500 outline-none"
            />
          </div>

          {/* بحث نصي سريع لتصفية الأصناف */}
          <div className="md:col-span-1">
            <button
              type="button"
              onClick={() => refetch()}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-xs"
            >
              عرض
            </button>
          </div>
        </div>

        {/* فلاتر سريعة للفترة */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-medium">فترة سريعة:</span>
          <button
            type="button"
            onClick={() => handleQuickRange('today')}
            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
          >
            اليوم
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('week')}
            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
          >
            آخر 7 أيام
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('month')}
            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-teal-700 bg-teal-50"
          >
            هذا الشهر
          </button>
          <button
            type="button"
            onClick={() => handleQuickRange('year')}
            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
          >
            هذا العام
          </button>

          {/* تصفية الأصناف بالبحث */}
          <div className="mr-auto flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="تصفية قائمة الأصناف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs outline-none w-36"
            />
          </div>
        </div>
      </div>

      {/* رسالة الخطأ إن وجدت */}
      {error && (
        <div className="no-print p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{(error as any)?.response?.data?.message || (error as any)?.message || 'حدث خطأ أثناء جلب كرت الصنف'}</span>
        </div>
      )}

      {/* منطقة التقرير القابلة للطباعة والعرض */}
      <div id="print-stock-card" className="space-y-6">
        {/* ترويسة التقرير الرسمية للطباعة */}
        <div className="border-b-2 border-slate-800 pb-4 flex justify-between items-start">
          <div>
            <div className="text-xl font-black text-slate-900">
              تقرير كرت حركة المخزن (كارت الصنف)
            </div>
            <div className="text-sm font-semibold text-teal-700 mt-1">
              المخزن: {stockCard?.branch.name} — كود الفرع: {stockCard?.branch.code}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              الفترة من: <span className="font-bold text-slate-800">{fromDate}</span> إلى:{' '}
              <span className="font-bold text-slate-800">{toDate}</span>
            </div>
          </div>

          <div className="text-left space-y-1">
            <div className="inline-block px-3 py-1 bg-slate-100 rounded-lg border border-slate-300 text-xs font-mono font-bold text-slate-800">
              {stockCard?.medicine.code ? `كود: ${stockCard?.medicine.code}` : 'صنف مخزني'}
            </div>
            <div className="text-base font-bold text-slate-900">
              {stockCard?.medicine.tradeName}
            </div>
            <div className="text-xs text-slate-500">
              الوحدة الأساسية: <span className="font-bold text-teal-700">{stockCard?.unit || 'وحدة'}</span>
            </div>
          </div>
        </div>

        {/* بطاقات المؤشرات الرئيسية (فوق الرصيد الافتتاحي - KPI Cards) */}
        {stockCard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* الرصيد الافتتاحي */}
            <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between text-blue-600 mb-2">
                <span className="text-xs font-bold text-slate-600">الرصيد الافتتاحي (قبل الفترة)</span>
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-blue-700 tracking-tight">
                {formatQty(stockCard.opening)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                الكمية المتوفرة حتى تاريخ {fromDate}
              </p>
            </div>

            {/* إجمالي الوارد */}
            <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between text-emerald-600 mb-2">
                <span className="text-xs font-bold text-slate-600">إجمالي الوارد (+)</span>
                <ArrowDownLeft className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-emerald-700 tracking-tight">
                +{formatQty(stockCard.incoming)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                توريدات شراء + مرتجعات بيع + تحويلات واردة
              </p>
            </div>

            {/* إجمالي المنصرف */}
            <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between text-rose-600 mb-2">
                <span className="text-xs font-bold text-slate-600">إجمالي المنصرف (-)</span>
                <ArrowUpRight className="w-5 h-5 text-rose-500" />
              </div>
              <div className="text-2xl font-black text-rose-700 tracking-tight">
                -{formatQty(stockCard.outgoing)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                مبيعات + مرتجعات شراء + تحويلات صادرة + تالف
              </p>
            </div>

            {/* الرصيد الختامي */}
            <div className="bg-white rounded-2xl p-4 border border-teal-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-teal-50/40 to-white">
              <div className="flex items-center justify-between text-teal-600 mb-2">
                <span className="text-xs font-bold text-slate-700">الرصيد الختامي (الرصيد الحالي)</span>
                <Scale className="w-5 h-5 text-teal-600" />
              </div>
              <div className="text-2xl font-black text-teal-800 tracking-tight">
                {formatQty(stockCard.closing)}
              </div>
              <p className="text-[11px] text-teal-600 font-medium mt-1">
                الرصيد التراكمي في المخزن حتى {toDate}
              </p>
            </div>
          </div>
        )}

        {/* تنبيه إذا كان الرصيد مستنتجاً */}
        {stockCard?.openingReconstructed && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              ملاحظة: الرصيد الافتتاحي مستنتج من الرصيد الفعلي الحالي والحركات؛ راجع الأرصدة الافتتاحية المسجلة.
            </span>
          </div>
        )}

        {/* جدول حركات كرت الصنف */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-600" />
              سجل حركات كرت الصنف (بيان تفصيلي بكل حركة)
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              إجمالي عدد الحركات: <b>{stockCard?.total || 0}</b> حركة
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase font-bold text-[11px]">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-3">التاريخ والوقت</th>
                  <th className="py-3 px-3">نوع العملية</th>
                  <th className="py-3 px-3">رقم المرجع / الفاتورة</th>
                  <th className="py-3 px-3">لمن الحركة (عميل / مورد / جهة)</th>
                  <th className="py-3 px-3">رقم التشغيلة (Batch)</th>
                  <th className="py-3 px-3 text-center text-emerald-700">الوارد (+)</th>
                  <th className="py-3 px-3 text-center text-rose-700">المنصرف (-)</th>
                  <th className="py-3 px-3 text-center bg-slate-200/60 font-black text-slate-900">
                    الرصيد
                  </th>
                  <th className="py-3 px-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* سطر الرصيد الافتتاحي */}
                {stockCard && (
                  <tr className="bg-blue-50/40 font-bold border-b border-blue-100">
                    <td className="py-3 px-3 text-center text-blue-600">-</td>
                    <td className="py-3 px-3 text-blue-900">{fromDate} (00:00)</td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-bold">
                        رصيد افتتاحي
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">OPENING</td>
                    <td className="py-3 px-3 text-slate-600">رصيد أول المدة</td>
                    <td className="py-3 px-3 text-slate-400">-</td>
                    <td className="py-3 px-3 text-center text-slate-400">-</td>
                    <td className="py-3 px-3 text-center text-slate-400">-</td>
                    <td className="py-3 px-3 text-center font-black text-blue-800 bg-blue-100/50">
                      {formatQty(stockCard.opening)}
                    </td>
                    <td className="py-3 px-3 text-slate-500 text-[11px]">
                      الرصيد المتوفر قبل تاريخ البداية
                    </td>
                  </tr>
                )}

                {/* الحركات التفصيلية */}
                {isLedgerLoading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
                        <span>جاري تحميل سجل حركات كرت الصنف...</span>
                      </div>
                    </td>
                  </tr>
                ) : !stockCard || stockCard.items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      لا توجد أي حركات مسجلة لهذا الصنف خلال الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  stockCard.items.map((item, idx) => {
                    const badge = TRANSACTION_BADGES[item.transactionType] || {
                      label: item.transactionType,
                      bg: 'bg-slate-50',
                      text: 'text-slate-700',
                      border: 'border-slate-200',
                    };

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors font-medium text-slate-700"
                      >
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">
                          {(page - 1) * stockCard.pageSize + idx + 1}
                        </td>
                        <td className="py-3 px-3 text-slate-800 whitespace-nowrap font-mono text-[11px]">
                          {new Date(item.createdAt).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}{' '}
                          <span className="text-slate-400">
                            {new Date(item.createdAt).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {item.referenceId || '-'}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-800">
                          {item.partyName || '-'}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600">
                          {item.batchNumber || '-'}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-emerald-700 font-mono">
                          {item.incoming > 0 ? `+${formatQty(item.incoming)}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-rose-700 font-mono">
                          {item.outgoing > 0 ? `-${formatQty(item.outgoing)}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-center font-black text-slate-900 bg-slate-50 font-mono">
                          {formatQty(item.balance)}
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-[11px] max-w-xs truncate" title={item.notes || ''}>
                          {item.notes || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ترقيم الصفحات (Pagination) */}
          {stockCard && stockCard.total > stockCard.pageSize && (
            <div className="no-print p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div>
                عرض صفحة <b>{stockCard.page}</b> من{' '}
                <b>{Math.ceil(stockCard.total / stockCard.pageSize)}</b>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
                >
                  السابق
                </button>
                <button
                  type="button"
                  disabled={page * stockCard.pageSize >= stockCard.total}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>

        {/* تذييل وتوقيعات الطباعة الرسمية */}
        <div className="hidden print:flex justify-between items-center pt-8 border-t border-slate-300 text-xs font-bold text-slate-700">
          <div className="text-center w-40">
            <p>أمين المخزن</p>
            <div className="mt-8 border-b border-dashed border-slate-400"></div>
          </div>
          <div className="text-center w-40">
            <p>المحاسب المالي</p>
            <div className="mt-8 border-b border-dashed border-slate-400"></div>
          </div>
          <div className="text-center w-40">
            <p>مدير الفرع / الصيدلية</p>
            <div className="mt-8 border-b border-dashed border-slate-400"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
