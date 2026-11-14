import React from 'react';
import { TopProductItem } from '../../../api/daily-sales';
import { TrendingUp, Package } from 'lucide-react';

interface TopSoldProductsCardProps {
  items: TopProductItem[];
}

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const TopSoldProductsCard: React.FC<TopSoldProductsCardProps> = ({ items }) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              المنتجات الأكثر مبيعاً
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              أعلى 10 أصناف حسب القيمة الإجمالية للمبيعات
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800">
          Top {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          لا توجد مبيعات أصناف مسجلة
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={item.medicineId}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                    idx === 0
                      ? 'bg-amber-400 text-slate-900 shadow-sm'
                      : idx === 1
                      ? 'bg-slate-300 text-slate-800'
                      : idx === 2
                      ? 'bg-amber-700 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {idx + 1}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.tradeName}
                  </h4>
                  <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <Package className="w-3 h-3" />
                    <span>{item.totalQuantity.toLocaleString()} وحدة مباعة</span>
                  </div>
                </div>
              </div>

              <div className="text-left">
                <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                  {fmt(item.totalSales)} ر.س
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
