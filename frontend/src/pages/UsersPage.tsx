import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, UserItem, UserRole } from '../api/users';
import { companiesApi, Company } from '../api/companies';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import { UserFormModal } from '../components/users/UserFormModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Plus, Pencil, Trash2, Shield, UserCheck, UserX, Users } from 'lucide-react';

const roleLabels: Record<UserRole, { label: string; color: string }> = {
  SUPER_ADMIN: { label: 'مدير نظام عام', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  COMPANY_ADMIN: { label: 'مدير شركة', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  BRANCH_MANAGER: { label: 'مدير فرع', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  CASHIER: { label: 'كاشير / صيدلي بيع', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ACCOUNTANT: { label: 'محاسب مالي', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  INVENTORY: { label: 'مسؤول مخزن', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
};

export const UsersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [role, setRole] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users', { search, companyId, role, page }],
    queryFn: () =>
      usersApi.getAll({
        search: search || undefined,
        companyId: companyId || undefined,
        role: role || undefined,
        page,
        limit: 10,
      }),
  });

  const { data: companiesData } = useQuery({
    queryKey: ['companies-lookup'],
    queryFn: () => companiesApi.getAll({ limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsDeleteDialogOpen(false);
    },
  });

  const columns = [
    {
      header: 'الاسم والمستخدم',
      accessor: (item: UserItem) => (
        <div>
          <p className="font-bold text-slate-800">{item.name}</p>
          <p className="text-xs text-teal-700 font-mono">@{item.username}</p>
        </div>
      ),
    },
    {
      header: 'الدور والصلاحية (RBAC)',
      accessor: (item: UserItem) => {
        const badge = roleLabels[item.role] || { label: item.role, color: 'bg-slate-50 text-slate-700 border-slate-200' };
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>
            <Shield size={12} />
            {badge.label}
          </span>
        );
      },
    },
    {
      header: 'الكيان والفرع',
      accessor: (item: UserItem) => (
        <div className="text-xs">
          <p className="font-semibold text-slate-800">{item.company?.name || '—'}</p>
          <p className="text-slate-500 font-mono mt-0.5">
            {item.branch ? `📍 ${item.branch.name} (${item.branch.code})` : '🌐 كافة فروع الشركة'}
          </p>
        </div>
      ),
    },
    {
      header: 'معلومات التواصل',
      accessor: (item: UserItem) => (
        <div className="text-xs">
          <p className="font-mono text-slate-700">{item.phone || '—'}</p>
          {item.email && <p className="text-slate-400">{item.email}</p>}
        </div>
      ),
    },
    {
      header: 'الحالة',
      accessor: (item: UserItem) => (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
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
      accessor: (item: UserItem) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            title="تعديل"
            onClick={() => {
              setSelectedUser(item);
              setIsModalOpen(true);
            }}
            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Pencil size={16} />
          </button>
          <button
            title="حذف"
            onClick={() => {
              setSelectedUser(item);
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
        title="إدارة المستخدمين والصلاحيات (RBAC)"
        subtitle="إدارة حسابات النظام وتعيين الفروع وتحديد أدوار الوصول المحكمة"
        action={
          <button
            onClick={() => {
              setSelectedUser(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-semibold shadow-sm"
          >
            <Plus size={18} /> إضافة مستخدم جديد
          </button>
        }
      />

      {/* شريط الفلاتر والبحث */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="بحث بالاسم أو اسم المستخدم أو رقم الهاتف..."
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
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white min-w-[180px]"
        >
          <option value="">جميع الشركات</option>
          {companiesData?.items?.map((c: Company) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white min-w-[180px]"
        >
          <option value="">جميع الأدوار والصلاحيات</option>
          {Object.entries(roleLabels).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>

        {(search || companyId || role) && (
          <button
            onClick={() => {
              setSearch('');
              setCompanyId('');
              setRole('');
              setPage(1);
            }}
            className="text-xs text-slate-500 hover:text-slate-800 underline px-2 py-1"
          >
            إعادة تعيين الفلاتر
          </button>
        )}
      </div>

      {/* جدول المستخدمين */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable
          data={data?.items || []}
          columns={columns}
          isLoading={isLoading}
          onRowClick={(item) => {
            setSelectedUser(item);
            setIsModalOpen(true);
          }}
        />

        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Users size={16} className="text-teal-600" />
            <span>إجمالي الحسابات: <strong className="text-slate-800">{data?.total || 0}</strong></span>
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

      <UserFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={selectedUser}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => selectedUser && deleteMutation.mutate(selectedUser.id)}
        title="حذف حساب المستخدم"
        message={`هل أنت متأكد من حذف الحساب "${selectedUser?.name}" (@${selectedUser?.username}) نهائياً من المنظومة؟`}
        confirmText="نعم، احذف الحساب"
        cancelText="إلغاء"
        variant="danger"
      />
    </div>
  );
};
