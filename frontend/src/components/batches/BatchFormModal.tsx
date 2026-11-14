import React, { useState, useEffect, useRef } from 'react';
import { Batch, CreateBatchInput } from '../../api/batches';
import { Medicine, medicinesApi } from '../../api/medicines';
import { Branch, branchesApi } from '../../api/branches';
import {
  X,
  Check,
  Calendar,
  AlertCircle,
  Search,
  Barcode,
  Pill,
  RotateCcw,
  Loader2,
  Building2,
  PackageCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface BatchFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateBatchInput) => void;
  batch?: Batch | null;
  isLoading?: boolean;
}

export const BatchFormModal: React.FC<BatchFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  batch,
  isLoading = false,
}) => {
  const isEditing = !!batch;

  const [batchNumber, setBatchNumber] = useState('');
  const [medicineId, setMedicineId] = useState('');
  const [selectedMedicine, setSelectedMedicine] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const [branchId, setBranchId] = useState('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantityInBase, setQuantityInBase] = useState<number | ''>('');
  const [isFrozen, setIsFrozen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const batchNumberInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search Medicines Query (Searches by Trade Name, Scientific Name, Barcode, Code, and Unit Barcode)
  const { data: medicinesData, isLoading: isMedicinesLoading } = useQuery({
    queryKey: ['medicines-search-batch-modal', debouncedSearch],
    queryFn: () => medicinesApi.getAll({ search: debouncedSearch || undefined, limit: 30 }),
    enabled: isOpen && !medicineId,
  });
  const medicines = medicinesData?.items || [];

  // Branches Query
  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup-batches'],
    queryFn: () => branchesApi.getAll({ limit: 50 }),
    enabled: isOpen,
  });
  const branches = branchesData?.items || [];

  // Reset or Populate Form
  useEffect(() => {
    if (batch) {
      setBatchNumber(batch.batchNumber || '');
      setMedicineId(batch.medicineId || '');
      setBranchId(batch.branchId || '');
      setCostPrice(batch.costPrice ?? '');
      setSalePrice(batch.salePrice ?? '');
      setExpiryDate(batch.expiryDate ? batch.expiryDate.split('T')[0] : '');
      setQuantityInBase(batch.quantityInBase ?? '');
      setIsFrozen(batch.isFrozen ?? false);

      if (batch.medicine) {
        setSelectedMedicine(batch.medicine);
      } else if (batch.medicineId) {
        medicinesApi
          .getById(batch.medicineId)
          .then((m) => setSelectedMedicine(m))
          .catch(() => {});
      }
    } else {
      setBatchNumber('');
      setMedicineId('');
      setSelectedMedicine(null);
      setSearchQuery('');
      setDebouncedSearch('');
      setBranchId(branches[0]?.id || '');
      setCostPrice('');
      setSalePrice('');
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      setExpiryDate(d.toISOString().split('T')[0]);
      setQuantityInBase(100);
      setIsFrozen(false);
    }
    setFormError(null);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  }, [batch, isOpen, branches.length]);

  // Handle selecting a medicine
  const handleSelectMedicine = (med: any) => {
    setSelectedMedicine(med);
    setMedicineId(med.id);
    setIsDropdownOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
    setFormError(null);

    // Auto-fill default sale price
    const defaultPrice = med.defaultUnit?.price || (med.units && med.units[0]?.price);
    if (defaultPrice) {
      setSalePrice(Number(defaultPrice));
    }

    // Auto-fill cost price if available from batch history
    if (med.batches && med.batches.length > 0) {
      const lastBatch = med.batches[0];
      if (lastBatch?.costPrice) {
        setCostPrice(Number(lastBatch.costPrice));
      }
    }

    // Focus on Batch Number next
    setTimeout(() => {
      batchNumberInputRef.current?.focus();
    }, 100);
  };

  // Handle Search Input KeyDown (Keyboard Navigation & Instant Barcode Scan)
  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsDropdownOpen(true);
      setHighlightedIndex((prev) => (prev < medicines.length - 1 ? prev + 1 : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsDropdownOpen(true);
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : medicines.length - 1));
      return;
    }
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;

      // 1. If an item is highlighted via keyboard
      if (highlightedIndex >= 0 && highlightedIndex < medicines.length) {
        handleSelectMedicine(medicines[highlightedIndex]);
        return;
      }

      // 2. Exact match in current search results by barcode, code, or name
      const exactMatch = medicines.find(
        (m) =>
          m.barcode?.toLowerCase() === q.toLowerCase() ||
          m.code?.toLowerCase() === q.toLowerCase() ||
          m.tradeName?.toLowerCase() === q.toLowerCase() ||
          m.units?.some((u) => u.barcode?.toLowerCase() === q.toLowerCase())
      );
      if (exactMatch) {
        handleSelectMedicine(exactMatch);
        return;
      }

      // 3. If there is only 1 result matching
      if (medicines.length === 1) {
        handleSelectMedicine(medicines[0]);
        return;
      }

      // 4. Barcode scanner direct API scan lookup
      try {
        const res = await fetch(`/api/medicines/scan?barcode=${encodeURIComponent(q)}`);
        if (res.ok) {
          const product = await res.json();
          if (product && product.id) {
            handleSelectMedicine(product);
            return;
          }
        }
      } catch {
        // Fallback to regular dropdown
      }

      setIsDropdownOpen(true);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!medicineId) {
      setFormError('يرجى اختيار الصنف الدوائي (ابحث بالاسم أو الباركود)');
      searchInputRef.current?.focus();
      return;
    }
    if (!batchNumber.trim()) {
      setFormError('رقم التشغيلة مطلوب');
      batchNumberInputRef.current?.focus();
      return;
    }
    if (!branchId) {
      setFormError('يرجى اختيار فرع الصيدلية');
      return;
    }
    if (!expiryDate) {
      setFormError('تاريخ الصلاحية مطلوب');
      return;
    }

    const payload: CreateBatchInput = {
      batchNumber: batchNumber.trim(),
      medicineId,
      branchId,
      costPrice: Number(costPrice) || 0,
      salePrice: Number(salePrice) || 0,
      expiryDate: new Date(expiryDate).toISOString(),
      quantityInBase: Number(quantityInBase) || 0,
      isFrozen,
    };

    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto" dir="rtl">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in duration-200 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#582949] text-white">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-xl">📦</span>
            <div>
              <h2 className="text-base font-bold">
                {isEditing ? `تعديل التشغيلة: ${batch?.batchNumber}` : 'إدخال تشغيلة ورصيد دفعة جديدة'}
              </h2>
              <p className="text-xs text-pink-200">
                تسجيل تاريخ الصلاحية والتسعير للدفعة وفق معيار FEFO
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-pink-200 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {formError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* 1. حقل الصنف الدوائي مع البحث الذكي بالاسم والباركود */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                الصنف الدوائي <span className="text-rose-500">*</span>
              </label>
              {!selectedMedicine && (
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5" />
                  يدعم البحث بالاسم التجاري أو الباركود
                </span>
              )}
            </div>

            {selectedMedicine ? (
              /* بطاقة الصنف المختار بعد التأكيد */
              <div className="rounded-xl border-2 border-teal-500/30 bg-teal-50/50 dark:bg-teal-950/20 p-3.5 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-sm flex-shrink-0 mt-0.5">
                      <Pill className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-teal-900 dark:text-teal-200">
                          {selectedMedicine.tradeName}
                        </span>
                        {selectedMedicine.category && (
                          <span className="px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 text-[10px] font-semibold">
                            {selectedMedicine.category}
                          </span>
                        )}
                        {isEditing && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                            تشغيلة قائمة
                          </span>
                        )}
                      </div>
                      {selectedMedicine.scientificName && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          {selectedMedicine.scientificName}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1 font-mono flex-wrap">
                        <span className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px]">
                          <Barcode className="w-3.5 h-3.5 text-slate-400" />
                          {selectedMedicine.barcode || selectedMedicine.code || 'بدون باركود'}
                        </span>
                        {selectedMedicine.code && (
                          <span className="text-[10px] text-slate-400">
                            كود: {selectedMedicine.code}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMedicine(null);
                        setMedicineId('');
                        setSearchQuery('');
                        setTimeout(() => searchInputRef.current?.focus(), 50);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-50 dark:hover:bg-slate-700 transition cursor-pointer"
                      title="تغيير واختيار صنف آخر"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>تغيير</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* حقل البحث بالاسم أو الباركود مع قائمة منسدلة تفاعلية */
              <div className="relative">
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsDropdownOpen(true);
                      setHighlightedIndex(-1);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="ابحث باسم الصنف (عربي / إنجليزي) أو امسح الباركود..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 pr-10 pl-10 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition placeholder:text-slate-400"
                    autoFocus={!isEditing}
                  />
                  <div className="absolute right-3 top-3 text-slate-400 pointer-events-none">
                    {isMedicinesLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </div>
                  <div className="absolute left-3 top-3 text-slate-400 pointer-events-none flex items-center gap-1">
                    <Barcode className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                </div>

                {/* القائمة المنسدلة للنتائج */}
                {isDropdownOpen && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 w-full mt-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-60 overflow-y-auto"
                  >
                    {medicines.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        {isMedicinesLoading ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                            <span>جاري البحث في الأدوية...</span>
                          </div>
                        ) : searchQuery ? (
                          <div>
                            <p className="font-bold text-slate-700 dark:text-slate-200">
                              لم يتم العثور على صنف مطابق
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              تأكد من كتابة الاسم التجاري أو مسح الباركود بشكل صحيح
                            </p>
                          </div>
                        ) : (
                          <span>اكتب اسم الدواء أو مرر الباركود للبحث</span>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {medicines.map((m, idx) => {
                          const isHighlighted = idx === highlightedIndex;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => handleSelectMedicine(m)}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                              className={`w-full text-right p-3 transition flex items-center justify-between gap-3 cursor-pointer ${
                                isHighlighted
                                  ? 'bg-teal-50/90 dark:bg-teal-900/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                              }`}
                            >
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-800 dark:text-white truncate">
                                    {m.tradeName}
                                  </span>
                                  {m.category && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex-shrink-0">
                                      {m.category}
                                    </span>
                                  )}
                                </div>
                                {m.scientificName && (
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {m.scientificName}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  <span className="inline-flex items-center gap-1">
                                    <Barcode className="w-3 h-3 text-slate-400" />
                                    {m.barcode}
                                  </span>
                                  {m.code && <span>• كود: {m.code}</span>}
                                </div>
                              </div>

                              <div className="text-left flex-shrink-0">
                                {m.defaultUnit?.price ? (
                                  <div className="text-xs font-bold font-mono text-teal-600 dark:text-teal-400">
                                    {Number(m.defaultUnit.price).toFixed(2)} ج.م
                                  </div>
                                ) : null}
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  رصيد: {m.totalStockInBase ?? 0} حبة
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. رقم التشغيلة وفرع الصيدلية */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                رقم التشغيلة (Batch / Lot) <span className="text-rose-500">*</span>
              </label>
              <input
                ref={batchNumberInputRef}
                type="text"
                required
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="مثال: AUG26E01"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                فرع الصيدلية <span className="text-rose-500">*</span>
              </label>
              <select
                required
                disabled={isEditing}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition disabled:bg-slate-100 dark:disabled:bg-slate-800 cursor-pointer"
              >
                {branches.map((b: Branch) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. تاريخ الصلاحية والكمية */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                تاريخ انتهاء الصلاحية <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                الكمية (بالوحدة الأساسية / الحبة) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                required
                value={quantityInBase}
                onChange={(e) => setQuantityInBase(parseInt(e.target.value, 10) || 0)}
                placeholder="100"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
              />
            </div>
          </div>

          {selectedMedicine?.isWeighed && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">تشغيلة صنف موزون: أدخل رصيد المخزون بالجرام وتكلفة الجرام. سعر البيع بالكيلو. مثال: 1.5 كيلو = 1500 جرام. شاشة المشتريات تقبل الكيلو وتحول التكلفة والمخزون تلقائياً.</p>}
          {/* 4. التسعير: سعر التكلفة وسعر البيع */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {selectedMedicine?.isWeighed ? 'تكلفة الجرام (عملة النظام)' : 'سعر التكلفة (عملة النظام)'}
              </label>
              <input step={selectedMedicine?.isWeighed ? "0.000001" : "0.01"}
                type="number"
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm font-bold font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {selectedMedicine?.isWeighed ? 'سعر بيع الكيلو' : 'سعر البيع الافتراضي'}
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={salePrice}
                onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm font-bold font-mono text-teal-700 dark:text-teal-400 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-teal-500 outline-none transition"
              />
            </div>
          </div>

          {/* 5. تجميد التشغيلة */}
          <div className="pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100/60 dark:hover:bg-slate-900/60 transition">
              <input
                type="checkbox"
                checked={isFrozen}
                onChange={(e) => setIsFrozen(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-white block">
                  تجميد التشغيلة (عزل ومنع الصرف في الكاشير)
                </span>
                <span className="text-[10px] text-slate-500 block">
                  يُفعل في حالة وجود استدعاء رسمي للدواء أو شكوى صلاحية وتلف
                </span>
              </div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-lg shadow-teal-600/20 disabled:opacity-50 flex items-center gap-2 transition cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEditing ? 'تحديث التشغيلة' : 'تسجيل التشغيلة والرصيد'}</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
