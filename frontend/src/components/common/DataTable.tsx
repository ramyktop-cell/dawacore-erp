import React from 'react';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
}

export function DataTable<T extends { id?: string }>({
  data,
  columns,
  isLoading,
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        جارٍ تحميل البيانات...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        لا توجد بيانات مسجلة حالياً
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs border-collapse">
        <thead>
          <tr className="border-b bg-slate-50 text-slate-600 font-bold">
            {columns.map((col, idx) => (
              <th key={idx} className={`py-3.5 px-4 ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-medium">
          {data.map((item, rowIdx) => (
            <tr
              key={item.id || rowIdx}
              onClick={() => onRowClick && onRowClick(item)}
              className={`hover:bg-slate-50/80 transition ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {columns.map((col, colIdx) => (
                <td key={colIdx} className={`py-3.5 px-4 ${col.className || ''}`}>
                  {typeof col.accessor === 'function'
                    ? col.accessor(item)
                    : (item[col.accessor] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
