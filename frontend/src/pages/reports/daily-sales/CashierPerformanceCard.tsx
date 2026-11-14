import React from 'react';
import { CashierSalesSummary } from '../../../api/daily-sales';
import { Users, Receipt, ArrowDownRight, CheckCircle2 } from 'lucide-react';

interface CashierPerformanceCardProps {
  items: CashierSalesSummary[];
}

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const CashierPerformanceCard: React.FC<CashierPerformanceCardProps> = ({ items }) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              أداء الكاشيرين ونقاط البيع
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              حجم مبيعات ومرتجعات كل صيدلي كاشير
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800">
          {items.length} كاشير
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          لا توجد بيانات كاشير مسجلة
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div
              key={c.cashierId}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-100 dark:border-slate-800 flex items-center justify-between"
            >
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {c.cashierName}
                </h4>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Receipt className="w-3 h-3" />
                    {c.invoicesCount} فاتورة
                  </span>
                  {c.returns > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-rose-500 font-medium">
                        مرتجع: {fmt(c.returns)} ر.س
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-left space-y-0.5">
                <span className="text-xs text-slate-400 block">صافي المبيعات</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                  {fmt(c.netTotal)} ر.س
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
