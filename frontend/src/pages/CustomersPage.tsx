import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, Customer } from '../api/customers';
import { companiesApi, Company } from '../api/companies';
import { branchesApi, Branch } from '../api/branches';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import { CustomerFormModal } from '../components/customers/CustomerFormModal';
import { CustomerLedgerModal } from '../components/customers/CustomerLedgerModal';
import { CustomerPaymentModal } from '../components/customers/CustomerPaymentModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Plus, Pencil, Trash2, Wallet, Users, UserCheck, UserX, AlertCircle, Banknote } from 'lucide-react';

export const CustomersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [hasDebt, setHasDebt] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search, companyId, branchId, hasDebt, page }],
    queryFn: () =>
      customersApi.getAll({
        search: search || undefined,
        companyId: companyId || undefined,
        branchId: branchId || undefined,
        hasDebt: hasDebt || undefined,
        page,
        limit: 10,
      }),
  });

  const { data: companiesData } = useQuery({
    queryKey: ['companies-lookup'],
    queryFn: () => companiesApi.getAll({ limit: 100 }),
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup', companyId],
    queryFn: () => branchesApi.getAll({ companyId: companyId || undefined, limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsDeleteDialogOpen(false);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'لا يمكن حذف هذا العميل');
    },
  });

  const columns = [
    {
      header: 'اسم العميل',
      accessor: (item: Customer) => (
        <div>
          <p className="font-bold text-slate-800">{item.name}</p>
          {item.nationalId && (
            <p className="text-xs text-slate-400 font-mono">هوية: {item.nationalId}</p>
          )}
        </div>
      ),
    },
    {
      header: 'رقم الهاتف',
      accessor: (item: Customer) => (
        <span className="font-mono text-xs font-semibold text-slate-700">{item.phone}</span>
      ),
    },
    {
      header: 'الفرع والشركة',
      accessor: (item: Customer) => (
        <div className="text-xs">
          <p className="font-semibold text-slate-800">{item.branch?.name || 'الفرع الرئيسي'}</p>
          <p className="text-slate-400">{item.company?.name || '—'}</p>
        </div>
      ),
    },
    {
      header: 'سقف الائتمان',
      accessor: (item: Customer) => (
        <span className="font-mono text-xs font-semibold text-slate-700">
          {Number(item.creditLimit).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.س
        </span>
      ),
    },
    {
      header: 'المديونية الحالية',
      accessor: (item: Customer) => {
        const debt = Number(item.currentDebt || 0);
        return (
          <span
            className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
              debt > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'text-slate-500'
            }`}
          >
            {debt.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.س
          </span>
        );
      },
    },
    {
      header: 'الحالة',
      accessor: (item: Customer) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
            item.isActive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          {item.isActive ? <UserCheck size={12} /> : <UserX size={12} />}
          {item.isActive ? 'نشط' : 'معطل'}
        </span>
      ),
    },
    {
      header: 'الإجراءات',
      accessor: (item: Customer) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {Number(item.currentDebt || 0) > 0 && (
            <button
              title="سند قبض / تحصيل مديونية"
              onClick={() => {
                setSelectedCustomer(item);
                setIsPaymentModalOpen(true);
              }}
              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
            >
              <Banknote size={16} />
            </button>
          )}
          <button
            title="كشف حساب تفصيلي"
            onClick={() => {
              setSelectedCustomer(item);
              setIsLedgerOpen(true);
            }}
            className="p-1.5 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
          >
            <Wallet size={16} />
          </button>
          <button
            title="تعديل"
            onClick={() => {
              setSelectedCustomer(item);
              setIsModalOpen(true);
            }}
            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Pencil size={16} />
          </button>
          <button
            title="حذف"
            onClick={() => {
              setSelectedCustomer(item);
              setIsDeleteDialogOpen(true);
            }}
            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="إدارة العملاء والبيع الآجل (Customers & Credit)"
        subtitle="إدارة حسابات العملاء، تحديد سقوف الائتمان، ومتابعة كشوفات الحسابات المباشرة"
        action={
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-semibold shadow-sm"
          >
            <Plus size={18} /> إضافة عميل جديد
          </button>
        }
      />

      {/* شريط الفلاتر والبحث */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="بحث باسم العميل أو رقم الهاتف أو الرقم الوطني..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="border border-slate-300 rounded-lg px-4 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
          />
        </div>

        <select
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value);
            setBranchId('');
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white min-w-[160px]"
        >
          <option value="">جميع الشركات</option>
          {companiesData?.items?.map((c: Company) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white min-w-[160px]"
        >
          <option value="">جميع الفروع</option>
          {branchesData?.items?.map((b: Branch) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={hasDebt}
            onChange={(e) => {
              setHasDebt(e.target.checked);
              setPage(1);
            }}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
          />
          <span>العملاء ذوي المديونية فقط</span>
        </label>

        {(search || companyId || branchId || hasDebt) && (
          <button
            onClick={() => {
              setSearch('');
              setCompanyId('');
              setBranchId('');
              setHasDebt(false);
              setPage(1);
            }}
            className="text-xs text-slate-500 hover:text-slate-800 underline px-2 py-1"
          >
            إعادة تعيين الفلاتر
          </button>
        )}
      </div>

      {/* جدول العملاء */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable
          data={data?.items || []}
          columns={columns}
          isLoading={isLoading}
          onRowClick={(item) => {
            setSelectedCustomer(item);
            setIsLedgerOpen(true);
          }}
        />

        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Users size={16} className="text-teal-600" />
            <span>إجمالي العملاء: <strong className="text-slate-800">{data?.total || 0}</strong></span>
          </div>
          <div className="flex gap-2 items-center">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 disabled:opacity-50 hover:bg-white bg-slate-50 text-slate-700 transition-colors"
            >
              الصفحة السابقة
            </button>
            <span className="px-3 py-1 text-xs font-bold text-teal-700 bg-teal-50 rounded-md border border-teal-100">
              صفحة {page}
            </span>
            <button
              disabled={!data?.items || (data?.page * data?.limit >= data?.total)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 disabled:opacity-50 hover:bg-white bg-slate-50 text-slate-700 transition-colors"
            >
              الصفحة التالية
            </button>
          </div>
        </div>
      </div>

      <CustomerFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={selectedCustomer}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}
      />

      <CustomerLedgerModal
        isOpen={isLedgerOpen}
        onClose={() => setIsLedgerOpen(false)}
        customerId={selectedCustomer?.id || ''}
        customerName={selectedCustomer?.name || ''}
      />

      {selectedCustomer && (
        <CustomerPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          customerPhone={selectedCustomer.phone}
          currentDebt={Number(selectedCustomer.currentDebt || 0)}
          branchId={selectedCustomer.branchId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
          }}
        />
      )}

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => selectedCustomer && deleteMutation.mutate(selectedCustomer.id)}
        title="حذف العميل"
        message={`هل أنت متأكد من حذف العميل "${selectedCustomer?.name}" نهائياً من النظام؟ (لا يمكن حذف عميل عليه مديونية قائمة)`}
        confirmText="نعم، احذف العميل"
        cancelText="إلغاء"
        variant="danger"
      />
    </div>
  );
};
