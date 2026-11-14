import React from 'react';
import { StockMovementItem } from '../../../api/stock-movement';
import { AlertOctagon, Calendar, DollarSign, PackageX } from 'lucide-react';

interface SlowMoversCardProps {
  items: StockMovementItem[];
}

export const SlowMoversCard: React.FC<SlowMoversCardProps> = ({ items }) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-rose-100 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              الأصناف الراكدة والبطيئة حرجة الهدر
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              أصناف مهددة بالانتهاء أو بركود مالي مرتفع
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-800">
          تحذير ({items.length})
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          ممتاز! لا توجد أصناف راكدة عالية الخطورة حالياً
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.medicineId}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-r-4 border-r-rose-500"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.tradeName}
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      item.movementClass === 'dead'
                        ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {item.movementLabel}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>المخزون: {item.currentStock.toLocaleString()} حبة</span>
                  <span>•</span>
                  <span>
                    آخر بيع:{' '}
                    {item.daysSinceLastSale >= 999
                      ? 'لا يوجد'
                      : `منذ ${item.daysSinceLastSale} يوم`}
                  </span>
                  {item.nearestExpiryDate && (
                    <>
                      <span>•</span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        ينتهي: {item.nearestExpiryDate.slice(0, 10)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-left space-y-0.5">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">
                  هدر محتمل
                </span>
                <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                  {item.potentialWasteValue.toLocaleString('en-US', {
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
