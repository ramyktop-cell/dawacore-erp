import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { balanceSheetApi } from '../../../api/balance-sheet';
import { PageHeader } from '../../../components/common/PageHeader';
import { BalanceTree } from './BalanceTree';
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Building2,
  Wallet,
  Users,
} from 'lucide-react';

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const BalanceSheetPage: React.FC = () => {
  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [compareWithPrevious, setCompareWithPrevious] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['balance-sheet', asOfDate, compareWithPrevious],
    queryFn: () =>
      balanceSheetApi.getReport({
        asOfDate,
        compareWithPrevious: compareWithPrevious ? 'true' : 'false',
      }),
  });

  const handleExportExcel = () => {
    const qs = new URLSearchParams({
      asOfDate,
      compareWithPrevious: compareWithPrevious ? 'true' : 'false',
    }).toString();
    window.open(`/api/reports/balance-sheet/excel?${qs}`, '_blank');
  };

  const handleExportPdf = () => {
    const qs = new URLSearchParams({
      asOfDate,
      compareWithPrevious: compareWithPrevious ? 'true' : 'false',
    }).toString();
    window.open(`/api/reports/balance-sheet/pdf?${qs}`, '_blank');
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen" dir="rtl">
      <PageHeader
        title="الميزانية العمومية (المركز المالي)"
        subtitle="لقطة لحظية للأصول مقابل الخصوم وحقوق الملكية"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm"
              title="تحديث البيانات"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={handleExportExcel}
              disabled={!data}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm"
            >
              <FileSpreadsheet size={16} />
              Excel
            </button>
            <button
              onClick={handleExportPdf}
              disabled={!data}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm"
            >
              <FileText size={16} />
              PDF
            </button>
          </div>
        }
      />

      {/* شريط الفلاتر */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-500" />
          <label className="text-xs font-semibold text-slate-600">
            كما في تاريخ:
          </label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="border border-slate-300 rounded-lg p-1.5 text-sm font-mono focus:ring-2 focus:ring-violet-200"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={compareWithPrevious}
            onChange={(e) => setCompareWithPrevious(e.target.checked)}
            className="rounded border-slate-300 text-violet-600"
          />
          المقارنة مع نفس التاريخ من السنة السابقة
        </label>
      </div>

      {isLoading && (
        <div className="p-12 text-center text-slate-500">
          جاري احتساب المركز المالي...
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* تحذيرات الحسابات المفقودة */}
          {data.meta.warnings && data.meta.warnings.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
              <div className="text-xs text-amber-800">
                {data.meta.warnings.map((w: string, i: number) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            </div>
          )}

          {/* بطاقات المؤشرات الكبرى */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <KpiCard
              label="إجمالي الأصول"
              value={data.assets.totalAssets}
              icon={<Building2 size={20} />}
              color="indigo"
            />
            <KpiCard
              label="إجمالي الخصوم"
              value={data.liabilities.totalLiabilities}
              icon={<Users size={20} />}
              color="rose"
            />
            <KpiCard
              label="إجمالي حقوق الملكية"
              value={data.equity.totalEquity}
              icon={<Wallet size={20} />}
              color="emerald"
            />
          </div>

          {/* حالة التوازن */}
          <div
            className={`mt-4 p-3 rounded-xl flex items-center justify-between border ${
              data.totals.isBalanced
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {data.totals.isBalanced ? (
                <CheckCircle2 size={18} className="text-emerald-600" />
              ) : (
                <AlertTriangle size={18} className="text-rose-600" />
              )}
              <span
                className={`font-bold text-sm ${
                  data.totals.isBalanced ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {data.totals.isBalanced
                  ? '✅ الميزانية العمومية متوازنة'
                  : `❌ عدم توازن بمقدار: ${fmt(data.totals.difference)}`}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-600">
              الأصول: {fmt(data.assets.totalAssets)} | الخصوم + الملكية:{' '}
              {fmt(data.totals.totalLiabilitiesAndEquity)}
            </div>
          </div>

          {/* المقارنة */}
          {data.comparison && (
            <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-700 mb-3">
                المقارنة مع {data.comparison.asOfDate}
              </h3>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <ComparisonCard
                  label="الأصول"
                  data={data.comparison.totalAssets}
                  color="indigo"
                />
                <ComparisonCard
                  label="الخصوم"
                  data={data.comparison.totalLiabilities}
                  color="rose"
                />
                <ComparisonCard
                  label="حقوق الملكية"
                  data={data.comparison.totalEquity}
                  color="emerald"
                />
              </div>
            </div>
          )}

          {/* جدول الميزانية (عمودان) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            {/* الأصول */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-3">
                <h2 className="font-bold text-indigo-800 flex items-center gap-2">
                  <Building2 size={16} />
                  الأصول (الموجودات)
                </h2>
              </div>

              <table className="w-full text-sm">
                <tbody>
                  {/* الأصول المتداولة */}
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <td className="py-2 px-4 font-bold text-slate-700 text-xs">
                      الأصول المتداولة
                    </td>
                    <td className="py-2 px-4 text-left font-mono font-bold text-slate-700 text-xs">
                      {fmt(data.assets.currentAssets.total)}
                    </td>
                  </tr>
                  <BalanceTree
                    items={data.assets.currentAssets.items}
                    side="asset"
                  />

                  {/* الأصول الثابتة */}
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <td className="py-2 px-4 font-bold text-slate-700 text-xs">
                      الأصول الثابتة
                    </td>
                    <td className="py-2 px-4 text-left font-mono font-bold text-slate-700 text-xs">
                      {fmt(data.assets.fixedAssets.total)}
                    </td>
                  </tr>
                  <BalanceTree
                    items={data.assets.fixedAssets.items}
                    side="asset"
                  />

                  {/* الإجمالي */}
                  <tr className="bg-indigo-100 border-t-2 border-indigo-300">
                    <td className="py-3 px-4 font-black text-indigo-900">
                      إجمالي الأصول
                    </td>
                    <td className="py-3 px-4 text-left font-mono font-black text-indigo-900 text-base">
                      {fmt(data.assets.totalAssets)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* الخصوم + حقوق الملكية */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-rose-50 border-b border-rose-200 px-4 py-3">
                <h2 className="font-bold text-rose-800 flex items-center gap-2">
                  <Users size={16} />
                  الخصوم + حقوق الملكية
                </h2>
              </div>

              <table className="w-full text-sm">
                <tbody>
                  {/* الخصوم المتداولة */}
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <td className="py-2 px-4 font-bold text-slate-700 text-xs">
                      الخصوم المتداولة
                    </td>
                    <td className="py-2 px-4 text-left font-mono font-bold text-slate-700 text-xs">
                      {fmt(data.liabilities.currentLiabilities.total)}
                    </td>
                  </tr>
                  <BalanceTree
                    items={data.liabilities.currentLiabilities.items}
                    side="liability"
                  />

                  {/* الخصوم طويلة الأجل */}
                  {data.liabilities.longTermLiabilities.total > 0 && (
                    <>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td className="py-2 px-4 font-bold text-slate-700 text-xs">
                          الخصوم طويلة الأجل
                        </td>
                        <td className="py-2 px-4 text-left font-mono font-bold text-slate-700 text-xs">
                          {fmt(data.liabilities.longTermLiabilities.total)}
                        </td>
                      </tr>
                      <BalanceTree
                        items={data.liabilities.longTermLiabilities.items}
                        side="liability"
                      />
                    </>
                  )}

                  {/* إجمالي الخصوم */}
                  <tr className="bg-rose-100 border-t-2 border-rose-300">
                    <td className="py-3 px-4 font-bold text-rose-900">
                      إجمالي الخصوم
                    </td>
                    <td className="py-3 px-4 text-left font-mono font-bold text-rose-900">
                      {fmt(data.liabilities.totalLiabilities)}
                    </td>
                  </tr>

                  {/* حقوق الملكية */}
                  <tr className="bg-emerald-50 border-b border-emerald-200">
                    <td className="py-2 px-4 font-bold text-emerald-800 text-xs">
                      حقوق الملكية
                    </td>
                    <td className="py-2 px-4 text-left font-mono font-bold text-emerald-800 text-xs">
                      {fmt(data.equity.totalEquity)}
                    </td>
                  </tr>
                  <BalanceTree items={data.equity.items} side="equity" />

                  {/* إجمالي حقوق الملكية */}
                  <tr className="bg-emerald-100 border-t-2 border-emerald-300">
                    <td className="py-3 px-4 font-black text-emerald-900">
                      إجمالي حقوق الملكية
                    </td>
                    <td className="py-3 px-4 text-left font-mono font-black text-emerald-900 text-base">
                      {fmt(data.equity.totalEquity)}
                    </td>
                  </tr>

                  {/* الإجمالي العام */}
                  <tr
                    className={`border-t-4 ${
                      data.totals.isBalanced
                        ? 'bg-emerald-200 border-emerald-500'
                        : 'bg-rose-200 border-rose-500'
                    }`}
                  >
                    <td className="py-3 px-4 font-black text-slate-900 text-base">
                      إجمالي الخصوم + حقوق الملكية
                    </td>
                    <td className="py-3 px-4 text-left font-mono font-black text-slate-900 text-base">
                      {fmt(data.totals.totalLiabilitiesAndEquity)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-slate-400">
            تم الإنشاء بواسطة: {data.meta.generatedBy?.name || 'النظام'} —{' '}
            {new Date(data.meta.generatedAt).toLocaleString('ar-EG')}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================
// KPI Card
// ============================================
const KpiCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'indigo' | 'rose' | 'emerald';
}> = ({ label, value, icon, color }) => {
  const colors = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-600">{label}</span>
        <div className={`p-2 rounded-lg border ${colors[color]}`}>{icon}</div>
      </div>
      <p className={`text-xl font-black font-mono ${colors[color].split(' ')[2]}`}>
        {fmt(value)}
      </p>
    </div>
  );
};

// ============================================
// Comparison Card
// ============================================
const ComparisonCard: React.FC<{
  label: string;
  data: { current: number; previous: number; change: number; changePercent: number };
  color: 'indigo' | 'rose' | 'emerald';
}> = ({ label, data, color }) => {
  const isPositive = data.change >= 0;

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <p className="text-slate-500 text-[10px] mb-1">{label}</p>
      <p className="font-mono font-bold text-slate-800">{fmt(data.current)}</p>
      <div className="flex items-center gap-1 mt-1">
        {isPositive ? (
          <TrendingUp size={12} className="text-emerald-500" />
        ) : (
          <TrendingDown size={12} className="text-rose-500" />
        )}
        <span
          className={`text-[10px] font-mono ${
            isPositive ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {isPositive ? '+' : ''}
          {fmt(data.change)} ({data.changePercent.toFixed(1)}%)
        </span>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        سابقاً: {fmt(data.previous)}
      </p>
    </div>
  );
};
