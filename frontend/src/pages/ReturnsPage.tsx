import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  RotateCcw,
  Receipt,
  CheckCircle,
  AlertTriangle,
  Package,
  Calendar,
  DollarSign,
  CreditCard,
  Building2,
  User,
  History,
  Printer,
  X,
  FileText,
  AlertCircle,
  RefreshCw,
  Clock,
  Check,
} from 'lucide-react';
import {
  returnsApi,
  SaleForReturn,
  SaleForReturnItem,
  ReturnItemPayload,
  SaleReturnSummary,
} from '../api/returns';

interface ItemReturnState {
  selected: boolean;
  returnQuantity: number;
  condition: 'RESTOCKABLE' | 'DAMAGED';
}

export const ReturnsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'NEW_RETURN' | 'HISTORY'>('NEW_RETURN');

  // Search invoice
  const [searchInvoiceNumber, setSearchInvoiceNumber] = useState('');
  const [searching, setSearching] = useState(false);
  const [currentSale, setCurrentSale] = useState<SaleForReturn | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Return Form State
  const [itemStates, setItemStates] = useState<Record<string, ItemReturnState>>({});
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT'>('CASH');
  const [returnReason, setReturnReason] = useState('طلب العميل إرجاع الصنف');
  const [submitSuccess, setSubmitSuccess] = useState<any | null>(null);

  // History State
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedReturnDetails, setSelectedReturnDetails] = useState<SaleReturnSummary | null>(null);

  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();

  // Query History
  const { data: historyData, isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['returns-history', historyPage],
    queryFn: () => returnsApi.getAll({ page: historyPage, limit: 10 }),
    enabled: activeTab === 'HISTORY',
  });

  const performSearch = async (invNum: string) => {
    if (!invNum.trim()) return;

    setSearching(true);
    setSearchError(null);
    setCurrentSale(null);
    setItemStates({});
    setSubmitSuccess(null);

    try {
      const sale = await returnsApi.findSaleForReturn(invNum.trim());
      setCurrentSale(sale);

      const initial: Record<string, ItemReturnState> = {};
      sale.items.forEach((item) => {
        const remaining = Math.max(0, Number(item.quantity) - Number(item.returnedQty || 0) / Number(item.multiplier || 1));
        initial[item.id] = {
          selected: remaining > 0,
          returnQuantity: remaining > 0 ? Math.min(1, remaining) : 0,
          condition: 'RESTOCKABLE',
        };
      });
      setItemStates(initial);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'لم يتم العثور على الفاتورة أو أنها مسترجعة بالكامل';
      setSearchError(Array.isArray(msg) ? msg.join(' - ') : msg);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const inv = searchParams.get('invoice');
    if (inv) {
      setSearchInvoiceNumber(inv);
      performSearch(inv);
    }
  }, [searchParams]);

  // Handle Search Invoice
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    performSearch(searchInvoiceNumber);
  };

  // Submit Mutation
  const returnMutation = useMutation({
    mutationFn: returnsApi.createReturn,
    onSuccess: (data) => {
      setSubmitSuccess(data);
      queryClient.invalidateQueries({ queryKey: ['returns-history'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'حدث خطأ أثناء حفظ المرتجع';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });

  // Calculate return details
  const getSelectedItemsPayload = (): ReturnItemPayload[] => {
    if (!currentSale) return [];
    const items: ReturnItemPayload[] = [];
    for (const item of currentSale.items) {
      const state = itemStates[item.id];
      if (state && state.selected && state.returnQuantity > 0) {
        items.push({
          saleItemId: item.id,
          returnQuantity: state.returnQuantity,
          condition: state.condition,
          isDamaged: state.condition === 'DAMAGED',
        });
      }
    }
    return items;
  };

  const calculateTotalRefund = (): number => {
    if (!currentSale) return 0;
    const grossTotal = Number(currentSale.subTotal || currentSale.grandTotal || 0);
    const discountRatio = grossTotal > 0 ? Number(currentSale.discountTotal || 0) / grossTotal : 0;

    let total = 0;
    for (const item of currentSale.items) {
      const state = itemStates[item.id];
      if (state && state.selected && state.returnQuantity > 0) {
        const baseRefund = Number(item.unitPrice) * state.returnQuantity;
        const netRefund = baseRefund * (1 - discountRatio);
        total += netRefund;
      }
    }
    return Math.round(total * 100) / 100;
  };

  const handleConfirmReturn = () => {
    if (!currentSale) return;
    const items = getSelectedItemsPayload();
    if (items.length === 0) {
      alert('الرجاء اختيار صنف واحد على الأقل مع تحديد كمية صالحة للإرجاع');
      return;
    }

    const payload = {
      saleId: currentSale.id,
      branchId: currentSale.branchId,
      shiftId: currentSale.shiftId,
      reason: returnReason.trim() || 'مرتجع مبيعات',
      refundMethod,
      items,
    };

    returnMutation.mutate(payload);
  };

  const handleResetForNew = () => {
    setCurrentSale(null);
    setSearchInvoiceNumber('');
    setSearchError(null);
    setItemStates({});
    setSubmitSuccess(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl">
              <RotateCcw className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                مرتجع المبيعات والاسترداد المالي
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                البحث عن فواتير البيع الأصلية، استرجاع الأصناف (سليم للمخزون أو كهنة تالف)، وإعادة المستحقات المالية
              </p>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl self-start md:self-auto">
          <button
            onClick={() => {
              setActiveTab('NEW_RETURN');
              setSubmitSuccess(null);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'NEW_RETURN'
                ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>تسجيل مرتجع جديد</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('HISTORY');
              refetchHistory();
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'HISTORY'
                ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل المرتجعات</span>
          </button>
        </div>
      </div>

      {activeTab === 'NEW_RETURN' && (
        <div className="space-y-6">
          {/* Search Box */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
            <form onSubmit={handleSearch} className="max-w-2xl">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                رقم فاتورة البيع الأصلية أو مسح الباركود
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Receipt className="w-5 h-5 absolute right-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchInvoiceNumber}
                    onChange={(e) => setSearchInvoiceNumber(e.target.value)}
                    placeholder="مثال: INV-2026-00001 أو امسح باركود الفاتورة..."
                    className="w-full pl-4 pr-11 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-rose-500 focus:outline-none transition-all font-mono"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !searchInvoiceNumber.trim()}
                  className="px-6 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-medium rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {searching ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري البحث...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>بحث عن الفاتورة</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {searchError && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 flex items-center gap-3 text-amber-800 dark:text-amber-200 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600" />
                <span>{searchError}</span>
              </div>
            )}
          </div>

          {/* Success Dialog */}
          {submitSuccess && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 p-6 rounded-2xl shadow-sm text-slate-800 dark:text-white space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500 text-white rounded-xl">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-300">
                    تم تسجيل المرتجع بنجاح!
                  </h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    رقم إشعار المرتجع: <span className="font-mono font-bold text-base">{submitSuccess.returnNumber}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                <div className="bg-white/70 dark:bg-slate-900/50 p-3.5 rounded-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400">المبلغ المسترد</div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                    {submitSuccess.totalRefund} ج.م
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-slate-900/50 p-3.5 rounded-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400">طريقة الاسترداد</div>
                  <div className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                    {submitSuccess.refundMethod === 'CASH'
                      ? 'نقداً من الخزينة'
                      : submitSuccess.refundMethod === 'CARD'
                      ? 'بطاقة بنكية'
                      : submitSuccess.refundMethod === 'BANK_TRANSFER'
                      ? 'تحويل بنكي'
                      : 'رصيد آجل'}
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-slate-900/50 p-3.5 rounded-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400">توجيه المخزون</div>
                  <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    تم استرجاع السليم تلقائياً وعزل التالف
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-medium flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة سند الإرجاع</span>
                </button>
                <button
                  onClick={handleResetForNew}
                  className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-sm font-medium"
                >
                  إجراء مرتجع جديد
                </button>
              </div>
            </div>
          )}

          {/* Sale Loaded Form */}
          {currentSale && !submitSuccess && (
            <div className="space-y-6">
              {/* Invoice Summary Card */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-3 py-1 font-semibold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      فاتورة مبيعات
                    </span>
                    <h2 className="text-xl font-bold font-mono text-slate-800 dark:text-white">
                      {currentSale.invoiceNumber}
                    </h2>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {new Date(currentSale.createdAt).toLocaleString('ar-EG')}
                    </span>
                    {currentSale.customer && (
                      <span className="flex items-center gap-1.5">
                        <User className="w-4 h-4" />
                        {currentSale.customer.name} ({currentSale.customer.phone || 'بدون هاتف'})
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                    <span className="text-xs text-slate-500 dark:text-slate-400">إجمالي الفاتورة الأصلي</span>
                    <p className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">
                      {Number(currentSale.grandTotal).toLocaleString('ar-EG')} ج.م
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                    <span className="text-xs text-slate-500 dark:text-slate-400">الخصم الممنوح</span>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                      {Number(currentSale.discountTotal || 0).toLocaleString('ar-EG')} ج.م
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                    <span className="text-xs text-slate-500 dark:text-slate-400">طريقة الدفع الأصلية</span>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {currentSale.paymentMethod}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                    <span className="text-xs text-slate-500 dark:text-slate-400">حالة الفاتورة</span>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {currentSale.status === 'PARTIAL_RETURN' ? 'مرتجع جزئياً' : 'مكتملة'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Return Items Selection Table */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                  <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Package className="w-5 h-5 text-rose-600" />
                    <span>حدد الأصناف والكميات المراد استرجاعها</span>
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    يمكنك تحديد حالة كل صنف: سليم (يعود للمخزون) أو تالف (يُعزل في التوالف)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-4 w-12 text-center">إرجاع</th>
                        <th className="p-4">الصنف الدوائي</th>
                        <th className="p-4">التشغيلة والصلاحية</th>
                        <th className="p-4 text-center">الكمية المباعة</th>
                        <th className="p-4 text-center">المسترجع سابقاً</th>
                        <th className="p-4 text-center">المتاح للإرجاع</th>
                        <th className="p-4 text-center w-36">الكمية المرتجعة</th>
                        <th className="p-4">سعر الوحدة</th>
                        <th className="p-4">حالة الصنف المرتجع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {currentSale.items.map((item) => {
                        const remaining = Math.max(0, Number(item.quantity) - Number(item.returnedQty || 0) / Number(item.multiplier || 1));
                        const state = itemStates[item.id] || {
                          selected: false,
                          returnQuantity: 0,
                          condition: 'RESTOCKABLE',
                        };

                        const isFullyReturned = remaining <= 0;

                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              state.selected ? 'bg-rose-50/40 dark:bg-rose-950/20' : 'hover:bg-slate-50/60 dark:hover:bg-slate-900/30'
                            } ${isFullyReturned ? 'opacity-50 bg-slate-100/50 dark:bg-slate-900/20' : ''}`}
                          >
                            <td className="p-4 text-center">
                              <input
                                type="checkbox"
                                disabled={isFullyReturned}
                                checked={state.selected}
                                onChange={(e) => {
                                  setItemStates((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      selected: e.target.checked,
                                      returnQuantity: e.target.checked
                                        ? prev[item.id]?.returnQuantity || Math.min(1,remaining)
                                        : prev[item.id]?.returnQuantity || 0,
                                    },
                                  }));
                                }}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-4 font-medium text-slate-800 dark:text-white">
                              <div>{item.batch?.medicine?.tradeName || 'دواء غير محدد'}</div>
                              {item.batch?.medicine?.barcode && (
                                <div className="text-xs text-slate-400 font-mono">
                                  {item.batch.medicine.barcode}
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-slate-600 dark:text-slate-300">
                              <div className="font-mono text-xs font-semibold">
                                {item.batch?.batchNumber || 'بدون رقم'}
                              </div>
                              {item.batch?.expiryDate && (
                                <div className="text-xs text-slate-400">
                                  تنتهي: {new Date(item.batch.expiryDate).toLocaleDateString('ar-EG')}
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-center font-bold text-slate-700 dark:text-slate-300">
                              {Number(item.quantity)}
                            </td>
                            <td className="p-4 text-center text-slate-500 dark:text-slate-400">
                              {Number(item.returnedQty || 0) / Number(item.multiplier || 1)}
                            </td>
                            <td className="p-4 text-center">
                              {isFullyReturned ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                                  مسترجع بالكامل
                                </span>
                              ) : (
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {remaining}
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  disabled={!state.selected || state.returnQuantity <= 0.001}
                                  onClick={() =>
                                    setItemStates((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        returnQuantity: Math.max(0.001, Number((prev[item.id].returnQuantity - 0.001).toFixed(3))),
                                      },
                                    }))
                                  }
                                  className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold disabled:opacity-40"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  max={remaining}
                                  disabled={!state.selected || isFullyReturned}
                                  step="0.001"
                                  min="0.001"
                                  value={state.returnQuantity}
                                  onChange={(e) => {
                                    const val = Math.min(remaining, Math.max(0.001, parseFloat(e.target.value) || 0.001));
                                    setItemStates((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        returnQuantity: val,
                                      },
                                    }));
                                  }}
                                  className="w-14 text-center py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 font-bold text-slate-800 dark:text-white"
                                />
                                <button
                                  type="button"
                                  disabled={!state.selected || state.returnQuantity >= remaining}
                                  onClick={() =>
                                    setItemStates((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        returnQuantity: Math.min(remaining, Number((prev[item.id].returnQuantity + 0.001).toFixed(3))),
                                      },
                                    }))
                                  }
                                  className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold disabled:opacity-40"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="p-4 font-mono font-bold text-slate-800 dark:text-white">
                              {Number(item.unitPrice).toFixed(2)} ج.م
                            </td>
                            <td className="p-4">
                              <select
                                disabled={!state.selected || isFullyReturned}
                                value={state.condition}
                                onChange={(e) =>
                                  setItemStates((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      condition: e.target.value as 'RESTOCKABLE' | 'DAMAGED',
                                    },
                                  }))
                                }
                                className={`text-xs font-semibold py-1.5 px-2.5 rounded-lg border focus:outline-none transition-colors ${
                                  state.condition === 'RESTOCKABLE'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                                    : 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700'
                                }`}
                              >
                                <option value="RESTOCKABLE">✅ سليم (يعاد للرف)</option>
                                <option value="DAMAGED">⚠️ تالف / كهنة (يُعزل)</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Refund & Execution Controls */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                    سبب المرتجع
                  </label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="اكتب سبب الاسترجاع (مثال: طلب العميل، عبوة تالفة...)"
                    className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />

                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    {['طلب العميل إرجاع الصنف', 'صنف خاطئ تم صرفه', 'دواء تالف / منتهي الصلاحية'].map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setReturnReason(reason)}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md cursor-pointer transition-colors"
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                    طريقة رد المبلغ المالي
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'CASH', label: 'نقداً (خزينة)', icon: DollarSign },
                      { id: 'CARD', label: 'شبكة / كارت', icon: CreditCard },
                      { id: 'BANK_TRANSFER', label: 'تحويل بنكي', icon: Building2 },
                      { id: 'CREDIT', label: 'رصيد للعميل', icon: User },
                    ].map((m) => {
                      const Icon = m.icon;
                      const active = refundMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setRefundMethod(m.id as any)}
                          className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                            active
                              ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 shadow-sm'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col justify-between bg-slate-50 dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>الأصناف المختارة:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {getSelectedItemsPayload().length} أصناف
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        إجمالي المبلغ المسترد:
                      </span>
                      <span className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
                        {calculateTotalRefund().toLocaleString('ar-EG')} ج.م
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmReturn}
                    disabled={returnMutation.isPending || getSelectedItemsPayload().length === 0}
                    className="w-full mt-4 py-3.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 text-base transition-all cursor-pointer"
                  >
                    {returnMutation.isPending ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>جاري تنفيذ المرتجع...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        <span>تأكيد واسترجاع الفاتورة</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Returns History Tab */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">سجل إشعارات المرتجعات السابقة</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                قائمة بكافة عمليات الإرجاع المسجلة، الأصناف المستلمة، والمبالغ المستردة
              </p>
            </div>
            <button
              onClick={() => refetchHistory()}
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              title="تحديث القائمة"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {isHistoryLoading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-rose-500" />
              <span>جاري تحميل سجل المرتجعات...</span>
            </div>
          ) : historyData?.items && historyData.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-4">رقم المرتجع</th>
                    <th className="p-4">الفاتورة الأصلية</th>
                    <th className="p-4">التاريخ والوقت</th>
                    <th className="p-4">السبب</th>
                    <th className="p-4">طريقة الرد</th>
                    <th className="p-4">المبلغ المسترد</th>
                    <th className="p-4 text-center">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {historyData.items.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                      <td className="p-4 font-mono font-bold text-rose-600 dark:text-rose-400">
                        {ret.returnNumber}
                      </td>
                      <td className="p-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {ret.originalSale?.invoiceNumber || 'غير محدد'}
                      </td>
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(ret.createdAt).toLocaleString('ar-EG')}
                      </td>
                      <td className="p-4 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                        {ret.reason || 'بدون سبب'}
                      </td>
                      <td className="p-4">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                          {ret.refundMethod === 'CASH'
                            ? 'نقداً'
                            : ret.refundMethod === 'CARD'
                            ? 'بطاقة'
                            : ret.refundMethod === 'BANK_TRANSFER'
                            ? 'تحويل بنكي'
                            : ret.refundMethod}
                        </span>
                      </td>
                      <td className="p-4 font-bold font-mono text-slate-800 dark:text-white">
                        {Number(ret.totalRefund).toFixed(2)} ج.م
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setSelectedReturnDetails(ret)}
                          className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                        >
                          عرض الأصناف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-base font-semibold">لا توجد مرتجعات مسجلة حتى الآن</p>
              <p className="text-xs mt-1">عند تسجيل أي عملية إرجاع ستظهر هنا بالتفصيل</p>
            </div>
          )}
        </div>
      )}

      {/* Return Details Modal */}
      {selectedReturnDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-slate-700">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  تفاصيل إشعار المرتجع: {selectedReturnDetails.returnNumber}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  الفاتورة الأصلية: {selectedReturnDetails.originalSale?.invoiceNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedReturnDetails(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-900/40 p-3.5 rounded-xl">
                <div>
                  <span className="text-slate-400">تاريخ الإرجاع:</span>
                  <div className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                    {new Date(selectedReturnDetails.createdAt).toLocaleString('ar-EG')}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">المبلغ المسترد:</span>
                  <div className="font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                    {Number(selectedReturnDetails.totalRefund).toFixed(2)} ج.م
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">طريقة الاسترداد:</span>
                  <div className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                    {selectedReturnDetails.refundMethod}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">الأصناف المسترجعة</h4>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-3">الصنف</th>
                        <th className="p-3">التشغيلة</th>
                        <th className="p-3 text-center">الكمية</th>
                        <th className="p-3">الحالة</th>
                        <th className="p-3 text-left">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {selectedReturnDetails.items?.map((it) => (
                        <tr key={it.id}>
                          <td className="p-3 font-medium text-slate-800 dark:text-white">
                            {it.batch?.medicine?.tradeName || 'دواء'}
                          </td>
                          <td className="p-3 font-mono text-slate-500">
                            {it.batch?.batchNumber || '-'}
                          </td>
                          <td className="p-3 text-center font-bold">{it.quantity}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-semibold ${
                                it.condition === 'RESTOCKABLE'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              }`}
                            >
                              {it.condition === 'RESTOCKABLE' ? 'سليم للمخزون' : 'تالف / كهنة'}
                            </span>
                          </td>
                          <td className="p-3 text-left font-mono font-bold text-slate-800 dark:text-white">
                            {Number(it.refundAmount).toFixed(2)} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setSelectedReturnDetails(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-medium"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
