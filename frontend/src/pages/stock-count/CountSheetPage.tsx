import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stockCountApi, StockCountItem } from '../../api/stock-count';
import { CancelCountModal } from '../../components/stock-count/CancelCountModal';
import { QuickAddItemModal } from '../../components/stock-count/QuickAddItemModal';
import { CountTimeline } from '../../components/stock-count/CountTimeline';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import {
  ArrowRight,
  Save,
  Calculator,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  Search,
  Printer,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  ScanLine,
  Zap,
} from 'lucide-react';

type TabType = 'count' | 'variance';

export const CountSheetPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>('count');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState('');
  const [localQty, setLocalQty] = useState<Record<string, string>>({});
  const [highlightedBatchId, setHighlightedBatchId] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data: stockCount, isLoading } = useQuery({
    queryKey: ['stock-count', id],
    queryFn: () => stockCountApi.getOne(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (stockCount?.items) {
      const initial: Record<string, string> = {};
      stockCount.items.forEach((item: StockCountItem) => {
        initial[item.batchId] = item.actualQty !== null ? String(item.actualQty) : '';
      });
      setLocalQty(initial);
    }
  }, [stockCount]);

  const canEdit = stockCount?.status === 'IN_PROGRESS';

  // معالجة مسح الباركود السريع
  const handleBarcodeScanned = (barcode: string) => {
    if (!stockCount?.items || !canEdit) {
      setScanFeedback({ type: 'error', message: 'المحضر ليس بحالة العد الفعلي' });
      return;
    }

    const foundItem = stockCount.items.find((item: StockCountItem) => {
      const medicineBarcode = item.batch?.medicine?.barcode;
      const batchNumber = item.batch?.batchNumber;
      return medicineBarcode === barcode || batchNumber === barcode;
    });

    if (!foundItem) {
      // ⚡ الصنف غير موجود بالجرد: فتح نافذة الإدخال السريع على الطائر فورياً
      setScanFeedback({
        type: 'error',
        message: `الباركود "${barcode}" غير مدرج بالجرد — جاري فتح نافذة الإدخال السريع على الطائر...`,
      });
      setQuickAddBarcode(barcode);
      setIsQuickAddOpen(true);
      setTimeout(() => setScanFeedback(null), 4000);
      return;
    }

    const currentValue = localQty[foundItem.batchId];
    const currentQty = currentValue === '' || currentValue === undefined ? 0 : parseInt(currentValue, 10);
    const newQty = currentQty + 1;

    setLocalQty((prev) => ({ ...prev, [foundItem.batchId]: String(newQty) }));
    setHighlightedBatchId(foundItem.batchId);
    setTimeout(() => setHighlightedBatchId(null), 1500);

    setTimeout(() => {
      const row = document.querySelector(`[data-batch-id="${foundItem.batchId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    setScanFeedback({
      type: 'success',
      message: `تم حصر: ${foundItem.batch?.medicine?.tradeName} (الكمية الحالية: ${newQty})`,
    });
    setTimeout(() => setScanFeedback(null), 2000);
  };

  useBarcodeScanner({
    onBarcodeScanned: handleBarcodeScanned,
    enabled: !!stockCount && canEdit,
    minLength: 3,
    maxDelay: 60,
  });

  const filteredItems = useMemo(() => {
    if (!stockCount?.items) return [];
    let items = stockCount.items;

    if (activeTab === 'variance') {
      items = items.filter((i: StockCountItem) => i.variance !== 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i: StockCountItem) =>
          i.batch?.medicine?.tradeName?.toLowerCase().includes(q) ||
          i.batch?.medicine?.barcode?.includes(q) ||
          i.batch?.batchNumber?.toLowerCase().includes(q),
      );
    }

    return items;
  }, [stockCount, activeTab, searchQuery]);

  const stats = useMemo(() => {
    if (!stockCount?.items) return { total: 0, counted: 0, shortage: 0, surplus: 0 };
    const items = stockCount.items;
    const total = items.length;
    const counted = items.filter((i: StockCountItem) => i.actualQty !== null).length;
    let shortage = 0;
    let surplus = 0;
    items.forEach((i: StockCountItem) => {
      if (i.variance < 0) shortage += Math.abs(i.variance) * Number(i.unitCost);
      if (i.variance > 0) surplus += i.variance * Number(i.unitCost);
    });
    return { total, counted, shortage, surplus };
  }, [stockCount]);

  const canReconcile = stockCount?.status === 'IN_PROGRESS' && stats.counted === stats.total && stats.total > 0;
  const canApprove = stockCount?.status === 'RECONCILED';
  const canCancel = ['DRAFT', 'IN_PROGRESS', 'RECONCILED'].includes(stockCount?.status || '');

  const saveMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(localQty)
        .filter(([_, qty]) => qty !== '')
        .map(([batchId, qty]) => ({
          batchId,
          actualQty: parseInt(qty, 10),
        }));
      return stockCountApi.recordItems(id!, { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-count', id] });
      setScanFeedback({ type: 'success', message: 'تم حفظ سجلات العد بنجاح' });
      setTimeout(() => setScanFeedback(null), 2000);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'فشل حفظ العد';
      setScanFeedback({ type: 'error', message: Array.isArray(msg) ? msg.join(' | ') : msg });
      setTimeout(() => setScanFeedback(null), 4000);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: () => stockCountApi.reconcile(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-count', id] });
      setScanFeedback({ type: 'success', message: 'تمت مطابقة الفروقات وتجهيز ملخص التكلفة' });
      setTimeout(() => setScanFeedback(null), 2000);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => stockCountApi.approve(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-count', id] });
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      alert('تم اعتماد الجرد، تعديل أرصدة الدفعات، وترحيل القيد المحاسبي المزدوج بنجاح');
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextInput = document.querySelector(`input[data-index="${index + 1}"]`) as HTMLInputElement;
      if (nextInput) nextInput.focus();
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (canEdit && !saveMutation.isPending) {
          saveMutation.mutate();
        }
      }
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'F8') {
        e.preventDefault();
        if (canEdit) {
          setQuickAddBarcode('');
          setIsQuickAddOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canEdit, saveMutation]);

  if (isLoading) return <div className="p-8 text-center text-slate-500">جاري تحميل بيانات المحضر...</div>;
  if (!stockCount) return <div className="p-8 text-center text-rose-500">محضر الجرد غير موجود</div>;

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/stock-count')}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <ArrowRight size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="font-mono text-violet-700">{stockCount.countNumber}</span>
              <span className="text-sm font-normal text-slate-500">
                ({stockCount.countType === 'FULL' ? 'جرد شامل' : 'جرد جزئي'})
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              {stockCount.branch?.name} • بدأ في{' '}
              {new Date(stockCount.startedAt).toLocaleString('ar-EG')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => {
                setQuickAddBarcode('');
                setIsQuickAddOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20 cursor-pointer transition-all animate-in fade-in"
              title="إدخال صنف أو تشغيلة جديدة غير مدرجة في الجرد فورياً (F8)"
            >
              <Zap size={16} className="text-amber-300 fill-amber-300" />
              <span>إضافة على الطائر [F8]</span>
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm cursor-pointer"
          >
            <Printer size={16} /> طباعة التقرير
          </button>
        </div>
      </div>

      {stockCount.status === 'IN_PROGRESS' && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
          <div className="text-xs text-amber-800 flex-1">
            <p className="font-bold">⚠️ الأصناف مجمدة في الـ POS</p>
            <p>تم إيقاف صرف الأدوية المشمولة مؤقتاً لضمان دقة المطابقة ومنع تضارب الرصيد.</p>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-lg flex items-center gap-3">
          <ScanLine size={20} className="text-violet-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-violet-800">وضع الباركود الذكي نشط</p>
            <p className="text-xs text-violet-600">
              امسح باركود الدواء أو رقم الدفعة بالليزر لزيادة الكمية تلقائياً. وفي حال كان الصنف غير مدرج، ستُفتح نافذة الإدخال السريع تلقائياً.
            </p>
          </div>
          <button
            onClick={() => {
              setQuickAddBarcode('');
              setIsQuickAddOpen(true);
            }}
            className="px-2.5 py-1 rounded-md border border-emerald-300 bg-emerald-100 hover:bg-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Zap size={12} className="text-amber-600 fill-amber-600" />
            F8: إضافة على الطائر
          </button>
          <kbd className="px-2 py-1 rounded border border-violet-300 bg-white text-xs font-mono text-violet-700">
            Ctrl+S: حفظ
          </kbd>
          <kbd className="px-2 py-1 rounded border border-violet-300 bg-white text-xs font-mono text-violet-700">
            F1: بحث
          </kbd>
        </div>
      )}

      {scanFeedback && (
        <div
          className={`mb-4 p-3 rounded-lg border flex items-center gap-2 text-sm font-medium ${
            scanFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {scanFeedback.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {scanFeedback.message}
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white p-3 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-500">إنجاز العد</span>
          <p className="text-lg font-bold text-violet-700 font-mono">
            {stats.counted} / {stats.total}
          </p>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-violet-600 rounded-full transition-all"
              style={{ width: `${stats.total > 0 ? (stats.counted / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-500">قيمة العجز الإجمالية</span>
          <p className="text-lg font-bold text-rose-600 font-mono">{stats.shortage.toLocaleString()} ج.س</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-500">قيمة الفائض الإجمالية</span>
          <p className="text-lg font-bold text-emerald-600 font-mono">{stats.surplus.toLocaleString()} ج.س</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-500">صافي الأثر المالي</span>
          <p
            className={`text-lg font-bold font-mono ${
              stats.surplus - stats.shortage >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {(stats.surplus - stats.shortage).toLocaleString()} ج.س
          </p>
        </div>
      </div>

      <div className="bg-white rounded-t-xl border border-slate-200 border-b-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('count')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'count'
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              قائمة البنود
            </button>
            <button
              onClick={() => setActiveTab('variance')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'variance'
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              فروقات الجرد
              {stats.total === stats.counted && (
                <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-mono">
                  {stockCount.items.filter((i: StockCountItem) => i.variance !== 0).length}
                </span>
              )}
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="بحث بالباركود، الاسم، أو الدفعة... [F1]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-72 rounded-lg border border-slate-300 pl-3 pr-9 py-1.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600"
            />
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-slate-600">
                <th className="py-2 px-3 text-right font-semibold">الصنف</th>
                <th className="py-2 px-3 text-center font-semibold">رقم التشغيلة</th>
                <th className="py-2 px-3 text-center font-semibold">الصلاحية</th>
                <th className="py-2 px-3 text-center font-semibold">الرصيد النظامي</th>
                <th className="py-2 px-3 text-center font-semibold w-32">العد الفعلي</th>
                <th className="py-2 px-3 text-center font-semibold">الفارق</th>
                <th className="py-2 px-3 text-center font-semibold">سعر التكلفة</th>
                <th className="py-2 px-3 text-center font-semibold">قيمة الفارق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    {activeTab === 'variance' ? 'لا توجد أي فروقات في الأرصدة 🎉' : 'لا توجد أصناف مطابقة للبحث'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item: StockCountItem, index: number) => {
                  const localValue = localQty[item.batchId] ?? '';
                  const numValue = localValue === '' ? null : parseInt(localValue, 10);
                  const currentVariance = numValue !== null ? numValue - item.systemQty : 0;
                  const varianceValue = currentVariance * Number(item.unitCost);
                  const isHighlighted = highlightedBatchId === item.batchId;

                  return (
                    <tr
                      key={item.id}
                      data-batch-id={item.batchId}
                      className={`transition-all ${
                        isHighlighted
                          ? 'bg-violet-100 ring-2 ring-violet-400'
                          : item.variance !== 0
                          ? 'bg-amber-50/30 hover:bg-amber-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {item.batch?.medicine?.tradeName}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-xs text-slate-500">
                        {item.batch?.batchNumber}
                      </td>
                      <td className="py-2 px-3 text-center text-xs">
                        {item.batch?.expiryDate
                          ? new Date(item.batch.expiryDate).toLocaleDateString('ar-EG')
                          : '-'}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-500">
                        {item.systemQty}
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min="0"
                          data-index={index}
                          value={localValue}
                          onChange={(e) => setLocalQty({ ...localQty, [item.batchId]: e.target.value })}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          disabled={!canEdit}
                          placeholder="__"
                          className={`w-20 rounded border p-1.5 text-center font-mono text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 disabled:bg-slate-100 transition-all ${
                            isHighlighted ? 'border-violet-500 bg-violet-50 scale-105' : 'border-slate-300'
                          }`}
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        {numValue !== null ? (
                          currentVariance === 0 ? (
                            <span className="text-slate-400 font-mono">0</span>
                          ) : currentVariance > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold font-mono">
                              <TrendingUp size={14} />+{currentVariance}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-600 font-semibold font-mono">
                              <TrendingDown size={14} />${currentVariance}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-xs text-slate-500">
                        {Number(item.unitCost).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-xs">
                        {numValue !== null && currentVariance !== 0 ? (
                          <span className={varianceValue >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {varianceValue.toLocaleString()} ج.س
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 p-4 flex justify-between items-center">
        <div>
          {canCancel && (
            <button
              onClick={() => setIsCancelModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 text-sm font-medium cursor-pointer"
            >
              <XCircle size={16} /> إلغاء الجرد
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 text-sm font-medium cursor-pointer"
            >
              <Save size={16} />
              {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ العد [Ctrl+S]'}
            </button>
          )}
          {canReconcile && (
            <button
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm font-medium cursor-pointer"
            >
              <Calculator size={16} />
              {reconcileMutation.isPending ? 'جاري المطابقة...' : 'مطابقة الفروقات'}
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => {
                if (confirm('سيتم اعتماد الجرد وترحيل التسويات محاسبياً وتحديث المخزن. هل أنت متأكد؟')) {
                  approveMutation.mutate();
                }
              }}
              disabled={approveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium cursor-pointer"
            >
              <ShieldCheck size={16} />
              {approveMutation.isPending ? 'جاري الاعتماد...' : 'اعتماد وترحيل التسوية'}
            </button>
          )}
          {stockCount.status === 'APPROVED' && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium">
              <CheckCircle size={16} /> تم الاعتماد النهائي
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <CountTimeline stockCount={stockCount} />
      </div>

      <CancelCountModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={(reason: string) => {
          stockCountApi.cancel(id!, reason).then(() => {
            queryClient.invalidateQueries({ queryKey: ['stock-count', id] });
            setIsCancelModalOpen(false);
          });
        }}
      />

      <QuickAddItemModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        stockCountId={id!}
        initialBarcode={quickAddBarcode}
        onSuccess={(newItem: any) => {
          queryClient.invalidateQueries({ queryKey: ['stock-count', id] });
          if (newItem?.batchId) {
            setLocalQty((prev) => ({
              ...prev,
              [newItem.batchId]: String(newItem.actualQty ?? 1),
            }));
            setHighlightedBatchId(newItem.batchId);
            setTimeout(() => setHighlightedBatchId(null), 2500);
            setTimeout(() => {
              const row = document.querySelector(`[data-batch-id="${newItem.batchId}"]`);
              if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 300);
          }
          setScanFeedback({
            type: 'success',
            message: `✨ تم إدراج (${newItem?.batch?.medicine?.tradeName || 'الصنف'}) بنجاح وربطه بالجرد!`,
          });
          setTimeout(() => setScanFeedback(null), 4000);
        }}
      />
    </div>
  );
};
