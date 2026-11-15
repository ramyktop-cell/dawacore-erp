import React, { useState, useEffect } from 'react';
import { usePlatformBrand } from '../hooks/usePlatformBrand';
import { useBusinessTerminology } from '../hooks/useBusinessTerminology';

interface CartItem {
  id: string;
  tradeName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface DisplayState {
  invoiceNumber: string;
  items: CartItem[];
  subTotal: number;
  discountTotal: number;
  grandTotal: number;
  paidAmount: number;
  changeAmount: number;
  statusText: string;
}

export const CustomerDisplayPage: React.FC = () => {
  const { companyBrand } = usePlatformBrand();
  const terms = useBusinessTerminology();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [data, setData] = useState<DisplayState>({
    invoiceNumber: 'S-2026-00000060',
    items: [],
    subTotal: 0.0,
    discountTotal: 0.0,
    grandTotal: 0.0,
    paidAmount: 0.0,
    changeAmount: 0.0,
    statusText: 'جاري تجهيز الفاتورة',
  });

  // تحديث الساعة والتاريخ
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      setCurrentTime(`${hours}:${minutes} ${day}/${month}/${year}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // قراءة الحالة الابتدائية من التخزين المحلي والاستماع لتحديثات الـ POS
  useEffect(() => {
    // 1. القراءة الفورية عند فتح الشاشة
    const hydrateFromStorage = () => {
      try {
        const savedState = localStorage.getItem('dawacore_customer_display_state');
        if (savedState) {
          const parsed = JSON.parse(savedState);
          setData((prev) => ({ ...prev, ...parsed }));
          return;
        }

        // قراءة بديلة من سلة نقطة البيع المحفوظة
        const rawCart = localStorage.getItem('dawacore-pos-active-cart');
        if (rawCart) {
          const cartState = JSON.parse(rawCart)?.state;
          if (cartState?.items && cartState.items.length > 0) {
            const subTotal = cartState.items.reduce((s: number, i: any) => s + (Number(i.totalPrice) || 0), 0);
            const discount = Number(cartState.discountTotal) || 0;
            const grandTotal = Math.max(0, subTotal - discount);
            setData((prev) => ({
              ...prev,
              items: cartState.items,
              subTotal,
              discountTotal: discount,
              grandTotal,
              statusText: 'جاري تسجيل الأصناف...',
            }));
          }
        }
      } catch (err) {
        console.error('فشل قراءة حالة شاشة العميل:', err);
      }
    };

    hydrateFromStorage();

    // 2. الاستماع عبر BroadcastChannel وطلب المزامنة الفورية من شاشة الكاشير
    const channel = new BroadcastChannel('dawacore_pos_channel');

    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'SYNC_CART') {
        setData((prev) => ({
          ...prev,
          ...event.data.payload,
        }));
      }
    };

    // إرسال طلب مزامنة إلى شاشة نقطة البيع إن كانت مفتوحة
    channel.postMessage({ type: 'REQUEST_SYNC' });

    // 3. الاستماع لتغييرات الـ localStorage لضمان المزامنة عبر النوافذ والشاشات المنفصلة
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dawacore_customer_display_state' && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue);
          setData((prev) => ({ ...prev, ...updated }));
        } catch {}
      } else if (e.key === 'dawacore-pos-active-cart' && e.newValue) {
        hydrateFromStorage();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      channel.close();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const totalItemCount = data.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex h-screen w-full flex-col bg-[#ECEFF1] font-sans text-slate-800 select-none" dir="rtl">
      
      {/* 1. الشريط العلوي البنفسجي العنابي */}
      <header className="flex h-20 items-center justify-between bg-[#532742] px-8 text-white shadow-md">
        {/* بيانات الفاتورة والوقت على اليمين */}
        <div className="flex flex-col justify-center">
          <div className="text-xl font-black tracking-wide">
            فاتورة {data.invoiceNumber}
          </div>
          <div className="text-xs font-mono text-pink-200 mt-0.5">
            {currentTime}
          </div>
        </div>

        {/* هوية الشركة والشعار على اليسار */}
        <div className="flex items-center gap-3">
          <div className="text-left">
            <h1 className="text-2xl font-black tracking-wider leading-none">
              {companyBrand.displayName}
            </h1>
            <p className="text-xs text-pink-200 text-right mt-1">{terms.labelAr}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00A8A8] text-white shadow overflow-hidden">
            <img
              src={companyBrand.logoUrl || '/logo.png'}
              alt={companyBrand.displayName}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </header>

      {/* 2. منطقة العرض المقسمة */}
      <div className="flex flex-1 gap-6 overflow-hidden p-6">
        
        {/* اللوحة اليمنى: كشف الحساب والمبالغ المطلوبة */}
        <div className="flex w-[340px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="text-center">
              <h2 className="text-lg font-black text-slate-700">المبلغ المطلوب</h2>
              <div className="my-2 text-6xl font-black font-mono text-[#532742]">
                {data.grandTotal.toFixed(2)}
              </div>
              <span className="text-xs font-bold text-slate-400">جنيه</span>
            </div>

            {/* تفاصيل المبالغ */}
            <div className="mt-8 space-y-4 text-sm font-bold border-t border-slate-100 pt-6">
              <div className="flex justify-between items-center">
                <span className="font-mono text-base text-slate-800">{data.subTotal.toFixed(2)}</span>
                <span className="text-slate-600">الإجمالي</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="font-mono text-base text-slate-800">{data.discountTotal.toFixed(2)}</span>
                <span className="text-slate-600">الخصم</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="font-mono text-base text-slate-800">{data.paidAmount.toFixed(2)}</span>
                <span className="text-slate-600">المدفوع</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <span className="font-mono text-lg font-black text-[#00A8A8]">
                  {data.changeAmount.toFixed(2)}
                </span>
                <span className="text-[#00A8A8] font-black text-base">الباقي للعميل</span>
              </div>
            </div>
          </div>

          {/* شريط حالة التجهيز السفلي */}
          <div className="rounded-xl bg-[#FEF3C7] py-3 text-center text-sm font-bold text-[#D97706] shadow-sm">
            {data.statusText}
          </div>
        </div>

        {/* اللوحة اليسرى: جدول استعراض المشتريات */}
        <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* ترويسة بطاقة المشتريات */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <span className="rounded-full bg-[#E0F2F1] px-4 py-1 text-xs font-bold text-[#00A8A8]">
              {totalItemCount} صنف
            </span>
            <h3 className="text-lg font-black text-slate-800">مشترياتكم</h3>
          </div>

          {/* عناوين الأعمدة */}
          <div className="grid grid-cols-12 bg-slate-50/70 px-6 py-3 text-sm font-bold text-slate-500 border-b border-slate-100">
            <div className="col-span-6 text-right">{terms.itemSingular}</div>
            <div className="col-span-2 text-center">الكمية</div>
            <div className="col-span-2 text-center">السعر</div>
            <div className="col-span-2 text-left">الإجمالي</div>
          </div>

          {/* جسم الجدول واستعراض السلة */}
          <div className="flex-1 overflow-y-auto px-6 py-2">
            {data.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-slate-300">
                <span className="text-5xl">🛍️</span>
                <p className="text-sm font-semibold text-slate-400 mt-2">أهلاً بكم في {companyBrand.displayNameAr}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 items-center py-3.5 text-sm">
                    <div className="col-span-6 font-bold text-slate-800 text-right">{item.tradeName}</div>
                    <div className="col-span-2 font-mono font-bold text-slate-700 text-center">{item.quantity}</div>
                    <div className="col-span-2 font-mono text-slate-600 text-center">{item.unitPrice.toFixed(2)}</div>
                    <div className="col-span-2 font-mono font-black text-[#532742] text-left">
                      {item.totalPrice.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
