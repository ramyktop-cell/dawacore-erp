import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agingApi } from '../../../api/aging';
import { PageHeader } from '../../../components/common/PageHeader';
import { AgingPartnerCard } from './AgingPartnerCard';
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Users,
  Building2,
  AlertTriangle,
  TrendingUp,
  DollarSign,
} from 'lucide-react';

type AgingType = 'customers' | 'suppliers';

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const AgingReportPage: React.FC = () => {
  const [type, setType] = useState<AgingType>('customers');
  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [bucket1, setBucket1] = useState(30);
  const [bucket2, setBucket2] = useState(60);
  const [bucket3, setBucket3] = useState(90);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['aging', type, asOfDate, bucket1, bucket2, bucket3],
    queryFn: () =>
      type === 'customers'
        ? agingApi.getCustomers({ asOfDate, bucket1, bucket2, bucket3 })
        : agingApi.getSuppliers({ asOfDate, bucket1, bucket2, bucket3 }),
  });

  const handleExportExcel = () => {
    const qs = new URLSearchParams({
      asOfDate,
      bucket1: String(bucket1),
      bucket2: String(bucket2),
      bucket3: String(bucket3),
    }).toString();
    window.open(`/api/reports/aging/${type}/excel?${qs}`, '_blank');
  };

  const handleExportPdf = () => {
    const qs = new URLSearchParams({
      asOfDate,
      bucket1: String(bucket1),
      bucket2: String(bucket2),
      bucket3: String(bucket3),
    }).toString();
    window.open(`/api/reports/aging/${type}/pdf?${qs}`, '_blank');
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen" dir="rtl">
      <PageHeader
        title="تقرير أعمار الديون (Aging Report)"
        subtitle="تصنيف المديونيات حسب عمر الدين لاتخاذ إجراءات التحصيل"
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

      {/* نوع التقرير */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setType('customers')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            type === 'customers'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
          }`}
        >
          <Users size={16} />
          ديون العملاء (AR)
        </button>
        <button
          onClick={() => setType('suppliers')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            type === 'suppliers'
              ? 'bg-rose-600 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-rose-300'
          }`}
        >
          <Building2 size={16} />
          ديون الموردين (AP)
        </button>
      </div>

      {/* شريط الفلاتر */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-500" />
          <label className="text-xs font-semibold text-slate-600">كما في تاريخ:</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="border border-slate-300 rounded-lg p-1.5 text-sm font-mono focus:ring-2 focus:ring-violet-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">فترات الأعمار:</label>
          <input
            type="number"
            value={bucket1}
            onChange={(e) => setBucket1(Number(e.target.value))}
            className="w-16 border border-slate-300 rounded-lg p-1.5 text-xs font-mono text-center"
          />
          <span className="text-xs text-slate-400">/</span>
          <input
            type="number"
            value={bucket2}
            onChange={(e) => setBucket2(Number(e.target.value))}
            className="w-16 border border-slate-300 rounded-lg p-1.5 text-xs font-mono text-center"
          />
          <span className="text-xs text-slate-400">/</span>
          <input
            type="number"
            value={bucket3}
            onChange={(e) => setBucket3(Number(e.target.value))}
            className="w-16 border border-slate-300 rounded-lg p-1.5 text-xs font-mono text-center"
          />
          <span className="text-xs text-slate-400">يوم</span>
        </div>
      </div>

      {isLoading && (
        <div className="p-12 text-center text-slate-500">
          جاري احتساب أعمار الديون...
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* بطاقات الملخص */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-6">
            <SummaryCard
              label="إجمالي المديونيات"
              value={data.summary.totalBalance}
              icon={<DollarSign size={18} />}
              color="violet"
              highlight
            />
            {data.summary.buckets.map((bucket, idx) => (
              <SummaryCard
                key={idx}
                label={bucket.label}
                value={bucket.amount}
                percentage={bucket.percentage}
                icon={
                  idx === 0 ? (
                    <TrendingUp size={18} />
                  ) : idx === 3 ? (
                    <AlertTriangle size={18} />
                  ) : null
                }
                color={bucket.color}
              />
            ))}
          </div>

          {/* شريط النسب البصرية */}
          <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex h-8 rounded-lg overflow-hidden">
              {data.summary.buckets.map((bucket, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-center text-white text-xs font-bold transition-all"
                  style={{
                    width: `${bucket.percentage}%`,
                    backgroundColor:
                      idx === 0
                        ? '#10B981'
                        : idx === 1
                        ? '#F59E0B'
                        : idx === 2
                        ? '#F97316'
                        : '#DC2626',
                    minWidth: bucket.percentage > 0 ? '40px' : '0',
                  }}
                  title={`${bucket.label}: ${fmt(bucket.amount)} ج.س`}
                >
                  {bucket.percentage > 5 && `${bucket.percentage.toFixed(0)}%`}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              {data.summary.buckets.map((bucket, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        idx === 0
                          ? '#10B981'
                          : idx === 1
                          ? '#F59E0B'
                          : idx === 2
                          ? '#F97316'
                          : '#DC2626',
                    }}
                  />
                  <span>{bucket.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* قائمة الشركاء */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {type === 'customers' ? 'العملاء' : 'الموردون'} المدينون (
                {data.partners.length})
              </h2>
            </div>

            {data.partners.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500 font-medium">
                  🎉 لا توجد مديونيات مستحقة في هذه الفترة
                </p>
              </div>
            ) : (
              data.partners.map((partner) => (
                <AgingPartnerCard
                  key={partner.partnerId}
                  partner={partner}
                  bucketsConfig={data.meta.bucketsConfig}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================
// بطاقة ملخص
// ============================================
const SummaryCard: React.FC<{
  label: string;
  value: number;
  percentage?: number;
  icon?: React.ReactNode;
  color: string;
  highlight?: boolean;
}> = ({ label, value, percentage, icon, color, highlight }) => {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  };

  const c = colorMap[color] || colorMap.violet;

  return (
    <div
      className={`p-3 rounded-xl border ${c.bg} ${c.border} ${highlight ? 'md:col-span-1' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-bold ${c.text}`}>{label}</span>
        {icon && <span className={c.text}>{icon}</span>}
      </div>
      <p className={`text-lg font-black font-mono ${c.text}`}>{fmt(value)}</p>
      {percentage !== undefined && (
        <p className="text-[10px] text-slate-500 mt-0.5">
          {percentage.toFixed(1)}% من الإجمالي
        </p>
      )}
    </div>
  );
};
