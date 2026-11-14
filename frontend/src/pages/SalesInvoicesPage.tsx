import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi, SalesInvoice, PaymentMethod, shiftsApi } from '../api/shifts';
import { branchesApi } from '../api/branches';
import { customersApi } from '../api/customers';
import { downloadReport } from '../api/http';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import { getCurrentUser } from '../utils/permissions';
import { ThermalPrinterService, generateCode128Svg } from '../services/printer.service';
import { installPosConsoleGuard } from '../utils/pos-security';
import {
  Receipt,
  Search,
  PlusCircle,
  Printer,
  FileText,
  DollarSign,
  CreditCard,
  Building2,
  User,
  Calendar,
  X,
  AlertCircle,
  Plus,
  Trash2,
  RotateCcw,
  Barcode,
  Percent,
  Minus,
  Sparkles,
  Tag,
} from 'lucide-react';

export interface InvoiceItemRow {
  medicineId: string;
  medicineName: string;
  scientificName?: string;
  barcode?: string;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  availableQty: number;
  quantity: number;
  isWeighed: boolean;
  unitPrice: number;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
}

export const SalesInvoicesPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [page, setPage] = useState(1);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Create Invoice State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invPaymentMethod, setInvPaymentMethod] = useState<PaymentMethod>('CASH');
  const [bankReference, setBankReference] = useState('');
  const [additionalDiscount, setAdditionalDiscount] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const [medicineSearch, setMedicineSearch] = useState('');
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemRow[]>([]);

  const queryClient = useQueryClient();

  // 🛡️ تفعيل درع الحماية ضد التلاعب عبر الكونسول في شاشة الفواتير
  useEffect(() => {
    return installPosConsoleGuard();
  }, []);

  // Focus barcode input when modal opens
  useEffect(() => {
    if (isCreateModalOpen) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [isCreateModalOpen]);

  // Queries
  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup'],
    queryFn: () => branchesApi.getAll({ limit: 100 }),
  });
  const branches = branchesData?.items || [];
  const defaultBranchId = branchId || (branches.length > 0 ? branches[0].id : '');

  const { data: customersData } = useQuery({
    queryKey: ['customers-lookup', defaultBranchId],
    queryFn: () => customersApi.getAll({ branchId: defaultBranchId, limit: 100 }),
    enabled: !!defaultBranchId,
  });
  const customers = customersData?.items || [];

  const currentUser = getCurrentUser();
  const { data: activeShift } = useQuery({
    queryKey: ['active-shift', defaultBranchId, currentUser?.id],
    queryFn: () => shiftsApi.getActive(defaultBranchId || undefined, currentUser?.id),
    enabled: true,
  });

  const { data: medicinesData } = useQuery({
    queryKey: ['pos-medicines', defaultBranchId, medicineSearch],
    queryFn: () => (defaultBranchId ? salesApi.getMedicinesForPos(defaultBranchId, medicineSearch) : []),
    enabled: !!defaultBranchId && isCreateModalOpen && medicineSearch.trim().length > 0,
  });

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ['sales-invoices', { branchId, paymentMethod, search, page }],
    queryFn: () =>
      salesApi.getInvoices({
        branchId: branchId || undefined,
        paymentMethod: (paymentMethod as PaymentMethod) || undefined,
        search: search || undefined,
        page,
        limit: 10,
      }),
  });

  // 🎯 فتح modal تلقائياً وتصفية الشاشة عند الوصول بـ ?openInvoice=xxx
  useEffect(() => {
    const openInvoiceKey = searchParams.get('openInvoice');
    if (!openInvoiceKey) return;

    // تصفية الجدول ليظهر فقط هذه الفاتورة المحددة
    setSearch((prev) => (prev !== openInvoiceKey ? openInvoiceKey : prev));

    // 1. البحث في القائمة الحالية
    const target = invoicesData?.items?.find(
      (inv: any) =>
        inv.id === openInvoiceKey || inv.invoiceNumber === openInvoiceKey,
    );

    // Always fetch canonical details; list rows do not carry historical balances.

    // 2. جلب الفاتورة مباشرة عبر API إذا لم تكن محملة
    salesApi
      .getInvoice(openInvoiceKey)
      .then((res: any) => {
        const inv = res?.data || res;
        if (inv && (inv.id || inv.invoiceNumber)) {
          setSelectedInvoice(inv);
          setIsReceiptModalOpen(true);
        }
      })
      .catch(() => {});
  }, [searchParams, invoicesData?.items]);

  /**
   * إغلاق الـ Modal مع تنظيف الـ URL
   */
  const closeReceiptModal = () => {
    setIsReceiptModalOpen(false);
    setSelectedInvoice(null);

    // نظّف الـ query param إن وُجد
    if (searchParams.get('openInvoice')) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('openInvoice');
      setSearchParams(newParams, { replace: true });
    }
  };

  const createInvoiceMutation = useMutation({
    mutationFn: salesApi.createInvoice,
    onSuccess: (newInv) => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsCreateModalOpen(false);
      resetCreateForm();
      setSelectedInvoice(newInv);
      setIsReceiptModalOpen(true);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل إنشاء الفاتورة');
    },
  });

  const resetCreateForm = () => {
    setInvoiceItems([]);
    setSelectedCustomerId('');
    setAdditionalDiscount(0);
    setPaidAmount('');
    setNotes('');
    setBankReference('');
    setInvPaymentMethod('CASH');
    setMedicineSearch('');
  };

  const addItemToInvoice = (medicine: any, batch?: any) => {
    // Choose selected batch or fallback to first available FEFO batch
    const selectedBatch =
      batch ||
      (medicine.batches && medicine.batches.find((b: any) => b.quantityInBase > 0)) ||
      medicine.batches?.[0];

    if (!selectedBatch) {
      alert(`لا توجد تشغيلة / دفعة برصيد متاح للصنف: ${medicine.tradeName}`);
      return;
    }

    const existingIndex = invoiceItems.findIndex((i) => i.batchId === selectedBatch.id);
    const isWeighed = Boolean(medicine.isWeighed);
    const quantityStep = isWeighed ? 0.001 : 1;
    const availableQty = isWeighed
      ? Number(selectedBatch.quantityInBase) / 1000
      : Number(selectedBatch.quantityInBase);
    if (existingIndex > -1) {
      const updated = [...invoiceItems];
      const nextQty = Number((updated[existingIndex].quantity + quantityStep).toFixed(isWeighed ? 3 : 0));
      if (nextQty <= availableQty) {
        updated[existingIndex].quantity = nextQty;
        setInvoiceItems(updated);
      } else {
        alert(`الكمية المطلوبة تتجاوز المتاح في الدفعة (${availableQty}${isWeighed ? ' كجم' : ''})`);
      }
    } else {
      const defaultUnit = medicine.units?.[0] || {};
      const unitPrice =
        Number(selectedBatch.salePrice) ||
        Number(defaultUnit.price) ||
        (selectedBatch.costPrice ? Number(selectedBatch.costPrice) * 1.25 : 10);

      setInvoiceItems((prev) => [
        ...prev,
        {
          medicineId: medicine.id || medicine.medicineId,
          medicineName: medicine.tradeName,
          scientificName: medicine.scientificName,
          barcode: medicine.barcode,
          batchId: selectedBatch.id,
          batchNumber: selectedBatch.batchNumber,
          expiryDate: selectedBatch.expiryDate,
          availableQty,
          quantity: quantityStep,
          isWeighed,
          unitPrice,
          discountType: 'PERCENT',
          discountValue: 0,
        },
      ]);
    }

    setMedicineSearch('');
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const handleBarcodeSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = medicineSearch.trim();
    if (!query) return;

    setIsSearchingBarcode(true);
    try {
      // 1. Check exact barcode in currently loaded results
      const exactMatch = medicinesData?.find(
        (m: any) =>
          m.barcode === query ||
          m.units?.some((u: any) => u.barcode === query)
      );

      if (exactMatch) {
        addItemToInvoice(exactMatch);
        return;
      }

      // 2. Direct scan via scan endpoint
      const scanRes = await fetch(`/api/medicines/scan?barcode=${encodeURIComponent(query)}`);
      if (scanRes.ok) {
        const product = await scanRes.json();
        if (product) {
          addItemToInvoice(product);
          return;
        }
      }

      // 3. If there is a single match in search results
      if (medicinesData && medicinesData.length === 1) {
        addItemToInvoice(medicinesData[0]);
        return;
      }

      // 4. Query pos endpoint
      const posRes = await fetch(
        `/api/medicines/pos?branchId=${encodeURIComponent(defaultBranchId)}&q=${encodeURIComponent(query)}`
      );
      if (posRes.ok) {
        const results = await posRes.json();
        if (results && results.length > 0) {
          addItemToInvoice(results[0]);
          return;
        }
      }

      alert(`لم يتم العثور على صنف بالرمز أو الاسم: "${query}"`);
    } catch (err) {
      console.error('Barcode search error', err);
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  const removeItemFromInvoice = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const updateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    const updated = [...invoiceItems];
    if (newQty > updated[index].availableQty) {
      alert(`الكمية المتاحة هي ${updated[index].availableQty} فقط`);
      return;
    }
    updated[index].quantity = Number(newQty.toFixed(updated[index].isWeighed ? 3 : 0));
    setInvoiceItems(updated);
  };

  const updateItemPrice = (index: number, newPrice: number) => {
    const updated = [...invoiceItems];
    updated[index].unitPrice = Math.max(0, newPrice);
    setInvoiceItems(updated);
  };

  const toggleItemDiscountType = (index: number) => {
    const updated = [...invoiceItems];
    const currentType = updated[index].discountType;
    const newType = currentType === 'PERCENT' ? 'FIXED' : 'PERCENT';
    updated[index].discountType = newType;
    if (newType === 'PERCENT' && updated[index].discountValue > 100) {
      updated[index].discountValue = 100;
    }
    setInvoiceItems(updated);
  };

  const updateItemDiscountValue = (index: number, value: number) => {
    const updated = [...invoiceItems];
    const safeVal = Math.max(0, value);
    if (updated[index].discountType === 'PERCENT' && safeVal > 100) {
      updated[index].discountValue = 100;
    } else {
      updated[index].discountValue = safeVal;
    }
    setInvoiceItems(updated);
  };

  const getItemDiscount = (item: InvoiceItemRow): number => {
    const lineTotal = item.quantity * item.unitPrice;
    if (!item.discountValue || item.discountValue <= 0) return 0;
    if (item.discountType === 'PERCENT') {
      const calculated = (lineTotal * item.discountValue) / 100;
      return Math.min(lineTotal, Math.round(calculated * 100) / 100);
    }
    return Math.min(lineTotal, Math.round(item.discountValue * 100) / 100);
  };

  const getItemNetTotal = (item: InvoiceItemRow): number => {
    const lineTotal = item.quantity * item.unitPrice;
    return Math.max(0, lineTotal - getItemDiscount(item));
  };

  // Financial Calculations
  const subTotal = invoiceItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const itemsDiscountTotal = invoiceItems.reduce((sum, item) => sum + getItemDiscount(item), 0);
  const totalDiscount = itemsDiscountTotal + (Number(additionalDiscount) || 0);
  const netAmount = Math.max(0, subTotal - totalDiscount);
  const actualPaid = paidAmount === '' ? netAmount : Number(paidAmount);
  const remainingDebt = Math.max(0, netAmount - actualPaid);

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) {
      alert('يجب فتح وردية نشطة أولاً قبل إصدار الفواتير');
      return;
    }
    if (invoiceItems.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل للفاتورة');
      return;
    }
    if (remainingDebt > 0 && !selectedCustomerId) {
      alert('يجب تحديد عميل مسجل لتسجيل متبقي آجل');
      return;
    }

    createInvoiceMutation.mutate({
      branchId: defaultBranchId,
      shiftId: activeShift.id,
      userId: activeShift.userId,
      customerId: selectedCustomerId || undefined,
      items: invoiceItems.map((i) => ({
        medicineId: i.medicineId,
        batchId: i.batchId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      discountAmount: totalDiscount,
      paidAmount: invPaymentMethod === 'CREDIT' ? 0 : actualPaid,
      paymentMethod: invPaymentMethod,
      bankReference: bankReference || undefined,
      notes: notes || undefined,
    });
  };

  const getPaymentBadge = (method: PaymentMethod) => {
    switch (method) {
      case 'CASH':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">نقدي</span>;
      case 'BANK_TRANSFER':
      case 'TRANSFER':
      case 'CARD':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">بنكك / تحويل</span>;
      case 'CREDIT':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800">آجل (ذمم)</span>;
      case 'MIXED':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">مختلط</span>;
    }
  };

  const columns = [
    {
      header: 'رقم الفاتورة',
      accessor: (item: SalesInvoice) => (
        <div>
          <span className="font-mono font-bold text-teal-800 text-xs">{item.invoiceNumber}</span>
          <p className="text-[11px] text-slate-400">
            {new Date(item.createdAt).toLocaleDateString('ar-SD', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      ),
    },
    {
      header: 'العميل',
      accessor: (item: SalesInvoice) => (
        <div>
          <span className="font-bold text-slate-800 text-xs">{item.customer?.name || 'عميل نقدي مباشر'}</span>
          {item.customer?.phone && <p className="text-[11px] text-slate-400 font-mono">{item.customer.phone}</p>}
        </div>
      ),
    },
    {
      header: 'طريقة الدفع',
      accessor: (item: SalesInvoice) => getPaymentBadge(item.paymentMethod),
    },
    {
      header: 'الإجمالي الصافي',
      accessor: (item: SalesInvoice) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {Number(item.netAmount).toLocaleString()} ج.س
        </span>
      ),
    },
    {
      header: 'المدفوع / المتبقي',
      accessor: (item: SalesInvoice) => {
        const remaining = Number(item.remainingAmount);
        return (
          <div className="text-xs">
            <span className="font-mono font-semibold text-emerald-700">
              مدفوع: {Number(item.paidAmount).toLocaleString()} ج.س
            </span>
            {remaining > 0 && (
              <p className="font-mono font-bold text-rose-600 text-[11px]">
                متبقي: {remaining.toLocaleString()} ج.س
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: 'الكاشير والفرع',
      accessor: (item: SalesInvoice) => (
        <div className="text-xs text-slate-600">
          <p className="font-medium">{item.user?.name}</p>
          <span className="text-[10px] text-slate-400">{item.branch?.name}</span>
        </div>
      ),
    },
    {
      header: 'إجراءات وعرض',
      accessor: (item: SalesInvoice) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={async () => {
              const fullInvoice = await salesApi.getInvoice(item.id);
              setSelectedInvoice(fullInvoice?.data || fullInvoice);
              setIsReceiptModalOpen(true);
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition flex items-center gap-1 cursor-pointer"
            title="عرض وطباعة الفاتورة"
          >
            <Printer className="w-3.5 h-3.5 text-teal-600" />
            الفاتورة
          </button>
          <button
            onClick={() => navigate(`/sales/returns?invoice=${encodeURIComponent(item.invoiceNumber)}`)}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition flex items-center gap-1 cursor-pointer"
            title="تسجيل مرتجع لهذه الفاتورة"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            مرتجع
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className={isReceiptModalOpen ? 'print:hidden space-y-6' : 'space-y-6'}>
        <PageHeader
          title="فواتير المبيعات (Sales Invoices)"
          subtitle="سجل فواتير البيع، السحب المخزني الآلي بدفعات FEFO، والربط مع الورديات والذمم"
          action={
            <button
              onClick={() => {
                resetCreateForm();
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm transition"
            >
              <PlusCircle className="w-4 h-4" />
              إنشاء فاتورة مبيعات
            </button>
          }
        />

        {/* Filter Toolbar */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث برقم الفاتورة أو اسم العميل..."
                className="w-full px-3 py-1.5 pl-8 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            {/* Branch Filter */}
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-teal-500 bg-white min-w-[160px]"
            >
              <option value="">جميع الفروع</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {/* Payment Method Filter */}
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-teal-500 bg-white min-w-[140px]"
            >
              <option value="">كل طرق الدفع</option>
              <option value="CASH">نقدي (CASH)</option>
              <option value="BANK_TRANSFER">تحويل بنكي / بنكك</option>
              <option value="CREDIT">آجل (CREDIT)</option>
              <option value="MIXED">مختلط (MIXED)</option>
            </select>
          </div>

          <div className="text-xs text-slate-500">
            إجمالي الفواتير: <strong className="text-slate-800">{invoicesData?.total || 0}</strong>
          </div>
        </div>

        {/* Invoices DataTable */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataTable<SalesInvoice>
            columns={columns}
            data={invoicesData?.items || []}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* ================= MODAL: Create Invoice ================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 md:p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 px-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-600">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">إصدار فاتورة مبيعات جديدة</h3>
                  <p className="text-xs text-slate-400">إضافة الأصناف، تحديد خصم البنود [% أو مبلغ]، والسحب الآلي FEFO</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="flex-1 overflow-y-auto p-6 space-y-5">
              {!activeShift && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>تحذير: لا توجد وردية مفتوحة في هذا الفرع. يجب فتح وردية في شاشة الورديات قبل المتابعة.</span>
                </div>
              )}

              {/* Customer and Payment Config */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">العميل (اختياري للنقدي / إلزامي للآجل)</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">عميل نقدي مباشر (بدون حساب)</option>
                    {customers.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name} - (دين: {Number(c.currentDebt).toLocaleString()} ج.س)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع *</label>
                  <select
                    value={invPaymentMethod}
                    onChange={(e) => setInvPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-teal-500 font-semibold"
                  >
                    <option value="CASH">نقدي (CASH)</option>
                    <option value="BANK_TRANSFER">تحويل بنكي / بنكك (BANK_TRANSFER)</option>
                    <option value="CREDIT">آجل بالكامل (CREDIT)</option>
                    <option value="MIXED">دفع جزئي ومتبقي آجل (MIXED)</option>
                  </select>
                </div>

                {invPaymentMethod === 'BANK_TRANSFER' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">رقم الإشعار / العملية البنكية</label>
                    <input
                      type="text"
                      value={bankReference}
                      onChange={(e) => setBankReference(e.target.value)}
                      placeholder="رقم المعاملة أو إشعار بنكك..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-teal-500 bg-white"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفاتورة</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="ملاحظات اختيارية..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Medicine Barcode & Fast Search Section (POS Experience) */}
              <div className="border border-teal-200/80 rounded-xl p-3.5 bg-gradient-to-l from-teal-50/40 via-white to-teal-50/20 space-y-3 shadow-sm">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Barcode className="w-5 h-5 text-teal-600 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-800">البحث السريع ومسح الباركود (POS)</span>
                      <p className="text-[10px] text-slate-400">امسح الباركود أو اكتب الاسم ثم اضغط Enter للإضافة الفورية</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-1 sm:max-w-md">
                    <div className="relative flex-1">
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        value={medicineSearch}
                        onChange={(e) => setMedicineSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleBarcodeSearch();
                          }
                        }}
                        placeholder="امسح الباركود أو ابحث بالاسم... (Enter للإضافة)"
                        className="w-full px-3 py-2 pr-9 border border-teal-300 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-teal-500 shadow-inner"
                      />
                      <Search className="w-4 h-4 text-teal-600 absolute right-3 top-2.5 pointer-events-none" />
                      {medicineSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setMedicineSearch('');
                            barcodeInputRef.current?.focus();
                          }}
                          className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBarcodeSearch()}
                      disabled={isSearchingBarcode || !medicineSearch.trim()}
                      className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      {isSearchingBarcode ? (
                        <span>جاري البحث...</span>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Available search results / Autocomplete Dropdown */}
                {medicinesData && medicinesData.length > 0 && medicineSearch.trim() && (
                  <div className="max-h-52 overflow-y-auto bg-white border border-teal-200 rounded-xl divide-y divide-slate-100 text-xs shadow-md">
                    {medicinesData.slice(0, 6).map((med: any) => (
                      <div key={med.id || med.medicineId} className="p-2.5 flex flex-wrap items-center justify-between hover:bg-teal-50/50 gap-2 transition">
                        <div className="min-w-[180px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{med.tradeName}</span>
                            {med.barcode && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-600 border border-slate-200">
                                {med.barcode}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate max-w-xs">{med.scientificName}</p>
                        </div>

                        {/* Batch Selector / FEFO Auto-Add */}
                        <div className="flex items-center flex-wrap gap-1.5">
                          {med.batches && med.batches.length > 0 ? (
                            med.batches.map((b: any, bIdx: number) => {
                              const isFefo = bIdx === 0;
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => addItemToInvoice(med, b)}
                                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition ${
                                    isFefo
                                      ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700 shadow-sm'
                                      : 'bg-white hover:bg-teal-50 border-slate-200 text-slate-700'
                                  }`}
                                  title={`إضافة تشغيلة: ${b.batchNumber} - ينتهي: ${new Date(b.expiryDate).toLocaleDateString('ar-SD')}`}
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>دفعة: {b.batchNumber}</span>
                                  <span className={`text-[10px] ${isFefo ? 'text-teal-100' : 'text-slate-500'}`}>
                                    (متاح: {b.quantityInBase})
                                  </span>
                                  {isFefo && (
                                    <span className="bg-teal-700/80 text-white text-[9px] px-1 py-0.2 rounded font-bold">
                                      FEFO
                                    </span>
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            <span className="text-rose-500 text-[11px] font-medium">لا يوجد رصيد متاح في المخزن</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Items Table with Item-Level Discount */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 text-right">الصنف</th>
                      <th className="p-3 text-right">الدفعة والصلاحية</th>
                      <th className="p-3 text-center w-28">الكمية</th>
                      <th className="p-3 text-right w-28">السعر (ج.س)</th>
                      <th className="p-3 text-right w-24">الإجمالي</th>
                      <th className="p-3 text-center w-44">الخصم ([%] / ج.س)</th>
                      <th className="p-3 text-right w-28">الصافي</th>
                      <th className="p-3 text-center w-12">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoiceItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 italic bg-slate-50/30">
                          <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          لم يتم إضافة أصناف للفاتورة بعد. استخدم البحث أو امسح الباركود أعلاه لإضافة الأصناف.
                        </td>
                      </tr>
                    ) : (
                      invoiceItems.map((item, index) => {
                        const itemSub = item.quantity * item.unitPrice;
                        const itemDisc = getItemDiscount(item);
                        const itemNet = getItemNetTotal(item);

                        return (
                          <tr key={`${item.batchId}-${index}`} className="hover:bg-slate-50/60 transition">
                            {/* Medicine Details */}
                            <td className="p-3">
                              <p className="font-bold text-slate-900">{item.medicineName}</p>
                              {item.scientificName && (
                                <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{item.scientificName}</p>
                              )}
                              {item.barcode && (
                                <span className="font-mono text-[9px] text-slate-400 block mt-0.5">
                                  #{item.barcode}
                                </span>
                              )}
                            </td>

                            {/* Batch & Expiry */}
                            <td className="p-3">
                              <span className="font-mono font-semibold text-slate-700 block text-xs">
                                {item.batchNumber}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {new Date(item.expiryDate).toLocaleDateString('ar-SD', {
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </td>

                            {/* Quantity Stepper */}
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(index, item.quantity - (item.isWeighed ? 0.001 : 1))}
                                  disabled={item.quantity <= (item.isWeighed ? 0.001 : 1)}
                                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center disabled:opacity-30 transition"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min={item.isWeighed ? 0.001 : 1}
                                  step={item.isWeighed ? 0.001 : 1}
                                  max={item.availableQty}
                                  value={item.quantity}
                                  onChange={(e) => updateItemQty(index, Number(e.target.value) || (item.isWeighed ? 0.001 : 1))}
                                  className="w-12 px-1 py-1 border border-slate-300 rounded font-mono font-bold text-center text-xs focus:ring-1 focus:ring-teal-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(index, item.quantity + (item.isWeighed ? 0.001 : 1))}
                                  disabled={item.quantity >= item.availableQty}
                                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center disabled:opacity-30 transition"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                متاح: {item.availableQty}{item.isWeighed ? ' كجم' : ''}
                              </span>
                            </td>

                            {/* Unit Price (Locked to Official DB Price) */}
                            <td className="p-3">
                              <input
                                type="number"
                                readOnly
                                tabIndex={-1}
                                value={item.unitPrice}
                                title="السعر الرسمي المعتمد من قاعدة البيانات (مؤمّن ضد التعديل)"
                                className="w-24 px-2 py-1 border border-slate-200 bg-slate-100 text-slate-700 rounded font-mono font-bold text-right text-xs cursor-not-allowed select-none"
                              />
                            </td>

                            {/* Row Subtotal */}
                            <td className="p-3 font-mono font-semibold text-slate-700 text-right">
                              {itemSub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Item Discount (Percentage [%] or Fixed [SDG]) */}
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Mode Toggle Button */}
                                <button
                                  type="button"
                                  onClick={() => toggleItemDiscountType(index)}
                                  className={`px-2 py-1 rounded text-[10px] font-bold border transition ${
                                    item.discountType === 'PERCENT'
                                      ? 'bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100'
                                      : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                  }`}
                                  title={
                                    item.discountType === 'PERCENT'
                                      ? 'الخصم كنسبة مئوية، انقر للتبديل لمبلغ ثابت'
                                      : 'الخصم كمبلغ ثابت، انقر للتبديل لنسبة مئوية'
                                  }
                                >
                                  {item.discountType === 'PERCENT' ? '[%] نسبة' : '[ج.س] مبلغ'}
                                </button>

                                {/* Value Input */}
                                <input
                                  type="number"
                                  min="0"
                                  max={item.discountType === 'PERCENT' ? 100 : itemSub}
                                  step={item.discountType === 'PERCENT' ? '0.5' : '1'}
                                  value={item.discountValue || ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    updateItemDiscountValue(index, parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 px-1.5 py-1 border border-slate-300 rounded font-mono font-bold text-center text-xs focus:ring-1 focus:ring-teal-500"
                                />
                              </div>

                              {/* Calculated Deduction Display */}
                              <div className="text-center mt-1">
                                {itemDisc > 0 ? (
                                  <span className="font-mono font-bold text-rose-600 text-[11px]">
                                    −{itemDisc.toFixed(2)} ج.س
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-xs font-mono">—</span>
                                )}
                              </div>
                            </td>

                            {/* Row Net Total */}
                            <td className="p-3 text-right">
                              <span className="font-mono font-bold text-teal-800 text-xs block">
                                {itemNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.س
                              </span>
                            </td>

                            {/* Remove Row */}
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => removeItemFromInvoice(index)}
                                className="text-rose-500 hover:text-rose-700 p-1.5 hover:bg-rose-50 rounded-lg transition"
                                title="حذف الصنف"
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

              {/* Financial Calculation Summary (مطابق للمقترح) */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                {/* 1. Subtotal */}
                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 flex flex-col justify-between">
                  <span className="text-slate-400 block mb-1 font-medium">المجموع الفرعي (قبل الخصم)</span>
                  <p className="font-mono font-bold text-lg text-slate-100">
                    {subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span className="text-xs font-normal text-slate-400">ج.س</span>
                  </p>
                </div>

                {/* 2. Total Discounts */}
                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">إجمالي الخصم</span>
                    <span className="font-mono font-bold text-base text-rose-400">
                      {totalDiscount > 0 ? `−${totalDiscount.toFixed(2)}` : '0.00'}{' '}
                      <span className="text-xs font-normal text-slate-400">ج.س</span>
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-700/50 flex items-center justify-between gap-1 text-[11px]">
                    <span className="text-slate-400">خصم إضافي عام:</span>
                    <input
                      type="number"
                      min="0"
                      max={subTotal - itemsDiscountTotal}
                      value={additionalDiscount || ''}
                      placeholder="0"
                      onChange={(e) => setAdditionalDiscount(parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-rose-400 font-mono text-center text-xs focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                {/* 3. Final Net Amount */}
                <div className="bg-gradient-to-br from-teal-900/90 to-emerald-950/90 p-3.5 rounded-xl border border-teal-500/30 flex flex-col justify-between shadow-inner">
                  <span className="text-teal-200 block mb-1 font-bold">الإجمالي الصافي المطلوب</span>
                  <p className="font-mono font-black text-xl text-teal-300">
                    {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span className="text-xs font-normal text-teal-400">ج.س</span>
                  </p>
                </div>

                {/* 4. Payment & Debt */}
                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 flex flex-col justify-between space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 font-medium">المدفوع نقداً / بنك</label>
                    <button
                      type="button"
                      onClick={() => setPaidAmount(netAmount)}
                      className="text-[10px] text-teal-400 hover:text-teal-300 underline font-semibold"
                    >
                      سداد كامل
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder={String(netAmount)}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded font-mono font-bold text-emerald-400 text-sm focus:ring-1 focus:ring-teal-500"
                  />
                  {remainingDebt > 0 && (
                    <span className="text-[10px] text-rose-400 font-bold block">
                      المتبقي الآجل (دين): {remainingDebt.toLocaleString()} ج.س
                    </span>
                  )}
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500">
                  عدد البنود: <strong className="text-slate-800">{invoiceItems.length}</strong> صنف
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={createInvoiceMutation.isPending || !activeShift || invoiceItems.length === 0}
                    className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {createInvoiceMutation.isPending ? (
                      <span>جاري الإصدار...</span>
                    ) : (
                      <>
                        <Receipt className="w-4 h-4" />
                        <span>إصدار الفاتورة وحفظ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: Printable Receipt ================= */}
      {isReceiptModalOpen && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 print:hidden">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Printer className="w-5 h-5 text-teal-600" />
                إيصال فاتورة مبيعات
              </h3>
              <button onClick={closeReceiptModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Paper */}
            <div id="printable-receipt" className="p-4 bg-white border border-dashed border-slate-300 rounded-xl space-y-3 font-mono text-xs text-slate-800">
              <div className="text-center pb-2 border-b border-dashed border-slate-300">
                <h2 className="font-black text-base text-teal-800">DawaCore Pharmacy</h2>
                <p className="text-[11px] text-slate-500">نظام إدارة الصيدليات الموحد</p>
                <p className="text-[11px] text-slate-500">{selectedInvoice.branch?.name || 'الفرع الرئيسي'}</p>
                <p className="font-bold text-xs mt-1 text-teal-700">{selectedInvoice.invoiceNumber}</p>
                <p className="text-[10px] text-slate-400">
                  {new Date(selectedInvoice.createdAt).toLocaleString('ar-SD')}
                </p>
              </div>

              <div className="text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">العميل:</span>
                  <span className="font-bold">{selectedInvoice.customer?.name || 'نقدي مباشر'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الكاشير:</span>
                  <span>{selectedInvoice.user?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">طريقة الدفع:</span>
                  <span>{selectedInvoice.paymentMethod}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="pt-2 border-t border-dashed border-slate-300">
                <div className="flex justify-between font-bold text-[11px] pb-1">
                  <span>الصنف</span>
                  <span>الكمية × السعر</span>
                  <span>الإجمالي</span>
                </div>
                {selectedInvoice.items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-[11px] py-0.5">
                    <span className="truncate max-w-[140px]">{item.medicine?.tradeName || 'دواء'}</span>
                    <span>
                      {item.quantity} × {Number(item.unitPrice).toLocaleString()}
                    </span>
                    <span className="font-bold">{Number(item.subtotal || item.quantity * item.unitPrice).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="pt-2 border-t border-dashed border-slate-300 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>الإجمالي:</span>
                  <span>{Number(selectedInvoice.totalAmount).toLocaleString()} ج.س</span>
                </div>
                {Number(selectedInvoice.discountAmount) > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>الخصم:</span>
                    <span>-{Number(selectedInvoice.discountAmount).toLocaleString()} ج.س</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300 text-teal-900">
                  <span>الصافي:</span>
                  <span>{Number(selectedInvoice.netAmount).toLocaleString()} ج.س</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>المدفوع:</span>
                  <span>{Number(selectedInvoice.paidAmount).toLocaleString()} ج.س</span>
                </div>
                {Number(selectedInvoice.remainingAmount) > 0 && (
                  <div className="flex justify-between font-bold text-rose-600">
                    <span>المتبقي الآجل:</span>
                    <span>{Number(selectedInvoice.remainingAmount).toLocaleString()} ج.س</span>
                  </div>
                )}
              </div>

              <div
                className="py-1 flex justify-center"
                dangerouslySetInnerHTML={{
                  __html: generateCode128Svg(selectedInvoice.invoiceNumber, {
                    height: 28,
                    barWidth: 1.15,
                    showText: true,
                    fontSize: 9,
                  }),
                }}
              />

              <div className="text-center pt-2 border-t border-dashed border-slate-300 text-[10px] text-slate-400">
                شكراً لزيارتكم • نتمنى لكم دوام الصحة والعافية
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 print:hidden">
              <button className="py-2.5 bg-slate-800 text-white rounded-lg" onClick={() => downloadReport(`/api/sales/invoices/${encodeURIComponent(selectedInvoice.id)}/pdf`)}>تنزيل فاتورة PDF</button>
              <button
                onClick={() =>
                  ThermalPrinterService.printInvoice({
                    companyName: currentUser?.companyName || undefined,
                    branchName: selectedInvoice.branch?.name || 'الفرع الرئيسي',
                    invoiceNumber: selectedInvoice.invoiceNumber,
                    createdAt: selectedInvoice.createdAt,
                    cashierName: selectedInvoice.user?.name || 'الكاشير',
                    customerName: selectedInvoice.customer?.name || 'عميل نقدي مباشر',
                    paymentMethod: selectedInvoice.paymentMethod,
                    bankReference: selectedInvoice.bankReference,
                    items: (selectedInvoice.items || []).map((item: any) => ({
                      tradeName: item.medicine?.tradeName || 'دواء',
                      quantity: Number(item.quantity || 1),
                      unitPrice: Number(item.unitPrice || 0),
                      discountAmount: Number(item.discount || 0),
                      totalPrice: Number(item.subtotal || item.quantity * item.unitPrice),
                    })),
                    subTotal: Number(selectedInvoice.totalAmount || 0),
                    discountTotal: Number(selectedInvoice.discountAmount || 0),
                    grandTotal: Number(selectedInvoice.netAmount || 0),
                    paidAmount: Number(selectedInvoice.paidAmount || 0),
                    changeAmount: 0,
                    remainingDebt: Number(selectedInvoice.remainingAmount || 0),
                    paperWidth: '80mm',
                    customerBalance: selectedInvoice.customerBalance,
                    showCustomerBalance: !!selectedInvoice.customerId && Number(selectedInvoice.remainingAmount) > 0,
                  })
                }
                className="py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                طباعة حرارية (80mm)
              </button>
              <button
                onClick={() =>
                  ThermalPrinterService.printInvoice({
                    companyName: currentUser?.companyName || undefined,
                    branchName: selectedInvoice.branch?.name || 'الفرع الرئيسي',
                    invoiceNumber: selectedInvoice.invoiceNumber,
                    createdAt: selectedInvoice.createdAt,
                    cashierName: selectedInvoice.user?.name || 'الكاشير',
                    customerName: selectedInvoice.customer?.name || 'عميل نقدي مباشر',
                    paymentMethod: selectedInvoice.paymentMethod,
                    bankReference: selectedInvoice.bankReference,
                    items: (selectedInvoice.items || []).map((item: any) => ({
                      tradeName: item.medicine?.tradeName || 'دواء',
                      quantity: Number(item.quantity || 1),
                      unitPrice: Number(item.unitPrice || 0),
                      discountAmount: Number(item.discount || 0),
                      totalPrice: Number(item.subtotal || item.quantity * item.unitPrice),
                    })),
                    subTotal: Number(selectedInvoice.totalAmount || 0),
                    discountTotal: Number(selectedInvoice.discountAmount || 0),
                    grandTotal: Number(selectedInvoice.netAmount || 0),
                    paidAmount: Number(selectedInvoice.paidAmount || 0),
                    changeAmount: 0,
                    remainingDebt: Number(selectedInvoice.remainingAmount || 0),
                    paperWidth: '58mm',
                    customerBalance: selectedInvoice.customerBalance,
                    showCustomerBalance: !!selectedInvoice.customerId && Number(selectedInvoice.remainingAmount) > 0,
                  })
                }
                className="py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                طباعة مصغرة (58mm)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
