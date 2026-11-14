import React, { useState } from 'react';
import { DailySalesInvoice } from '../../../api/daily-sales';
import { Search, ChevronLeft, ChevronRight, Receipt } from 'lucide-react';

interface DailySalesInvoicesTableProps {
  invoices: DailySalesInvoice[];
  isLoading?: boolean;
}

const fmt = (v: number) => {
  if (Math.abs(v) < 0.01) return '0.00';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const DailySalesInvoicesTable: React.FC<DailySalesInvoicesTableProps> = ({
  invoices,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.cashierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalPages = Math.ceil(filteredInvoices.length / pageSize) || 1;
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Search Header */}
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
            placeholder="بحث برقم الفاتورة، الكاشير، أو العميل..."
            className="w-full pr-9 pl-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          إجمالي الفواتير: <span className="font-bold text-slate-900 dark:text-white">{filteredInvoices.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3">رقم الفاتورة</th>
              <th className="px-4 py-3">التاريخ والوقت</th>
              <th className="px-3 py-3">الكاشير</th>
              <th className="px-3 py-3">العميل</th>
              <th className="px-3 py-3 text-center">طريقة الدفع</th>
              <th className="px-3 py-3 text-left">المجموع</th>
              <th className="px-3 py-3 text-left">الخصم</th>
              <th className="px-3 py-3 text-left">الإجمالي الصافي</th>
              <th className="px-3 py-3 text-left">المدفوع</th>
              <th className="px-3 py-3 text-center">الحالة</th>
              <th className="px-4 py-3 text-center">البنود</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400">
                  جارٍ تحميل الفواتير...
                </td>
              </tr>
            ) : paginatedInvoices.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400">
                  لا توجد فواتير مطابقة
                </td>
              </tr>
            ) : (
              paginatedInvoices.map((inv) => (
                <tr
                  key={inv.saleId}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {inv.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                    {inv.createdAt.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-900 dark:text-white">
                    {inv.cashierName}
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                    {inv.customerName}
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {inv.paymentMethod}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-left font-mono">
                    {fmt(inv.subTotal)}
                  </td>
                  <td className="px-3 py-3 text-left font-mono text-slate-400">
                    {inv.discountTotal > 0 ? fmt(inv.discountTotal) : '-'}
                  </td>
                  <td className="px-3 py-3 text-left font-mono font-bold text-slate-900 dark:text-white">
                    {fmt(inv.grandTotal)}
                  </td>
                  <td className="px-3 py-3 text-left font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    {fmt(inv.paidAmount)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        inv.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : inv.status === 'RETURNED'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      {inv.status === 'COMPLETED'
                        ? 'مكتملة'
                        : inv.status === 'RETURNED'
                        ? 'مرتجعة'
                        : inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">
                    {inv.itemsCount}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
