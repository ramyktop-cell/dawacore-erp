import React, { useState } from 'react';
import { AgingPartner } from '../../../api/aging';
import {
  ChevronDown,
  ChevronRight,
  Phone,
  AlertTriangle,
  FileText,
} from 'lucide-react';

interface Props {
  partner: AgingPartner;
  bucketsConfig: { bucket1: number; bucket2: number; bucket3: number };
}

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '-';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const AgingPartnerCard: React.FC<Props> = ({ partner, bucketsConfig }) => {
  const [isOpen, setIsOpen] = useState(false);

  const riskConfig = {
    low: {
      label: 'منخفض',
      icon: '🟢',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-700',
      cardBg: 'bg-emerald-50',
      cardBorder: 'border-emerald-200',
      amountText: 'text-emerald-700',
    },
    medium: {
      label: 'متوسط',
      icon: '🟡',
      badgeBg: 'bg-amber-100',
      badgeText: 'text-amber-700',
      cardBg: 'bg-amber-50',
      cardBorder: 'border-amber-200',
      amountText: 'text-amber-700',
    },
    high: {
      label: 'مرتفع',
      icon: '🟠',
      badgeBg: 'bg-orange-100',
      badgeText: 'text-orange-700',
      cardBg: 'bg-orange-50',
      cardBorder: 'border-orange-200',
      amountText: 'text-orange-700',
    },
    critical: {
      label: 'حرج',
      icon: '🔴',
      badgeBg: 'bg-rose-100',
      badgeText: 'text-rose-700',
      cardBg: 'bg-rose-50',
      cardBorder: 'border-rose-200',
      amountText: 'text-rose-700',
    },
  };

  const risk = riskConfig[partner.riskLevel] || riskConfig.low;

  const bucketLabels = {
    current: `0-${bucketsConfig.bucket1}`,
    days31_60: `${bucketsConfig.bucket1 + 1}-${bucketsConfig.bucket2}`,
    days61_90: `${bucketsConfig.bucket2 + 1}-${bucketsConfig.bucket3}`,
    over90: `+${bucketsConfig.bucket3}`,
  };

  const bucketStyles = [
    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
    { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
    { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* الترويسة */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 cursor-pointer flex items-center gap-4 hover:bg-slate-50 transition-colors"
      >
        {/* أيقونة الطي */}
        <button className="text-slate-400">
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {/* الأيقونة والنوع */}
        <div
          className={`w-10 h-10 rounded-lg ${risk.cardBg} border ${risk.cardBorder} flex items-center justify-center`}
        >
          <span className="text-lg">{risk.icon}</span>
        </div>

        {/* الاسم */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 truncate">
              {partner.partnerName}
            </h3>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {partner.partnerCode}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
            {partner.phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} />
                {partner.phone}
              </span>
            )}
            {partner.oldestInvoiceDays > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle size={11} />
                أقدم فاتورة: {partner.oldestInvoiceDays} يوم
              </span>
            )}
          </div>
        </div>

        {/* الإجمالي */}
        <div className="text-left">
          <p className="text-xs text-slate-500">إجمالي المديونية</p>
          <p className={`text-xl font-black font-mono ${risk.amountText}`}>
            {fmt(partner.currentBalance)} <span className="text-xs font-normal">ج.س</span>
          </p>
        </div>

        {/* شارة المخاطر */}
        <div
          className={`px-3 py-1 rounded-full text-xs font-bold ${risk.badgeBg} ${risk.badgeText}`}
        >
          {risk.label}
        </div>
      </div>

      {/* التوزيع حسب الفئات */}
      <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(Object.keys(partner.buckets) as (keyof typeof partner.buckets)[]).map(
          (key, idx) => {
            const amount = partner.buckets[key];
            const style = bucketStyles[idx];
            return (
              <div
                key={key}
                className={`p-2 rounded-lg border ${
                  amount > 0
                    ? `${style.bg} ${style.border}`
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <p className="text-[10px] text-slate-500">
                  {bucketLabels[key]} يوم
                </p>
                <p
                  className={`text-sm font-black font-mono ${
                    amount > 0 ? style.text : 'text-slate-400'
                  }`}
                >
                  {fmt(amount)}
                </p>
              </div>
            );
          },
        )}
      </div>

      {/* الفواتير (عند التوسيع) */}
      {isOpen && (
        <div className="border-t border-slate-200 bg-slate-50">
          <div className="p-4">
            <h4 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-2">
              <FileText size={12} />
              الفواتير غير المسددة ({partner.invoices.length})
            </h4>
            {partner.invoices.length === 0 ? (
              <p className="text-xs text-slate-400">رصيد دفتري مرحل لا توجد له فواتير تفصيلية معلقة</p>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-right font-semibold text-slate-600">
                        رقم الفاتورة
                      </th>
                      <th className="py-2 px-3 text-center font-semibold text-slate-600">
                        التاريخ
                      </th>
                      <th className="py-2 px-3 text-center font-semibold text-slate-600">
                        الإجمالي
                      </th>
                      <th className="py-2 px-3 text-center font-semibold text-slate-600">
                        المدفوع
                      </th>
                      <th className="py-2 px-3 text-center font-semibold text-slate-600">
                        المتبقي
                      </th>
                      <th className="py-2 px-3 text-center font-semibold text-slate-600">
                        العمر
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {partner.invoices.map((inv) => {
                      const bucketColor =
                        inv.daysOverdue <= bucketsConfig.bucket1
                          ? 'bg-emerald-100 text-emerald-700'
                          : inv.daysOverdue <= bucketsConfig.bucket2
                          ? 'bg-amber-100 text-amber-700'
                          : inv.daysOverdue <= bucketsConfig.bucket3
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-rose-100 text-rose-700';

                      return (
                        <tr key={inv.invoiceId} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-violet-700">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-600">
                            {new Date(inv.invoiceDate).toLocaleDateString('en-GB')}
                          </td>
                          <td className="py-2 px-3 text-center font-mono">
                            {fmt(inv.amount)}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-emerald-600">
                            {fmt(inv.paidAmount)}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-rose-600">
                            {fmt(inv.remainingAmount)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${bucketColor}`}
                            >
                              {inv.daysOverdue} يوم
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
