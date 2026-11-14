import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasingApi, suppliersApi } from '../../api/purchasing';
import { apiFetch } from '../../api/http';
import { branchesApi } from '../../api/branches';
import { useDebounce } from '../../hooks/useDebounce';
import { getCurrentUser } from '../../utils/permissions';
import {
  Truck,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  X,
  Search,
  Package,
  Barcode,
  Loader2,
  Receipt,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { LandedCostHelpModal } from './LandedCostHelpModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ItemRow {
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  previousCostPrice?: number;
}

interface ExpenseRow {
  id: string;
  title: string;
  amount: number | '';
  paymentMethod: 'CASH' | 'BANK';
  notes?: string;
}

export const PurchaseOrderModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [supplierId, setSupplierId] = useState('');
  const selectedSupplierLabelRef = useRef('');
  const [branchId, setBranchId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  // الخيار الثاني هو الأساس والموصى به
  const [allocationMethod, setAllocationMethod] = useState<'LANDED_COST' | 'PERIOD_EXPENSE'>('LANDED_COST');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([
    {
      id: 'exp-1',
      title: 'نولون شحن',
      amount: '',
      paymentMethod: 'CASH',
      notes: '',
    },
  ]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [notes, setNotes] = useState('');

  // حالة البحث ومسح الباركود السريع (مثل شاشة POS)
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);

  const debouncedInput = useDebounce(barcodeInput, 200);
  const queryClient = useQueryClient();

  // Queries
  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup'],
    queryFn: () => branchesApi.getAll({ limit: 100 }),
  });
  const branches = branchesData?.items || [];
  const userBranchId = getCurrentUser()?.branchId;
  const availableBranches = userBranchId ? branches.filter((branch: any) => branch.id === userBranchId) : branches;
  const selectedBranchId = userBranchId || branchId || (availableBranches.length > 0 ? availableBranches[0].id : '');

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-lookup', selectedBranchId],
    queryFn: () => suppliersApi.getAll({ branchId: selectedBranchId, limit: 100 }),
    enabled: !!selectedBranchId,
  });
  const suppliers = suppliersData?.items || [];
  const selectedSupplier = suppliers.find((supplier: any) => supplier.id === supplierId);

  // Keep the selected supplier visible while the lookup list is refreshing.
  useEffect(() => {
    if (selectedSupplier) {
      selectedSupplierLabelRef.current = `${selectedSupplier.name}${selectedSupplier.companyName ? ` (${selectedSupplier.companyName})` : ''}`;
    }
  }, [selectedSupplier]);

  // البحث المباشر عند الكتابة (مثل شاشة POS)
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const fetchMedicines = async () => {
      const q = debouncedInput.trim();
      // إذا كان الإدخال باركود رقمي طويل جداً (مسح ليزر سريع)، ننتظر معالجة الإدخال
      if (q.length < 2 || /^\d{8,}$/.test(q)) {
        setSearchResults([]);
        setSelectedIndex(-1);
        setSearchError('');
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setSearchError('');
      try {
        const branchQuery = selectedBranchId ? `&branchId=${encodeURIComponent(selectedBranchId)}` : '';
        const res = await apiFetch(`/api/medicines/search?q=${encodeURIComponent(q)}${branchQuery}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('تعذر البحث عن الأصناف');
        const data = await res.json();
        if (controller.signal.aborted) return;
        setSearchResults(Array.isArray(data) ? data : []);
        setSelectedIndex(-1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSelectedIndex(-1);
        setSearchError('تعذر جلب الأصناف. تحقق من اتصال السيرفر وحاول مجدداً.');
        console.error('خطأ أثناء البحث عن الأصناف:', err);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    };

    fetchMedicines();
    return () => controller.abort();
  }, [debouncedInput, isOpen, selectedBranchId]);

  // تركيز مؤشر الكتابة تلقائياً في حقل الباركود عند فتح الشاشة
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    } else {
      setBarcodeInput('');
      setSearchResults([]);
      setSelectedIndex(-1);
      setSearchError('');
    }
  }, [isOpen]);

  // التقاط مسح الباركود السريع بالليزر (Hardware Barcode Scanner)
  useEffect(() => {
    if (!isOpen) return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleWindowKeyDown = async (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement;
      // إذا كان يكتب في حقل آخر غير الباركود، نتجاهل إلا إذا كان مسحاً سريعاً من جهاز القارئ
      const isTypingInOtherInput =
        activeElement &&
        activeElement.tagName === 'INPUT' &&
        activeElement !== barcodeInputRef.current;

      const now = Date.now();
      if (now - lastKeyTime > 70) {
        buffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          e.preventDefault();
          const scannedCode = buffer.trim();
          buffer = '';
          await handleScanDirect(scannedCode);
        }
      } else if (e.key.length === 1 && !isTypingInOtherInput) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [isOpen, items, selectedBranchId]);

  // Mutations
  const createOrderMutation = useMutation({
    mutationFn: purchasingApi.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      alert('تم حفظ مسودة أمر الشراء بنجاح!');
      onClose();
      onSuccess?.();
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل حفظ أمر الشراء');
    },
  });

  const directReceiveMutation = useMutation({
    mutationFn: purchasingApi.directReceive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      alert('تم توريد واستلام البضاعة وتحديث الدفعات والمخزون بنجاح!');
      onClose();
      onSuccess?.();
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل استلام وتوريد البضاعة');
    },
  });

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
  const extraExpenses = expenses.reduce(
    (sum, e) => sum + (typeof e.amount === 'number' && !isNaN(e.amount) ? e.amount : 0),
    0
  );
  const totalLandedCost = totalAmount + (allocationMethod === 'LANDED_COST' ? extraExpenses : 0);
  const actualPaid = paidAmount === '' ? 0 : Number(paidAmount);
  const remainingDebt = Math.max(0, totalAmount - actualPaid);

  const computedExpenseNotes = expenses
    .filter((e) => (typeof e.amount === 'number' && e.amount > 0) || e.title.trim())
    .map(
      (e) =>
        `${e.title || 'مصروف'}: ${e.amount || 0} ج.س (${e.paymentMethod === 'BANK' ? 'بنك' : 'صندوق'}${
          e.notes ? ` - ${e.notes}` : ''
        })`
    )
    .join(' | ');

  const addExpenseRow = (defaultTitle = '') => {
    setExpenses((prev) => [
      ...prev,
      {
        id: `exp-${Date.now()}-${Math.random().toString().slice(2, 5)}`,
        title: defaultTitle,
        amount: '',
        paymentMethod: 'CASH',
        notes: '',
      },
    ]);
  };

  const updateExpenseField = (index: number, field: keyof ExpenseRow, value: any) => {
    const updated = [...expenses];
    updated[index] = { ...updated[index], [field]: value };
    setExpenses(updated);
  };

  const removeExpenseRow = (index: number) => {
    setExpenses((prev) => prev.filter((_, i) => i !== index));
  };

  const addMedicineRow = (med: any) => {
    const medId = med.id || med.medicineId;
    const existingIndex = items.findIndex((i) => i.medicineId === medId);

    if (existingIndex >= 0) {
      // زيادة الكمية إذا كان الصنف مضافاً مسبقاً
      const updated = [...items];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: Number(updated[existingIndex].quantity) + 1,
      };
      setItems(updated);
    } else {
      // توليد رقم تشغيلة افتراضي وتاريخ صلاحية لسنتين قادمتين
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 2);
      const defaultExpiry = nextYear.toISOString().slice(0, 10);
      const defaultBatch = `BN-${Date.now().toString().slice(-5)}`;

      const defaultUnit = med.units?.find((u: any) => u.isDefault) || med.units?.[0] || {};
      const previousCost = med.batches?.[0]?.costPrice
        ? Number(med.batches[0].costPrice) * (med.isWeighed ? 1000 : 1)
        : med.costPrice
        ? Number(med.costPrice)
        : undefined;
      const defaultCost = previousCost || (defaultUnit.price ? Number(defaultUnit.price) * 0.8 : 10);
      const defaultSale = defaultUnit.price ? Number(defaultUnit.price) : defaultCost * 1.25;

      setItems((prev) => [
        ...prev,
        {
          medicineId: medId,
          medicineName: med.tradeName + (med.isWeighed ? ' (كمية وسعر بالكيلو)' : ''),
          batchNumber: defaultBatch,
          expiryDate: defaultExpiry,
          quantity: 10,
          costPrice: Number(defaultCost),
          sellingPrice: Number(defaultSale),
          previousCostPrice: previousCost,
        },
      ]);
    }

    setBarcodeInput('');
    setSearchResults([]);
    setSelectedIndex(-1);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const handleScanDirect = async (code: string) => {
    try {
      // 1. محاولة مطابقة دقيقة بالباركود
      const branchQuery = selectedBranchId ? `&branchId=${encodeURIComponent(selectedBranchId)}` : '';
      const res = await apiFetch(`/api/medicines/scan?barcode=${encodeURIComponent(code)}${branchQuery}`);
      if (res.ok) {
        const product = await res.json();
        addMedicineRow(product);
        return true;
      }

      // 2. البحث بالاسم إذا لم يكن باركود
      const searchRes = await apiFetch(`/api/medicines/search?q=${encodeURIComponent(code)}${branchQuery}`);
      if (searchRes.ok) {
        const list = await searchRes.json();
        if (list && list.length > 0) {
          addMedicineRow(list[0]);
          return true;
        }
      }

      alert(`لم يتم العثور على صنف بالباركود أو الاسم: ${code}`);
      return false;
    } catch {
      console.error('فشل معالجة الباركود');
      return false;
    }
  };

  const handleBarcodeOrSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = barcodeInput.trim();
    if (!query) return;

    if (searchResults.length > 0 && selectedIndex >= 0 && selectedIndex < searchResults.length) {
      addMedicineRow(searchResults[selectedIndex]);
      return;
    }

    if (searchResults.length === 1) {
      addMedicineRow(searchResults[0]);
      return;
    }

    await handleScanDirect(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
        return;
      }
      if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < searchResults.length) {
        e.preventDefault();
        addMedicineRow(searchResults[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setSearchResults([]);
        setSelectedIndex(-1);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeOrSearchSubmit();
    }
  };

  const removeItemRow = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItemField = (index: number, field: keyof ItemRow, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const validateForm = () => {
    if (!supplierId) {
      alert('يرجى اختيار المورد');
      return false;
    }
    if (items.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل للطلب');
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of items) {
      if (!item.batchNumber.trim()) {
        alert(`يرجى كتابة رقم التشغيلة للصنف ${item.medicineName}`);
        return false;
      }
      if (!item.expiryDate || new Date(item.expiryDate) <= today) {
        alert(`تاريخ الصلاحية للصنف ${item.medicineName} يجب أن يكون تاريخاً مستقبلياً`);
        return false;
      }
      if (item.quantity <= 0) {
        alert(`الكمية للصنف ${item.medicineName} يجب أن تكون 1 على الأقل`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = (actionType: 'draft' | 'receive') => {
    if (!validateForm()) return;
    const payload = {
      branchId: selectedBranchId,
      supplierId,
      invoiceNumber: invoiceNumber || undefined,
      paidAmount: actualPaid,
      additionalExpenses: extraExpenses > 0 ? extraExpenses : undefined,
      expenseAllocationMethod: allocationMethod,
      expenseNotes: computedExpenseNotes || undefined,
      notes: notes || undefined,
      items: items.map((i) => ({
        medicineId: i.medicineId,
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate,
        quantity: Number(i.quantity),
        costPrice: Number(i.costPrice),
        sellingPrice: Number(i.sellingPrice) || undefined,
      })),
    };

    if (actionType === 'draft') {
      createOrderMutation.mutate(payload);
    } else {
      directReceiveMutation.mutate(payload);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-600" />
            فاتورة مشتريات وتوريد مخزني جديد
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الفرع المستلم *</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-teal-500"
              >
                {availableBranches.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المورد / شركة الأدوية *</label>
              <select
                value={supplierId}
                onChange={(e) => {
                  const nextSupplierId = e.target.value;
                  setSupplierId(nextSupplierId);
                  const nextSupplier = suppliers.find((supplier: any) => supplier.id === nextSupplierId);
                  if (nextSupplier) {
                    selectedSupplierLabelRef.current = `${nextSupplier.name}${nextSupplier.companyName ? ` (${nextSupplier.companyName})` : ''}`;
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-teal-500"
              >
                <option value="">اختر المورد...</option>
                {supplierId && !selectedSupplier && (
                  <option value={supplierId}>{selectedSupplierLabelRef.current || 'المورد المختار (جار التحقق...)'}</option>
                )}
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.companyName ? `(${s.companyName})` : ''} - (دين: {Number(s.currentDebt).toLocaleString()} ج.س)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم فاتورة المورد الورقية</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="مثال: SUP-INV-9821"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* شريط مسح الباركود والبحث الفوري الذكي بالاسم (POS Style) */}
          <div className="relative rounded-2xl border-2 border-teal-500 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
                  <Barcode size={15} className="text-teal-600" />
                  <span>مسح الباركود أو البحث الفوري بالاسم</span>
                </span>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  (اكتب أي حرفين ليبدأ البحث فوراً أو استخدم جهاز مسح الباركود)
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">
                ⚡ جاهز للمسح
              </span>
            </div>

            <div className="relative">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => {
                  setBarcodeInput(e.target.value);
                  setSearchResults([]);
                  setSelectedIndex(-1);
                  setSearchError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="امسح الباركود بجهاز الليزر أو اكتب اسم الصنف / التركيبة (مثال: pan, aug, كولد)..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pr-10 pl-24 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-100 focus:outline-none transition"
                autoFocus
              />
              <div className="absolute right-3.5 top-3.5 text-slate-400">
                {isSearching ? (
                  <Loader2 size={18} className="animate-spin text-teal-600" />
                ) : (
                  <Search size={18} />
                )}
              </div>

              {barcodeInput && (
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput('');
                    setSearchResults([]);
                    setSelectedIndex(-1);
                    barcodeInputRef.current?.focus();
                  }}
                  className="absolute left-16 top-3 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 cursor-pointer"
                  title="مسح حقل البحث"
                >
                  <X size={16} />
                </button>
              )}

              <button
                type="button"
                onClick={() => handleBarcodeOrSearchSubmit()}
                className="absolute left-2 top-2 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 active:scale-[0.98] text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
              >
                إضافة
              </button>

              {/* القائمة المنسدلة التلقائية لنتائج البحث الفوري (Autocomplete) */}
              {searchResults.length > 0 && (
                <div className="relative z-10 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-teal-200 bg-white shadow-lg divide-y divide-slate-100">
                  <div className="bg-teal-50 px-4 py-2 text-xs font-bold text-teal-800 flex justify-between items-center border-b border-teal-100">
                    <span>نتائج البحث ({searchResults.length}): تنقل بالأسهم ⬆️ ⬇️ ثم اضغط Enter أو انقر للإضافة</span>
                    <span className="text-[10px] text-slate-400">Esc للإغلاق</span>
                  </div>
                  {searchResults.map((med: any, idx: number) => {
                    const isSelected = idx === selectedIndex;
                    const defaultUnit = med.units?.find((u: any) => u.isDefault) || med.units?.[0];
                    return (
                      <div
                        key={med.id || idx}
                        onClick={() => addMedicineRow(med)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`cursor-pointer px-4 py-2.5 transition-colors flex items-center justify-between ${
                          isSelected ? 'bg-teal-50 border-r-4 border-teal-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{med.tradeName}</span>
                            {med.code && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                                {med.code}
                              </span>
                            )}
                            {med.category && (
                              <span className="rounded bg-teal-50 text-teal-700 border border-teal-100 px-1.5 py-0.2 text-[10px]">
                                {med.category}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                            <span>{med.scientificName || '—'}</span>
                            {med.barcode && (
                              <span className="font-mono text-slate-400 text-[11px] flex items-center gap-1">
                                <Barcode size={12} />
                                {med.barcode}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-left flex items-center gap-3 shrink-0 mr-3">
                          {defaultUnit?.price && (
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 block">سعر البيع المقترح</span>
                              <span className="font-mono font-bold text-teal-700 text-xs">
                                {Number(defaultUnit.price).toLocaleString()} ج.س
                              </span>
                            </div>
                          )}
                          <span className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs">
                            <Plus size={14} />
                            <span>إضافة</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {barcodeInput.trim().length >= 2 && !isSearching && searchResults.length === 0 && !/^\d{8,}$/.test(barcodeInput.trim()) && (
                <div className="relative z-10 mt-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600" role="status">
                  {searchError || 'لا توجد أصناف مطابقة للاسم المكتوب.'}
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <th className="p-2.5 text-right">الصنف</th>
                  <th className="p-2.5 text-right">رقم التشغيلة (Batch)</th>
                  <th className="p-2.5 text-right">تاريخ الانتهاء</th>
                  <th className="p-2.5 text-right">الكمية</th>
                  <th className="p-2.5 text-right">
                    <span>سعر الشراء</span>
                    {extraExpenses > 0 && allocationMethod === 'LANDED_COST' && (
                      <span className="block text-[10px] text-teal-600 font-bold">التكلفة بعد النولون</span>
                    )}
                  </th>
                  <th className="p-2.5 text-right">سعر البيع المقترح</th>
                  <th className="p-2.5 text-right">الإجمالي</th>
                  <th className="p-2.5 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-400 italic">
                      لم يتم إضافة أصناف بعد. ابحث عن صنف أعلاه لإضافته.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => {
                    const rowBase = item.quantity * item.costPrice;
                    const ratio = totalAmount > 0 ? rowBase / totalAmount : 0;
                    const rowAllocatedExp = ratio * extraExpenses;
                    const rowLandedCost = item.quantity > 0 ? item.costPrice + (rowAllocatedExp / item.quantity) : item.costPrice;

                    return (
                      <tr key={index}>
                        <td className="p-2 font-bold text-slate-800">{item.medicineName}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.batchNumber}
                            onChange={(e) => updateItemField(index, 'batchNumber', e.target.value)}
                            className="w-28 px-2 py-1 border border-slate-300 rounded font-mono font-semibold"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => updateItemField(index, 'expiryDate', e.target.value)}
                            className="px-2 py-1 border border-slate-300 rounded font-mono"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={item.quantity}
                            onChange={(e) => updateItemField(index, 'quantity', parseFloat(e.target.value) || 0.001)}
                            className="w-16 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-center"
                          />
                        </td>
                        <td className="p-2">
                          <div className="space-y-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.costPrice}
                              onChange={(e) => updateItemField(index, 'costPrice', parseFloat(e.target.value) || 0)}
                              className="w-24 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-right"
                            />
                            {/* مقارنة سعر الشراء السابق مع الحالي */}
                            {item.previousCostPrice !== undefined && item.previousCostPrice > 0 && (
                              <div className="text-[10px] leading-tight font-bold">
                                {item.costPrice > item.previousCostPrice ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200" title={`سعر الشراء السابق: ${item.previousCostPrice} ج.س`}>
                                    🔺 +${(((item.costPrice - item.previousCostPrice) / item.previousCostPrice) * 100).toFixed(0)}% (سابقاً: ${item.previousCostPrice})
                                  </span>
                                ) : item.costPrice < item.previousCostPrice ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    🟢 -${(((item.previousCostPrice - item.costPrice) / item.previousCostPrice) * 100).toFixed(0)}% (سابقاً: ${item.previousCostPrice})
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[9px]">⚖️ التكلفة مستقرة</span>
                                )}
                              </div>
                            )}
                            {extraExpenses > 0 && allocationMethod === 'LANDED_COST' && (
                              <div className="text-[10px] text-teal-800 font-bold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 text-center font-mono">
                                منزل: {rowLandedCost.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="space-y-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.sellingPrice}
                              onChange={(e) => updateItemField(index, 'sellingPrice', parseFloat(e.target.value) || 0)}
                              className="w-24 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-teal-700 text-right"
                            />
                            {/* تحليل هامش الربح والتحذير من البيع بأقل من التكلفة */}
                            {(() => {
                              const effCost = allocationMethod === 'LANDED_COST' && extraExpenses > 0 ? rowLandedCost : item.costPrice;
                              const marginPct = item.sellingPrice > 0 ? (((item.sellingPrice - effCost) / item.sellingPrice) * 100).toFixed(0) : '0';
                              const isLoss = item.sellingPrice <= effCost;
                              return (
                                <div className="space-y-0.5 text-[10px]">
                                  {isLoss ? (
                                    <span className="block px-1 py-0.5 rounded bg-rose-600 text-white font-black text-center animate-pulse">
                                      ⚠️ خسارة! البيع &lt; التكلفة
                                    </span>
                                  ) : (
                                    <span className="block font-mono text-emerald-700 font-bold">
                                      هامش: {marginPct}%
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => updateItemField(index, 'sellingPrice', Number((effCost * 1.25).toFixed(2)))}
                                    className="text-[9px] font-bold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer block"
                                    title="تعديل سعر البيع تلقائياً بهامش ربح 25% فوق التكلفة"
                                  >
                                    تحديث البيع (+25%) ⚡
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="p-2 font-mono font-bold text-slate-900">
                          {(item.quantity * item.costPrice).toLocaleString()} ج.س
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItemRow(index)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* تنبيه هوامش الربح وارتفاع الأسعار المكتشف في الفاتورة */}
          {items.some((it) => it.previousCostPrice && it.costPrice > it.previousCostPrice) && (
            <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl text-xs flex items-center justify-between text-amber-900 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <strong className="block font-black text-amber-950">تنبيه ذكي: تم رصد زيادة في سعر التكلفة لبعض الأصناف!</strong>
                  <span>لحماية الأرباح من التآكل، تأكد من تحديث أسعار البيع المقترحة للأصناف التي ارتفع سعر توريدها.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setItems(
                    items.map((it) => {
                      if (it.previousCostPrice && it.costPrice > it.previousCostPrice) {
                        return { ...it, sellingPrice: Number((it.costPrice * 1.25).toFixed(2)) };
                      }
                      return it;
                    })
                  );
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-xs transition shrink-0 cursor-pointer"
              >
                تحديث تلقائي لهامش 25% للأصناف المرتفعة ⚡
              </button>
            </div>
          )}

          {/* قسم المصاريف الإضافية وتكليف المخزون (Landed Cost & Expenses) */}
          <div className="bg-gradient-to-r from-teal-50/70 via-slate-50 to-teal-50/40 p-4 rounded-xl border border-teal-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-sm">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>مصاريف إضافية على الفاتورة (نولون / شحن / عتالة / رسوم محلية)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    أدخل مبالغ الشحن والتفريغ واختر طريقة المعالجة المحاسبية وأثرها على المخزون
                  </p>
                </div>
              </div>

              {/* زر فتح النافذة التوضيحية */}
              <button
                type="button"
                onClick={() => setIsHelpOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-teal-300 text-teal-700 hover:bg-teal-50 shadow-sm transition hover:scale-105 active:scale-95"
              >
                <HelpCircle className="w-4 h-4 text-teal-600" />
                <span>دليل الفرق بين الخيارين والقيود المحاسبية</span>
              </button>
            </div>

            {/* جدول تفصيل المصاريف الإضافية التفاعلي */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>جدول تفصيل بنود المصاريف (يمكنك الزيادة والنقصان وإضافة أي سطر):</span>
                </span>
                {/* أزرار سريعة لإضافة مصروف */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => addExpenseRow('نولون شحن')}
                    className="px-2 py-1 text-[11px] font-semibold bg-white hover:bg-teal-50 text-teal-700 border border-teal-200 rounded-lg transition"
                  >
                    + نولون شحن
                  </button>
                  <button
                    type="button"
                    onClick={() => addExpenseRow('عتالة وتفريغ')}
                    className="px-2 py-1 text-[11px] font-semibold bg-white hover:bg-teal-50 text-teal-700 border border-teal-200 rounded-lg transition"
                  >
                    + عتالة وتفريغ
                  </button>
                  <button
                    type="button"
                    onClick={() => addExpenseRow('رسوم بلدية وتصاريح')}
                    className="px-2 py-1 text-[11px] font-semibold bg-white hover:bg-teal-50 text-teal-700 border border-teal-200 rounded-lg transition"
                  >
                    + رسوم محلية
                  </button>
                  <button
                    type="button"
                    onClick={() => addExpenseRow('')}
                    className="px-2.5 py-1 text-[11px] font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة سطر مصروف</span>
                  </button>
                </div>
              </div>

              {/* جدول المصاريف */}
              <div className="border border-teal-200 bg-white rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-xs">
                  <thead className="bg-teal-50/70 text-teal-900 font-bold border-b border-teal-100">
                    <tr>
                      <th className="p-2 text-right">بيان / نوع المصروف</th>
                      <th className="p-2 text-right w-36">المبلغ (ج.س) *</th>
                      <th className="p-2 text-right w-36">طريقة الدفع</th>
                      <th className="p-2 text-right">ملاحظات / جهة الصرف</th>
                      <th className="p-2 text-center w-12">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                          لا توجد مصاريف إضافية مسجلة. انقر على "إضافة سطر مصروف" أو الأزرار السريعة أعلاه.
                        </td>
                      </tr>
                    ) : (
                      expenses.map((exp, expIdx) => (
                        <tr key={exp.id || expIdx} className="hover:bg-slate-50/50">
                          <td className="p-2">
                            <input
                              type="text"
                              value={exp.title}
                              onChange={(e) => updateExpenseField(expIdx, 'title', e.target.value)}
                              placeholder="مثال: نولون شاحنة، عتالة، رسوم جمركية..."
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-teal-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={exp.amount}
                              onChange={(e) =>
                                updateExpenseField(
                                  expIdx,
                                  'amount',
                                  e.target.value === '' ? '' : parseFloat(e.target.value)
                                )
                              }
                              placeholder="0.00"
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-teal-800 focus:ring-2 focus:ring-teal-500 text-right bg-teal-50/30"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={exp.paymentMethod}
                              onChange={(e) =>
                                updateExpenseField(expIdx, 'paymentMethod', e.target.value as 'CASH' | 'BANK')
                              }
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-teal-500 font-medium"
                            >
                              <option value="CASH">نقداً (الصندوق)</option>
                              <option value="BANK">تحويل بنكي</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={exp.notes || ''}
                              onChange={(e) => updateExpenseField(expIdx, 'notes', e.target.value)}
                              placeholder="اسم السائق، رقم الإيصال..."
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeExpenseRow(expIdx)}
                              className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-lg transition"
                              title="حذف هذا السطر"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {expenses.length > 0 && (
                    <tfoot className="bg-teal-50/40 font-bold border-t border-teal-200 text-xs text-slate-800">
                      <tr>
                        <td className="p-2 text-right">إجمالي المصاريف الإضافية:</td>
                        <td className="p-2 font-mono text-teal-800 text-right font-black text-sm">
                          {extraExpenses.toLocaleString()} ج.س
                        </td>
                        <td colSpan={3} className="p-2 text-left text-slate-500 text-[11px]">
                          {expenses.filter((e) => Number(e.amount) > 0).length} بنود مسجلة
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* اختيار طريقة المعالجة المحاسبية */}
            <div className="pt-2 border-t border-teal-100">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                اختر طريقة المعالجة المحاسبية:
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* الخيار الثاني - الأساس والموصى به */}
                <label
                  className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                    allocationMethod === 'LANDED_COST'
                      ? 'bg-teal-50 border-teal-500 ring-2 ring-teal-500/20 shadow-sm'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="expenseAllocation"
                    value="LANDED_COST"
                    checked={allocationMethod === 'LANDED_COST'}
                    onChange={() => setAllocationMethod('LANDED_COST')}
                    className="mt-0.5 text-teal-600 focus:ring-teal-500"
                  />
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-teal-900">
                      <span>🔘 [الأساس] تحميل على تكلفة الأصناف وتعلية المخزون (Landed Cost)</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-teal-600 text-white font-bold">الموصى به</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      توزيع النولون والعتالة على سعر تكلفة كل دواء لرفع تكلفة الباتش بدقة وحماية هامش الربح الحقيقي.
                    </p>
                  </div>
                </label>

                {/* الخيار الأول */}
                <label
                  className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                    allocationMethod === 'PERIOD_EXPENSE'
                      ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="expenseAllocation"
                    value="PERIOD_EXPENSE"
                    checked={allocationMethod === 'PERIOD_EXPENSE'}
                    onChange={() => setAllocationMethod('PERIOD_EXPENSE')}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">
                      ⚪ تسجيل كمصروف تشغيلي مستقل للفترة (Period Expense)
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      عدم تعديل تكلفة شراء الأدوية، وقيد المصاريف الإضافية في قائمة الدخل كبند مصروفات عمومية.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block mb-1">قيمة بضاعة المورد</span>
              <p className="font-mono font-black text-lg text-slate-900">{totalAmount.toLocaleString()} ج.س</p>
            </div>
            {extraExpenses > 0 && (
              <div>
                <span className="text-slate-500 block mb-1">
                  المصاريف الإضافية ({allocationMethod === 'LANDED_COST' ? 'منزلة للمخزون' : 'مصروف تشغيلي'})
                </span>
                <p className="font-mono font-black text-lg text-teal-700">+{extraExpenses.toLocaleString()} ج.س</p>
              </div>
            )}
            <div>
              <label className="text-slate-500 block mb-1">المبلغ المسدد نقداً للمورد (ج.س)</label>
              <input
                type="number"
                min="0"
                max={totalAmount}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="0.00"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700 text-sm bg-white"
              />
            </div>
            <div>
              <span className="text-slate-500 block mb-1">المتبقي (آجل في ذمة المورد)</span>
              <p className="font-mono font-black text-lg text-rose-700">{remainingDebt.toLocaleString()} ج.س</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفاتورة</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="شروط الدفع، رقم السند، إلخ..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              إلغاء
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSubmit('draft')}
                disabled={createOrderMutation.isPending || directReceiveMutation.isPending || items.length === 0}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                {createOrderMutation.isPending ? 'جاري الحفظ...' : 'حفظ كمسودة (Draft)'}
              </button>
              <button
                type="button"
                onClick={() => handleSubmit('receive')}
                disabled={createOrderMutation.isPending || directReceiveMutation.isPending || items.length === 0}
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {directReceiveMutation.isPending ? 'جاري التوريد...' : 'استلام وتوريد فوري للمخزون'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* النافذة التوضيحية لدليل المعالجة المحاسبية وتكليف المخزون */}
      <LandedCostHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};
