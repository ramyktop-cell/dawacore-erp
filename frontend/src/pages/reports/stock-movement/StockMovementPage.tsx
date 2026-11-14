import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { stockMovementApi } from '../../../api/stock-movement';
import { PageHeader } from '../../../components/common/PageHeader';
import { MovementClassTab } from './MovementClassTab';
import { TopMoversCard } from './TopMoversCard';
import { SlowMoversCard } from './SlowMoversCard';
import { StockMovementTable } from './StockMovementTable';
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Boxes,
  TrendingUp,
  AlertOctagon,
  Activity,
  Filter,
} from 'lucide-react';

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const StockMovementPage: React.FC = () => {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [movementClass, setMovementClass] = useState<
    'all' | 'fast' | 'normal' | 'slow' | 'dead'
  >('all');
  const [hideZeroStock, setHideZeroStock] = useState('false');
  const [sortBy, setSortBy] = useState('daysOfCover');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stock-movement', fromDate, toDate, movementClass, hideZeroStock, sortBy],
    queryFn: () =>
      stockMovementApi.getReport({
        fromDate,
        toDate,
        movementClass,
        hideZeroStock,
        sortBy,
      }),
  });

  const handleExportExcel = () => {
    const url = stockMovementApi.exportExcelUrl({
      fromDate,
      toDate,
      movementClass,
      hideZeroStock,
      sortBy,
    });
    window.open(url, '_blank');
  };

  const handleExportPdf = () => {
    const url = stockMovementApi.exportPdfUrl({
      fromDate,
      toDate,
      movementClass,
      hideZeroStock,
      sortBy,
    });
    window.open(url, '_blank');
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6 pb-12">
      {/* رأس الصفحة */}
      <PageHeader
        title="تقرير حركة الأصناف والبطء والرواكد"
        subtitle="تحليل معدلات استهلاك الأدوية، فترات التغطية، سرعة الدوران، والتنبؤ بالرواكد وقيم الهدر المحتملة"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/60 shadow-sm transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel</span>
            </button>

            <button
              onClick={handleExportPdf}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/60 shadow-sm transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>PDF</span>
            </button>
          </div>
        }
      />

      {/* شريط الفلاتر والإعدادات */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> من:
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> إلى:
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> الترتيب:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="daysOfCover">أيام التغطية (الأقل أولاً)</option>
              <option value="movementRate">معدل الاستهلاك (الأعلى أولاً)</option>
              <option value="currentStock">المخزون الحالي (الأعلى أولاً)</option>
              <option value="turnoverRatio">نسبة الدوران (الأعلى أولاً)</option>
              <option value="totalSales">إجمالي المبيعات (الأعلى أولاً)</option>
              <option value="medicineName">اسم الدواء (أبجدياً)</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideZeroStock === 'true'}
              onChange={(e) => setHideZeroStock(e.target.checked ? 'true' : 'false')}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              إخفاء الرصيد الصفري
            </span>
          </label>
        </div>
      </div>

      {/* بطاقات المؤشرات الرئيسية (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* إجمالي قيمة المخزون */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              إجمالي قيمة المخزون
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              {summary ? fmt(summary.totalStockValue) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ر.س</span>
            </p>
          </div>
        </div>

        {/* تكلفة البضاعة المباعة في الفترة */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              تكلفة المبيعات (COGS)
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              {summary ? fmt(summary.totalCogs) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ر.س</span>
            </p>
          </div>
        </div>

        {/* القيمة المعرضة للهدر */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              قيمة الهدر المحتمل (رواكد / منتهي)
            </p>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">
              {summary ? fmt(summary.potentialWasteValue) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ر.س</span>
            </p>
          </div>
        </div>

        {/* معدل الدوران السنوي */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              متوسط معدل الدوران السنوي
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              {summary?.avgTurnoverRatio || 0}{' '}
              <span className="text-xs font-normal text-slate-400">مرة/سنة</span>
            </p>
          </div>
        </div>
      </div>

      {/* بطاقات الأكثر والأبطأ حركة */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopMoversCard items={data?.topMovers || []} />
        <SlowMoversCard items={data?.slowMovers || []} />
      </div>

      {/* تبويبات الفلترة حسب سرعة الحركة */}
      <MovementClassTab
        currentTab={movementClass}
        onTabChange={(t) => setMovementClass(t)}
        summary={summary}
      />

      {/* جدول حركة الأصناف الرئيسي */}
      <StockMovementTable items={data?.items || []} isLoading={isLoading} />
    </div>
  );
};
