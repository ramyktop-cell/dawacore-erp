import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dailySalesApi } from '../../../api/daily-sales';
import { PageHeader } from '../../../components/common/PageHeader';
import { PaymentBreakdownCard } from './PaymentBreakdownCard';
import { CashierPerformanceCard } from './CashierPerformanceCard';
import { TopSoldProductsCard } from './TopSoldProductsCard';
import { HourlySalesChart } from './HourlySalesChart';
import { DailySalesInvoicesTable } from './DailySalesInvoicesTable';
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Receipt,
  Percent,
  RotateCcw,
  Wallet,
} from 'lucide-react';

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const DailySalesPage: React.FC = () => {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['daily-sales', fromDate, toDate, paymentMethod, status],
    queryFn: () =>
      dailySalesApi.getReport({
        fromDate,
        toDate,
        paymentMethod: paymentMethod || undefined,
        status: status || undefined,
      }),
  });

  const handleExportExcel = () => {
    const url = dailySalesApi.exportExcelUrl({
      fromDate,
      toDate,
      paymentMethod: paymentMethod || undefined,
      status: status || undefined,
    });
    window.open(url, '_blank');
  };

  const handleExportPdf = () => {
    const url = dailySalesApi.exportPdfUrl({
      fromDate,
      toDate,
      paymentMethod: paymentMethod || undefined,
      status: status || undefined,
    });
    window.open(url, '_blank');
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6 pb-12 p-6 max-w-7xl mx-auto">
      {/* رأس الصفحة */}
      <PageHeader
        title="تقرير المبيعات اليومية والشاملة"
        subtitle="تحليل مالي فوري للفواتير، المبيعات الصافية، طرق السداد، نشاط الكاشيرين والمنتجات الأكثر طلباً"
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

      {/* شريط الفلاتر */}
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
            <span className="text-xs font-semibold text-slate-500">طريقة الدفع:</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">كل الطرق</option>
              <option value="CASH">نقداً</option>
              <option value="CARD">بطاقة / شبكة</option>
              <option value="BANK">تحويل بنكي</option>
              <option value="CREDIT">آجل</option>
              <option value="MIXED">دفع مختلط</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">الحالة:</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">كل الحالات</option>
              <option value="COMPLETED">مكتملة</option>
              <option value="PARTIAL_RETURN">مرتجع جزئي</option>
              <option value="RETURNED">مرتجعة بالكامل</option>
            </select>
          </div>
        </div>
      </div>

      {/* بطاقات المؤشرات الأساسية (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* صافي المبيعات المحاسبي */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              صافي المبيعات (Net Sales)
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
              {summary ? fmt(summary.netSales) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ر.س</span>
            </p>
          </div>
        </div>

        {/* إجمالي المبيعات قبل الخصم */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              إجمالي المبيعات (Gross)
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
              {summary ? fmt(summary.grossSales) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ر.س</span>
            </p>
          </div>
        </div>

        {/* إجمالي الخصومات */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
            <Percent className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              إجمالي الخصومات
            </p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
              {summary ? fmt(summary.totalDiscounts) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ر.س</span>
            </p>
          </div>
        </div>

        {/* إجمالي المرتجعات */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              إجمالي المرتجعات
            </p>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5 font-mono">
              {summary ? fmt(summary.totalReturns) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ر.س</span>
            </p>
          </div>
        </div>

        {/* إجمالي المحصل الفعلي */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              إجمالي المحصل الفعلي
            </p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
              {summary ? fmt(summary.totalCollected) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ر.س</span>
            </p>
          </div>
        </div>
      </div>

      {/* شبكة البطاقات التفصيلية */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PaymentBreakdownCard items={data?.paymentBreakdown || []} />
        <CashierPerformanceCard items={data?.cashierBreakdown || []} />
        <TopSoldProductsCard items={data?.topProducts || []} />
      </div>

      {/* النشاط الساعي */}
      <HourlySalesChart items={data?.hourlyBreakdown || []} />

      {/* جدول الفواتير التفصيلي */}
      <DailySalesInvoicesTable invoices={data?.invoices || []} isLoading={isLoading} />
    </div>
  );
};
