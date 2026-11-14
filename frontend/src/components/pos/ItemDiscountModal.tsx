import React, { useState, useEffect } from 'react';
import { X, DollarSign, Percent, Trash2, Check, Tag } from 'lucide-react';

interface CartItemLike {
  id: string;
  tradeName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discountAmount?: number;
}

interface Props {
  item: CartItemLike | null;
  isOpen: boolean;
  onClose: () => void;
  onApply: (itemId: string, discountAmount: number) => void;
  onClear: (itemId: string) => void;
}

type Mode = 'amount' | 'percentage';

export const ItemDiscountModal: React.FC<Props> = ({
  item,
  isOpen,
  onClose,
  onApply,
  onClear,
}) => {
  const [mode, setMode] = useState<Mode>('amount');
  const [rawValue, setRawValue] = useState<string>('0');
  const [error, setError] = useState<string>('');

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // إعادة التهيئة عند فتح modal جديد
  useEffect(() => {
    if (isOpen && item) {
      const currentDiscount = item.discountAmount || 0;
      if (currentDiscount > 0) {
        setRawValue(String(currentDiscount));
        setMode('amount');
      } else {
        setRawValue('0');
        setMode('amount');
      }
      setError('');
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const inputValue = Number(rawValue) || 0;
  const lineTotal = item.totalPrice;

  // حساب المبلغ الفعلي
  const computedDiscount =
    mode === 'amount'
      ? inputValue
      : Number(((lineTotal * inputValue) / 100).toFixed(2));

  const finalDiscount = Math.max(0, Math.min(computedDiscount, lineTotal));
  const finalTotal = lineTotal - finalDiscount;

  const handleApply = () => {
    if (inputValue < 0) {
      setError('القيمة لا يمكن أن تكون سالبة');
      return;
    }
    if (mode === 'percentage' && inputValue > 100) {
      setError('النسبة لا يمكن أن تتجاوز 100%');
      return;
    }
    if (mode === 'amount' && inputValue > lineTotal) {
      setError(`المبلغ يتجاوز قيمة البند (${lineTotal.toFixed(2)} ج.س)`);
      return;
    }

    onApply(item.id, finalDiscount);
    onClose();
  };

  const handleClear = () => {
    onClear(item.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─── */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100/80 flex items-center justify-center text-teal-700 shadow-sm">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">خصم خاص على الصنف</h3>
              <p className="text-xs text-slate-500 font-semibold truncate max-w-[220px]">
                {item.tradeName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition"
            title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ─── Body ─── */}
        <div className="p-5 space-y-4">
          {/* معلومات البند */}
          <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs border border-slate-200/80">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">الكمية المباعة:</span>
              <span className="font-mono font-bold text-slate-800">{item.quantity}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">سعر الوحدة:</span>
              <span className="font-mono font-bold text-slate-800">
                {item.unitPrice.toFixed(2)} ج.س
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 pt-1.5 mt-1">
              <span className="text-slate-700 font-bold">إجمالي الصنف قبل الخصم:</span>
              <span className="font-mono font-black text-teal-700 text-sm">
                {lineTotal.toFixed(2)} ج.س
              </span>
            </div>
          </div>

          {/* اختيار النوع: مبلغ أو نسبة */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('amount');
                setRawValue(String(finalDiscount || 0));
                setError('');
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'amount'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-teal-400'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              مبلغ نقدي ثابت
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('percentage');
                setRawValue('0');
                setError('');
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'percentage'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-teal-400'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              نسبة مئوية (%)
            </button>
          </div>

          {/* أزرار سريعة للنسب المئوية */}
          {mode === 'percentage' && (
            <div className="flex items-center gap-1.5">
              {[5, 10, 15, 20, 25, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setRawValue(String(pct));
                    setError('');
                  }}
                  className="flex-1 py-1 text-[11px] font-bold rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition"
                >
                  {pct}%
                </button>
              ))}
            </div>
          )}

          {/* حقل الإدخال */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {mode === 'amount' ? 'قيمة الخصم النقدي (ج.س)' : 'نسبة الخصم المئوية (%)'}
            </label>
            <div className="relative">
              <input
                type="number"
                value={rawValue}
                onChange={(e) => {
                  setRawValue(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApply();
                }}
                min={0}
                max={mode === 'amount' ? lineTotal : 100}
                step={mode === 'amount' ? '0.01' : '1'}
                autoFocus
                className="w-full px-3 py-2.5 border-2 border-slate-300 rounded-xl text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                placeholder="0"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                {mode === 'amount' ? 'ج.س' : '%'}
              </span>
            </div>
          </div>

          {/* Line total preview */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-emerald-700 font-medium">الخصم المحسوب:</span>
              <span className="font-mono font-bold text-emerald-800">
                −{finalDiscount.toFixed(2)} ج.س
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-emerald-200 pt-1.5 mt-1">
              <span className="text-emerald-800 font-bold">الصافي بعد الخصم:</span>
              <span className="font-mono font-black text-emerald-950 text-sm">
                {finalTotal.toFixed(2)} ج.س
              </span>
            </div>
          </div>

          {/* Validation error */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-xs text-rose-700 font-semibold animate-shake">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
          {item.discountAmount && item.discountAmount > 0 ? (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-bold transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف الخصم
            </button>
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Check className="w-4 h-4" />
            تطبيق الخصم
          </button>
        </div>
      </div>
    </div>
  );
};
