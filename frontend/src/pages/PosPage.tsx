import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePosStore, UnitType, CartItem } from '../stores/pos.store';
import { usePosShortcuts } from '../hooks/usePosShortcuts';
import { useDebounce } from '../hooks/useDebounce';
import { PaymentModal } from '../components/pos/PaymentModal';
import { HoldResumeModal } from '../components/pos/HoldResumeModal';
import { CustomerLedgerModal } from '../components/customers/CustomerLedgerModal';
import { CustomerFormModal } from '../components/customers/CustomerFormModal';
import { CustomerPaymentModal } from '../components/customers/CustomerPaymentModal';
import { ItemDiscountModal } from '../components/pos/ItemDiscountModal';
import { OfflineQueueModal } from '../components/pos/OfflineQueueModal';
import { offlinePosEngine, OfflineSyncSnapshot } from '../services/offline-pos.service';
import { ThermalPrinterService } from '../services/printer.service';
import { getUnitLabel, getBusinessTerminology } from '../utils/business-terminology';
import { parseScaleBarcode, scaleQuantity, saveScaleBarcodeSettings, hasScaleBarcodeSettings } from '../utils/scale-barcode';
import {
  installPosConsoleGuard,
  isBrowserDevToolsOpen,
  reportPosSecurityIncident,
} from '../utils/pos-security';
import { customersApi, Customer } from '../api/customers';
import { apiFetch } from '../api/http';
import { getUserRole, getCurrentUser, ROLE_LABELS, logoutUser } from '../utils/permissions';
import {
  UserPlus,
  Wallet,
  X,
  User,
  Banknote,
  Tag,
  Wifi,
  WifiOff,
  RefreshCw,
  ShieldAlert,
  Lock,
  Package,
  LayoutGrid,
} from 'lucide-react';

const normalizeQuantityText = (raw: string): string => raw
  .trim()
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[٫,]/g, '.')
  .replace(/\s+/g, '');

const DecimalQuantityInput: React.FC<{
  quantity: number;
  onCommit: (quantity: number) => void;
}> = ({ quantity, onCommit }) => {
  const [draft, setDraft] = useState(String(quantity));
  useEffect(() => setDraft(String(quantity)), [quantity]);

  const commit = () => {
    const normalized = normalizeQuantityText(draft);
    const withLeadingZero = normalized.startsWith('.') ? `0${normalized}` : normalized;
    const parsed = Number(withLeadingZero);
    if (Number.isFinite(parsed) && parsed >= 0.001) {
      const cleanQuantity = Number(parsed.toFixed(4));
      onCommit(cleanQuantity);
      setDraft(String(cleanQuantity));
      return;
    }
    setDraft(String(quantity));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setDraft(String(quantity));
      }}
      title="الكمية أو الوزن: يقبل 0.25 أو .25 أو 0,25 أو ٠٫٢٥"
      className="w-14 text-center font-mono font-bold text-xs rounded border border-slate-300 py-0.5 px-1 bg-white focus:border-[#00A8A8] focus:outline-none"
    />
  );
};

