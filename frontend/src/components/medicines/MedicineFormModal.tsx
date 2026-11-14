import { useBusinessTerminology } from '../../hooks/useBusinessTerminology';
import React, { useState, useEffect } from 'react';
import { Medicine, MedicineUnit, UnitType, CreateMedicineInput, medicinesApi } from '../../api/medicines';
import { X, Plus, Trash2, Check, Sparkles, Barcode, HelpCircle } from 'lucide-react';

interface MedicineFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateMedicineInput) => void;
  medicine?: Medicine | null;
  categories: string[];
  isLoading?: boolean;
  onOpenExisting?: (medicine: Medicine) => void;
}

const DEFAULT_UNITS: Array<{ unitType: UnitType; label?: string; multiplier: number; price: number; minSalePrice?: number; isDefault: boolean }> = [
  { unitType: 'BOX', label: 'علبة', multiplier: 20, price: 50, minSalePrice: 50, isDefault: true },
  { unitType: 'STRIP', label: 'شريط', multiplier: 10, price: 25, minSalePrice: 25, isDefault: false },
  { unitType: 'UNIT', label: 'حبة', multiplier: 1, price: 2.5, minSalePrice: 2.5, isDefault: false },
];

export const MedicineFormModal: React.FC<MedicineFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  medicine,
  categories,
  isLoading = false,
  onOpenExisting,
}) => {
  const terms = useBusinessTerminology();
  const isPharmacy = terms.type === 'PHARMACY';
  const itemNameLabel = isPharmacy ? 'الاسم التجاري للدواء' : 'اسم الصنف';
  const unitLabel = (type: UnitType) => type === 'UNIT' ? terms.units.PIECE : terms.units[type];
  const isEditing = !!medicine;
  const [isWeighed, setIsWeighed] = useState(false);
  const [scalePlu, setScalePlu] = useState('');

  const [tradeName, setTradeName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [minStockLevel, setMinStockLevel] = useState(10);

  const [existingSuggestions, setExistingSuggestions] = useState<Medicine[]>([]);
  const [isSearchingExisting, setIsSearchingExisting] = useState(false);

  const [units, setUnits] = useState<
    Array<{
      unitType: UnitType;
      label?: string;
      multiplier: number;
      price: number;
      minSalePrice?: number;
      barcode?: string;
      isDefault?: boolean;
    }>
  >([]);

  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setIsWeighed(!!medicine?.isWeighed);
    setScalePlu(medicine?.scalePlu || '');
    if (medicine) {
      setTradeName(medicine.tradeName || '');
      setScientificName(medicine.scientificName || '');
      setBarcode(medicine.barcode || '');
      setCode(medicine.code || '');
      setCategory(medicine.category || '');
      setIsCustomCategory(false);
      setMinStockLevel(medicine.minStockLevel || 10);
      setUnits(
        medicine.units.map((u) => ({
          unitType: u.unitType,
          label: u.label || (medicine.isWeighed ? 'كيلوجرام' : (u.unitType === 'BOX' ? 'علبة' : u.unitType === 'STRIP' ? 'شريط' : 'حبة')),
          multiplier: u.multiplier,
          price: Number(u.price),
          minSalePrice: u.minSalePrice !== undefined && u.minSalePrice !== null ? Number(u.minSalePrice) : Number(u.price),
          barcode: u.barcode || '',
          isDefault: u.isDefault,
        }))
      );
    } else {
      setTradeName('');
      setScientificName('');
      setBarcode('');
      setCode('');
      setCategory(categories[0] || (isPharmacy ? 'مضادات حيوية' : 'عام'));
      setIsCustomCategory(false);
      setMinStockLevel(10);
      setUnits(DEFAULT_UNITS);
    }
    setExistingSuggestions([]);
    setFormError(null);
  }, [medicine, isOpen, categories, isPharmacy]);

  useEffect(() => {
    if (isEditing || !isOpen || tradeName.trim().length < 2) {
      setExistingSuggestions([]);
      setIsSearchingExisting(false);
      return;
    }

    const query = tradeName.trim();
    setIsSearchingExisting(true);

    const timer = setTimeout(async () => {
      try {
        const res = await medicinesApi.search(query);
        if (Array.isArray(res)) {
          setExistingSuggestions(res.slice(0, 8));
        } else {
          setExistingSuggestions([]);
        }
      } catch {
        setExistingSuggestions([]);
      } finally {
        setIsSearchingExisting(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [tradeName, isEditing, isOpen]);

  if (!isOpen) return null;

  const handleGenerateBarcode = () => {
    const random = Math.floor(100000000000 + Math.random() * 900000000000);
    setBarcode(`622${random.toString().slice(0, 9)}`);
  };

  const handleGenerateScaleCode = () => {
    const scaleNum = Math.floor(10001 + Math.random() * 89998).toString();
    setIsWeighed(true);
    setScalePlu(scaleNum);
    setBarcode(scaleNum);
    setCode(scaleNum);
    setUnits([
      {
        unitType: 'UNIT',
        label: 'كيلوجرام',
        multiplier: 1000,
        price: units[0]?.price || 100,
        minSalePrice: units[0]?.price || 100,
        barcode: scaleNum,
        isDefault: true,
      },
    ]);
  };

  const handleAddUnit = (type: UnitType) => {
    if (units.some((u) => u.unitType === type)) return;
    const defaultMultipliers: Record<UnitType, number> = {
      BOX: isWeighed ? 50000 : 20,
      STRIP: isWeighed ? 10000 : 10,
      UNIT: isWeighed ? 1000 : 1,
    };
    const defaultLabels: Record<UnitType, string> = {
      BOX: isWeighed ? 'شوال' : 'علبة',
      STRIP: isWeighed ? 'عبوة' : 'شريط',
      UNIT: isWeighed ? 'كيلوجرام' : 'حبة',
    };
    setUnits([
      ...units,
      {
        unitType: type,
        label: defaultLabels[type],
        multiplier: defaultMultipliers[type],
        price: 10,
        minSalePrice: 10,
        isDefault: units.length === 0,
      },
    ]);
  };

  const handleRemoveUnit = (index: number) => {
    if (units.length <= 1) {
      alert('يجب الإبقاء على وحدة قياس واحدة على الأقل');
      return;
    }
    const filtered = units.filter((_, i) => i !== index);
    if (!filtered.some((u) => u.isDefault)) {
      filtered[0].isDefault = true;
    }
    setUnits(filtered);
  };

  const handleSetDefaultUnit = (index: number) => {
    setUnits(
      units.map((u, i) => ({
        ...u,
        isDefault: i === index,
      }))
    );
  };

  const handleUnitChange = (index: number, field: string, value: any) => {
    if (isWeighed && (field === 'minSalePrice' || (field === 'multiplier' && units[index]?.unitType === 'UNIT'))) return;
    setUnits(
      units.map((u, i) => {
        if (i !== index) return u;
        const updated = {
          ...u,
          [field]: value,
        };
        if (field === 'price' && (!isEditing || u.minSalePrice === undefined || u.minSalePrice === u.price)) {
          updated.minSalePrice = value;
        }
        return updated;
      })
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const finalCategory = isCustomCategory ? newCategoryInput.trim() : category.trim();

    if (!tradeName.trim()) {
      setFormError(`يرجى كتابة ${itemNameLabel}`);
      return;
    }
    if (isPharmacy && !scientificName.trim()) {
      setFormError('يرجى كتابة الاسم العلمي والمادة الفعالة');
      return;
    }
    if (!barcode.trim()) {
      setFormError('الباركود الرئيسي مطلوب');
      return;
    }
    if (!finalCategory) {
      setFormError(`يرجى تحديد أو إدخال ${terms.categoryLabel}`);
      return;
    }
    if (units.length === 0) {
      setFormError('يجب تحديد وحدة قياس واحدة على الأقل');
      return;
    }

    // التحقق من صحة الأسعار ومعاملات التحويل والحد الأدنى لسعر البيع
    for (const u of units) {
      if (isNaN(u.price) || u.price < 0) {
        setFormError(`السعر للوحدة (${u.unitType}) غير صالح`);
        return;
      }
      const minPrice = u.minSalePrice !== undefined && !isNaN(u.minSalePrice) ? u.minSalePrice : u.price;
      if (isNaN(minPrice) || minPrice < 0) {
        setFormError(`الحد الأدنى لسعر البيع للوحدة (${u.unitType}) غير صالح`);
        return;
      }
      if (minPrice > u.price) {
        setFormError(`الحد الأدنى لسعر البيع للوحدة (${u.unitType}) لا يمكن أن يتجاوز سعر البيع الافتراضي`);
        return;
      }
      if (isNaN(u.multiplier) || u.multiplier < 1) {
        setFormError(`معامل التحويل للوحدة (${u.unitType}) يجب أن يكون 1 أو أكثر`);
        return;
      }
    }

    if (isWeighed && !/^\d{5}$/.test(scalePlu)) { setFormError('PLU يجب أن يكون 5 أرقام كما في الميزان'); return; }
    if (isWeighed) {
      const kilo = units.find((u) => u.unitType === 'UNIT');
      if (!kilo || Number(kilo.multiplier) !== 1000) {
        setFormError('الصنف الموزون يجب أن يحتوي وحدة كيلو بمعامل 1000 جرام');
        return;
      }
    }
    const payload: CreateMedicineInput = {
      isWeighed,
      scalePlu: isWeighed ? scalePlu : undefined,
      tradeName: tradeName.trim(),
      scientificName: isPharmacy ? scientificName.trim() : (medicine?.scientificName || ''),
      barcode: barcode.trim(),
      code: code.trim() || undefined,
      category: finalCategory,
      minStockLevel: Number(minStockLevel) || 10,
      units: units.map((u) => ({
        unitType: u.unitType,
        label: isWeighed && u.unitType === 'UNIT' ? 'كيلوجرام' : (u.label?.trim() || (u.unitType === 'BOX' ? 'علبة' : u.unitType === 'STRIP' ? 'شريط' : 'حبة')),
        multiplier: Number(u.multiplier),
        price: Number(u.price),
        minSalePrice: isWeighed ? Number(u.price) : Number(u.minSalePrice !== undefined && !isNaN(u.minSalePrice) ? u.minSalePrice : u.price),
        barcode: u.barcode?.trim() || undefined,
        isDefault: !!u.isDefault,
      })),
    };

    onSubmit(payload);
  };

  const availableUnitTypes: UnitType[] = (['BOX', 'STRIP', 'UNIT'] as UnitType[]).filter(
    (t) => !units.some((u) => u.unitType === t)
  );

  const getUnitTypeLabel = (type: UnitType) => {
    switch (type) {
      case 'BOX':
        return `📦 ${terms.units.BOX} (BOX)`;
      case 'STRIP':
        return `📑 ${terms.units.STRIP} (STRIP)`;
      case 'UNIT':
        return isWeighed ? 'كيلوجرام (1000 جرام مخزون)' : `${terms.units.PIECE} (UNIT)`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl">
      <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#582949] text-white">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 text-xl">{terms.icon}</span>
            <div>
              <h2 className="text-lg font-bold">
                {isEditing ? `تعديل ${isPharmacy ? 'صنف دوائي' : 'صنف'}: ${medicine?.tradeName}` : (isPharmacy ? 'إضافة دواء جديد لدليل الأدوية' : 'إضافة صنف جديد')}
              </h2>
              <p className="text-xs text-pink-200">
                {isPharmacy ? 'تسجيل البيانات الصيدلانية، تسعير الوحدات المتعددة، وتحديد حدود المخزون' : 'تسجيل بيانات الصنف، تسعير الوحدات، وتحديد حدود المخزون'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-pink-200 hover:bg-white/10 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {formError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            ⚠️ {formError}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-2">
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={isWeighed} onChange={e=>{ setIsWeighed(e.target.checked); if(e.target.checked) setUnits([{unitType:'UNIT',label:'كيلوجرام',multiplier:1000,price:units[0]?.price || 100,minSalePrice:units[0]?.price || 100,isDefault:true}]); else setUnits(DEFAULT_UNITS); }} />صنف موزون — البيع بالكيلو والمخزون بالجرام</label>
              {isWeighed && <><label className="block text-sm">كود الصنف في الميزان PLU (5 أرقام)<input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} value={scalePlu} onChange={e=>setScalePlu(e.target.value)} className="mr-2 rounded border p-2" /></label><p className="text-xs">أدخل سعر الكيلو. مثال: 0.250 كيلو تخصم 250 جراماً. لا تحوّل صنفاً له مخزون قديم مباشرة. رصيد الجرد بالجرام.</p></>}
            </div>

          {/* 1. المعلومات الأساسية */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <span>📋</span> {isPharmacy ? 'البيانات الدوائية الأساسية' : 'بيانات الصنف الأساسية'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {itemNameLabel} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder={isPharmacy ? 'مثال: أوجمنتين 1 جم أقراص (Augmentin 1g)' : 'مثال: أرز بسمتي 1 كيلو'}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                />
                {existingSuggestions.length > 0 && !isEditing && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/60 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300 mb-2">
                      <span>⚠️</span>
                      <span>قد يكون الصنف مسجلاً مسبقاً؛ راجع النتائج قبل الحفظ:</span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {existingSuggestions.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-amber-100 dark:border-amber-900/40"
                        >
                          <div className="flex-1 truncate">
                            <span className="font-bold text-slate-800 dark:text-white ml-2">{item.tradeName}</span>
                            <span className="text-[11px] text-slate-500 font-mono ml-2">[{item.code}]</span>
                            <span className="text-[11px] text-slate-400 font-mono ml-2">#{item.barcode}</span>
                            <span className="text-[11px] text-teal-600 dark:text-teal-400">
                              ({item.units?.map((u) => u.label || u.unitType).join(', ')})
                            </span>
                          </div>
                          {onOpenExisting && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenExisting(item);
                                setExistingSuggestions([]);
                              }}
                              className="mr-2 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              فتح للتعديل
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {isPharmacy && <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الاسم العلمي والمادة الفعالة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={scientificName}
                  onChange={(e) => setScientificName(e.target.value)}
                  placeholder="مثال: Amoxicillin + Clavulanic Acid 1000mg"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                />
              </div>}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الباركود الرئيسي (باركود العبوة) <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="امسح بالباركود أو اكتب الرقم..."
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                    title="توليد باركود تلقائي"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    توليد
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateScaleCode}
                    className="px-3 py-2 bg-teal-50 dark:bg-teal-900/40 hover:bg-teal-100 text-teal-800 dark:text-teal-300 border border-teal-200 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                    title="تجهيز كصنف ميزان إلكتروني (كود من 5 أرقام يطابق باركود الميزان)"
                  >
                    <span>⚖️</span>
                    صنف ميزان
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  لأصناف الميزان: أدخل كود الصنف في الميزان (مثلاً 5 أرقام مثل <code className="font-mono">10001</code>) أو اضغط <strong>⚖️ صنف ميزان</strong>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  كود الصنف الداخلي (Code)
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="يولد تلقائياً إن ترك فارغاً (مثال: MED-001)"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {terms.categoryLabel} <span className="text-rose-500">*</span>
                </label>
                {!isCustomCategory ? (
                  <div className="flex gap-2">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCategory(true);
                        setNewCategoryInput('');
                      }}
                      className="px-3 py-2 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-xl text-xs font-bold hover:bg-teal-100 transition"
                    >
                      + تصنيف جديد
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      placeholder="اكتب اسم التصنيف الجديد..."
                      className="flex-1 rounded-xl border border-teal-500 px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomCategory(false)}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  حد الطلب الأدنى (تنبيه نقص المخزون)
                </label>
                <input
                  type="number"
                  min={0}
                  value={minStockLevel}
                  onChange={(e) => setMinStockLevel(parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* 2. وحدات القياس والتسعير */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>⚖️</span> وحدات القياس وتعدد التسعير ({terms.units.BOX} / {terms.units.STRIP} / {terms.units.PIECE})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  حدد معاملات التحويل وسعر البيع لكل وحدة، مع اختيار الوحدة الافتراضية للبيع
                </p>
              </div>

              {availableUnitTypes.length > 0 && (
                <div className="flex gap-1.5">
                  {availableUnitTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleAddUnit(type)}
                      className="px-2.5 py-1 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 rounded-lg text-xs font-bold transition flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة {unitLabel(type)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {units.map((unit, idx) => (
                <div
                  key={unit.unitType}
                  className={`p-4 rounded-xl border transition-all ${
                    unit.isDefault
                      ? 'border-teal-500 bg-teal-50/40 dark:bg-teal-950/20'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700/60 text-xs">
                    <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white">
                      <span>{getUnitTypeLabel(unit.unitType)}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                        <input
                          type="radio"
                          name="defaultUnitGroup"
                          checked={unit.isDefault}
                          onChange={() => handleSetDefaultUnit(idx)}
                          className="w-4 h-4 text-teal-600 cursor-pointer"
                        />
                        <span>الوحدة الافتراضية للبيع</span>
                      </label>

                      {units.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveUnit(idx)}
                          className="p-1 text-rose-500 hover:bg-rose-100 rounded-md transition"
                          title="حذف هذه الوحدة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        اسم الوحدة الظاهر
                      </label>
                      <input
                        type="text"
                        disabled={isWeighed && unit.unitType === 'UNIT'}
                        value={isWeighed && unit.unitType === 'UNIT' ? 'كيلوجرام' : (unit.label ?? '')}
                        onChange={(e) => handleUnitChange(idx, 'label', e.target.value)}
                        placeholder={unit.unitType === 'BOX' ? 'علبة' : unit.unitType === 'STRIP' ? 'شريط' : 'حبة'}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        معامل التحويل (كم {terms.units.baseUnitPlural} تحتوي؟)
                      </label>
                      <input
                        type="number"
                        min={1}
                        disabled={unit.unitType === 'UNIT'}
                        value={unit.unitType === 'UNIT' ? (isWeighed ? 1000 : 1) : unit.multiplier}
                        onChange={(e) =>
                          handleUnitChange(idx, 'multiplier', parseInt(e.target.value, 10) || 1)
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        سعر بيع هذه الوحدة (ج.م / ج.س)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        required
                        value={unit.price}
                        onChange={(e) =>
                          handleUnitChange(idx, 'price', parseFloat(e.target.value) || 0)
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-bold font-mono text-teal-700 dark:text-teal-400 bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        الحد الأدنى لسعر البيع (ج.م / ج.س)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={unit.price}
                        disabled={isWeighed}
                        required
                        value={isWeighed ? unit.price : (unit.minSalePrice !== undefined ? unit.minSalePrice : unit.price)}
                        onChange={(e) =>
                          handleUnitChange(idx, 'minSalePrice', parseFloat(e.target.value) || 0)
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-bold font-mono text-amber-700 dark:text-amber-400 bg-white dark:bg-slate-900 disabled:opacity-60 disabled:bg-slate-100 dark:disabled:bg-slate-800"
                        title={isWeighed ? 'غير قابل للتعديل للصنف الموزون' : 'أقل سعر مسموح به عند تعديل السعر في نقطة البيع'}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        باركود مخصص لهذه الوحدة (اختياري)
                      </label>
                      <input
                        type="text"
                        value={unit.barcode || ''}
                        onChange={(e) => handleUnitChange(idx, 'barcode', e.target.value)}
                        placeholder="باركود الوحدة (اختياري)"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-lg shadow-teal-600/20 disabled:opacity-50 flex items-center gap-2 transition cursor-pointer"
          >
            {isLoading ? (
              <span>جاري الحفظ...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{isEditing ? 'تحديث بيانات الصنف' : 'حفظ الصنف والوحدات'}</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
