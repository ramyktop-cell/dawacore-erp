// frontend/src/components/pos/HoldResumeModal.tsx
import React, { useState, useEffect } from 'react';
import { usePosStore } from '../../stores/pos.store';

interface HoldResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HoldResumeModal: React.FC<HoldResumeModalProps> = ({ isOpen, onClose }) => {
  const [heldCarts, setHeldCarts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { cashierId, restoreCart } = usePosStore();

  const fetchHeldCarts = () => {
    setIsLoading(true);
    const url = cashierId && cashierId !== 'null' && cashierId !== 'undefined'
      ? `/api/sales/held-carts?cashierId=${encodeURIComponent(cashierId)}`
      : '/api/sales/held-carts';

    fetch(url)
      .then((res) => res.json())
      .then((data) => setHeldCarts(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('خطأ في جلب الفواتير المعلقة:', err);
        setHeldCarts([]);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchHeldCarts();
    }
  }, [isOpen, cashierId]);

  const handleResume = async (holdId: string) => {
    try {
      const res = await fetch('/api/sales/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdId,
          cashierId: cashierId || 'cashier-1',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const { items, discount, customerId } = data.cartData || {};

        restoreCart(items || [], discount || 0, customerId || null);
        onClose();
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'فشل استرجاع الفاتورة المعلقة');
      }
    } catch (err: any) {
      alert(`خطأ: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[620px] max-h-[85vh] rounded-2xl bg-white p-6 shadow-2xl dir-rtl overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <span>📋</span> الفواتير المعلقة
          </h3>
          <button
            onClick={fetchHeldCarts}
            className="text-xs text-violet-600 hover:text-violet-800 font-bold flex items-center gap-1"
          >
            <span>🔄</span> تحديث
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-slate-500">جاري تحميل الفواتير المعلقة...</div>
        ) : heldCarts.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <p className="text-3xl mb-2">📂</p>
            <p className="text-sm font-semibold">لا توجد فواتير معلقة حالياً في هذا الفرع</p>
          </div>
        ) : (
          <div className="space-y-3">
            {heldCarts.map((cart) => {
              const itemsList = cart.cartData?.items || [];
              const totalAmount = itemsList.reduce((sum: number, it: any) => sum + (it.totalPrice || 0), 0);
              const previewNames = itemsList.slice(0, 3).map((it: any) => it.tradeName).join('، ');

              return (
                <div
                  key={cart.id}
                  className="flex justify-between items-center border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 hover:bg-violet-50/30 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-800">{itemsList.length} أصناف</span>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        {totalAmount.toFixed(2)} ج.س / ج.م
                      </span>
                    </div>
                    {previewNames && (
                      <p className="text-xs text-slate-500 line-clamp-1 mb-1">{previewNames}...</p>
                    )}
                    <p className="text-[11px] text-slate-400 font-mono">
                      {new Date(cart.createdAt).toLocaleString('ar-EG')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleResume(cart.id)}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 transition shadow-sm"
                  >
                    استرجاع الفاتورة
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl border border-slate-300 p-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          إغلاق النافذة
        </button>
      </div>
    </div>
  );
};
