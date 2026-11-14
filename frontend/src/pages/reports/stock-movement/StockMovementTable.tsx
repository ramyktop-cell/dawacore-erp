import React, { useState } from 'react';
import { StockMovementItem } from '../../../api/stock-movement';
import {
  Package,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Search,
} from 'lucide-react';

interface StockMovementTableProps {
  items: StockMovementItem[];
  isLoading?: boolean;
}

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const StockMovementTable: React.FC<StockMovementTableProps> = ({
  items,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const filteredItems = items.filter(
    (i) =>
      i.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.scientificName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.medicineCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.category.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const getClassBadge = (cls: string, label: string) => {
    switch (cls) {
      case 'fast':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            {label}
          </span>
        );
      case 'normal':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            {label}
          </span>
        );
      case 'slow':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            {label}
          </span>
        );
      case 'dead':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            {label}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            {label}
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* شريط البحث والتحكم */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="بحث بالاسم، الكود، أو التصنيف..."
            className="w-full pr-9 pl-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          إجمالي النتائج: <span className="font-bold text-slate-900 dark:text-white">{filteredItems.length}</span> صنف
        </div>
      </div>

      {/* الجدول */}
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 text-center">كود</th>
              <th className="px-4 py-3">اسم الدواء</th>
              <th className="px-3 py-3">التصنيف</th>
              <th className="px-3 py-3 text-left">المخزون الحالي</th>
              <th className="px-3 py-3 text-left">قيمة المخزون</th>
              <th className="px-3 py-3 text-left">مبيعات الفترة</th>
              <th className="px-3 py-3 text-left">قيمة المبيعات</th>
              <th className="px-3 py-3 text-center">معدل يومي</th>
              <th className="px-3 py-3 text-center">أيام التغطية</th>
              <th className="px-3 py-3 text-center">دوران سنوياً</th>
              <th className="px-3 py-3 text-center">حركة الصنف</th>
              <th className="px-4 py-3 text-left">هدر محتمل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={12} className="py-12 text-center text-slate-400">
                  جارٍ تحميل البيانات...
                </td>
              </tr>
            ) : paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-12 text-center text-slate-400">
                  لا توجد نتائج مطابقة
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => (
                <tr
                  key={item.medicineId}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-3 text-center font-mono text-slate-500 text-[11px]">
                    {item.medicineCode}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {item.tradeName}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                      {item.scientificName}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                    {item.category}
                  </td>
                  <td className="px-3 py-3 text-left font-medium">
                    <span
                      className={
                        item.currentStock === 0
                          ? 'text-rose-600 font-bold'
                          : 'text-slate-900 dark:text-white'
                      }
                    >
                      {item.currentStock.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 mr-1">حبة</span>
                  </td>
                  <td className="px-3 py-3 text-left font-mono font-medium text-slate-800 dark:text-slate-200">
                    {fmt(item.stockValue)}
                  </td>
                  <td className="px-3 py-3 text-left font-medium text-slate-800 dark:text-slate-200">
                    {item.totalSoldBaseQty.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-left font-mono font-medium text-slate-800 dark:text-slate-200">
                    {fmt(item.totalSalesValue)}
                  </td>
                  <td className="px-3 py-3 text-center font-mono">
                    {item.dailyConsumption}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        item.daysOfCover >= 9999
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          : item.daysOfCover < 15
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : item.daysOfCover <= 45
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      {item.daysOfCover >= 9999 ? '∞' : `${item.daysOfCover} يوم`}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center font-mono font-semibold">
                    {item.turnoverRatio}x
                  </td>
                  <td className="px-3 py-3 text-center">
                    {getClassBadge(item.movementClass, item.movementLabel)}
                  </td>
                  <td className="px-4 py-3 text-left font-mono">
                    {item.potentialWasteValue > 0 ? (
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        {fmt(item.potentialWasteValue)}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* التصفح الصفحي */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            صفحة {currentPage} من {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
