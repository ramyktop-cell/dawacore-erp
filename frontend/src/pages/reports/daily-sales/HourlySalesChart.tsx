import React from 'react';
import { HourlySales } from '../../../api/daily-sales';
import { Clock } from 'lucide-react';

interface HourlySalesChartProps {
  items: HourlySales[];
}

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const HourlySalesChart: React.FC<HourlySalesChartProps> = ({ items }) => {
  const maxSales = Math.max(...items.map((i) => i.totalSales), 1);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-100 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              النشاط الساعي وحركة الذروة (24 ساعة)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              توزيع المبيعات وعدد الفواتير على مدار اليوم
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 sm:grid-cols-24 gap-1.5 items-end h-40 pt-6 pb-2">
        {items.map((h) => {
          const heightPercent = Math.max(5, (h.totalSales / maxSales) * 100);
          const hasSales = h.totalSales > 0;

          return (
            <div
              key={h.hour}
              className="flex flex-col items-center h-full justify-end group relative"
            >
              {/* Tooltip */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 pointer-events-none bg-slate-900 text-white text-[10px] py-1 px-2 rounded-lg whitespace-nowrap shadow-lg">
                <p className="font-bold">{h.hourLabel}</p>
                <p>{fmt(h.totalSales)} ر.س ({h.invoicesCount} فاتورة)</p>
              </div>

              {/* Bar */}
              <div
                className={`w-full rounded-t-md transition-all duration-300 ${
                  hasSales
                    ? 'bg-indigo-500 group-hover:bg-indigo-600 dark:bg-indigo-600'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
                style={{ height: `${heightPercent}%` }}
              />

              {/* Label */}
              <span className="text-[9px] text-slate-400 mt-1 font-mono">
                {String(h.hour).padStart(2, '0')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
