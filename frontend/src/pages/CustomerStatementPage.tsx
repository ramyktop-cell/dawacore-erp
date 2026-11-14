import React, { useState, useEffect } from 'react';

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  currentBalance?: number;
}

export const CustomerStatementPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [fromDate, setFromDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [statement, setStatement] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // تحميل قائمة العملاء
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async (query = '') => {
    try {
      const res = await fetch(`/api/reports/customers?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
        if (!selectedCustomerId && data.length > 0) {
          setSelectedCustomerId(data[0].id);
          setCustomerSearchQuery(`${data[0].name} (${data[0].code})`);
        }
      }
    } catch (e) {
      console.error('Failed to load customers', e);
    }
  };

  const handleSearchChange = (val: string) => {
    setCustomerSearchQuery(val);
    setShowDropdown(true);
    fetchCustomers(val);
  };

  const handleSelectCustomer = (c: CustomerOption) => {
    setSelectedCustomerId(c.id);
    setCustomerSearchQuery(`${c.name} (${c.code})`);
    setShowDropdown(false);
  };

  const fetchStatement = async () => {
    if (!selectedCustomerId) {
      alert('يرجى اختيار العميل أولاً');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/customer-statement?customerId=${selectedCustomerId}&from=${fromDate}&to=${toDate}`
      );
      if (res.ok) {
        const data = await res.json();
        setStatement(data);
      } else {
        const errData = await res.json();
        setError(errData.message || 'فشل جلب كشف الحساب');
      }
    } catch (e: any) {
      setError(e.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!selectedCustomerId || !statement) return;
    try {
      setIsDownloadingPdf(true);
      const res = await fetch(
        `/api/reports/customer-statement/pdf?customerId=${selectedCustomerId}&from=${fromDate}&to=${toDate}`
      );
      if (!res.ok) throw new Error('فشل تحميل ملف PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف_حساب_${statement.customer.name.replace(/\s+/g, '_')}_${fromDate}_${toDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تصدير ملف PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleWhatsAppShare = () => {
    if (!statement) return;
    const text = `*كشف حساب صيدلية DawaCore*%0A` +
      `*العميل:* ${statement.customer.name}%0A` +
      `*الفترة من:* ${statement.period.from} *إلى:* ${statement.period.to}%0A` +
      `*الرصيد الافتتاحي:* ${statement.openingBalance} ج.س%0A` +
      `*إجمالي المبيعات/المدين:* ${statement.totalDebit} ج.س%0A` +
      `*إجمالي السداد/الدائن:* ${statement.totalCredit} ج.س%0A` +
      `*الرصيد النهائي المستحق:* ${statement.closingBalance} ج.س`;
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 font-sans text-slate-800 print:bg-white print:p-0" dir="rtl">
      {/* شريط التنقل العلوي */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#582949] p-4 text-white shadow-lg print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl font-black">
            📊
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide">DawaCore | التقارير المالية والذمم</h1>
            <p className="text-xs text-white/70">كشف حساب العملاء التفصيلي (CSTDTLST) والأرصدة التراكمية</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="rounded-xl bg-white/15 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/25"
          >
            🛒 نقطة البيع (POS)
          </a>
          <a
            href="/customer-screen"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-[#009E9E] px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-[#008A8A]"
          >
            🖥️ شاشة العميل
          </a>
        </div>
      </div>

      {/* بطاقة التصفية العلوية */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <h2 className="mb-4 text-lg font-black text-[#582949]">تحديد معايير كشف الحساب</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* حقل اختيار العميل مع بحث منسدل */}
          <div className="relative">
            <label className="mb-1 block text-xs font-bold text-slate-600">اختيار العميل:</label>
            <input
              type="text"
              placeholder="ابحث بالاسم أو الكود..."
              value={customerSearchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold text-slate-800 focus:border-[#009E9E] focus:outline-none"
            />
            {showDropdown && customers.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                {customers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    className="cursor-pointer border-b border-slate-100 p-2.5 text-xs hover:bg-slate-50"
                  >
                    <span className="font-bold text-[#582949]">{c.name}</span>
                    <span className="mr-2 text-[11px] text-slate-400 font-mono">({c.code})</span>
                    {c.phone && <span className="mr-2 text-[10px] text-slate-500">📞 {c.phone}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">من تاريخ:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono focus:border-[#009E9E] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">إلى تاريخ:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono focus:border-[#009E9E] focus:outline-none"
            />
          </div>

          <button
            onClick={fetchStatement}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#009E9E] py-2.5 px-6 text-sm font-bold text-white shadow transition hover:bg-[#008A8A] disabled:opacity-50"
          >
            {isLoading ? 'جارٍ التحميل...' : '⚡ عرض التقرير'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* نتائج التقرير */}
      {statement && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-none print:shadow-none print:p-0">
          {/* ترويسة رسمية للطباعة الورقية فقط */}
          <div className="hidden print:block mb-6 text-center border-b-2 border-slate-800 pb-4">
            <h1 className="text-2xl font-black text-slate-900">مجموعة صيدليات داواكور العالمية</h1>
            <h2 className="text-base font-bold text-slate-700 mt-1">كشف حساب عميل تفصيلي (CSTDTLST)</h2>
            <div className="mt-2 text-xs text-slate-600 flex justify-between px-2">
              <span>العميل: <strong className="font-bold text-black">{statement.customer.name}</strong></span>
              <span>كود / هاتف: <strong className="font-mono text-black">{statement.customer.phone || statement.customer.code}</strong></span>
              <span>الفترة من: <strong className="font-mono text-black">{statement.period.from}</strong> إلى: <strong className="font-mono text-black">{statement.period.to}</strong></span>
            </div>
          </div>

          {/* ترويسة الكشف في واجهة المستخدم */}
          <div className="flex flex-wrap justify-between items-start border-b border-slate-200 pb-4 mb-4 gap-4 print:hidden">
            <div>
              <h2 className="text-xl font-black text-[#582949]">{statement.customer.name}</h2>
              <p className="mt-1 text-xs text-slate-500">
                كود العميل: <span className="font-mono font-bold text-slate-700">{statement.customer.code}</span> | 
                الهاتف: <span className="font-mono text-slate-700">{statement.customer.phone || 'غير مسجل'}</span> | 
                سقف الائتمان: <span className="font-mono font-bold text-amber-700">{statement.customer.creditLimit} ج.س</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportPdf}
                disabled={isDownloadingPdf}
                className="rounded-xl bg-[#009E9E] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#008A8A] shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                📄 {isDownloadingPdf ? 'جارٍ التحميل...' : 'تصدير PDF'}
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-xl bg-[#582949] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#481D3E] shadow-sm"
              >
                🖨️ طباعة الكشف
              </button>
              <button
                onClick={handleWhatsAppShare}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-sm"
              >
                📲 مشاركة واتساب
              </button>
            </div>
          </div>

          {/* شريط الأرصدة الإحصائي */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 rounded-2xl bg-[#F8FAFC] p-4 text-center border border-slate-100">
            <div className="border-l border-slate-200 last:border-l-0">
              <span className="block text-[11px] font-bold text-slate-400">الرصيد الافتتاحي</span>
              <span className="text-lg font-black font-mono text-slate-700">{statement.openingBalance} <span className="text-xs font-normal">ج.س</span></span>
            </div>
            <div className="border-l border-slate-200 last:border-l-0">
              <span className="block text-[11px] font-bold text-slate-400">إجمالي المدين (مشتريات/فواتير)</span>
              <span className="text-lg font-black font-mono text-rose-600">+{statement.totalDebit} <span className="text-xs font-normal">ج.س</span></span>
            </div>
            <div className="border-l border-slate-200 last:border-l-0">
              <span className="block text-[11px] font-bold text-slate-400">إجمالي الدائن (سدادات/دفعات)</span>
              <span className="text-lg font-black font-mono text-emerald-600">-{statement.totalCredit} <span className="text-xs font-normal">ج.س</span></span>
            </div>
            <div>
              <span className="block text-[11px] font-bold text-slate-400">الرصيد النهائي المستحق</span>
              <span className="text-2xl font-black font-mono text-[#009E9E]">{statement.closingBalance} <span className="text-sm font-normal">ج.س</span></span>
            </div>
          </div>

          {/* جدول الحركات */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-xs">
              <thead>
                <tr className="border-b bg-slate-100/70 text-slate-600">
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3">رقم القيد / السند</th>
                  <th className="py-3 px-3">النوع</th>
                  <th className="py-3 px-3">البيان</th>
                  <th className="py-3 px-3 text-center">مدين (ج.س)</th>
                  <th className="py-3 px-3 text-center">دائن (ج.س)</th>
                  <th className="py-3 px-3 text-left">الرصيد التراكمي (ج.س)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {statement.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                      لا توجد حركات مسجلة خلال الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  statement.items.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-3 font-mono">{new Date(row.date).toLocaleDateString('ar-EG')}</td>
                      <td className="py-3 px-3 font-bold text-slate-800">{row.entryNumber}</td>
                      <td className="py-3 px-3">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-sans font-bold text-slate-600">
                          {row.docType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans text-slate-700">{row.description}</td>
                      <td className="py-3 px-3 text-center text-rose-600 font-bold">
                        {row.debit !== '0.00' ? row.debit : '-'}
                      </td>
                      <td className="py-3 px-3 text-center text-emerald-600 font-bold">
                        {row.credit !== '0.00' ? row.credit : '-'}
                      </td>
                      <td className="py-3 px-3 text-left font-black text-[#582949]">
                        {row.runningBalance}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