export const PosPage: React.FC = () => {
  const [scaleConfigReady, setScaleConfigReady] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch('/api/settings/scale-barcode').then(async response => {
      if (!response.ok) throw new Error('Scale settings unavailable');
      saveScaleBarcodeSettings(await response.json());
      if (active) setScaleConfigReady(true);
    }).catch(() => { if (active) setScaleConfigReady(offlinePosEngine.isEffectivelyOffline() && hasScaleBarcodeSettings()); });
    return () => { active = false; };
  }, []);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [isOfflineQueueOpen, setIsOfflineQueueOpen] = useState(false);
  const [offlineState, setOfflineState] = useState<OfflineSyncSnapshot>(
    offlinePosEngine.getSnapshot(),
  );

  // 🆕 حالة كروت الأصناف الأكثر مبيعاً وبطاقات الكتالوج تحت الباركود
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [topSellingProducts, setTopSellingProducts] = useState<any[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('TOP_SELLING');

  // 🛡️ حالة قفل وتعطيل المبيعات عند فتح الكونسول (Console Lockout)
  const [isConsoleLocked, setIsConsoleLocked] = useState<boolean>(false);
  const [consoleLockReason, setConsoleLockReason] = useState<string>(
    'تم رصد فتح نافذة أدوات المطورين (Console / DevTools). تم قفل وتعطيل عمليات البيع لحماية نزاهة الأسعار.',
  );

  // حالة العميل والمديونية وكشف الحساب وسند القبض
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isCustomerLedgerOpen, setIsCustomerLedgerOpen] = useState(false);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isCustomerPaymentOpen, setIsCustomerPaymentOpen] = useState(false);
  const [activeShiftData, setActiveShiftData] = useState<any>(null);
  // ⚡ نافذة فتح وردية سريعة من شاشة الـ POS مباشرة
  const [isQuickOpenShiftModal, setIsQuickOpenShiftModal] = useState(false);
  const [quickOpeningBalance, setQuickOpeningBalance] = useState('');
  const [isOpeningShiftLoading, setIsOpeningShiftLoading] = useState(false);

  const handleQuickOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpeningShiftLoading(true);
    try {
      const rawUser = localStorage.getItem('dawacore_user');
      let bId = '';
      let cId = '';
      if (rawUser) {
        const u = JSON.parse(rawUser);
        bId = u.branchId || bId;
        cId = u.id || u.username || cId;
      }
      if (!bId || !cId) throw new Error('حدد فرع / مخزن المستخدم من إدارة المستخدمين قبل فتح الوردية');
      const token = localStorage.getItem('dawacore_token');
      const res = await apiFetch('/api/shifts/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          branchId: bId,
          userId: cId,
          openingBalance: parseFloat(quickOpeningBalance) || 0,
        }),
      });
      if (res.ok) {
        const shiftData = await res.json();
        setActiveShiftData(shiftData);
        usePosStore.getState().initSession(shiftData.branchId || bId, cId, shiftData.id);
        setIsQuickOpenShiftModal(false);
        setQuickOpeningBalance('');
        alert('🎉 تم فتح الوردية بنجاح! يمكنك الآن متابعة عمليات البيع.');
        if (items.length > 0) {
          setIsPaymentOpen(true);
        }
      } else {
        const err = await res.json();
        alert(err?.message || 'فشل فتح الوردية');
      }
    } catch (e: any) {
      alert(e?.message || 'فشل الاتصال بالخادم لفتح الوردية');
    } finally {
      setIsOpeningShiftLoading(false);
    }
  };


  const {
    items,
    updateQuantity,
    setExactQuantity,
    changeUnit,
    overrideItemPrice,
    resetItemPrice,
    removeItem,
    clearCart,
    getSubTotal,
    getGrandTotal,
    getItemsDiscountTotal,
    setItemDiscount,
    clearItemDiscount,
    discountTotal,
    setDiscount,
    addItem,
    customer,
    setCustomer,
  } = usePosStore();

  const currentUser = getCurrentUser();
  const userRoles = currentUser?.roles && currentUser.roles.length > 0 ? currentUser.roles : (currentUser?.role ? [currentUser.role] : []);
  const canOverridePrice = userRoles.some((r) => ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER'].includes(r));

  // حالة نافذة تعديل سعر البيع الرقابي
  const [overrideModalItem, setOverrideModalItem] = useState<CartItem | null>(null);
  const [overrideNewPrice, setOverrideNewPrice] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const openPriceOverrideModal = (item: CartItem) => {
    setOverrideModalItem(item);
    setOverrideNewPrice(item.unitPrice.toString());
    setOverrideReason(item.priceOverrideReason || '');
    setOverrideError(null);
  };

  const handleSavePriceOverride = () => {
    if (!overrideModalItem) return;
    const priceNum = parseFloat(overrideNewPrice);
    const reasonTrimmed = overrideReason.trim();

    if (isNaN(priceNum) || priceNum < 0) {
      setOverrideError('يرجى إدخال سعر بيع صالح وغير سالب');
      return;
    }

    const minPrice = overrideModalItem.minSalePrice !== undefined ? overrideModalItem.minSalePrice : 0;
    if (priceNum < minPrice) {
      setOverrideError(`لا يمكن أن يقل السعر عن الحد الأدنى المسموح به (${minPrice.toFixed(2)})`);
      return;
    }

    const origPrice = overrideModalItem.originalUnitPrice ?? overrideModalItem.unitPrice;
    if (priceNum !== origPrice && reasonTrimmed.length < 3) {
      setOverrideError('تعديل سعر البيع يتطلب سبباً لا يقل عن 3 أحرف');
      return;
    }

    if (reasonTrimmed.length > 500) {
      setOverrideError('سبب التعديل لا يجب أن يتجاوز 500 حرف');
      return;
    }

    const success = overrideItemPrice(overrideModalItem.id, priceNum, reasonTrimmed);
    if (success) {
      setOverrideModalItem(null);
    } else {
      setOverrideError('فشل تطبيق تعديل السعر');
    }
  };

  const handleResetPriceOverride = () => {
    if (!overrideModalItem) return;
    resetItemPrice(overrideModalItem.id);
    setOverrideModalItem(null);
  };

  // إشعار قراءة باركود الميزان الإلكتروني
  const [scaleBanner, setScaleBanner] = useState<{
    tradeName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    itemCode: string;
  } | null>(null);

  // 🛡️ تفعيل درع حماية الكونسول وقفل شاشة المبيعات وإرسال إشعار فوري للمدير عند فتح الكونسول
  useEffect(() => {
    return installPosConsoleGuard(
      () => {
        const st = usePosStore.getState();
        const currentUser = getCurrentUser();
        const reasonMsg =
          '🚨 تم اكتشاف محاولة تلاعب ببيانات سلة المبيعات عبر الكونسول، وتم إبطال السلة وقفل شاشة البيع فوراً.';
        reportPosSecurityIncident({
          alertType: 'STORAGE_TAMPERED',
          reason: reasonMsg,
          companyId: currentUser?.companyId,
          branchId: st.branchId || currentUser?.branchId,
          userId: st.cashierId || currentUser?.id,
          cashierName: currentUser?.name || currentUser?.username || st.cashierId || 'كاشير نقطة البيع',
          shiftId: st.activeShiftId || undefined,
          cartItemsCount: st.items.length,
          cartTotal: st.getGrandTotal(),
        });
        clearCart();
        setIsPaymentOpen(false);
        setIsConsoleLocked(true);
        setConsoleLockReason(reasonMsg);
      },
      (locked, reason) => {
        if (locked) {
          const st = usePosStore.getState();
          const currentUser = getCurrentUser();
          const finalReason =
            reason ||
            'تم رصد فتح نافذة أدوات المطورين (Console / DevTools) أثناء جلسة البيع.';
          reportPosSecurityIncident({
            alertType: finalReason.includes('F12') || finalReason.includes('Ctrl')
              ? 'SHORTCUT_BLOCKED'
              : 'CONSOLE_OPENED',
            reason: finalReason,
            companyId: currentUser?.companyId,
            branchId: st.branchId || currentUser?.branchId,
            userId: st.cashierId || currentUser?.id,
            cashierName: currentUser?.name || currentUser?.username || st.cashierId || 'كاشير نقطة البيع',
            shiftId: st.activeShiftId || undefined,
            cartItemsCount: st.items.length,
            cartTotal: st.getGrandTotal(),
          });
          setIsPaymentOpen(false);
          setIsConsoleLocked(true);
          if (reason) setConsoleLockReason(reason);
        }
      },
    );
  }, [clearCart]);


  const handleUnlockPosScreen = () => {
    if (isBrowserDevToolsOpen()) {
      alert('⚠️ نافذة الكونسول (DevTools) ما زالت مفتوحة! يرجى إغلاق نافذة الكونسول أولاً ثم الضغط على إعادة التفعيل.');
      return;
    }
    setIsConsoleLocked(false);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 80);
  };

  // نافذة الخصم الخاص على البند
  const [discountItemId, setDiscountItemId] = useState<string | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  const discountItem = discountItemId
    ? items.find((i) => i.id === discountItemId) || null
    : null;

  const openDiscountModal = (itemId: string) => {
    setDiscountItemId(itemId);
    setIsDiscountModalOpen(true);
  };

  const closeDiscountModal = () => {
    setIsDiscountModalOpen(false);
    setDiscountItemId(null);
  };

  // جلب أكثر 20 صنفاً مبيعاً وقائمة الأصناف لعرضها ككروت مع الرصيد المتبقي تحت الباركود
  const loadCatalogProducts = useCallback(async () => {
    setIsLoadingCatalog(true);
    try {
      if (!offlinePosEngine.isEffectivelyOffline()) {
        const branchId = getCurrentUser()?.branchId;
        const branchQuery = branchId ? `&branchId=${encodeURIComponent(branchId)}` : '';
        const [topRes, fullRes] = await Promise.all([
          apiFetch(`/api/medicines/top-selling?limit=20${branchQuery}`),
          apiFetch(`/api/medicines?limit=60${branchQuery}`),
        ]);

        if (topRes.ok) {
          const topData = await topRes.json();
          const topList = Array.isArray(topData?.items) ? topData.items : Array.isArray(topData) ? topData : [];
          setTopSellingProducts(topList);
        }

        if (fullRes.ok) {
          const fullData = await fullRes.json();
          const fullList = Array.isArray(fullData?.items) ? fullData.items : Array.isArray(fullData) ? fullData : [];
          setCatalogProducts(fullList);
        }
        return;
      }
      const localList = await offlinePosEngine.searchCatalogOffline('');
      setCatalogProducts(localList);
      setTopSellingProducts(localList.slice(0, 20));
    } catch {
      const localList = await offlinePosEngine.searchCatalogOffline('');
      setCatalogProducts(localList);
      setTopSellingProducts(localList.slice(0, 20));
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  // حساب الكمية المسحوبة في السلة حالياً بالوحدة الأساسية لأي صنف
  const getInCartBaseQty = useCallback(
    (medId: string) => {
      return usePosStore.getState().items
        .filter((it) => it.medicineId === medId)
        .reduce((sum, it) => {
          const u = it.availableUnits?.find((au) => au.unitType === it.unitType);
          const mult = Number(u?.multiplier || 1);
          return sum + it.quantity * mult;
        }, 0);
    },
    [items],
  );

  // حساب الرصيد المتبقي الفعلي للصنف (الرصيد بالمخزن ناقص الموجود في السلة)
  const getProductRemainingStock = useCallback(
    (product: any) => {
      const medId = product?.id || product?.medicineId || '';
      const rawStock = Number(
        product?.branchStockInBase ??
          product?.availableStockInBase ??
          product?.totalStockInBase ??
          0,
      );
      const inCart = getInCartBaseQty(medId);
      return Math.max(0, rawStock - inCart);
    },
    [getInCartBaseQty],
  );

  // البحث الفوري عن العملاء
  useEffect(() => {
    const q = customerSearch.trim();
    if (q.length < 1) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await customersApi.getAll({ search: q, limit: 8 });
        setCustomerResults(res.items || []);
      } catch (err) {
        console.error('Failed to search customers:', err);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const debouncedInput = useDebounce(barcodeInput, 200);

  // الاشتراك في محرك الأوفلاين وتحميل دليل الأصناف المحلي وكروت الأصناف تلقائياً عند فتح شاشة الكاشير
  useEffect(() => {
    const unsub = offlinePosEngine.subscribe((snap) => {
      setOfflineState(snap);
    });
    offlinePosEngine.refreshCatalogFromServer();
    loadCatalogProducts();
    return unsub;
  }, [loadCatalogProducts]);

  // تحديث أرصدة الكروت تلقائياً عند تفريغ السلة بعد إتمام عملية بيع
  useEffect(() => {
    if (items.length === 0) {
      loadCatalogProducts();
    }
  }, [items.length, loadCatalogProducts]);

  // البحث المباشر عند الكتابة (مع التحويل التلقائي للذاكرة المحلية IndexedDB عند انقطاع الإنترنت)
  useEffect(() => {
    const fetchMedicines = async () => {
      const q = debouncedInput.trim();
      // إذا كان الإدخال باركود رقمي طويل فقط (مثل مسح الباركود)، لا نفتح القائمة التلقائية
      if (q.length < 2 || (/^\d{8,}$/.test(q))) {
        setSearchResults([]);
        setSelectedIndex(-1);
        return;
      }

      setIsSearching(true);
      try {
        if (offlinePosEngine.isEffectivelyOffline()) {
          const localMatches = await offlinePosEngine.searchCatalogOffline(q);
          setSearchResults(localMatches);
          setSelectedIndex(-1);
          return;
        }

        const branchId = getCurrentUser()?.branchId;
        const branchQuery = branchId ? `&branchId=${encodeURIComponent(branchId)}` : '';
        const res = await apiFetch(`/api/medicines/search?q=${encodeURIComponent(q)}${branchQuery}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data : []);
          setSelectedIndex(-1);
        } else {
          const localMatches = await offlinePosEngine.searchCatalogOffline(q);
          setSearchResults(localMatches);
          setSelectedIndex(-1);
        }
      } catch {
        // Fallback to local IndexedDB catalog when offline
        const localMatches = await offlinePosEngine.searchCatalogOffline(q);
        setSearchResults(localMatches);
        setSelectedIndex(-1);
      } finally {
        setIsSearching(false);
      }
    };

    fetchMedicines();
  }, [debouncedInput]);

  // مزامنة لحظية مع شاشة العميل (Customer Display BroadcastChannel & localStorage)
  useEffect(() => {
    const channel = new BroadcastChannel('dawacore_pos_channel');

    const syncPayload = {
      invoiceNumber: `INV-${new Date().getFullYear()}-${String(items.length).padStart(4, '0')}`,
      items: items.map((i) => ({
        id: i.id,
        tradeName: i.tradeName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
      })),
      subTotal: getSubTotal(),
      discountTotal: discountTotal,
      grandTotal: getGrandTotal(),
      paidAmount: 0.0,
      changeAmount: 0.0,
      statusText: items.length > 0 ? 'جاري تسجيل الأصناف...' : 'أهلاً بكم في صيدلية DawaCore',
    };

    // إرسال التحديث الفوري
    channel.postMessage({
      type: 'SYNC_CART',
      payload: syncPayload,
    });

    try {
      localStorage.setItem('dawacore_customer_display_state', JSON.stringify(syncPayload));
    } catch {}

    // الاستماع لطلبات المزامنة القادمة عند فتح شاشة العميل
    channel.onmessage = (event) => {
      if (event.data?.type === 'REQUEST_SYNC') {
        channel.postMessage({
          type: 'SYNC_CART',
          payload: syncPayload,
        });
      }
    };

    return () => channel.close();
  }, [items, discountTotal]);

  // تهيئة جلسة الكاشير والفرع والوردية النشطة
  useEffect(() => {
    const initSessionData = async () => {
      try {
        const rawUser = localStorage.getItem('dawacore_user');
        let bId = '';
        let cId = '';
        let sId = 'OPEN_SHIFT';

        if (rawUser) {
          const user = JSON.parse(rawUser);
          bId = user.branchId || bId;
          cId = user.id || user.username || cId;
        }

        usePosStore.getState().initSession(bId, cId, 'OPEN_SHIFT');
        if (!bId || !cId) { setActiveShiftData(null); return; }
        try {
          const res = await apiFetch(`/api/shifts/active?userId=${encodeURIComponent(cId)}&branchId=${encodeURIComponent(bId)}`);
          if (res.ok) {
            const shiftData = await res.json();
            if (shiftData && shiftData.id) {
              sId = shiftData.id;
              if (shiftData.branchId) bId = shiftData.branchId;
              setActiveShiftData(shiftData);
            }
          }
        } catch {
          // استخدام القيم الحالية
        }

        usePosStore.getState().initSession(bId, cId, sId);
      } catch (e) {
        console.error('فشل تهيئة جلسة الكاشير:', e);
      }
    };

    initSessionData();
  }, []);

  const handleNewInvoice = () => {
    if (items.length > 0) {
      const confirmed = window.confirm(
        'هل تريد بالتأكيد تفريغ الفاتورة وبدء فاتورة جديدة؟\n(ملاحظة: يمكنك الضغط على "إلغاء" ثم زر "تعليق" للاحتفاظ بها في قائمة الفواتير المعلقة).'
      );
      if (!confirmed) return;
    }
    clearCart();
    setBarcodeInput('');
    setSearchResults([]);
    setSelectedIndex(-1);
    setIsPaymentOpen(false);
    setIsResumeOpen(false);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const handleHold = async () => {
    if (items.length === 0) {
      alert('السلة فارغة، يرجى إضافة أصناف أولاً قبل تعليق الفاتورة');
      return;
    }
    const store = usePosStore.getState();
    const effectiveCashierId = store.cashierId;
    const effectiveBranchId = store.branchId;
    if (!effectiveCashierId || !effectiveBranchId) { alert('حدد مخزن المستخدم أولاً'); return; }

    try {
      const res = await apiFetch('/api/sales/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashierId: effectiveCashierId,
          branchId: effectiveBranchId,
          cartData: {
            items: store.items,
            discount: store.discountTotal,
            customerId: store.customerId,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'فشل تعليق الفاتورة');
      }

      clearCart();
      setBarcodeInput('');
      setSearchResults([]);
      setSelectedIndex(-1);
      alert('تم تعليق الفاتورة بنجاح! يمكنك استرجاعها في أي وقت من زر "المعلقة"');
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 50);
    } catch (err: any) {
      alert(`خطأ أثناء تعليق الفاتورة: ${err.message}`);
    }
  };

  // معالج موحد لمسح الباركود العادي وباركود الميزان الإلكتروني (أونلاين وأوفلاين)
  const processBarcodeScan = useCallback(
    async (rawBarcode: string): Promise<boolean> => {
      const clean = rawBarcode.trim();
      if (!clean) return false;

      let scaleParsed;
      try {
        if (!scaleConfigReady) { alert('انتظر تحميل إعدادات نقطة البيع قبل المسح'); return true; }
        const exact = catalogProducts.find(p => !p.isWeighed && (p.barcode === clean || p.units?.some((u:any)=>u.barcode === clean)));
        if (exact) { addItem(exact, clean); setBarcodeInput(''); return true; }
        scaleParsed = parseScaleBarcode(clean);
      } catch(error) { alert(error instanceof Error ? error.message : 'باركود الميزان غير صالح'); return true; }
      const branchId = getCurrentUser()?.branchId;
      const branchQuery = branchId ? `&branchId=${encodeURIComponent(branchId)}` : '';

      // 1. إذا كان الباركود الممسوح باركود ميزان إلكتروني (مثلاً يبدأ بـ 20-29 وطوله 13 رقماً)
      if (scaleParsed) {
        let matchedProduct: any = null;

        if (!offlinePosEngine.isEffectivelyOffline()) {
          try {
            const response = await apiFetch('/api/medicines/scan?barcode='+encodeURIComponent(clean)+branchQuery);
            if (!response.ok) { const error = await response.json(); alert(error.message || 'الصنف الموزون غير موجود'); return true; }
            matchedProduct = await response.json();
          } catch { alert('تعذر التحقق من باركود الميزان على الخادم؛ أعد المحاولة'); return true; }
        } else {
          const matches = catalogProducts.filter(p=>p.isWeighed && p.scalePlu === scaleParsed.itemCode);
          if (matches.length === 1) matchedProduct = matches[0];
        }
        if (!matchedProduct?.isWeighed || matchedProduct.scalePlu !== scaleParsed.itemCode) { alert('كود الميزان لا يرتبط بصنف موزون معروف'); return true; }

        if (matchedProduct) {
          if (getProductRemainingStock(matchedProduct) <= 0) {
            alert(`⚠️ نفد الرصيد المتاح للصنف الموزون: ${matchedProduct.tradeName} (المتبقي بالمخزن: 0)`);
            return true;
          }
          const defaultUnit =
            matchedProduct.units?.find((u: any) => u.unitType === 'UNIT' && u.multiplier === 1000);
          const unitPrice = Number(defaultUnit?.price || 0);

          let finalQty: number;
          try { finalQty = matchedProduct.isScaleScan ? Number(matchedProduct.scaleWeight) : scaleQuantity(scaleParsed, unitPrice); }
          catch(error) { alert((error as Error).message); return true; }
          if (!defaultUnit || getProductRemainingStock(matchedProduct) < finalQty * 1000) { alert('رصيد الصنف بالجرام لا يكفي للوزن المطلوب'); return true; }

          addItem(matchedProduct, undefined, finalQty);
          setScaleBanner({
            tradeName: matchedProduct.tradeName,
            quantity: finalQty,
            unitPrice,
            totalPrice: Number((finalQty * unitPrice).toFixed(2)),
            itemCode: scaleParsed.itemCode,
          });
          setTimeout(() => setScaleBanner(null), 6000);
          setBarcodeInput('');
          setSearchResults([]);
          setSelectedIndex(-1);
          return true;
        }
      }

      // 2. مسح الباركود العادي (أو الاحتياطي عبر السيرفر والأوفلاين)
      try {
        if (!offlinePosEngine.isEffectivelyOffline()) {
          const response = await apiFetch(
            `/api/medicines/scan?barcode=${encodeURIComponent(clean)}${branchQuery}`,
          );
          if (response.ok) {
            const product = await response.json();
            if (getProductRemainingStock(product) <= 0) {
              alert(`⚠️ نفد الرصيد المتاح للصنف: ${product.tradeName} (المتبقي بالمخزن: 0)`);
              return true;
            }
            const customQty =
              product.isScaleScan && product.scaleWeight ? Number(product.scaleWeight) : undefined;
            addItem(product, clean, customQty);
            if (customQty) {
              const defaultUnit =
                product.units?.find((u: any) => u.isDefault) || product.units?.[0];
              const unitPrice = Number(defaultUnit?.price || 0);
              setScaleBanner({
                tradeName: product.tradeName,
                quantity: customQty,
                unitPrice,
                totalPrice: Number((customQty * unitPrice).toFixed(2)),
                itemCode: product.code || product.barcode,
              });
              setTimeout(() => setScaleBanner(null), 6000);
            }
            setBarcodeInput('');
            setSearchResults([]);
            setSelectedIndex(-1);
            return true;
          }
        }
        const localProduct = await offlinePosEngine.findByBarcodeOffline(clean);
        if (localProduct) {
          if (getProductRemainingStock(localProduct) <= 0) {
            alert(`⚠️ نفد الرصيد المتاح للصنف: ${localProduct.tradeName} (المتبقي: 0)`);
            return true;
          }
          addItem(localProduct, clean);
          setBarcodeInput('');
          setSearchResults([]);
          setSelectedIndex(-1);
          return true;
        }
      } catch {
        const localProduct = await offlinePosEngine.findByBarcodeOffline(clean);
        if (localProduct) {
          addItem(localProduct, clean);
          setBarcodeInput('');
          setSearchResults([]);
          setSelectedIndex(-1);
          return true;
        }
      }

      return false;
    },
    [addItem, catalogProducts, getProductRemainingStock, scaleConfigReady],
  );

  // تفعيل الاختصارات ومسح الباركود السريع بالليزر (يدعم الأونلاين والأوفلاين والميزان الإلكتروني)
  usePosShortcuts({
    onBarcodeScanned: async (barcode) => {
      if (isConsoleLocked) return;
      await processBarcodeScan(barcode);
    },
    onFocusSearch: () => !isConsoleLocked && barcodeInputRef.current?.focus(),
    onOpenPayment: () => {
      if (isConsoleLocked || items.length === 0) return;
      if (!activeShiftData) {
        setIsQuickOpenShiftModal(true);
        return;
      }
      setIsPaymentOpen(true);
    },
    onHoldCart: () => !isConsoleLocked && handleHold(),
    onResumeCart: () => !isConsoleLocked && setIsResumeOpen(true),
    onClearCart: () => !isConsoleLocked && handleNewInvoice(),
  });

  const handleSelectProduct = (product: any) => {
    if (isConsoleLocked) return;
    const remaining = getProductRemainingStock(product);
    if (remaining <= 0) {
      alert(`⚠️ لا يمكن إضافة "${product.tradeName}": الرصيد المتبقي في المخزن (0) وحدة.`);
      return;
    }
    addItem(product);
    setBarcodeInput('');
    setSearchResults([]);
    setSelectedIndex(-1);
    barcodeInputRef.current?.focus();
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
        handleSelectProduct(searchResults[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setSearchResults([]);
        setSelectedIndex(-1);
        return;
      }
    }
  };

  const handleManualBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isConsoleLocked) return;
    const query = barcodeInput.trim();
    if (!query) return;

    // إذا كانت هناك نتيجة محددة في القائمة، نختارها
    if (searchResults.length > 0 && selectedIndex >= 0) {
      handleSelectProduct(searchResults[selectedIndex]);
      return;
    }

    // 1. فحص الباركود المباشر أو باركود الميزان الإلكتروني أولاً
    const scannedSuccess = await processBarcodeScan(query);
    if (scannedSuccess) return;

    // إذا كانت هناك نتائج بحث مطابقة أولى، نختار الأولى تلقائياً
    if (searchResults.length === 1) {
      handleSelectProduct(searchResults[0]);
      return;
    }

    try {
      if (!offlinePosEngine.isEffectivelyOffline()) {
        const branchId = getCurrentUser()?.branchId;
        const branchQuery = branchId ? `&branchId=${encodeURIComponent(branchId)}` : '';
        const searchRes = await apiFetch(`/api/medicines/search?q=${encodeURIComponent(query)}${branchQuery}`);
        if (searchRes.ok) {
          const list = await searchRes.json();
          if (list && list.length > 0) {
            handleSelectProduct(list[0]);
            return;
          }
        }
      }

      const offlineList = await offlinePosEngine.searchCatalogOffline(query);
      if (offlineList.length > 0) {
        handleSelectProduct(offlineList[0]);
        return;
      }

      alert('لم يتم العثور على الصنف');
    } catch {
      const offlineList = await offlinePosEngine.searchCatalogOffline(query);
      if (offlineList.length > 0) {
        handleSelectProduct(offlineList[0]);
        return;
      }
      alert('لم يتم العثور على الصنف في الذاكرة المحلية');
    }
  };

  const isCurrentlyOffline = !offlineState.isOnline || offlineState.isSimulatedOffline;
  const businessTerms = getBusinessTerminology();

  // استخراج التصنيفات الفريدة لشريط فلاتر كروت أودو
  const availableCategories = Array.from(
    new Set(catalogProducts.map((p) => p.category).filter(Boolean)),
  ) as string[];

  // تحديد القائمة الفعالة (أكثر 20 صنفاً مبيعاً كوضع افتراضي تحت الباركود)
  const activeProductsList =
    selectedCategory === 'TOP_SELLING'
      ? (topSellingProducts.length > 0 ? topSellingProducts : catalogProducts.slice(0, 20))
      : catalogProducts;

  // تصفية الكروت المعروضة تحت الباركود (حسب التصنيف أو نص البحث)
  const filteredCardProducts = activeProductsList.filter((p) => {
    if (selectedCategory !== 'TOP_SELLING' && selectedCategory !== 'ALL') {
      if (p.category !== selectedCategory) return false;
    }
    const q = barcodeInput.trim().toLowerCase();
    if (!q) return true;
    return (
      p.tradeName?.toLowerCase().includes(q) ||
      p.scientificName?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="relative flex min-h-screen lg:h-screen w-full flex-col bg-[#F4F6F8] font-sans text-slate-800 select-none" dir="rtl">
      {/* 🛡️ شاشة القفل الأمني الكامل عند فتح الكونسول (DevTools Lockout Overlay) */}
      {isConsoleLocked && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-6">
          <div className="max-w-lg w-full rounded-3xl border-2 border-rose-500/80 bg-slate-900 p-8 text-center text-white shadow-2xl space-y-5">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-500/20 border-2 border-rose-500 text-rose-400 animate-pulse">
              <Lock className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 px-3 py-1 text-xs font-black text-rose-300">
                <ShieldAlert className="w-4 h-4" />
                حماية أمنية نشطة (POS Zero-Trust Security)
              </span>
              <h2 className="text-2xl font-black text-white">
                تم قفل وتعطيل شاشة المبيعات أمنياً!
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                {consoleLockReason}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-800/90 border border-slate-700 p-4 text-right text-xs text-slate-300 space-y-2">
              <div className="font-bold text-amber-300">لماذا تم قفل الشاشة؟</div>
              <p>
                يمنع نظام <strong>DawaCore</strong> استخدام شاشة الكاشير أثناء فتح وحدة التحكم البرمجية (Console / DevTools) لمنع أي محاولة لتغذية أو تزوير قيم المبيعات أو الأسعار.
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-rose-950/70 border border-rose-500/40 px-3 py-2 text-[11px] font-bold text-rose-300">
                <span>🔔</span>
                <span>
                  تم إرسال إشعار أمني فوري لمدير النظام وتسجيل الواقعة في سجل التدقيق (Audit Log) باسم المستخدم والتوقيت الحالي.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnlockPosScreen}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3.5 px-6 text-sm font-black text-white shadow-lg transition cursor-pointer"
            >
              🔓 أغلقت الكونسول — إعادة فحص وتفعيل شاشة المبيعات
            </button>
          </div>
        </div>
      )}


      {/* 1. الشريط العلوي المدمج والأنيق لنقطة البيع (Compact Clean POS Header) */}
      <header className="flex flex-wrap min-h-12 py-1.5 items-center justify-between gap-2 bg-[#582949] px-3 sm:px-5 text-white shadow-sm shrink-0">
        {/* القسم الأيمن: الأزرار الأساسية فقط بدون زحام */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* مؤشر الاتصال والمزامنة (مدمج) */}
          <button
            type="button"
            onClick={() => setIsOfflineQueueOpen(true)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
              isCurrentlyOffline
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : offlineState.pendingCount > 0
                ? 'bg-amber-600 text-white hover:bg-amber-500'
                : 'bg-emerald-600/90 text-white hover:bg-emerald-600'
            }`}
            title="إدارة وضع الأوفلاين والفواتير المحفوظة محلياً"
          >
            {offlineState.isSyncing ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : isCurrentlyOffline ? (
              <WifiOff className="w-3 h-3" />
            ) : (
              <Wifi className="w-3 h-3" />
            )}
            <span>
              {isCurrentlyOffline
                ? 'أوفلاين'
                : offlineState.isSyncing
                ? 'مزامنة...'
                : 'متصل'}
            </span>
            {offlineState.pendingCount > 0 && (
              <span className="rounded-full bg-black/30 px-1.5 font-mono text-[10px] text-white">
                {offlineState.pendingCount}
              </span>
            )}
          </button>

          {/* الأزرار اليومية الأساسية للكاشير (تعليق + المعلقة + فاتورة جديدة) */}
          <button
            onClick={handleHold}
            className="flex items-center gap-1 rounded-lg bg-[#481D3E] px-2.5 py-1 text-[11px] font-bold hover:bg-[#3D1834] transition cursor-pointer"
            title="تعليق الفاتورة الحالية مؤقتاً"
          >
            <span>⏸️</span>
            <span>تعليق</span>
          </button>

          <button
            onClick={() => setIsResumeOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-[#481D3E] px-2.5 py-1 text-[11px] font-bold hover:bg-[#3D1834] transition cursor-pointer"
            title="استعراض الفواتير المعلقة"
          >
            <span>📋</span>
            <span>المعلقة</span>
          </button>

          <button
            onClick={handleNewInvoice}
            className="flex items-center gap-1 rounded-lg bg-[#481D3E] px-2.5 py-1 text-[11px] font-bold hover:bg-[#3D1834] transition cursor-pointer"
            title="بدء فاتورة جديدة (F2)"
          >
            <span className="text-teal-300 font-mono">F2</span>
            <span>جديدة</span>
          </button>

          {/* قائمة منسدلة مدمجة للأدوات الإضافية لمنع ازدحام الشريط العلوي */}
          <details className="relative group">
            <summary className="list-none flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-bold cursor-pointer select-none transition">
              <span>⚙️</span>
              <span>أدوات واختصارات</span>
              <span className="text-[9px] opacity-80">▾</span>
            </summary>
            <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white text-slate-800 shadow-xl border border-slate-200 py-1.5 z-50 text-xs font-bold">
              {getUserRole() !== 'CASHIER' && (
                <button
                  type="button"
                  onClick={() => (window.location.href = '/dashboard')}
                  className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-slate-100 text-right transition cursor-pointer"
                >
                  <span>📊</span>
                  <span>لوحة التحكم</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => (window.location.href = '/statement')}
                className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-slate-100 text-right transition cursor-pointer"
              >
                <span>📑</span>
                <span>كشف حساب عميل</span>
              </button>
              <button
                type="button"
                onClick={() => window.open('/customer-screen', '_blank', 'width=1024,height=768')}
                className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-slate-100 text-right transition cursor-pointer"
              >
                <span>🖥️</span>
                <span>شاشة عرض العميل</span>
              </button>
              <button
                type="button"
                onClick={() => !isConsoleLocked && items.length > 0 && setIsPaymentOpen(true)}
                className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-teal-50 text-teal-700 text-right border-t border-slate-100 transition cursor-pointer"
              >
                <span className="font-mono text-[10px] bg-teal-100 px-1.5 py-0.5 rounded">F4</span>
                <span>نافذة الدفع السريع</span>
              </button>
            </div>
          </details>
        </div>

        {/* القسم الأيسر: حالة الوردية والمخزن + المستخدم (مدمج في سطر واحد) */}
        <div className="flex flex-wrap items-center gap-2">
          {activeShiftData ? (
            <span
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2.5 py-1 text-[11px] font-bold"
              title={`مخزن الخصم: ${activeShiftData?.branch?.name || getCurrentUser()?.branchName || 'فرع المستخدم'}`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              <span>
                وردية #{activeShiftData.shiftNumber} •{' '}
                {activeShiftData.branch?.name || getCurrentUser()?.branchName || 'الفرع'}
              </span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setIsQuickOpenShiftModal(true)}
              className="flex items-center gap-1 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/30 px-2.5 py-1 text-[11px] font-bold hover:bg-amber-500/30 transition cursor-pointer animate-pulse"
              title="اضغط هنا لفتح وردية جديدة مباشرة دون مغادرة البيع"
            >
              <span>⚠️</span>
              <span>فتح وردية</span>
            </button>
          )}

          <div className="flex items-center gap-2 border-r border-white/15 pr-2.5">
            <span className="text-[11px] font-bold text-white hidden sm:inline">
              {getCurrentUser()?.name || getCurrentUser()?.username || 'مستخدم'}
            </span>
            <button
              onClick={logoutUser}
              className="flex items-center gap-1 rounded-lg bg-rose-500/80 hover:bg-rose-600 px-2 py-1 text-[11px] font-bold text-white transition cursor-pointer"
              title="تسجيل الخروج"
            >
              <span>🚪</span>
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. منطقة العمل الرئيسية (Main Grid Layout) */}
      <div className="flex flex-col lg:flex-row flex-1 gap-3 lg:gap-4 overflow-y-auto lg:overflow-hidden p-2.5 sm:p-4">
        
        {/* القسم الأيمن: الفاتورة الحالية + الباركود + كروت الأصناف بأسلوب أودو */}
        <div className="flex flex-1 flex-col gap-3 min-h-[460px] lg:min-h-0 lg:overflow-hidden">
          
          {/* بطاقة بيانات الفاتورة والفرع واختيار العميل والمديونية */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm shrink-0">
            <div className="flex items-center justify-between mb-2 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black text-slate-700">الفاتورة الحالية</h2>
                <span className="text-[11px] text-slate-400">
                  الفرع: <strong className="text-slate-700">{activeShiftData?.branch?.name || 'الفرع الرئيسي'}</strong>
                </span>
              </div>
              <button
                onClick={handleNewInvoice}
                className="rounded-lg bg-[#582949] px-3.5 py-1 text-xs font-bold text-white transition hover:bg-[#481D3E]"
              >
                فاتورة جديدة F2
              </button>
            </div>

            {/* شريط اختيار العميل والمديونية وزر كشف الحساب */}
            <div>
              {customer ? (
                <div className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/90 via-white to-teal-50/40 p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00A8A8] text-white font-black text-base shadow-sm">
                      👤
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-900">{customer.name}</span>
                        {customer.phone && (
                          <span className="font-mono text-xs text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                            📞 {customer.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 font-semibold">المديونية الحالية:</span>
                          <span
                            className={`font-mono font-black text-xs px-2 py-0.5 rounded-md ${
                              Number(customer.currentDebt || 0) > 0
                                ? 'text-rose-700 bg-rose-50 border border-rose-200'
                                : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                            }`}
                          >
                            {Number(customer.currentDebt || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}{' '}
                            ج.س
                          </span>
                        </div>
                        <span className="text-slate-300">•</span>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500 font-medium">سقف الائتمان:</span>
                          <span className="font-mono font-bold text-slate-700">
                            {Number(customer.creditLimit || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}{' '}
                            ج.س
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {Number(customer.currentDebt || 0) > 0 && (
                      <button
                        onClick={() => setIsCustomerPaymentOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] text-xs font-bold shadow-sm transition-all cursor-pointer"
                      >
                        <Banknote size={14} />
                        <span>قبض / سداد 💵</span>
                      </button>
                    )}

                    <button
                      onClick={() => setIsCustomerLedgerOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#582949] text-white hover:bg-[#481D3E] text-xs font-bold shadow-sm transition-all cursor-pointer"
                    >
                      <Wallet size={14} className="text-teal-300" />
                      <span>كشف الحساب 📑</span>
                    </button>

                    <button
                      onClick={() => setCustomer(null)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                      title="إلغاء اختيار العميل"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[260px] relative">
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-500 shrink-0">
                      <User size={15} className="text-[#00A8A8]" />
                      <span>العميل:</span>
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="ابحث بالاسم أو رقم الهاتف لاختيار عميل..."
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#00A8A8] focus:outline-none"
                      />
                      {showCustomerDropdown && customerResults.length > 0 && (
                        <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                          {customerResults.map((c) => {
                            const debt = Number(c.currentDebt || 0);
                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  setCustomer(c);
                                  setCustomerSearch('');
                                  setShowCustomerDropdown(false);
                                }}
                                className="cursor-pointer border-b border-slate-100 p-2.5 text-xs hover:bg-teal-50/60 transition flex justify-between items-center"
                              >
                                <div>
                                  <span className="font-bold text-slate-800">{c.name}</span>
                                  {c.phone && (
                                    <span className="mr-2 text-[11px] text-slate-500 font-mono">
                                      ({c.phone})
                                    </span>
                                  )}
                                </div>
                                <div className="text-left">
                                  <span
                                    className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded ${
                                      debt > 0 ? 'bg-rose-50 text-rose-700' : 'text-slate-500'
                                    }`}
                                  >
                                    رصيد: {debt.toLocaleString()} ج.س
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-1 rounded-md">
                      عميل نقدي عام
                    </span>
                    <button
                      onClick={() => setIsNewCustomerModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#00A8A8] text-white hover:bg-[#009292] text-xs font-bold shadow-sm transition cursor-pointer"
                    >
                      <UserPlus size={14} />
                      <span>+ عميل جديد</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* بطاقة مسح الباركود والبحث الذكي بالاسم مع القائمة التلقائية */}
          <div className="relative rounded-xl border-t-4 border-t-[#00A8A8] border-x border-b border-slate-200 bg-white p-3.5 shadow-sm shrink-0">
            <form onSubmit={handleManualBarcodeSubmit} className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <label className="absolute -top-2.5 right-4 bg-white px-1.5 text-[11px] font-bold text-[#00A8A8]">
                  مسح الباركود (العادي أو باركود الميزان ⚖️) أو البحث الفوري بالاسم
                </label>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  disabled={isConsoleLocked}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`امسح الباركود أو باركود الميزان أو اكتب اسم ${businessTerms.itemSingular}...`}
                  className="w-full rounded-xl border-2 border-[#00A8A8] bg-white px-4 py-2.5 text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-teal-100 placeholder:text-slate-400 disabled:bg-slate-100"
                  autoFocus
                />

                {/* قائمة الإكمال التلقائي الذكية (Autocomplete Dropdown) مع الكمية المتبقية */}
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-teal-200 bg-white shadow-2xl divide-y divide-slate-100">
                    <div className="bg-teal-50/70 px-4 py-2 text-xs font-bold text-[#00A8A8] flex justify-between items-center">
                      <span>نتائج مطابقة ({searchResults.length}): اختر بالأسهم ⬆️ ⬇️ ثم Enter أو انقر للإضافة</span>
                      <span className="text-[10px] text-slate-400">Esc للإغلاق</span>
                    </div>
                    {searchResults.map((product, idx) => {
                      const defaultUnit = product.units?.find((u: any) => u.isDefault) || product.units?.[0];
                      const isSelected = idx === selectedIndex;
                      const remainingStock = getProductRemainingStock(product);
                      return (
                        <div
                          key={product.id}
                          onClick={() => handleSelectProduct(product)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`cursor-pointer px-4 py-2.5 transition-colors flex items-center justify-between ${
                            isSelected ? 'bg-teal-100/70 border-r-4 border-[#00A8A8]' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <span>{product.tradeName}</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                                {product.code}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                  remainingStock > 10
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : remainingStock > 0
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                المتبقي: {remainingStock}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {product.scientificName} • <span className="text-teal-700 font-semibold">{product.category}</span>
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="font-mono font-black text-[#00A8A8] text-base">
                              {defaultUnit ? `${Number(defaultUnit.price).toFixed(2)} ج.س` : ''}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {defaultUnit ? ((defaultUnit as any).label || (product.isWeighed ? 'كيلوجرام' : getUnitLabel(defaultUnit.unitType))) : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isConsoleLocked}
                className="rounded-xl bg-[#582949] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#481D3E] shrink-0 cursor-pointer"
              >
                إضافة [Enter]
              </button>
            </form>

            {/* شريط إشعار فوري عند قراءة باركود ميزان إلكتروني */}
            {scaleBanner && (
              <div className="mt-2.5 flex items-center justify-between rounded-xl border border-teal-300 bg-teal-50/90 px-3.5 py-2 text-xs text-teal-950 shadow-2xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚖️</span>
                  <div>
                    <span className="font-black text-[#582949]">{scaleBanner.tradeName}</span>
                    <span className="mx-1.5 text-slate-400">|</span>
                    <span>
                      الكمية/الوزن المقروء:{' '}
                      <strong className="font-mono text-teal-800">{scaleBanner.quantity}</strong>
                    </span>
                    <span className="mx-1 text-slate-400">×</span>
                    <span>
                      السعر:{' '}
                      <strong className="font-mono text-slate-700">
                        {scaleBanner.unitPrice.toFixed(2)}
                      </strong>
                    </span>
                    <span className="mx-1 text-slate-400">=</span>
                    <strong className="rounded bg-[#00A8A8] px-2 py-0.5 font-mono text-white">
                      {scaleBanner.totalPrice.toFixed(2)} ج.س
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScaleBanner(null)}
                  className="text-slate-400 hover:text-slate-700 font-bold px-1"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* 🆕 شبكة كروت الأصناف التفاعلية تحت الباركود بأسلوب أودو (Odoo-Style Product Cards Grid) */}
          <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-0">
            {/* شريط عنوان الكروت وتبويبات التصنيفات بأسلوب أودو */}
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-[#00A8A8]" />
                <span className="text-xs font-black text-slate-800">
                  {selectedCategory === 'TOP_SELLING'
                    ? '🔥 أكثر 20 صنفاً مبيعاً (انقر على الكرت للإضافة الفورية للفاتورة)'
                    : `بطاقات ${businessTerms.itemPlural} السريعة (انقر على الكرت للإضافة الفورية)`}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                  selectedCategory === 'TOP_SELLING'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-teal-50 border-teal-200 text-teal-800'
                }`}>
                  {filteredCardProducts.length} صنف
                </span>
              </div>

              {/* فلاتر التصنيفات السريعة مع تبويب أكثر 20 صنفاً مبيعاً كأول خيار */}
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('TOP_SELLING')}
                  className={`px-3 py-1 rounded-lg text-[11px] font-black transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                    selectedCategory === 'TOP_SELLING'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs ring-1 ring-amber-400'
                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span>🔥</span>
                  <span>أكثر 20 صنفاً مبيعاً</span>
                  <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10px] font-mono">
                    {topSellingProducts.length || 20}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer shrink-0 ${
                    selectedCategory === 'ALL'
                      ? 'bg-[#582949] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  الكل ({catalogProducts.length})
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer shrink-0 ${
                      selectedCategory === cat
                        ? 'bg-[#00A8A8] text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-teal-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={loadCatalogProducts}
                  title="تحديث أرصدة الكروت والأكثر مبيعاً"
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-[#00A8A8] hover:border-teal-300 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCatalog ? 'animate-spin text-[#00A8A8]' : ''}`} />
                </button>
              </div>
            </div>

            {/* شبكة الكروت القابلة للتمرير */}
            <div className="flex-1 overflow-y-auto p-3.5 bg-slate-50/40">
              {isLoadingCatalog && (catalogProducts.length === 0 && topSellingProducts.length === 0) ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  جاري تحميل أكثر الأصناف مبيعاً وبطاقات المخزون...
                </div>
              ) : filteredCardProducts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400 space-y-1.5">
                  <Package className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-bold">لا توجد أصناف مطابقة للفلتر الحالي</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
                  {filteredCardProducts.map((product) => {
                    const medId = product.id || product.medicineId;
                    const defaultUnit =
                      product.units?.find((u: any) => u.isDefault) ||
                      product.defaultUnit ||
                      product.units?.[0];
                    const unitPrice = Number(defaultUnit?.price || 0);
                    const remainingStock = getProductRemainingStock(product);
                    const inCartQty = getInCartBaseQty(medId);
                    const isOutOfStock = remainingStock <= 0;
                    const isLowStock = remainingStock > 0 && remainingStock <= (product.minStockLevel || 10);

                    return (
                      <button
                        key={medId}
                        type="button"
                        disabled={isConsoleLocked}
                        onClick={() => handleSelectProduct(product)}
                        className={`group relative flex flex-col justify-between rounded-xl border p-3 text-right transition-all duration-150 cursor-pointer ${
                          isOutOfStock
                            ? 'border-rose-200 bg-rose-50/30 opacity-75 hover:border-rose-300'
                            : inCartQty > 0
                            ? 'border-2 border-[#00A8A8] bg-teal-50/20 shadow-md -translate-y-0.5'
                            : 'border-slate-200 bg-white hover:border-[#00A8A8] hover:shadow-md hover:-translate-y-0.5'
                        }`}
                      >
                        {/* شارة الترتيب للأكثر مبيعاً */}
                        {(product.rank || selectedCategory === 'TOP_SELLING') && (
                          <div className="mb-2 flex items-center justify-between w-full">
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-black text-amber-800">
                              <span>🔥 رتبة #{product.rank || 1} الأكثر مبيعاً</span>
                            </span>
                            {product.totalSold !== undefined && product.totalSold > 0 && (
                              <span className="text-[10px] font-bold text-slate-400 font-mono">
                                مباع: <strong className="text-amber-700">{product.totalSold}</strong>
                              </span>
                            )}
                          </div>
                        )}

                        {/* الشريط العلوي للكرت: شارة الكمية المتبقية + شارة السعر */}
                        <div className="flex items-center justify-between gap-1 w-full mb-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black border ${
                              isOutOfStock
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : isLowStock
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <span>{isOutOfStock ? 'نفد:' : 'المتبقي:'}</span>
                            <span className="font-mono text-[11px]">{remainingStock}</span>
                          </span>

                          <span className="rounded-md bg-[#582949] px-2 py-0.5 font-mono text-[11px] font-black text-white shadow-2xs">
                            {unitPrice.toLocaleString()} ج.س
                          </span>
                        </div>

                        {/* وسط الكرت: اسم الصنف والاسم العلمي/التصنيف */}
                        <div className="my-1 w-full">
                          <div className="font-black text-xs sm:text-sm text-slate-800 group-hover:text-[#00A8A8] line-clamp-1 transition-colors">
                            {product.tradeName}
                          </div>
                          <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                            {product.scientificName || product.category || 'عام'}
                          </div>
                        </div>

                        {/* أسفل الكرت: الباركود والوحدة وشارة السلة */}
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between w-full text-[10px]">
                          <span className="font-mono text-slate-400 truncate max-w-[95px]">
                            #{product.barcode}
                          </span>
                          {inCartQty > 0 ? (
                            <span className="rounded-full bg-[#00A8A8] px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">
                              بالسلة: {inCartQty}
                            </span>
                          ) : (
                            <span className="font-bold text-slate-500 group-hover:text-[#00A8A8]">
                              {defaultUnit ? ((defaultUnit as any).label || (product.isWeighed ? 'كيلوجرام' : getUnitLabel(defaultUnit.unitType))) : 'وحدة'} +
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* القسم الأيسر: سلة المبيعات والإجماليات */}
        <div className="flex w-full lg:w-[400px] xl:w-[480px] shrink-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b px-5 py-3 bg-slate-50 flex justify-between items-center">
            <h3 className="text-sm font-black text-slate-700">سلة المبيعات</h3>
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-[#00A8A8]">
              {items.length} أصناف
            </span>
          </div>

          {/* بنود السلة */}
          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-slate-400 space-y-2">
                <span className="text-4xl">🛒</span>
                <p className="text-sm font-semibold">السلة فارغة</p>
                <p className="text-xs text-slate-400">امسح الباركود أو انقر على أي كرت صنف لإضافته فوراً</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const catalogMatch = catalogProducts.find(
                    (p) => (p.id || p.medicineId) === item.medicineId,
                  );
                  const totalStockBase =
                    item.availableStockInBase ??
                    catalogMatch?.totalStockInBase ??
                    catalogMatch?.branchStockInBase;
                  const inCartBase = getInCartBaseQty(item.medicineId);
                  const remainingAfterCart =
                    totalStockBase !== undefined ? Math.max(0, totalStockBase - inCartBase) : null;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">{item.tradeName}</span>
                          {item.isPriceOverridden && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300"
                              title={item.priceOverrideReason ? `السبب: ${item.priceOverrideReason}` : 'تم تعديل سعر البيع'}
                            >
                              سعر معدل
                            </span>
                          )}
                          {remainingAfterCart !== null && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                remainingAfterCart > 5
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : remainingAfterCart > 0
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                              title="الكمية المتبقية في المخزن بعد خصم كمية السلة الحالية"
                            >
                              المتبقي: {item.isWeighed && remainingAfterCart !== null ? (remainingAfterCart / 1000).toFixed(3) + ' كجم' : remainingAfterCart}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {/* تبديل الوحدة */}
                          <select
                            value={item.unitType}
                            onChange={(e) => changeUnit(item.id, e.target.value as UnitType)}
                            className="rounded border border-slate-300 py-0.5 px-1.5 text-xs bg-white focus:outline-none focus:border-[#00A8A8]"
                          >
                            {item.availableUnits.map((u) => (
                              <option key={u.unitType} value={u.unitType}>
                                {u.label || (item.isWeighed ? 'كيلوجرام' : getUnitLabel(u.unitType))}
                              </option>
                            ))}
                          </select>
                          {/* تعديل الكمية أو الوزن العشري */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded border bg-slate-100 font-bold hover:bg-slate-200 text-xs"
                            >
                              -
                            </button>
                            <DecimalQuantityInput
                              quantity={item.quantity}
                              onCommit={(quantity) => setExactQuantity(item.id, quantity)}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (remainingAfterCart !== null && remainingAfterCart <= 0) {
                                  alert(`⚠️ وصلت للحد الأقصى المتوفر في المخزن لهذا الصنف!`);
                                  return;
                                }
                                updateQuantity(item.id, 1);
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded border bg-slate-100 font-bold hover:bg-slate-200 text-xs"
                            >
                              +
                            </button>
                          </div>
                          {item.isPriceOverridden ? (
                            <span className="text-xs font-mono flex items-center gap-1">
                              <span className="text-amber-700 font-bold">× {item.unitPrice.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 line-through">
                                ({(item.originalUnitPrice ?? item.unitPrice).toFixed(2)})
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">× {item.unitPrice.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="text-left">
                          <span className="font-mono font-bold text-[#00A8A8] text-base block">
                            {(item.totalPrice - (item.discountAmount || 0)).toFixed(2)}
                          </span>
                          {item.discountAmount && item.discountAmount > 0 ? (
                            <div className="text-[10px] text-amber-700 font-semibold font-mono">
                              <span className="line-through text-slate-400 ml-1">{item.totalPrice.toFixed(2)}</span>
                              <span>−{item.discountAmount.toFixed(2)}</span>
                            </div>
                          ) : null}
                        </div>

                        {/* زر تعديل السعر الرقابي (للمخولين فقط) */}
                        {canOverridePrice && !item.isWeighed && (
                          <button
                            type="button"
                            onClick={() => openPriceOverrideModal(item)}
                            title={item.isPriceOverridden ? 'تعديل السعر المعدل' : 'تعديل سعر البيع (صلاحية إدارية)'}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                              item.isPriceOverridden
                                ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100 hover:border-amber-400'
                            }`}
                          >
                            <span>✏️</span>
                            {item.isPriceOverridden ? 'سعر معدل' : 'تعديل السعر'}
                          </button>
                        )}

                        {/* زر الخصم على البند */}
                        <button
                          type="button"
                          onClick={() => openDiscountModal(item.id)}
                          title={item.discountAmount ? 'تعديل الخصم على الصنف' : 'إضافة خصم على الصنف'}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                            item.discountAmount && item.discountAmount > 0
                              ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                              : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100 hover:border-teal-400'
                          }`}
                        >
                          <Tag className="w-3 h-3" />
                          {item.discountAmount && item.discountAmount > 0
                            ? `−${item.discountAmount.toFixed(2)}`
                            : 'خصم'}
                        </button>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-slate-400 hover:text-red-500 text-sm font-bold px-1 transition cursor-pointer"
                          title="حذف الصنف من السلة"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* الشريط السفلي للإجماليات وزر الدفع وإرسال المطبخ وتعليق الطاولة */}
          <div className="border-t bg-white p-4 space-y-2.5">
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">المجموع الفرعي:</span>
                <span className="font-bold font-mono text-slate-800">
                  {getSubTotal().toFixed(2)} <span className="text-[10px] font-normal">ج.س</span>
                </span>
              </div>

              {getItemsDiscountTotal() > 0 && (
                <div className="flex justify-between items-center text-xs text-amber-700">
                  <span className="flex items-center gap-1 font-medium">
                    <Tag className="w-3 h-3" />
                    خصم البنود:
                  </span>
                  <span className="font-bold font-mono">
                    −{getItemsDiscountTotal().toFixed(2)} <span className="text-[10px] font-normal">ج.س</span>
                  </span>
                </div>
              )}

              {discountTotal > 0 && (
                <div className="flex justify-between items-center text-xs text-amber-700">
                  <span className="font-medium">خصم عام على الفاتورة:</span>
                  <span className="font-bold font-mono">
                    −{discountTotal.toFixed(2)} <span className="text-[10px] font-normal">ج.س</span>
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-1">
                <span className="text-sm font-black text-slate-900">الصافي النهائي:</span>
                <span className="text-2xl font-black font-mono text-[#00A8A8]">
                  {getGrandTotal().toFixed(2)}{' '}
                  <span className="text-xs font-normal">ج.س</span>
                </span>
              </div>
            </div>

            <button
              disabled={items.length === 0 || isConsoleLocked}
              onClick={() => {
                if (isConsoleLocked) return;
                if (!activeShiftData) {
                  setIsQuickOpenShiftModal(true);
                  return;
                }
                setIsPaymentOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00A8A8] py-3.5 text-base font-black text-white shadow transition hover:bg-[#009292] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>💳</span> الدفع وإتمام البيع F4
            </button>
          </div>
        </div>

      </div>

      {/* النوافذ المنبثقة */}
      {/* نافذة فتح الوردية السريعة من داخل الـ POS مباشرة */}
      {isQuickOpenShiftModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>🔐</span>
                فتح وردية كاشير جديدة (POS Shift)
              </h3>
              <button onClick={() => setIsQuickOpenShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900">
              <strong>تنبيه إلزامي:</strong> لا يمكن إتمام عمليات البيع أو الدفع إلا بوجود وردية عمل نشطة لحماية عهدة الكاشير وتوثيق النقدية.
            </div>

            <form onSubmit={handleQuickOpenShift} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  العهدة النقدية الافتتاحية في الدرج (Opening Cash)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quickOpeningBalance}
                    onChange={(e) => setQuickOpeningBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 border-2 border-teal-300 rounded-xl text-base font-mono font-black text-slate-900 focus:border-teal-600 focus:outline-none pr-3 pl-12 bg-teal-50/20"
                    autoFocus
                  />
                  <span className="absolute left-3 top-3 text-xs font-black text-teal-700">ج.س</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">المبلغ النقدي المسلم لك كفكة في بداية العمل (اتركه 0 إذا لم تستلم عهدة).</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuickOpenShiftModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isOpeningShiftLoading}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isOpeningShiftLoading ? 'جاري الفتح...' : 'فتح الوردية ومتابعة البيع 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPaymentOpen && !isConsoleLocked && (
        <PaymentModal isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} />
      )}
      {isResumeOpen && (
        <HoldResumeModal isOpen={isResumeOpen} onClose={() => setIsResumeOpen(false)} />
      )}
      {customer && (
        <CustomerLedgerModal
          isOpen={isCustomerLedgerOpen}
          onClose={() => setIsCustomerLedgerOpen(false)}
          customerId={customer.id}
          customerName={customer.name}
        />
      )}
      {customer && (
        <CustomerPaymentModal
          isOpen={isCustomerPaymentOpen}
          onClose={() => setIsCustomerPaymentOpen(false)}
          customerId={customer.id}
          customerName={customer.name}
          customerPhone={customer.phone}
          currentDebt={Number(customer.currentDebt || 0)}
          branchId={customer.branchId}
          onSuccess={(voucher) => {
            if (voucher && voucher.remainingDebt !== undefined) {
              setCustomer({ ...customer, currentDebt: voucher.remainingDebt });
            }
          }}
        />
      )}
      <CustomerFormModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        onSuccess={(created) => {
          if (created) {
            setCustomer(created);
          }
          setIsNewCustomerModalOpen(false);
        }}
      />

      {/* 🆕 نافذة الخصم على مستوى البند */}
      <ItemDiscountModal
        item={discountItem}
        isOpen={isDiscountModalOpen}
        onClose={closeDiscountModal}
        onApply={setItemDiscount}
        onClear={clearItemDiscount}
      />

      {/* 🆕 نافذة تعديل سعر البيع الرقابي */}
      {overrideModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-right" dir="rtl">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">تعديل سعر البيع الرقابي</h3>
                <p className="text-xs text-amber-100 mt-0.5">{overrideModalItem.tradeName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideModalItem(null)}
                className="text-amber-200 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {overrideError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                  ⚠️ {overrideError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">السعر المعتمد:</span>
                  <span className="font-bold font-mono text-slate-800 text-sm">
                    {(overrideModalItem.originalUnitPrice ?? overrideModalItem.unitPrice).toFixed(2)} ج.س
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">الحد الأدنى للسعر:</span>
                  <span className="font-bold font-mono text-amber-700 text-sm">
                    {(overrideModalItem.minSalePrice ?? 0).toFixed(2)} ج.س
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  السعر الجديد <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={overrideModalItem.minSalePrice ?? 0}
                  value={overrideNewPrice}
                  onChange={(e) => setOverrideNewPrice(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-bold font-mono text-slate-800 focus:border-amber-500 focus:outline-none"
                  placeholder="أدخل السعر الجديد"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  سبب التعديل (إلزامي، 3 - 500 حرف) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-amber-500 focus:outline-none"
                  placeholder="اكتب سبب تعديل السعر (مثل: موافقة المدير، تلف عبوة، عرض خاص)..."
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {overrideReason.trim().length} / 500 حرف (الحد الأدنى 3 أحرف)
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSavePriceOverride}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-sm cursor-pointer"
                >
                  تأكيد تعديل السعر
                </button>
                {overrideModalItem.isPriceOverridden && (
                  <button
                    type="button"
                    onClick={handleResetPriceOverride}
                    className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                    title="إعادة السعر إلى السعر المعتمد الأصلي"
                  >
                    استعادة المعتمد
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOverrideModalItem(null)}
                  className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 نافذة العمل أوفلاين وطابور المزامنة التلقائية */}
      <OfflineQueueModal
        isOpen={isOfflineQueueOpen}
        onClose={() => setIsOfflineQueueOpen(false)}
      />
    </div>
  );
};

