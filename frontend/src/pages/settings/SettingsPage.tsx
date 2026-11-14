import React, { useState, useEffect } from 'react';
import {
  settingsApi,
  CompanySettingItem,
} from '../../api/settings';
import {
  currenciesApi,
  CompanyCurrency,
  GlobalCurrency,
  ExchangeRateHistoryItem,
} from '../../api/currencies';
import {
  BusinessType,
  BUSINESS_PROFILES,
  getBusinessType,
  setBusinessType,
} from '../../utils/business-terminology';
import {
  ScaleBarcodeSettings,
  getScaleBarcodeSettings,
  saveScaleBarcodeSettings,
  validateScaleSettings,
  scaleQuantity,
  parseScaleBarcode,
  buildSampleScaleBarcode,
} from '../../utils/scale-barcode';

type SettingsTab = 'general' | 'accounting' | 'sales' | 'scale' | 'currencies';

function sampleScaleBarcode(...args: Parameters<typeof buildSampleScaleBarcode>): string {
  try { return buildSampleScaleBarcode(...args); } catch { return ''; }
}

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states for settings key-value map
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});

  // Currency states
  const [companyCurrencies, setCompanyCurrencies] = useState<CompanyCurrency[]>([]);
  const [globalCurrencies, setGlobalCurrencies] = useState<GlobalCurrency[]>([]);
  const [selectedCurrencyHistory, setSelectedCurrencyHistory] = useState<ExchangeRateHistoryItem[]>([]);
  const [historyModalCurrency, setHistoryModalCurrency] = useState<CompanyCurrency | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showNewGlobalModal, setShowNewGlobalModal] = useState(false);
  const [selectedCurrencyForEdit, setSelectedCurrencyForEdit] = useState<CompanyCurrency | null>(null);

  // Forms for Currency Modals
  const [newCurrencyId, setNewCurrencyId] = useState('');
  const [newCurrencyRate, setNewCurrencyRate] = useState('1');
  const [newCurrencyIsBase, setNewCurrencyIsBase] = useState(false);

  const [updateRateValue, setUpdateRateValue] = useState('');
  const [updateRateReason, setUpdateRateReason] = useState('');

  const [globalCode, setGlobalCode] = useState('');
  const [globalNameAr, setGlobalNameAr] = useState('');
  const [globalNameEn, setGlobalNameEn] = useState('');
  const [globalSymbol, setGlobalSymbol] = useState('');
  const [globalDecimals, setGlobalDecimals] = useState(2);

  // Currency Converter widget state
  const [calcAmount, setCalcAmount] = useState<number>(100);
  const [calcFrom, setCalcFrom] = useState<string>('');
  const [calcTo, setCalcTo] = useState<string>('');
  const [calcResult, setCalcResult] = useState<number | null>(null);

  // Scale Barcode Settings & Live Simulator state
  const [scaleConfig, setScaleConfig] = useState<ScaleBarcodeSettings>(() =>
    getScaleBarcodeSettings(),
  );
  const [testScaleItemCode, setTestScaleItemCode] = useState<string>('10001');
  const [testScaleWeightGrams, setTestScaleWeightGrams] = useState<number>(1250);
  const [testScaleUnitPrice, setTestScaleUnitPrice] = useState<number>(100);
  const [testCustomBarcode, setTestCustomBarcode] = useState<string>(() =>
    sampleScaleBarcode('10001', 1250, '20'),
  );

  // Helper to get setting value with multiple possible keys and fallback
  const getVal = (keys: string[], def = ''): string => {
    for (const k of keys) {
      if (settingsForm[k] !== undefined && settingsForm[k] !== null && settingsForm[k] !== '') {
        return settingsForm[k];
      }
    }
    return def;
  };

  const setVal = (primaryKey: string, value: string) => {
    setSettingsForm((prev) => ({ ...prev, [primaryKey]: value }));
  };

  // Load all settings and currencies
  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [allSettings, compCurrs, globCurrs] = await Promise.all([
        settingsApi.getAll(),
        currenciesApi.listCompanyCurrencies(),
        currenciesApi.listGlobal(),
      ]);

      const flat: Record<string, string> = {};
      if (Array.isArray(allSettings)) {
        allSettings.forEach((item) => {
          if (item && item.key) {
            flat[item.key] = item.value ?? '';
          }
        });
      }
      if (flat.businessType || flat.BUSINESS_TYPE) {
        setBusinessType((flat.businessType || flat.BUSINESS_TYPE) as BusinessType);
      } else {
        flat.businessType = getBusinessType();
      }
      if (flat.scaleBarcodeConfig) {
        try {
          const parsedScale = JSON.parse(flat.scaleBarcodeConfig);
          const saved = saveScaleBarcodeSettings(parsedScale);
          setScaleConfig(saved);
        } catch {
          // keep local
        }
      }
      setSettingsForm(flat);

      const safeCompCurrs = Array.isArray(compCurrs) ? compCurrs : [];
      setCompanyCurrencies(safeCompCurrs);
      setGlobalCurrencies(Array.isArray(globCurrs) ? globCurrs : []);

      if (safeCompCurrs.length > 0) {
        const base = safeCompCurrs.find((c) => c.isBase) || safeCompCurrs[0];
        const other = safeCompCurrs.find((c) => !c.isBase) || safeCompCurrs[0];
        setCalcFrom(other.code);
        setCalcTo(base.code);
      }
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'حدث خطأ أثناء تحميل بيانات الإعدادات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Quick live currency converter effect
  useEffect(() => {
    if (!calcFrom || !calcTo || isNaN(calcAmount) || companyCurrencies.length === 0) {
      setCalcResult(null);
      return;
    }
    const fromObj = companyCurrencies.find((c) => c.code === calcFrom);
    const toObj = companyCurrencies.find((c) => c.code === calcTo);
    if (!fromObj || !toObj) return;

    // Convert: (amount * fromRate) / toRate
    const baseValue = calcAmount * Number(fromObj.exchangeRate || 1);
    const targetValue = toObj.exchangeRate > 0 ? baseValue / Number(toObj.exchangeRate) : 0;
    setCalcResult(Math.round(targetValue * 100) / 100);
  }, [calcAmount, calcFrom, calcTo, companyCurrencies]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveSuccessMessage(null);
    setErrorMessage(null);
    try {
      const updatedScale = validateScaleSettings(scaleConfig);
      const mergedForm: Record<string, string> = {
        ...settingsForm,
        scaleBarcodeConfig: JSON.stringify(updatedScale),
      };
      const payload = Object.entries(mergedForm).map(([key, value]) => ({
        key,
        value: String(value ?? ''),
      }));
      await settingsApi.updateBatch(payload);
      saveScaleBarcodeSettings(updatedScale);
      const selectedType = (mergedForm.businessType || mergedForm.BUSINESS_TYPE || 'PHARMACY') as BusinessType;
      setBusinessType(selectedType);
      setSaveSuccessMessage(
        `تم حفظ الإعدادات وإعدادات باركود الميزان وتفعيل وضع (${BUSINESS_PROFILES[selectedType]?.labelAr || 'المنشأة'}) بنجاح ✨`,
      );
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'تعذر حفظ إعدادات الميزان؛ لم يتم اعتماد التغيير');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('هل أنت متأكد من إعادة ضبط كافة الإعدادات إلى القيم الافتراضية؟')) return;
    setSaving(true);
    try {
      await settingsApi.resetDefaults();
      await loadData();
      setSaveSuccessMessage('تمت استعادة الإعدادات الافتراضية بنجاح.');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'فشل استعادة الإعدادات الافتراضية');
    } finally {
      setSaving(false);
    }
  };

  // Currency Handlers
  const handleAddCompanyCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrencyId) return;
    setSaving(true);
    try {
      await currenciesApi.addCompanyCurrency({
        currencyId: newCurrencyId,
        exchangeRate: parseFloat(newCurrencyRate) || 1,
        isBase: newCurrencyIsBase,
      });
      setShowAddModal(false);
      setNewCurrencyId('');
      setNewCurrencyRate('1');
      setNewCurrencyIsBase(false);
      await loadData();
      setSaveSuccessMessage('تمت إضافة العملة للشركة بنجاح');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'فشلت إضافة العملة');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateExchangeRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCurrencyForEdit) return;
    setSaving(true);
    try {
      await currenciesApi.updateExchangeRate(selectedCurrencyForEdit.id, {
        newRate: parseFloat(updateRateValue),
        reason: updateRateReason || 'تعديل يدوي من شاشة الإعدادات',
      });
      setShowRateModal(false);
      setSelectedCurrencyForEdit(null);
      setUpdateRateValue('');
      setUpdateRateReason('');
      await loadData();
      setSaveSuccessMessage('تم تحديث سعر الصرف وتسجيل الحركة في السجل التاريخي');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'فشل تحديث سعر الصرف');
    } finally {
      setSaving(false);
    }
  };

  const handleSetBaseCurrency = async (currency: CompanyCurrency) => {
    if (
      !window.confirm(
        `تنبيه هام: هل أنت متأكد من تعيين (${currency.nameAr} - ${currency.code}) كعملة أساسية للشركة؟\nسيتم جعل سعر صرفها = 1.0 تلقائياً.`
      )
    )
      return;
    setSaving(true);
    try {
      await currenciesApi.setBaseCurrency(currency.id);
      await loadData();
      setSaveSuccessMessage(`تم تعيين ${currency.nameAr} كعملة أساسية للشركة بنجاح.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'فشل تغيير العملة الأساسية');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCurrency = async (currency: CompanyCurrency) => {
    if (currency.isBase) {
      alert('لا يمكن حذف العملة الأساسية للشركة.');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف عملة (${currency.nameAr} - ${currency.code}) من قائمة عملات الشركة؟`)) return;
    setSaving(true);
    try {
      await currenciesApi.removeCompanyCurrency(currency.id);
      await loadData();
      setSaveSuccessMessage('تم حذف العملة بنجاح.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'فشل حذف العملة');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHistory = async (currency: CompanyCurrency) => {
    setHistoryModalCurrency(currency);
    setShowHistoryModal(true);
    try {
      const history = await currenciesApi.getHistory(currency.currencyId);
      setSelectedCurrencyHistory(Array.isArray(history) ? history : []);
    } catch (err) {
      setSelectedCurrencyHistory([]);
    }
  };

  const handleCreateGlobalCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await currenciesApi.createGlobal({
        code: globalCode.toUpperCase().trim(),
        nameAr: globalNameAr.trim(),
        nameEn: globalNameEn.trim(),
        symbol: globalSymbol.trim(),
        decimalPlaces: Number(globalDecimals) || 2,
      });
      setShowNewGlobalModal(false);
      setGlobalCode('');
      setGlobalNameAr('');
      setGlobalNameEn('');
      setGlobalSymbol('');
      await loadData();
      setSaveSuccessMessage('تمت إضافة العملة إلى الدليل العام بنجاح.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'فشلت إضافة العملة في الدليل العام');
    } finally {
      setSaving(false);
    }
  };

  const baseCurrency = companyCurrencies.find((c) => c.isBase);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#582949] border-t-transparent" />
          <p className="text-sm font-bold text-[#582949]">جاري تحميل إعدادات النظام والعملات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#582949] text-2xl text-white shadow-lg shadow-[#582949]/20">
              ⚙️
            </span>
            <div>
              <h1 className="text-2xl font-black text-[#582949]">إعدادات النظام والعملات</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                إدارة الإعدادات التشغيلية والمحاسبية وإدارة العملات المتعددة وأسعار الصرف
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition shadow-sm"
          >
            🔄 استعادة الافتراضي
          </button>
          {activeTab !== 'currencies' && (
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-[#00A8A8] text-white text-xs font-bold hover:bg-[#009292] transition shadow-md shadow-[#00A8A8]/20 flex items-center gap-2"
            >
              {saving ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {saveSuccessMessage && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2">
          <span>✅</span> {saveSuccessMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
          <span>⚠️</span> {errorMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'general'
              ? 'border-[#582949] text-[#582949] bg-white rounded-t-xl shadow-sm'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🏢 <span>البيانات العامة للمنشأة</span>
        </button>
        <button
          onClick={() => setActiveTab('accounting')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'accounting'
              ? 'border-[#582949] text-[#582949] bg-white rounded-t-xl shadow-sm'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📑 <span>السياسات المحاسبية</span>
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'sales'
              ? 'border-[#582949] text-[#582949] bg-white rounded-t-xl shadow-sm'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🛒 <span>المبيعات والضريبة ونقاط البيع</span>
        </button>
        <button
          onClick={() => setActiveTab('scale')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'scale'
              ? 'border-[#582949] text-[#582949] bg-white rounded-t-xl shadow-sm'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          ⚖️ <span>أصناف الميزان والباركود الوزني</span>
        </button>
        <button
          onClick={() => setActiveTab('currencies')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'currencies'
              ? 'border-[#582949] text-[#582949] bg-white rounded-t-xl shadow-sm'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          💱 <span>العملات وأسعار الصرف</span>
          <span className="rounded-full bg-[#00A8A8] text-white px-2 py-0.5 text-[10px] font-black">
            {companyCurrencies.length}
          </span>
        </button>
      </div>

      {/* Tab 1: General Settings */}
      {activeTab === 'general' && (
        <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-6">
          {/* Business Type Selector */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <label className="block text-sm font-black text-[#582949] mb-1">
              نوع النشاط التجاري (Business Mode):
            </label>
            <p className="text-xs text-slate-500 mb-3.5">
              يُعدّل مسميات الشاشات والوحدات تلقائياً في كافة أنحاء النظام (صيدلية • سوبر ماركت • شركة تجارية)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.values(BUSINESS_PROFILES) as Array<(typeof BUSINESS_PROFILES)[BusinessType]>).map(
                (profile) => {
                  const currentType = (getVal(['businessType', 'BUSINESS_TYPE'], 'PHARMACY') ||
                    'PHARMACY') as BusinessType;
                  const isSelected = currentType === profile.type;
                  return (
                    <button
                      key={profile.type}
                      type="button"
                      onClick={() => {
                        setVal('businessType', profile.type);
                        setBusinessType(profile.type);
                      }}
                      className={`p-4 rounded-xl border-2 text-right transition flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-[#00A8A8] bg-teal-50/60 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="text-2xl">{profile.icon}</span>
                      <div className="flex-1">
                        <div className="font-black text-sm text-slate-900 flex items-center justify-between">
                          <span>{profile.labelAr}</span>
                          {isSelected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00A8A8] text-white font-bold">
                              مُفعّل
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          الوحدات: <strong>{profile.units.BOX}</strong> /{' '}
                          <strong>{profile.units.STRIP}</strong> /{' '}
                          <strong>{profile.units.PIECE}</strong>
                        </div>
                      </div>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <h2 className="text-base font-bold text-[#582949] mb-4 flex items-center gap-2">
            <span>🏢</span> معلومات المنشأة وهوية النظام
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم النظام / التطبيق</label>
              <input
                type="text"
                value={getVal(['systemName', 'SYSTEM_NAME'], 'DawaCore Pharmacy')}
                onChange={(e) => setVal('systemName', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اللغة الرسمية للنظام</label>
              <select
                value={getVal(['language', 'LANGUAGE'], 'ar')}
                onChange={(e) => setVal('language', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              >
                <option value="ar">العربية (Arabic)</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المنطقة الزمنية (Timezone)</label>
              <input
                type="text"
                value={getVal(['timezone', 'TIMEZONE'], 'Africa/Cairo')}
                onChange={(e) => setVal('timezone', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رمز العملة الافتراضي للطباعة</label>
              <input
                type="text"
                value={getVal(['currencySymbol', 'CURRENCY_SYMBOL'], 'ج.س')}
                onChange={(e) => setVal('currencySymbol', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ترويسة التقارير المطبوعة</label>
              <input
                type="text"
                value={getVal(['reportHeaderText', 'REPORT_HEADER_TEXT'])}
                onChange={(e) => setVal('reportHeaderText', e.target.value)}
                placeholder="مثال: مجموعة صيدليات داواكور العالمية"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تذييل التقارير والفواتير</label>
              <input
                type="text"
                value={getVal(['reportFooterText', 'REPORT_FOOTER_TEXT'])}
                onChange={(e) => setVal('reportFooterText', e.target.value)}
                placeholder="مثال: نتمنى لكم دوام الصحة والعافية"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Accounting Settings */}
      {activeTab === 'accounting' && (
        <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-base font-bold text-[#582949] mb-4 flex items-center gap-2">
            <span>📑</span> السياسات والحسابات الافتراضية للترحيل المالي
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب الأرباح المحتجزة / المدورة (Retained Earnings)</label>
              <input
                type="text"
                value={getVal(['defaultRetainedEarningsAccountCode', 'DEFAULT_RETAINED_EARNINGS_ACCOUNT_CODE'], '3-1-02')}
                onChange={(e) => setVal('defaultRetainedEarningsAccountCode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">شهر بداية السنة المالية</label>
              <select
                value={getVal(['fiscalYearStartMonth', 'FISCAL_YEAR_START_MONTH'], '1')}
                onChange={(e) => setVal('fiscalYearStartMonth', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              >
                <option value="1">يناير (1)</option>
                <option value="4">أبريل (4)</option>
                <option value="7">يوليو (7)</option>
                <option value="10">أكتوبر (10)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب الصندوق الافتراضي (Cash)</label>
              <input
                type="text"
                value={getVal(['defaultCashAccountCode', 'DEFAULT_CASH_ACCOUNT_CODE'], '1101')}
                onChange={(e) => setVal('defaultCashAccountCode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب البنك ونقاط البيع (Bank)</label>
              <input
                type="text"
                value={getVal(['defaultBankAccountCode', 'DEFAULT_BANK_ACCOUNT_CODE'], '1102')}
                onChange={(e) => setVal('defaultBankAccountCode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب ذمم العملاء (Accounts Receivable)</label>
              <input
                type="text"
                value={getVal(['defaultARAccountCode', 'DEFAULT_AR_ACCOUNT_CODE'], '1105')}
                onChange={(e) => setVal('defaultARAccountCode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب ذمم الموردين (Accounts Payable)</label>
              <input
                type="text"
                value={getVal(['defaultAPAccountCode', 'DEFAULT_AP_ACCOUNT_CODE'], '2101')}
                onChange={(e) => setVal('defaultAPAccountCode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب إيرادات المبيعات (Revenue)</label>
              <input
                type="text"
                value={getVal(['defaultRevenueAccountCode', 'DEFAULT_REVENUE_ACCOUNT_CODE'], '4101')}
                onChange={(e) => setVal('defaultRevenueAccountCode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب تكلفة البضاعة المباعة (COGS)</label>
              <input
                type="text"
                value={getVal(['defaultCOGSAccountCode', 'DEFAULT_COGS_ACCOUNT_CODE'], '5101')}
                onChange={(e) => setVal('defaultCOGSAccountCode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب مخزون الأدوية (Inventory)</label>
              <input
                type="text"
                value={getVal(['defaultInventoryAccountCode', 'DEFAULT_INVENTORY_ACCOUNT_CODE'], '1104')}
                onChange={(e) => setVal('defaultInventoryAccountCode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Sales & POS Settings */}
      {activeTab === 'sales' && (
        <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-base font-bold text-[#582949] mb-4 flex items-center gap-2">
            <span>🛒</span> ضوابط البيع ونقاط البيع السريعة
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">السماح بالبيع بالرصيد السالب للمخزون</label>
              <select
                value={getVal(['allowNegativeStock', 'ALLOW_NEGATIVE_STOCK'], 'false')}
                onChange={(e) => setVal('allowNegativeStock', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              >
                <option value="false">ممنوع (حماية للمخزون ومنع العجز)</option>
                <option value="true">مسموح مع التحذير</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">إلزامية فتح وردية قبل إجراء عمليات البيع</label>
              <select
                value={getVal(['requireShiftOpen', 'REQUIRE_SHIFT_OPEN'], 'true')}
                onChange={(e) => setVal('requireShiftOpen', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              >
                <option value="true">إلزامي (يجب فتح وردية واستلام عهدة)</option>
                <option value="false">اختياري</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">أقصى نسبة خصم مسموحة للبند الواحد (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={getVal(['maxItemDiscountPercent', 'MAX_ITEM_DISCOUNT_PERCENT'], '50')}
                onChange={(e) => setVal('maxItemDiscountPercent', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">أقصى نسبة خصم إجمالي على الفاتورة (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={getVal(['maxInvoiceDiscountPercent', 'MAX_INVOICE_DISCOUNT_PERCENT'], '20')}
                onChange={(e) => setVal('maxInvoiceDiscountPercent', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حد الائتمان الافتراضي للعميل الجديد</label>
              <input
                type="number"
                value={getVal(['defaultCreditLimit', 'DEFAULT_CREDIT_LIMIT'], '0')}
                onChange={(e) => setVal('defaultCreditLimit', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium focus:border-[#582949] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Scale Barcode Settings (إعدادات أصناف الميزان الإلكتروني) */}
      {activeTab === 'scale' && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-teal-200 bg-white p-5 space-y-3">
            <h3 className="font-bold">طريقة اتصال الميزان</h3>
            <select value={scaleConfig.connectionMode} onChange={e => setScaleConfig(prev => ({...prev,connectionMode:e.target.value as 'BARCODE' | 'NETWORK'}))} className="rounded border p-2">
              <option value="BARCODE">بدون اتصال شبكة — قراءة ملصق باركود الميزان</option>
              <option value="NETWORK">ميزان متصل بالشبكة — يتطلب تعريف بروتوكول الجهاز</option>
            </select>
            {scaleConfig.connectionMode === 'NETWORK' && <div className="space-y-2">
              <label className="block">عنوان IPv4 للميزان<input value={scaleConfig.networkHost} onChange={e=>setScaleConfig(prev=>({...prev,networkHost:e.target.value}))} placeholder="192.168.1.50" className="mr-2 rounded border p-2" /></label>
              <label className="block">المنفذ<input type="number" min={1} max={65535} value={scaleConfig.networkPort || ''} onChange={e=>setScaleConfig(prev=>({...prev,networkPort:Number(e.target.value)}))} className="mr-2 rounded border p-2" /></label>
              <p role="status" className="rounded bg-amber-50 p-3 text-amber-800">لم يتم ربط جهاز فعلي. يلزم تحديد الماركة والموديل والبروتوكول قبل تفعيل قراءة الوزن أو إرسال الأصناف عبر الشبكة. يمكن متابعة قراءة الملصقات بالباركود؛ حفظ العنوان لا ينشئ اتصالاً.</p>
            </div>}
            <p className="text-sm text-slate-600">الصنف الموزون يُباع بالكيلو، والمخزون بالجرام. يُتحقق من رقم فحص EAN-13 وتُرفض الحقول المتداخلة. الإعداد محفوظ للشركة ويُحمّل لنقاط البيع.</p>
          </div>
          {/* بطاقة توضيحية لهيكل باركود الميزان */}
          <div className="bg-gradient-to-l from-[#582949] to-[#3B1B31] rounded-2xl p-6 text-white shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00A8A8] text-white text-xs font-black mb-2">
                  <span>⚖️</span>
                  <span>نظام قراءة باركود الميزان الإلكتروني (EAN-13 Weight Barcode)</span>
                </div>
                <h2 className="text-xl font-black">
                  كيف يتعرف النظام تلقائياً على الصنف والوزن من ملصق الميزان؟
                </h2>
                <p className="text-xs text-white/80 mt-1 max-w-2xl leading-relaxed">
                  عند وزن أي صنف على الميزان الإلكتروني، يطبع الميزان باركود مكوناً من <strong>13 رقماً</strong>. بمجرد مسحه في شاشة الكاشير (POS)، يتعرف النظام على الصنف من <strong>كود الصنف (5 أرقام)</strong>، ويقرأ <strong>الوزن/الكمية (5 أرقام)</strong> ويقسمها على معامل الوزن ثم يضربها فوراً في سعر الوحدة!
                </p>
              </div>

              {/* مخطط بصري لتشريح الباركود */}
              <div className="bg-black/25 border border-white/15 rounded-2xl p-4 font-mono text-center shrink-0">
                <div className="text-[10px] text-teal-300 font-sans font-bold mb-2">
                  مثال باركود ميزان قياسي (13 رقماً)
                </div>
                <div className="flex items-center justify-center gap-1.5 text-base font-black" dir="ltr">
                  <span className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950" title="بادئة الميزان">
                    20
                  </span>
                  <span className="px-3 py-1.5 rounded-lg bg-[#00A8A8] text-white" title="كود الصنف">
                    10001
                  </span>
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950" title="الوزن بالجرام">
                    01250
                  </span>
                  <span className="px-2 py-1.5 rounded-lg bg-slate-700 text-slate-200" title="رقم الفحص">
                    5
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[10px] font-sans mt-2 text-white/90" dir="ltr">
                  <span className="text-amber-300 font-bold">البادئة (2)</span>
                  <span className="text-teal-300 font-bold">كود الصنف (5)</span>
                  <span className="text-emerald-300 font-bold">الوزن 1.250 كجم</span>
                  <span className="text-slate-300">الفحص (1)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* إعدادات تقطيع الباركود */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-[#582949] flex items-center gap-2">
                  <span>⚙️</span> إعدادات قراءة وتفكيك باركود الميزان
                </h3>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scaleConfig.enabled}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-[#00A8A8] focus:ring-[#00A8A8]"
                  />
                  <span className="text-xs font-black text-slate-800">
                    تفعيل قراءة باركود الميزان في الكاشير
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    بادئات باركود الميزان (Scale Prefixes)
                  </label>
                  <input
                    type="text"
                    value={scaleConfig.prefixes}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({ ...prev, prefixes: e.target.value }))
                    }
                    placeholder="20,21,22,23,24,27,28,29"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-[#582949] focus:outline-none"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    الأرقام التي يبدأ بها باركود الميزان (الافتراضي العالمي: 20 إلى 29 مفصولة بفاصلة).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    طول باركود الميزان الكامل (عدد الخانات)
                  </label>
                  <input
                    type="number"
                    min={8}
                    max={18}
                    value={scaleConfig.barcodeLength}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({
                        ...prev,
                        barcodeLength: parseInt(e.target.value, 10) || 13,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-[#582949] focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    الباركود القياسي للموازين الإلكترونية (EAN-13) يتكون من 13 رقماً.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    بداية خانة كود الصنف (تبدأ من الخانة رقم)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={scaleConfig.itemCodeStart}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({
                        ...prev,
                        itemCodeStart: parseInt(e.target.value, 10) || 3,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-[#582949] focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    بعد أول رقمين للبادئة (20)، يبدأ كود الصنف من الخانة رقم 3.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    طول كود الصنف (عدد أرقام كود الصنف)
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={7}
                    value={scaleConfig.itemCodeLength}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({
                        ...prev,
                        itemCodeLength: parseInt(e.target.value, 10) || 5,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-[#582949] focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    عدد خانات كود الصنف في الميزان (الافتراضي: 5 أرقام مثل 10001).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    بداية خانة الوزن / الكمية (تبدأ من الخانة رقم)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={scaleConfig.weightStart}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({
                        ...prev,
                        weightStart: parseInt(e.target.value, 10) || 8,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-[#582949] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    طول خانة الوزن / الكمية (عدد الأرقام)
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={7}
                    value={scaleConfig.weightLength}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({
                        ...prev,
                        weightLength: parseInt(e.target.value, 10) || 5,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-[#582949] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    معامل قسمة الوزن (تحويل الجرام إلى كيلو)
                  </label>
                  <select
                    value={scaleConfig.weightDivisor}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({
                        ...prev,
                        weightDivisor: parseInt(e.target.value, 10) || 1000,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold focus:border-[#582949] focus:outline-none"
                  >
                    <option value={1000}>قسمة على 1000 (كيلوجرام - 3 خانات عشرية: 01250 = 1.250 كجم)</option>
                    <option value={100}>قسمة على 100 (خانتان عشريتان: 00250 = 2.50)</option>
                    <option value={10}>قسمة على 10 (خانة عشرية واحدة)</option>
                    <option value={1}>بدون قسمة / 1 (الكمية بالجرام أو بالعدد الصحيح)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نوع القيمة المدمجة في باركود الميزان
                  </label>
                  <select
                    value={scaleConfig.valueType}
                    onChange={(e) =>
                      setScaleConfig((prev) => ({
                        ...prev,
                        valueType: e.target.value as 'WEIGHT' | 'PRICE',
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold focus:border-[#582949] focus:outline-none"
                  >
                    <option value="WEIGHT">وزن / كمية (النظام يقرأ الوزن ويضربه × سعر الوحدة)</option>
                    <option value="PRICE">سعر إجمالي (النظام يقسم السعر المدمج ÷ سعر الوحدة لاستخراج الوزن)</option>
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-teal-900 space-y-1.5">
                <div className="font-black text-[#00A8A8] flex items-center gap-1.5">
                  <span>💡</span>
                  <span>كيف تعرّف صنف ميزان في شاشة الأصناف؟</span>
                </div>
                <p>
                  عند إضافة صنف موزون في شاشة <strong>الأصناف</strong>، اجعل <strong>الباركود</strong> أو <strong>كود الصنف الداخلي</strong> مطابقاً لكود الصنف المبرمج في الميزان (مثلاً: <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border">10001</code> أو <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border">2010001</code>)، وضع سعر الكيلو في خانة سعر الوحدة.
                </p>
              </div>
            </div>

            {/* مختبر محاكاة وفحص باركود الميزان المباشر */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[#582949] flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span>🧪</span> مختبر تجربة باركود الميزان
                </h3>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    كود الصنف في الميزان (5 أرقام)
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={testScaleItemCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setTestScaleItemCode(val);
                      setTestCustomBarcode(
                        sampleScaleBarcode(val || '10001', testScaleWeightGrams, '20'),
                      );
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold"
                    dir="ltr"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      الوزن بالجرام (مثلاً 1250 = 1.25 كجم)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      value={testScaleWeightGrams}
                      onChange={(e) => {
                        const w = parseInt(e.target.value, 10) || 0;
                        setTestScaleWeightGrams(w);
                        setTestCustomBarcode(
                          sampleScaleBarcode(testScaleItemCode || '10001', w, '20'),
                        );
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      سعر الكيلو / الوحدة (للتجربة)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={testScaleUnitPrice}
                      onChange={(e) => setTestScaleUnitPrice(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    باركود الميزان الناتج (أو امسح باركود ميزانك هنا للاختبار)
                  </label>
                  <input
                    type="text"
                    value={testCustomBarcode}
                    onChange={(e) => setTestCustomBarcode(e.target.value)}
                    className="w-full rounded-xl border-2 border-[#00A8A8] bg-teal-50/30 px-3 py-2 text-sm font-mono font-black text-center text-[#582949]"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* نتيجة التحليل الفوري */}
              {(() => {
                try {
                const res = parseScaleBarcode(testCustomBarcode, scaleConfig);
                if (!res) {
                  return (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                      ⚠️ هذا الباركود لا يطابق إعدادات باركود الميزان الحالية (تأكد من الطول {scaleConfig.barcodeLength} رقم والبادئة).
                    </div>
                  );
                }
                const quantity = scaleQuantity(res, testScaleUnitPrice);
                const total = Number((quantity * testScaleUnitPrice).toFixed(2));
                return (
                  <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2 text-xs">
                    <div className="text-teal-400 font-black flex items-center justify-between">
                      <span>✅ نتيجة قراءة النظام للباركود:</span>
                      <span className="font-mono text-[11px] bg-teal-500/20 px-2 py-0.5 rounded">
                        بادئة {res.prefix}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1.5">
                      <span className="text-slate-400">كود الصنف المستخرج:</span>
                      <span className="font-mono font-black text-amber-300">{res.itemCode}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1.5">
                      <span className="text-slate-400">الكمية / الوزن المقروء:</span>
                      <span className="font-mono font-black text-emerald-400">
                        {quantity} كجم
                      </span>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-slate-300 font-bold">الإجمالي (الوزن × السعر):</span>
                      <span className="font-mono font-black text-base text-[#00A8A8]">
                        {total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.س
                      </span>
                    </div>
                  </div>
                );
                } catch(error) { return <div role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{(error as Error).message}</div>; }
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Multi-Currency & Exchange Rates */}
      {activeTab === 'currencies' && (
        <div className="mt-6 space-y-6">
          {/* Base Currency Banner & Converter */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-gradient-to-l from-[#582949] to-[#3a1930] rounded-2xl p-6 text-white shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-lg bg-[#00A8A8] text-white text-xs font-black">
                    العملة الأساسية للنظام (Base Currency)
                  </span>
                  <span className="text-2xl font-black">{baseCurrency?.symbol || 'ج.س'}</span>
                </div>
                <h3 className="text-2xl font-black mt-3">
                  {baseCurrency ? `${baseCurrency.nameAr} (${baseCurrency.code})` : 'لم يتم تعيين عملة أساسية'}
                </h3>
                <p className="text-xs text-white/70 mt-1 max-w-lg">
                  جميع التقارير المحاسبية، القوائم المالية، وتقييم المخزون تتم تسويتها ومعادلتها بالعملة الأساسية (سعر الصرف = 1.0).
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 rounded-xl bg-white text-[#582949] font-black text-xs hover:bg-slate-100 transition shadow"
                >
                  ➕ إضافة عملة للشركة
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGlobalModal(true)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20 transition border border-white/20"
                >
                  🌐 تعريف عملة في الدليل العام
                </button>
              </div>
            </div>

            {/* Live Converter Widget */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-[#582949] flex items-center gap-1.5 mb-3">
                  <span>🔄</span> محول العملات الفوري السريع
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">المبلغ المراد تحويله</label>
                    <input
                      type="number"
                      value={calcAmount}
                      onChange={(e) => setCalcAmount(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-[#582949] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">من عملة</label>
                      <select
                        value={calcFrom}
                        onChange={(e) => setCalcFrom(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold focus:border-[#582949] focus:outline-none"
                      >
                        {companyCurrencies.map((c) => (
                          <option key={c.id} value={c.code}>
                            {c.code} ({c.symbol})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">إلى عملة</label>
                      <select
                        value={calcTo}
                        onChange={(e) => setCalcTo(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold focus:border-[#582949] focus:outline-none"
                      >
                        {companyCurrencies.map((c) => (
                          <option key={c.id} value={c.code}>
                            {c.code} ({c.symbol})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[10px] text-slate-500 block font-semibold">الناتج المعادل</span>
                <span className="text-lg font-black text-[#00A8A8]">
                  {calcResult !== null ? calcResult.toLocaleString() : '0'} {calcTo}
                </span>
              </div>
            </div>
          </div>

          {/* Currencies Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-black text-[#582949] flex items-center gap-2">
                <span>📋</span> جدول عملات الشركة وأسعار الصرف الحالية
              </h3>
              <span className="text-xs text-slate-500 font-bold">
                إجمالي العملات المعتمدة: {companyCurrencies.length}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">رمز العملة</th>
                    <th className="py-3.5 px-4">اسم العملة</th>
                    <th className="py-3.5 px-4">الرمز</th>
                    <th className="py-3.5 px-4">النوع</th>
                    <th className="py-3.5 px-4">سعر الصرف (مقابل الأساسية)</th>
                    <th className="py-3.5 px-4">تاريخ السعر</th>
                    <th className="py-3.5 px-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companyCurrencies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                        لا توجد عملات مضافة بعد. اضغط "➕ إضافة عملة للشركة" لربط العملات.
                      </td>
                    </tr>
                  ) : (
                    companyCurrencies.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3.5 px-4 font-black text-[#582949]">{c.code}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {c.nameAr}{' '}
                          <span className="text-slate-400 font-normal">({c.nameEn})</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-600">{c.symbol}</td>
                        <td className="py-3.5 px-4">
                          {c.isBase ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                              ⭐ عملة أساسية
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              عملة ثانوية
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-black text-sm text-slate-800">
                          {Number(c.exchangeRate).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium">
                          {c.effectiveFrom ? new Date(c.effectiveFrom).toLocaleDateString('ar-YE', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          }) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {!c.isBase && (
                              <>
                                <button
                                  type="button"
                                  title="تعديل سعر الصرف"
                                  onClick={() => {
                                    setSelectedCurrencyForEdit(c);
                                    setUpdateRateValue(c.exchangeRate.toString());
                                    setShowRateModal(true);
                                  }}
                                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition shadow-sm"
                                >
                                  ✏️ تعديل السعر
                                </button>
                                <button
                                  type="button"
                                  title="تعيين كعملة أساسية"
                                  onClick={() => handleSetBaseCurrency(c)}
                                  className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition shadow-sm"
                                >
                                  ⭐ جعلها أساسية
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              title="سجل تغيرات أسعار الصرف"
                              onClick={() => handleOpenHistory(c)}
                              className="p-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition shadow-sm"
                            >
                              📜 السجل
                            </button>
                            {!c.isBase && (
                              <button
                                type="button"
                                title="حذف العملة من الشركة"
                                onClick={() => handleRemoveCurrency(c)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition shadow-sm"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Company Currency */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in" dir="rtl">
            <h3 className="text-base font-black text-[#582949] mb-4 flex items-center gap-2">
              <span>➕</span> إضافة عملة جديدة لحساب الشركة
            </h3>
            <form onSubmit={handleAddCompanyCurrency} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اختر العملة من الدليل العام</label>
                <select
                  required
                  value={newCurrencyId}
                  onChange={(e) => setNewCurrencyId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold focus:border-[#582949] focus:outline-none"
                >
                  <option value="">-- اختر عملة --</option>
                  {globalCurrencies
                    .filter((g) => !companyCurrencies.some((cc) => cc.currencyId === g.id))
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nameAr} ({g.code} - {g.symbol})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  سعر الصرف (مقابل العملة الأساسية)
                </label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={newCurrencyRate}
                  onChange={(e) => setNewCurrencyRate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold focus:border-[#582949] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="newIsBase"
                  checked={newCurrencyIsBase}
                  onChange={(e) => setNewCurrencyIsBase(e.target.checked)}
                  className="h-4 w-4 rounded text-[#582949] focus:ring-[#582949]"
                />
                <label htmlFor="newIsBase" className="text-xs font-bold text-slate-700">
                  تعيين هذه العملة كعملة أساسية للشركة
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving || !newCurrencyId}
                  className="px-5 py-2 rounded-xl bg-[#582949] text-white text-xs font-bold hover:bg-[#431f37] transition shadow"
                >
                  {saving ? 'جاري الإضافة...' : 'إضافة العملة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Update Exchange Rate */}
      {showRateModal && selectedCurrencyForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in" dir="rtl">
            <h3 className="text-base font-black text-[#582949] mb-4 flex items-center gap-2">
              <span>✏️</span> تعديل سعر صرف {selectedCurrencyForEdit.nameAr} ({selectedCurrencyForEdit.code})
            </h3>
            <form onSubmit={handleUpdateExchangeRate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  السعر الجديد (مقابل العملة الأساسية)
                </label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={updateRateValue}
                  onChange={(e) => setUpdateRateValue(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold focus:border-[#582949] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب التعديل / ملاحظات</label>
                <input
                  type="text"
                  placeholder="مثال: تحديث يومي حسب أسعار السوق"
                  value={updateRateReason}
                  onChange={(e) => setUpdateRateReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium focus:border-[#582949] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving || !updateRateValue}
                  className="px-5 py-2 rounded-xl bg-[#00A8A8] text-white text-xs font-bold hover:bg-[#009292] transition shadow"
                >
                  {saving ? 'جاري التحديث...' : 'تحديث السعر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Exchange Rate History Log */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col" dir="rtl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-black text-[#582949] flex items-center gap-2">
                <span>📜</span> سجل أسعار الصرف التاريخي {historyModalCurrency && `(${historyModalCurrency.nameAr})`}
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-700 font-black text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              {selectedCurrencyHistory.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">لا توجد حركات تغيير مسجلة لهذه العملة حتى الآن.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {selectedCurrencyHistory.map((h) => (
                    <div key={h.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">
                            من {Number(h.oldRate).toLocaleString()} ⬅️ إلى {Number(h.newRate).toLocaleString()}
                          </span>
                        </div>
                        {h.reason && <p className="text-slate-500 text-[11px] mt-0.5">{h.reason}</p>}
                      </div>
                      <div className="text-left text-slate-400 text-[11px]">
                        {new Date(h.createdAt).toLocaleString('ar-YE')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 text-left">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Global Currency */}
      {showNewGlobalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in" dir="rtl">
            <h3 className="text-base font-black text-[#582949] mb-4 flex items-center gap-2">
              <span>🌐</span> تعريف عملة جديدة في الدليل العام للنظام
            </h3>
            <form onSubmit={handleCreateGlobalCurrency} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رمز العملة (ISO Code)</label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    placeholder="مثال: EUR"
                    value={globalCode}
                    onChange={(e) => setGlobalCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-[#582949] focus:outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رمز العملة (Symbol)</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="مثال: €"
                    value={globalSymbol}
                    onChange={(e) => setGlobalSymbol(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-[#582949] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الاسم بالعربية</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: يورو أوروبي"
                  value={globalNameAr}
                  onChange={(e) => setGlobalNameAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-[#582949] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الاسم بالإنجليزية</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: Euro"
                  value={globalNameEn}
                  onChange={(e) => setGlobalNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-[#582949] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عدد الخانات العشرية (Decimal Places)</label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={globalDecimals}
                  onChange={(e) => setGlobalDecimals(parseInt(e.target.value) || 2)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-[#582949] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewGlobalModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving || !globalCode || !globalNameAr}
                  className="px-5 py-2 rounded-xl bg-[#582949] text-white text-xs font-bold hover:bg-[#431f37] transition shadow"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ العملة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
