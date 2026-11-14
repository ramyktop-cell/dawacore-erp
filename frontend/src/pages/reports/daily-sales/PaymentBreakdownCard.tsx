import React from 'react';
import { PaymentBreakdown } from '../../../api/daily-sales';
import { CreditCard, Banknote, Layers, Wallet } from 'lucide-react';

interface PaymentBreakdownCardProps {
  items: PaymentBreakdown[];
}

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const PaymentBreakdownCard: React.FC<PaymentBreakdownCardProps> = ({ items }) => {
  const getMethodIcon = (m: string) => {
    switch (m.toUpperCase()) {
      case 'CASH':
        return <Banknote className="w-4 h-4 text-emerald-600" />;
      case 'CARD':
      case 'BANK':
        return <CreditCard className="w-4 h-4 text-blue-600" />;
      case 'MIXED':
        return <Layers className="w-4 h-4 text-amber-600" />;
      default:
        return <Wallet className="w-4 h-4 text-indigo-600" />;
    }
  };

  const getMethodLabel = (m: string) => {
    switch (m.toUpperCase()) {
      case 'CASH':
        return 'نقداً (Cash)';
      case 'CARD':
        return 'بطاقة / شبكة (Card)';
      case 'BANK':
        return 'تحويل بنكي (Bank Transfer)';
      case 'CREDIT':
        return 'آجل (Credit)';
      case 'MIXED':
        return 'دفع مختلط (Mixed)';
      default:
        return m;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                توزيع طرق الدفع
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                نسب التحصيل لكل قناة مالية
              </p>
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            لا توجد مدفوعات مسجلة
          </div>
        ) : (
          <div className="space-y-3.5">
            {items.map((item) => (
              <div key={item.method} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                    {getMethodIcon(item.method)}
                    <span>{getMethodLabel(item.method)}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {fmt(item.amount)} ر.س
                    </span>
                    <span className="text-slate-400 font-normal">
                      ({item.percentage}%)
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
