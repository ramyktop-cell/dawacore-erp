import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasingApi, PurchaseOrder, PurchaseStatus } from '../api/purchasing';
import { suppliersApi } from '../api/purchasing';
import { branchesApi } from '../api/branches';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import { PurchaseOrderModal } from '../components/purchasing/PurchaseOrderModal';
import {
  Truck,
  PlusCircle,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  Printer,
  FileText,
  Building2,
  X,
  Download,
  HandCoins,
} from 'lucide-react';
import { supplierDocumentsApi } from '../api/supplier-documents';
import { SupplierPaymentModal } from '../components/suppliers/SupplierPaymentModal';

export const PurchasingOrdersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | ''>('');
  const [page, setPage] = useState(1);
  const [isDownloadingDoc, setIsDownloadingDoc] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<{ id: string; name: string; branchId: string } | null>(null);

  const queryClient = useQueryClient();

  // Queries
  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup'],
    queryFn: () => branchesApi.getAll({ limit: 100 }),
  });
  const branches = branchesData?.items || [];

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-lookup', branchId],
    queryFn: () => suppliersApi.getAll({ branchId: branchId || undefined, limit: 100 }),
  });
  const suppliers = suppliersData?.items || [];

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['purchase-orders', { branchId, supplierId, status: statusFilter, search, page }],
    queryFn: () =>
      purchasingApi.getOrders({
        branchId: branchId || undefined,
        supplierId: supplierId || undefined,
        status: (statusFilter as PurchaseStatus) || undefined,
        search: search || undefined,
        page,
        limit: 10,
      }),
  });

  const { data: orderDetails } = useQuery({
    queryKey: ['purchase-order-details', selectedOrder?.id],
    queryFn: () => (selectedOrder ? purchasingApi.getOrder(selectedOrder.id) : null),
    enabled: !!selectedOrder && isDetailsModalOpen,
  });

  // Mutations
  const receiveOrderMutation = useMutation({
    mutationFn: purchasingApi.receiveOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      alert('تم استلام الشحنة وتوريدها للمخزون وتوليد الدفعات بنجاح!');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل استلام الشحنة');
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: purchasingApi.cancelOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      alert('تم إلغاء أمر الشراء');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل إلغاء أمر الشراء');
    },
  });

  const getStatusBadge = (status: PurchaseStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5" />
            مسودة معلقة (Draft)
          </span>
        );
      case 'RECEIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            تم الاستلام والتوريد
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5" />
            ملغي
          </span>
        );
    }
  };

  const columns = [
    {
      header: 'رقم الأمر والفاتورة',
      accessor: (item: PurchaseOrder) => (
        <div>
          <span className="font-mono font-bold text-teal-800 text-xs">{item.orderNumber}</span>
          {item.invoiceNumber && (
            <p className="text-[11px] text-slate-500 font-mono">فاتورة: {item.invoiceNumber}</p>
          )}
          <p className="text-[10px] text-slate-400">
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
      header: 'المورد',
      accessor: (item: PurchaseOrder) => (
        <div>
          <span className="font-bold text-slate-800 text-xs">{item.supplier?.name}</span>
          {item.supplier?.companyName && (
            <p className="text-[11px] text-slate-500">{item.supplier.companyName}</p>
          )}
        </div>
      ),
    },
    {
      header: 'الفرع',
      accessor: (item: PurchaseOrder) => (
        <span className="text-xs text-slate-700 font-medium">{item.branch?.name}</span>
      ),
    },
    {
      header: 'الحالة',
      accessor: (item: PurchaseOrder) => getStatusBadge(item.status),
    },
    {
      header: 'إجمالي القيمة',
      accessor: (item: PurchaseOrder) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {Number(item.totalAmount).toLocaleString()} ج.س
        </span>
      ),
    },
    {
      header: 'المدفوع / المتبقي',
      accessor: (item: PurchaseOrder) => {
        const laterPaid = (item.paymentAllocations || []).reduce((sum, row) => sum + Number(row.amount), 0);
        const returned = (item.purchaseReturns || []).reduce((sum, row) => sum + Number(row.totalRefund), 0);
        const remaining = Math.max(0, Number(item.totalAmount) - Number(item.paidAmount) - laterPaid - returned);
        return (
          <div className="text-xs">
            <span className="font-mono font-semibold text-emerald-700">
              مدفوع: {(Number(item.paidAmount) + laterPaid).toLocaleString()} ج.س
            </span>
            {remaining > 0 && (
              <p className="font-mono font-bold text-rose-600 text-[11px]">
                دين: {remaining.toLocaleString()} ج.س
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: 'الإجراءات',
      accessor: (item: PurchaseOrder) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setSelectedOrder(item);
              setIsDetailsModalOpen(true);
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            التفاصيل
          </button>
          {item.status === 'PENDING' && (
            <button
              onClick={() => {
                if (confirm(`هل أنت متأكد من استلام وتوريد الشحنة رقم ${item.orderNumber}؟`)) {
                  receiveOrderMutation.mutate(item.id);
                }
              }}
              className="px-2.5 py-1 text-xs font-bold rounded bg-teal-600 hover:bg-teal-700 text-white transition flex items-center gap-1 shadow-sm"
            >
              <CheckCircle2 className="w-3 h-3" />
              استلام وتوريد
            </button>
          )}
          {item.status === 'RECEIVED' && item.supplier && (
            <button
              onClick={() => setPaymentSupplier({ id: item.supplier!.id, name: item.supplier!.name, branchId: item.branchId })}
              className="px-2.5 py-1 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1 shadow-sm"
              title="سداد المبلغ المستحق للمورد"
            >
              <HandCoins className="w-3 h-3" />
              دفع للمورد
            </button>
          )}
          {item.status === 'PENDING' && (
            <button
              onClick={() => {
                if (confirm(`هل ترغب في إلغاء مسودة أمر الشراء ${item.orderNumber}؟`)) {
                  cancelOrderMutation.mutate(item.id);
                }
              }}
              className="px-2 py-1 text-xs font-semibold rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
            >
              إلغاء
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="فواتير المشتريات والتوريد (Purchasing & Inbound)"
        subtitle="إدارة أوامر الشراء، استلام شحنات الموردين، توليد دفعات FEFO وتحديث تكلفة المخزون"
        action={
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            فاتورة مشتريات جديدة
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="بحث برقم الأمر أو اسم المورد..."
              className="w-full px-3 py-1.5 pl-8 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          {/* Branch Filter */}
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setSupplierId('');
              setPage(1);
            }}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-teal-500 bg-white min-w-[160px]"
          >
            <option value="">جميع الفروع</option>
            {branches.map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Supplier Filter */}
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-teal-500 bg-white min-w-[160px]"
          >
            <option value="">جميع الموردين</option>
            {suppliers.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as PurchaseStatus | '');
              setPage(1);
            }}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-teal-500 bg-white min-w-[140px]"
          >
            <option value="">كل الحالات</option>
            <option value="PENDING">معلق / مسودة</option>
            <option value="RECEIVED">تم الاستلام</option>
            <option value="CANCELLED">ملغي</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          إجمالي أوامر الشراء: <strong className="text-slate-800">{ordersData?.total || 0}</strong>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataTable<PurchaseOrder>
          columns={columns}
          data={ordersData?.items || []}
          isLoading={isLoading}
        />
      </div>

      {/* Create Order Modal */}
      <PurchaseOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Details Modal */}
      {isDetailsModalOpen && orderDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center font-bold text-teal-800">
                  <Truck className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    أمر شراء {orderDetails.orderNumber}
                  </h3>
                  <p className="text-xs text-slate-500">
                    المورد: {orderDetails.supplier?.name} | {orderDetails.branch?.name}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Export Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs font-bold text-slate-700">المستندات والتقارير المعتمدة:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      setIsDownloadingDoc(true);
                      await supplierDocumentsApi.downloadPurchaseInvoicePdf(orderDetails.id, orderDetails.orderNumber);
                    } catch (e: any) {
                      alert(e.message || "فشل تحميل الفاتورة");
                    } finally {
                      setIsDownloadingDoc(false);
                    }
                  }}
                  disabled={isDownloadingDoc}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{orderDetails.status === "RECEIVED" ? "فاتورة المشتريات PDF" : "أمر الشراء PDF"}</span>
                </button>

                {orderDetails.status === "RECEIVED" && (
                  <button
                    onClick={async () => {
                      try {
                        setIsDownloadingDoc(true);
                        await supplierDocumentsApi.downloadReceivingNotePdf(orderDetails.id, orderDetails.orderNumber);
                      } catch (e: any) {
                        alert(e.message || "فشل تحميل مستند الاستلام");
                      } finally {
                        setIsDownloadingDoc(false);
                      }
                    }}
                    disabled={isDownloadingDoc}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>مستند الاستلام والتوريد PDF</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500">الحالة</span>
                <div className="mt-1">{getStatusBadge(orderDetails.status)}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500">إجمالي القيمة</span>
                <p className="font-mono font-bold text-sm text-slate-800 mt-1">
                  {Number(orderDetails.totalAmount).toLocaleString()} ج.س
                </p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-emerald-700">المبلغ المسدد</span>
                <p className="font-mono font-bold text-sm text-emerald-800 mt-1">
                  {(
                    Number(orderDetails.paidAmount)
                    + (orderDetails.paymentAllocations || []).reduce(
                      (sum: number, row: { amount: number | string }) => sum + Number(row.amount),
                      0,
                    )
                  ).toLocaleString()} ج.س
                </p>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                <span className="text-rose-700">المتبقي الآجل</span>
                <p className="font-mono font-bold text-sm text-rose-800 mt-1">
                  {Math.max(
                    0,
                    Number(orderDetails.totalAmount)
                      - Number(orderDetails.paidAmount)
                      - (orderDetails.paymentAllocations || []).reduce(
                        (sum: number, row: { amount: number | string }) => sum + Number(row.amount),
                        0,
                      )
                      - (orderDetails.purchaseReturns || []).reduce(
                        (sum: number, row: { totalRefund: number | string }) => sum + Number(row.totalRefund),
                        0,
                      ),
                  ).toLocaleString()} ج.س
                </p>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <h4 className="font-bold text-xs text-slate-700 mb-2">الأصناف المشتراة ({orderDetails.items?.length || 0})</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <thead className="bg-slate-50 text-slate-600 font-bold">
                    <tr>
                      <th className="p-2 text-right">الصنف</th>
                      <th className="p-2 text-right">التشغيلة (Batch)</th>
                      <th className="p-2 text-right">تاريخ الصلاحية</th>
                      <th className="p-2 text-right">الكمية</th>
                      <th className="p-2 text-right">سعر الشراء</th>
                      <th className="p-2 text-right">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orderDetails.items?.map((item: any) => (
                      <tr key={item.id}>
                        <td className="p-2 font-bold text-slate-800">{item.medicine?.tradeName}</td>
                        <td className="p-2 font-mono text-slate-600">{item.batchNumber}</td>
                        <td className="p-2 font-mono text-slate-500">
                          {new Date(item.expiryDate).toLocaleDateString('ar-SD')}
                        </td>
                        <td className="p-2 font-mono font-bold">{item.quantity}</td>
                        <td className="p-2 font-mono">{Number(item.costPrice).toLocaleString()} ج.س</td>
                        <td className="p-2 font-mono font-bold text-slate-900">
                          {Number(item.subtotal || item.quantity * item.costPrice).toLocaleString()} ج.س
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {orderDetails.notes && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                <strong>ملاحظات: </strong> {orderDetails.notes}
              </div>
            )}
          </div>
        </div>
      )}

      <SupplierPaymentModal
        isOpen={!!paymentSupplier}
        supplier={paymentSupplier}
        onClose={() => setPaymentSupplier(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
          queryClient.invalidateQueries({ queryKey: ['purchase-order-details'] });
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          queryClient.invalidateQueries({ queryKey: ['supplier-statement'] });
          queryClient.invalidateQueries({ queryKey: ['creditors-report'] });
          queryClient.invalidateQueries({ queryKey: ['supplier-outstanding-invoices'] });
        }}
      />
    </div>
  );
};
