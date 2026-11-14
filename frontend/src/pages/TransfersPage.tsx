import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transfersApi, TransferTransaction, TransferDetails } from '../api/transfers';
import { batchesApi, Batch } from '../api/batches';
import { branchesApi, Branch } from '../api/branches';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import {
  Truck,
  ArrowLeftRight,
  Plus,
  Trash2,
  CheckCircle2,
  Printer,
  History,
  Search,
  Building2,
  Boxes,
  FileText,
  AlertCircle,
  X,
  RefreshCw,
} from 'lucide-react';

interface CartItem {
  batch: Batch;
  quantity: number;
}

export const TransfersPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'NEW_TRANSFER' | 'HISTORY'>('NEW_TRANSFER');

  // Transfer Form State
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [notes, setNotes] = useState('تحويل دوري لسد العجز بين الفروع');

  // Selected batch to add
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [transferQty, setTransferQty] = useState<number | ''>(10);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [transferSuccess, setTransferSuccess] = useState<any | null>(null);

  // History State
  const [historySearch, setHistorySearch] = useState('');
  const [historyBranchId, setHistoryBranchId] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedDetails, setSelectedDetails] = useState<TransferDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const queryClient = useQueryClient();

  // Queries
  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup-transfers'],
    queryFn: () => branchesApi.getAll({ limit: 50 }),
  });
  const branches: Branch[] = branchesData?.items || [];

  // Initialize branches
  React.useEffect(() => {
    if (branches.length >= 2) {
      if (!fromBranchId) setFromBranchId(branches[0].id);
      if (!toBranchId) setToBranchId(branches[1].id);
    } else if (branches.length === 1 && !fromBranchId) {
      setFromBranchId(branches[0].id);
    }
  }, [branches]);

  // Query batches available in source branch
  const { data: sourceBatchesData } = useQuery({
    queryKey: ['batches-source-branch', fromBranchId],
    queryFn: () =>
      batchesApi.getAll({
        branchId: fromBranchId || undefined,
        limit: 100,
      }),
    enabled: !!fromBranchId,
  });
  const sourceBatches = sourceBatchesData?.items || [];

  // Query history
  const { data: historyData, isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['transfers-history', { historyBranchId, historySearch, historyPage }],
    queryFn: () =>
      transfersApi.getAll({
        branchId: historyBranchId || undefined,
        search: historySearch || undefined,
        page: historyPage,
        limit: 15,
      }),
    enabled: activeTab === 'HISTORY',
  });

  // Mutation
  const transferMutation = useMutation({
    mutationFn: transfersApi.createTransfer,
    onSuccess: (data) => {
      setTransferSuccess(data);
      setCartItems([]);
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['transfers-history'] });
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'فشل تنفيذ عملية التحويل المخزني';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });

  const handleAddToCart = () => {
    if (!selectedBatchId) {
      alert('يرجى اختيار التشغيلة المراد تحويلها');
      return;
    }
    const batch = sourceBatches.find((b) => b.id === selectedBatchId);
    if (!batch) return;

    const qty = Number(transferQty) || 0;
    if (qty <= 0) {
      alert('الكمية يجب أن تكون أكبر من صفر');
      return;
    }

    if (qty > batch.quantityInBase) {
      alert(`الرصيد المتاح في التشغيلة هو ${batch.quantityInBase} حبة فقط`);
      return;
    }

    const existingIndex = cartItems.findIndex((c) => c.batch.id === batch.id);
    if (existingIndex >= 0) {
      const newQty = cartItems[existingIndex].quantity + qty;
      if (newQty > batch.quantityInBase) {
        alert(`إجمالي الكمية المطلوبة (${newQty}) تتجاوز الرصيد المتاح (${batch.quantityInBase})`);
        return;
      }
      const updated = [...cartItems];
      updated[existingIndex].quantity = newQty;
      setCartItems(updated);
    } else {
      setCartItems([...cartItems, { batch, quantity: qty }]);
    }

    setSelectedBatchId('');
    setTransferQty(10);
  };

  const handleRemoveFromCart = (index: number) => {
    setCartItems(cartItems.filter((_, i) => i !== index));
  };

  const handleExecuteTransfer = () => {
    if (!fromBranchId || !toBranchId) {
      alert('يرجى تحديد الفرع المصدر والفرع المستلم');
      return;
    }
    if (fromBranchId === toBranchId) {
      alert('الفرع المصدر والمستلم متطابقان، يرجى اختيار فرعين مختلفين');
      return;
    }
    if (cartItems.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل للتحويل');
      return;
    }

    const payload = {
      fromBranchId,
      toBranchId,
      notes: notes.trim(),
      items: cartItems.map((c) => ({
        batchId: c.batch.id,
        quantity: c.quantity,
      })),
    };

    transferMutation.mutate(payload);
  };

  const handleViewDetails = async (referenceId: string) => {
    setLoadingDetails(true);
    try {
      const details = await transfersApi.getDetails(referenceId);
      setSelectedDetails(details);
    } catch {
      alert('تعذر جلب تفاصيل سند التحويل');
    } finally {
      setLoadingDetails(false);
    }
  };

  const historyColumns = [
    {
      header: 'رقم السند (TRF)',
      accessor: (item: TransferTransaction) => (
        <div>
          <span className="font-mono font-bold text-teal-700 text-xs block">{item.referenceId}</span>
          <span className="text-[10px] text-slate-400">
            {new Date(item.createdAt).toLocaleString('ar-EG')}
          </span>
        </div>
      ),
    },
    {
      header: 'الفرع المصدر',
      accessor: (item: TransferTransaction) => (
        <span className="font-medium text-slate-700 dark:text-slate-300 text-xs">
          {item.branchName}
        </span>
      ),
    },
    {
      header: 'الصنف الدوائي والتشغيلة',
      accessor: (item: TransferTransaction) => (
        <div>
          <div className="font-bold text-xs text-slate-800 dark:text-white">{item.medicineName}</div>
          <div className="font-mono text-[11px] text-slate-400">
            تشغيلة: {item.batchNumber} {item.barcode ? `• ${item.barcode}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'الكمية المحولة',
      accessor: (item: TransferTransaction) => (
        <span className="font-mono font-bold text-sm text-teal-600 dark:text-teal-400">
          {item.quantity.toLocaleString()} حبة
        </span>
      ),
    },
    {
      header: 'البيان / الملاحظات',
      accessor: (item: TransferTransaction) => (
        <span className="text-xs text-slate-500 max-w-xs truncate block">
          {item.notes || 'تحويل مخزني'}
        </span>
      ),
    },
    {
      header: 'عرض السند',
      accessor: (item: TransferTransaction) => (
        <button
          onClick={() => handleViewDetails(item.referenceId)}
          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition flex items-center gap-1 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-teal-600" />
          <span>السند</span>
        </button>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                تحويلات المخزون بين الفروع (Stock Transfers)
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                نقل ومناقلة التشغيلات الدوائية، توليد أذون التحويل الرسمية TRF، وتحديث الأرصدة ذرّياً
              </p>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl self-start md:self-auto">
          <button
            onClick={() => {
              setActiveTab('NEW_TRANSFER');
              setTransferSuccess(null);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer ${
              activeTab === 'NEW_TRANSFER'
                ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>إجراء تحويل جديد</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('HISTORY');
              refetchHistory();
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل التحويلات السابقة</span>
          </button>
        </div>
      </div>

      {activeTab === 'NEW_TRANSFER' && (
        <div className="space-y-6">
          {/* Success Banner */}
          {transferSuccess && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 p-6 rounded-2xl shadow-xs text-slate-800 dark:text-white space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500 text-white rounded-xl">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-300">
                    تم تنفيذ التحويل المخزني بنجاح!
                  </h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    رقم سند التحويل: <span className="font-mono font-bold text-base">{transferSuccess.transferNumber}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-emerald-200 dark:border-emerald-800 text-xs">
                <div className="bg-white/70 dark:bg-slate-900/50 p-3 rounded-xl">
                  <span className="text-slate-400">من فرع:</span>
                  <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">
                    {transferSuccess.fromBranch}
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-slate-900/50 p-3 rounded-xl">
                  <span className="text-slate-400">إلى فرع:</span>
                  <div className="font-bold text-sm text-slate-800 dark:text-white mt-0.5">
                    {transferSuccess.toBranch}
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-slate-900/50 p-3 rounded-xl">
                  <span className="text-slate-400">الأصناف المحولة:</span>
                  <div className="font-bold text-sm text-teal-600 dark:text-teal-400 mt-0.5">
                    {transferSuccess.itemsCount} تشغيلات دوائية
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة إذن التحويل</span>
                </button>
                <button
                  onClick={() => setTransferSuccess(null)}
                  className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إجراء تحويل آخر
                </button>
              </div>
            </div>
          )}

          {/* 1. تحديد الفرعين والبيان */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" />
              <span>تحديد الفرع المصدر والمستلم</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الفرع المصدر (المحول منه) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={fromBranchId}
                  onChange={(e) => {
                    setFromBranchId(e.target.value);
                    setCartItems([]);
                    setSelectedBatchId('');
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الفرع المستلم (المحول إليه) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={toBranchId}
                  onChange={(e) => setToBranchId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition cursor-pointer"
                >
                  {branches
                    .filter((b) => b.id !== fromBranchId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
                {branches.length < 2 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    ⚠️ لديك فرع واحد فقط مسجل. يرجى إضافة فرع ثانٍ من شاشة الفروع لإجراء التحويلات بينها.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  البيان وملاحظات التحويل
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="سبب التحويل أو رقم الإذن اليدوي..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* 2. اختيار التشغيلات المراد نقلها */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Boxes className="w-4 h-4 text-teal-600" />
              <span>إضافة الأصناف والتشغيلات لسند التحويل</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-8">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اختر التشغيلة من رصيد الفرع المصدر (يظهر الرصيد المتاح وتاريخ الصلاحية)
                </label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition cursor-pointer"
                >
                  <option value="">-- اختر الدواء والتشغيلة --</option>
                  {sourceBatches
                    .filter((b) => b.quantityInBase > 0 && !b.isFrozen)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.medicine?.tradeName} | تشغيلة: {b.batchNumber} | رصيد: {b.quantityInBase} حبة | تنتهي: {new Date(b.expiryDate).toLocaleDateString('ar-EG')}
                      </option>
                    ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الكمية بالحبة
                </label>
                <input
                  type="number"
                  min={1}
                  value={transferQty}
                  onChange={(e) => setTransferQty(parseInt(e.target.value, 10) || '')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-2.5 text-sm font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة للسند</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. جدول الأصناف في السند */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                قائمة الأصناف المجهزة للتحويل ({cartItems.length} صنف)
              </h3>
            </div>

            {cartItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">الصنف الدوائي</th>
                      <th className="p-3">التشغيلة والصلاحية</th>
                      <th className="p-3 text-center">الرصيد بالمصدر</th>
                      <th className="p-3 text-center">الكمية المحولة</th>
                      <th className="p-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {cartItems.map((item, idx) => (
                      <tr key={item.batch.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-800 dark:text-white">
                          {item.batch.medicine?.tradeName}
                          <span className="block font-mono text-[10px] text-slate-400 font-normal">
                            {item.batch.medicine?.barcode}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {item.batch.batchNumber}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            تنتهي: {new Date(item.batch.expiryDate).toLocaleDateString('ar-EG')}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono">
                          {item.batch.quantityInBase.toLocaleString()} حبة
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-mono font-bold text-teal-700 text-sm bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                            {item.quantity.toLocaleString()} حبة
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleRemoveFromCart(idx)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                لم تقم بإضافة أي أصناف بعد. اختر التشغيلة من الأعلى واضغط على "إضافة للسند".
              </div>
            )}

            {cartItems.length > 0 && (
              <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <span>إجمالي الكمية المراد تحويلها: </span>
                  <span className="font-bold font-mono text-sm text-teal-600">
                    {cartItems.reduce((sum, c) => sum + c.quantity, 0).toLocaleString()} حبة
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleExecuteTransfer}
                  disabled={transferMutation.isPending}
                  className="px-6 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-teal-600/20 flex items-center gap-2 text-sm transition cursor-pointer"
                >
                  {transferMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري تنفيذ التحويل وتحديث الأرصدة...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تأكيد وتنفيذ التحويل المخزني (F9)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setHistoryPage(1);
                }}
                placeholder="بحث برقم السند TRF، اسم الدواء أو رقم التشغيلة..."
                className="w-full pl-4 pr-10 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none transition"
              />
            </div>

            <div className="sm:w-64">
              <select
                value={historyBranchId}
                onChange={(e) => {
                  setHistoryBranchId(e.target.value);
                  setHistoryPage(1);
                }}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none transition cursor-pointer"
              >
                <option value="">جميع الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xs overflow-hidden p-4">
            <DataTable
              columns={historyColumns}
              data={historyData?.items || []}
              isLoading={isHistoryLoading}
            />

            {historyData && historyData.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-4 mt-4 text-xs">
                <span className="text-slate-500">
                  الصفحة {historyPage} من {historyData.totalPages} ({historyData.total} حركة تحويل)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 font-bold cursor-pointer"
                  >
                    السابق
                  </button>
                  <button
                    disabled={historyPage >= historyData.totalPages}
                    onClick={() => setHistoryPage((p) => Math.min(historyData.totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 font-bold cursor-pointer"
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transfer Details Modal */}
      {selectedDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col border border-slate-200 dark:border-slate-700">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-[#582949] text-white">
              <div>
                <h3 className="text-base font-bold">سند التحويل المخزني: {selectedDetails.referenceId}</h3>
                <p className="text-xs text-pink-200 mt-0.5">
                  التاريخ: {new Date(selectedDetails.date).toLocaleString('ar-EG')}
                </p>
              </div>
              <button
                onClick={() => setSelectedDetails(null)}
                className="p-1.5 text-pink-200 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-900/40 p-3.5 rounded-xl">
                <div>
                  <span className="text-slate-400">الفرع المحول منه:</span>
                  <div className="font-bold text-slate-800 dark:text-white mt-0.5">
                    {selectedDetails.fromBranch}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">الفرع المحول إليه:</span>
                  <div className="font-bold text-slate-800 dark:text-white mt-0.5">
                    {selectedDetails.toBranch}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-600 dark:text-slate-300 mb-2">الأصناف المحولة</h4>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-2.5">الصنف</th>
                        <th className="p-2.5">التشغيلة</th>
                        <th className="p-2.5 text-center">الكمية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {selectedDetails.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-bold text-slate-800 dark:text-white">
                            {it.medicineName}
                          </td>
                          <td className="p-2.5 font-mono text-slate-500">{it.batchNumber}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-teal-600">
                            {it.quantity.toLocaleString()} حبة
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-between">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة السند</span>
              </button>
              <button
                onClick={() => setSelectedDetails(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
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
