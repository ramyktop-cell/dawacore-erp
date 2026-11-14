import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { stockCountApi, QuickAddItemInput } from '../../api/stock-count';
import { medicinesApi } from '../../api/medicines';
import {
  X,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Barcode,
  Search,
  Loader2,
  PackagePlus,
  Layers,
  Calendar,
  DollarSign,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stockCountId: string;
  initialBarcode?: string;
  onSuccess: (newItem: any) => void;
}

export const QuickAddItemModal: React.FC<Props> = ({
  isOpen,
  onClose,
  stockCountId,
  initialBarcode = '',
  onSuccess,
}) => {
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const tradeNameInputRef = useRef<HTMLInputElement>(null);

  const [barcode, setBarcode] = useState(initialBarcode);
  const [medicineId, setMedicineId] = useState<string | null>(null);
  const [tradeName, setTradeName] = useState('');
  const [category, setCategory] = useState('عام');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [actualQty, setActualQty] = useState<number>(1);
  const [unitType, setUnitType] = useState<'UNIT' | 'STRIP' | 'BOX'>('UNIT');
  const [notes, setNotes] = useState('');

  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<'IDLE' | 'FOUND' | 'NOT_FOUND'>('IDLE');
  const [validationError, setValidationError] = useState<string | null>(null);

  // جلب التصنيفات المتاحة للاقتراح
  const { data: categories = [] } = useQuery({
    queryKey: ['medicines-categories'],
    queryFn: () => medicinesApi.getCategories(),
    enabled: isOpen,
  });

  // تعيين الباركود الأولي عند فتح النافذة
  useEffect(() => {
    if (isOpen) {
      setBarcode(initialBarcode);
      setLookupStatus('IDLE');
      setMedicineId(null);
      setTradeName('');
      setCostPrice('');
      setSalePrice('');
      setBatchNumber('');
      setActualQty(1);
      setNotes('');
      setValidationError(null);

      // تاريخ افتراضي للصلاحية (سنتان للأمام)
      const future = new Date();
      future.setFullYear(future.getFullYear() + 2);
      setExpiryDate(future.toISOString().split('T')[0]);

      if (initialBarcode.trim()) {
        lookupBarcode(initialBarcode.trim());
      } else {
        setTimeout(() => barcodeInputRef.current?.focus(), 150);
      }
    }
  }, [isOpen, initialBarcode]);

  // دالة البحث بالباركود في قاعدة البيانات
  const lookupBarcode = async (codeToSearch: string) => {
    const trimmed = codeToSearch.trim();
    if (!trimmed) return;

    setIsSearchingBarcode(true);
    setValidationError(null);

    try {
      const res = await axios.get(`/api/medicines/scan`, { params: { barcode: trimmed } });
      const med = res.data;
      if (med && med.id) {
        setLookupStatus('FOUND');
        setMedicineId(med.id);
        setTradeName(med.tradeName || '');
        setCategory(med.category || 'عام');
        const defaultUnit = med.units?.find((u: any) => u.isDefault) || med.units?.[0];
        if (defaultUnit) {
          setUnitType(defaultUnit.unitType || 'UNIT');
          if (defaultUnit.price) setSalePrice(Number(defaultUnit.price));
        }
      }
    } catch {
      // لم يتم العثور على الدواء بهذا الباركود -> صنف جديد
      setLookupStatus('NOT_FOUND');
      setMedicineId(null);
      setTimeout(() => tradeNameInputRef.current?.focus(), 150);
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  const mutation = useMutation({
    mutationFn: (data: QuickAddItemInput) => stockCountApi.addQuickItem(stockCountId, data),
    onSuccess: (data) => {
      onSuccess(data.item);
      onClose();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'حدث خطأ أثناء إضافة الصنف للجرد';
      setValidationError(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!barcode.trim() && !tradeName.trim()) {
      setValidationError('يجب إدخال الباركود أو اسم الصنف على الأقل');
      return;
    }

    if (!medicineId && !tradeName.trim()) {
      setValidationError('يرجى كتابة اسم الصنف التجاري');
      return;
    }

    if (!expiryDate) {
      setValidationError('تاريخ الصلاحية مطلوب');
      return;
    }

    if (costPrice === '' || Number(costPrice) < 0) {
      setValidationError('يرجى إدخال سعر شراء صحيح (صفر أو أكثر)');
      return;
    }

    if (salePrice === '' || Number(salePrice) < 0) {
      setValidationError('يرجى إدخال سعر بيع صحيح (صفر أو أكثر)');
      return;
    }

    if (actualQty <= 0) {
      setValidationError('الكمية الفعلية يجب أن تكون 1 على الأقل');
      return;
    }

    const payload: QuickAddItemInput = {
      barcode: barcode.trim() || undefined,
      medicineId: medicineId || undefined,
      tradeName: tradeName.trim() || undefined,
      category: category.trim() || undefined,
      batchNumber: batchNumber.trim() || undefined,
      expiryDate,
      costPrice: Number(costPrice),
      salePrice: Number(salePrice),
      actualQty: Number(actualQty),
      unitType,
      notes: notes.trim() || undefined,
    };

    mutation.mutate(payload);
  };

  if (!isOpen) return null;

  const isCostHigherThanSale =
    costPrice !== '' && salePrice !== '' && Number(salePrice) < Number(costPrice);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white p-5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-md">
              <Zap className="w-6 h-6 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                إدخال صنف أو تشغيلة على الطائر
                <span className="text-xs bg-amber-400/90 text-gray-900 font-semibold px-2 py-0.5 rounded-full">
                  F8
                </span>
              </h3>
              <p className="text-xs text-teal-100 mt-0.5">
                إدراج مباشر للأصناف غير المدرجة أو الدفعات الجديدة فورياً في محضر الجرد النشط
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Status Banners */}
          {lookupStatus === 'FOUND' && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-xl flex items-center gap-3 text-emerald-800 dark:text-emerald-200 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <span className="font-bold">دواء مسجل مسبقاً: </span>
                <span>{tradeName}</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  سيتم إنشاء تشغيلة إضافية له وربطها فوراً بمحضر الجرد الحالي.
                </span>
              </div>
            </div>
          )}

          {lookupStatus === 'NOT_FOUND' && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded-xl flex items-center gap-3 text-amber-800 dark:text-amber-200 text-sm">
              <PackagePlus className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <span className="font-bold">صنف جديد غير مسجل في الدليل:</span>
                <span className="text-xs text-amber-700 dark:text-amber-300 block mt-0.5">
                  سيقوم النظام بإنشاء بطاقة صنف + وحدة أساسية + تشغيلة + إدراجه في الجرد بضغطة واحدة.
                </span>
              </div>
            </div>
          )}

          {validationError && (
            <div className="p-3.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl flex items-center gap-3 text-red-800 dark:text-red-200 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Barcode row */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              باركود الصنف
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value);
                    if (lookupStatus !== 'IDLE') setLookupStatus('IDLE');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      lookupBarcode(barcode);
                    }
                  }}
                  placeholder="امسح بالباركود أو اكتب رقمه واضغط فحص..."
                  className="w-full pr-9 pl-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => lookupBarcode(barcode)}
                disabled={isSearchingBarcode || !barcode.trim()}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isSearchingBarcode ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>فحص</span>
              </button>
            </div>
          </div>

          {/* Medicine Name and Category */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                اسم الصنف التجاري <span className="text-red-500">*</span>
              </label>
              <input
                ref={tradeNameInputRef}
                type="text"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                disabled={lookupStatus === 'FOUND'}
                placeholder="مثال: Panadol Extra 500mg"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:opacity-80"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                التصنيف
              </label>
              <input
                type="text"
                list="categories-list"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="عام"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
              <datalist id="categories-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Batch Number and Expiry Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                رقم التشغيلة / الدفعة (Batch No.)
              </label>
              <div className="relative">
                <Layers className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="تلقائي إن تُرك فارغاً"
                  className="w-full pr-9 pl-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                تاريخ انتهاء الصلاحية <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Pricing & Unit */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                سعر الشراء (التكلفة) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full pr-9 pl-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                سعر البيع للجمهور <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className={`w-full pr-9 pl-3 py-2 bg-gray-50 dark:bg-gray-700 border rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 ${
                    isCostHigherThanSale ? 'border-amber-500 bg-amber-50/50' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                الوحدة الأساسية
              </label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as any)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="UNIT">علبة (UNIT)</option>
                <option value="STRIP">شريط (STRIP)</option>
                <option value="BOX">كرتونة / باكت (BOX)</option>
              </select>
            </div>
          </div>

          {/* Pricing Warning */}
          {isCostHigherThanSale && (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 text-amber-800 dark:text-amber-300 text-xs rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>تنبيه مالي: سعر البيع أقل من التكلفة! سيتم قبول الإدخال مع تسجيله بالرقابة.</span>
            </div>
          )}

          {/* Actual Counted Qty */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold text-emerald-900 dark:text-emerald-200">
                الكمية الفعلية المحصورة على الرف <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                تُسجل كزيادة فورية (Snapshot: 0, Actual: {actualQty})
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActualQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-bold text-lg hover:bg-gray-100 flex items-center justify-center text-gray-800 dark:text-white shadow-sm"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                value={actualQty}
                onChange={(e) => setActualQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="flex-1 text-center font-bold text-xl py-2 bg-white dark:bg-gray-700 border border-emerald-400 rounded-lg text-emerald-900 dark:text-emerald-100 focus:ring-2 focus:ring-emerald-500 shadow-inner"
              />
              <button
                type="button"
                onClick={() => setActualQty((q) => q + 1)}
                className="w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-bold text-lg hover:bg-gray-100 flex items-center justify-center text-gray-800 dark:text-white shadow-sm"
              >
                +
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              ملاحظات إضافية للجرد
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: صنف وجد خلف الرف A3 / تشغيلة جديدة لم تورد بعد"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري الحفظ والإدراج...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-amber-300" />
                <span>إدراج فوري في الجرد (Enter)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
