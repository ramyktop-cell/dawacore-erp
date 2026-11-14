import React from 'react';
import { TopMoverItem } from '../../../api/stock-movement';
import { TrendingUp, Award, DollarSign, Package } from 'lucide-react';

interface TopMoversCardProps {
  items: TopMoverItem[];
}

export const TopMoversCard: React.FC<TopMoversCardProps> = ({ items }) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              الأصناف الأكثر حركة (Top Movers)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              الأعلى مبيعاً بالوحدات خلال الفترة المحددة
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800">
          Top {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          لا توجد مبيعات مسجلة في هذه الفترة
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
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      {item.totalSoldBaseQty.toLocaleString()} حبة
                    </span>
                    <span>•</span>
                    <span>معدل {item.dailyConsumption}/يوم</span>
                  </div>
                </div>
              </div>

              <div className="text-left">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {item.totalSalesValue.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  ر.س
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
