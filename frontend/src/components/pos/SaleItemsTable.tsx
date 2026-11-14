import React from 'react';
import { Trash2, AlertTriangle, PackageCheck, AlertCircle } from 'lucide-react';

export interface PosCartItem {
  medicineId: string;
  tradeName: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string; // صيغة YYYY-MM أو ISO
  availableStock: number; // الرصيد المتاح من هذا الباتش
  unitType: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Props {
  items: PosCartItem[];
  onUpdateQuantity: (batchId: string, qty: number) => void;
  onRemoveItem: (batchId: string) => void;
}

export const SaleItemsTable: React.FC<Props> = ({ items, onUpdateQuantity, onRemoveItem }) => {
  // فحص ما إذا كان الدواء قريب الانتهاء (أقل من 90 يوماً)
  const isNearExpiry = (expiryDateStr: string) => {
    if (!expiryDateStr) return false;
    const exp = new Date(expiryDateStr);
    const now = new Date();
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 90;
  };

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm" dir="rtl">
      <table className="w-full text-right text-xs">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
          <tr>
            <th className="py-3 px-3.5">الصنف</th>
            <th className="py-3 px-3.5">التشغيلة (Batch)</th>
            <th className="py-3 px-3.5">تاريخ الانتهاء</th>
            <th className="py-3 px-3.5">المتاح في الرف</th>
            <th className="py-3 px-3.5 w-28">الكمية المطلوبة</th>
            <th className="py-3 px-3.5">السعر</th>
            <th className="py-3 px-3.5">الإجمالي</th>
            <th className="py-3 px-3.5 text-center">إلغاء</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-10 text-center text-slate-400">
                <div className="flex flex-col items-center justify-center gap-2">
                  <PackageCheck size={32} className="text-slate-300" />
                  <p className="font-semibold text-slate-500">لم يتم إضافة أي أدوية بعد</p>
                  <p className="text-[11px] text-slate-400">امسح الباركود بجهاز المسح أو ابحث باسم الدواء لإدراجه فوراً بنظام FEFO</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const nearExpiry = isNearExpiry(item.expiryDate);
              const isOverStock = item.quantity > item.availableStock;

              return (
                <tr key={item.batchId} className="hover:bg-slate-50/80 transition-colors">
                  {/* اسم الدواء */}
                  <td className="py-3 px-3.5 font-bold text-slate-800">
                    {item.tradeName}
                    <span className="mr-1.5 text-[11px] font-normal text-slate-500">
                      ({item.unitType === 'BOX' ? 'علبة' : item.unitType === 'STRIP' ? 'شريط' : item.unitType === 'UNIT' ? 'حبة' : item.unitType})
                    </span>
                  </td>

                  {/* رقم التشغيلة */}
                  <td className="py-3 px-3.5 font-mono text-xs font-semibold text-slate-600">
                    {item.batchNumber || '—'}
                  </td>

                  {/* تاريخ الانتهاء مع شارة التنبيه */}
                  <td className="py-3 px-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono text-xs ${nearExpiry ? 'text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200' : 'text-slate-600'}`}>
                        {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit' }) : '—'}
                      </span>
                      {nearExpiry && (
                        <span title="صلاحية قريبة (أقل من 3 أشهر)" className="text-amber-500 flex items-center">
                          <AlertTriangle size={14} />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* الرصيد المتاح */}
                  <td className="py-3 px-3.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono border ${
                      item.availableStock <= 5
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {item.availableStock} وحدة
                    </span>
                  </td>

                  {/* حقل إدخال الكمية مع التحقق */}
                  <td className="py-3 px-3.5">
                    <div>
                      <input
                        type="number"
                        min="1"
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          onUpdateQuantity(item.batchId, val);
                        }}
                        className={`w-20 border rounded-lg p-1.5 text-center text-xs font-bold font-mono focus:ring-2 focus:outline-none transition-colors ${
                          isOverStock
                            ? 'border-red-500 text-red-600 ring-2 ring-red-100 bg-red-50'
                            : 'border-slate-300 text-slate-800 focus:ring-teal-500/20 focus:border-teal-600 bg-white'
                        }`}
                      />
                      {isOverStock && (
                        <p className="text-[10px] text-red-500 font-semibold mt-0.5 flex items-center gap-0.5">
                          <AlertCircle size={10} /> تجاوز المتاح!
                        </p>
                      )}
                    </div>
                  </td>

                  {/* السعر والإجمالي */}
                  <td className="py-3 px-3.5 font-mono text-slate-700 font-medium">
                    {Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })} <small className="text-[10px] text-slate-400">ج.س</small>
                  </td>
                  <td className="py-3 px-3.5 font-mono font-bold text-teal-700 text-sm">
                    {Number(item.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} <small className="text-[10px] text-slate-400">ج.س</small>
                  </td>

                  {/* زر الحذف */}
                  <td className="py-3 px-3.5 text-center">
                    <button
                      onClick={() => onRemoveItem(item.batchId)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="حذف الصنف من الفاتورة"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
