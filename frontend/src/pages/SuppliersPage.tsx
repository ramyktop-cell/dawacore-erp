import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { suppliersApi, Supplier } from '../api/purchasing';
import { branchesApi } from '../api/branches';
import { useAuthStore } from '../stores/auth.store';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import {
  Factory,
  PlusCircle,
  Search,
  Pencil,
  Trash2,
  Phone,
  Building2,
  DollarSign,
  X,
  FileText,
  BarChart3,
  HandCoins,
} from 'lucide-react';
import { SupplierStatementModal } from '../components/suppliers/SupplierStatementModal';
import { CreditorsReport } from '../components/suppliers/CreditorsReport';
import { SupplierPaymentModal } from '../components/suppliers/SupplierPaymentModal';

export const SuppliersPage: React.FC = () => {
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [statementSupplier, setStatementSupplier] = useState<{ id: string; name: string } | null>(null);
  const [isCreditorsOpen, setIsCreditorsOpen] = useState(false);
  const [paymentSupplier, setPaymentSupplier] = useState<{ id: string; name: string; branchId: string } | null>(null);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [initialDebt, setInitialDebt] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const queryClient = useQueryClient();

  // Queries
  const { data: branchesData } = useQuery({
    queryKey: ['supplier-branches', user?.companyId],
    queryFn: () => branchesApi.getAll({ companyId: user?.companyId, limit: 100 }),
    enabled: !!user?.companyId,
  });
  const branches = (branchesData?.items || []).filter((branch: any) =>
    branch.companyId === user?.companyId && branch.isActive &&
    (['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user?.role || '') || branch.id === user?.branchId));
  const defaultBranch = selectedBranchId || branches.find((branch: any) => branch.id === user?.branchId)?.id || branches[0]?.id || '';

  const { data: suppliersData, isLoading } = useQuery({
    queryKey: ['suppliers', { companyId: user?.companyId, branchId, search, page }],
    queryFn: () =>
      suppliersApi.getAll({
        companyId: user?.companyId,
        branchId: branchId || undefined,
        search: search || undefined,
        page,
        limit: 10,
      }),
  });

  const createMutation = useMutation({
    mutationFn: suppliersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsModalOpen(false);
      resetForm();
      alert('تم حفظ المورد بنجاح!');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل حفظ المورد');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => suppliersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsModalOpen(false);
      resetForm();
      alert('تم تحديث بيانات المورد بنجاح!');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل تحديث المورد');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: suppliersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      alert('تم حذف المورد بنجاح');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل حذف المورد');
    },
  });

  const resetForm = () => {
    setEditingSupplier(null);
    setName('');
    setCompanyName('');
    setPhone('');
    setTaxNumber('');
    setInitialDebt('');
    setAddress('');
    setNotes('');
    setIsActive(true);
    setSelectedBranchId('');
  };

  const handleOpenEdit = (sup: Supplier) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setCompanyName(sup.companyName || '');
    setPhone(sup.phone);
    setTaxNumber(sup.taxNumber || '');
    setInitialDebt(String(sup.currentDebt));
    setAddress(sup.address || '');
    setNotes(sup.notes || '');
    setIsActive(sup.isActive ?? true);
    setSelectedBranchId(sup.branchId);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSupplier) {
      updateMutation.mutate({
        id: editingSupplier.id,
        data: {
          name,
          companyName: companyName || undefined,
          phone,
          taxNumber: taxNumber || undefined,
          address: address || undefined,
          notes: notes || undefined,
          isActive,
        },
      });
    } else {
      const chosenBranchId = selectedBranchId || defaultBranch;
      const chosenBranch = branches.find((b: any) => b.id === chosenBranchId);
      if (!user?.companyId || !chosenBranch || chosenBranch.companyId !== user.companyId) {
        alert('اختر فرعاً صحيحاً تابعاً لشركة المستخدم قبل الحفظ');
        return;
      }
      const resolvedCompanyId = user.companyId;

      createMutation.mutate({
        companyId: resolvedCompanyId || undefined,
        branchId: chosenBranchId || undefined,
        name,
        companyName: companyName || undefined,
        phone,
        taxNumber: taxNumber || undefined,
        initialDebt: parseFloat(initialDebt) || 0,
        address: address || undefined,
        notes: notes || undefined,
      });
    }
  };

  const columns = [
    {
      header: 'اسم المورد',
      accessor: (item: Supplier) => (
        <div>
          <span className="font-bold text-slate-800 text-xs">{item.name}</span>
          {item.companyName && <p className="text-[11px] text-slate-500">{item.companyName}</p>}
        </div>
      ),
    },
    {
      header: 'رقم الهاتف',
      accessor: (item: Supplier) => (
        <span className="font-mono text-xs text-slate-700 font-semibold">{item.phone}</span>
      ),
    },
    {
      header: 'الفرع والشركة',
      accessor: (item: Supplier) => (
        <span className="text-xs text-slate-600">{item.branch?.name}</span>
      ),
    },
    {
      header: 'رصيد المديونية الدائنة',
      accessor: (item: Supplier) => {
        const debt = Number(item.currentDebt);
        return (
          <span
            className={`font-mono font-bold text-xs ${
              debt > 0 ? 'text-rose-600' : 'text-slate-700'
            }`}
          >
            {debt.toLocaleString()} ج.س
          </span>
        );
      },
    },
    {
      header: 'أوامر الشراء',
      accessor: (item: Supplier) => (
        <span className="text-xs text-slate-500 font-medium">
          {item._count?.purchases || 0} طلب
        </span>
      ),
    },
    {
      header: 'الحالة',
      accessor: (item: Supplier) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
            item.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {item.isActive ? 'نشط' : 'معطّل'}
        </span>
      ),
    },
    {
      header: 'الإجراءات',
      accessor: (item: Supplier) => {
        const purchasesCount = item._count?.purchases || 0;
        const returnsCount = item._count?.purchaseReturns || 0;
        const debt = Math.abs(Number(item.currentDebt || 0));
        const hasHistory = purchasesCount > 0 || returnsCount > 0 || debt > 0.001;

        return (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setStatementSupplier({ id: item.id, name: item.name })}
              className="p-1 text-slate-600 hover:bg-slate-100 rounded transition"
              title="كشف حساب المورد"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPaymentSupplier({ id: item.id, name: item.name, branchId: item.branchId })}
              disabled={!item.isActive || Number(item.currentDebt || 0) <= 0}
              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition disabled:text-slate-300 disabled:cursor-not-allowed"
              title={Number(item.currentDebt || 0) > 0 ? 'دفع مبلغ للمورد' : 'لا يوجد رصيد مستحق للمورد'}
            >
              <HandCoins className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleOpenEdit(item)}
              className="p-1 text-teal-600 hover:bg-teal-50 rounded transition"
              title="تعديل بيانات المورد"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (hasHistory) {
                  alert(
                    `⚠️ تنبيه أمان محاسبي:\nلا يمكن حذف المورد (${item.name}) لوجود حركات سابقة مرتبطة به:\n` +
                      (purchasesCount > 0 ? `• ${purchasesCount} طلبات/فواتير شراء\n` : '') +
                      (returnsCount > 0 ? `• ${returnsCount} مرتجعات مشتريات\n` : '') +
                      (debt > 0.001 ? `• رصيد مديونية قائم: ${Number(item.currentDebt).toLocaleString()} ج.س\n` : '') +
                      `\nلحماية السجلات المحاسبية والتدقيق المالي، يمكنك تعطيل المورد بدلاً من حذفه.`
                  );
                  return;
                }
                if (confirm(`هل أنت متأكد من حذف المورد ${item.name}؟`)) {
                  deleteMutation.mutate(item.id);
                }
              }}
              className={`p-1 rounded transition ${
                hasHistory
                  ? 'text-slate-300 hover:text-slate-500 hover:bg-slate-100 cursor-not-allowed'
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
              title={
                hasHistory
                  ? 'لا يمكن حذف مورد لديه عمليات سابقة أو رصيد مالي (انقر لمعرفة التفاصيل)'
                  : 'حذف المورد'
              }
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="سجل الموردين وشركات الأدوية (Suppliers)"
        subtitle="إدارة بيانات الموردين، أرصدة المديونية الدائنة، وحركات التوريد والشراء"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreditorsOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm shadow-sm transition cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-teal-400" />
              تقرير الدائنين
            </button>
            <button
              onClick={() => {
                resetForm();
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              إضافة مورد جديد
            </button>
          </div>
        }
      />

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم، الشركة، أو الهاتف..."
              className="w-full px-3 py-1.5 pl-8 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

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
        </div>

        <div className="text-xs text-slate-500">
          إجمالي الموردين: <strong className="text-slate-800">{suppliersData?.total || 0}</strong>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataTable<Supplier>
          columns={columns}
          data={suppliersData?.items || []}
          isLoading={isLoading}
        />
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Factory className="w-5 h-5 text-teal-600" />
                {editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الفرع التابع له *</label>
                <select
                  value={selectedBranchId || defaultBranch}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-teal-500"
                  disabled={!!editingSupplier}
                  required
                >
                  {branches.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المورد / المسؤول *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: أحمد عبد الله (مندوب شركة الرعاية)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشركة / المصنع</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="مثال: الشركة المتحدة للأدوية"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف *</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0912345678"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الضريبي</label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    placeholder="TAX-12345"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {!editingSupplier && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرصيد الافتتاحي (مديونية سابقة للمورد)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={initialDebt}
                      onChange={(e) => setInitialDebt(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-teal-500 pr-3 pl-12"
                    />
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">ج.س</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="المدينة، المنطقة..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="أي تفاصيل أخرى..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {editingSupplier && (
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="supplierIsActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500 cursor-pointer"
                  />
                  <label htmlFor="supplierIsActive" className="text-xs font-bold text-slate-800 cursor-pointer">
                    حالة المورد: {isActive ? 'نشط (متاح للشراء وإنشاء الفواتير)' : 'معطّل (موقوف عن التعاملات الجديدة)'}
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ المورد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SupplierStatementModal
        isOpen={!!statementSupplier}
        onClose={() => setStatementSupplier(null)}
        supplierId={statementSupplier?.id || null}
        supplierName={statementSupplier?.name}
        branchId={branchId || undefined}
      />

      <CreditorsReport
        isOpen={isCreditorsOpen}
        onClose={() => setIsCreditorsOpen(false)}
        onOpenStatement={(supId: string, supName: string) => {
          setIsCreditorsOpen(false);
          setStatementSupplier({ id: supId, name: supName });
        }}
        branchId={branchId || undefined}
      />

      <SupplierPaymentModal
        isOpen={!!paymentSupplier}
        supplier={paymentSupplier}
        onClose={() => setPaymentSupplier(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          queryClient.invalidateQueries({ queryKey: ['supplier-statement'] });
          queryClient.invalidateQueries({ queryKey: ['creditors-report'] });
          queryClient.invalidateQueries({ queryKey: ['supplier-outstanding-invoices'] });
        }}
      />
    </div>
  );
};
