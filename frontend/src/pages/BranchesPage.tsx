import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchesApi, Branch } from '../api/branches';
import { companiesApi, Company } from '../api/companies';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import { BranchFormModal } from '../components/branches/BranchFormModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

export const BranchesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const companyIdFilter = searchParams.get('companyId') || '';

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: companiesData } = useQuery({
    queryKey: ['companies-filter'],
    queryFn: () => companiesApi.getAll({ limit: 100 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['branches', { companyId: companyIdFilter, search, page }],
    queryFn: () =>
      branchesApi.getAll({
        companyId: companyIdFilter || undefined,
        search,
        page,
        limit: 10,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => branchesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setIsDeleteDialogOpen(false);
    },
  });

  const columns = [
    {
      header: 'اسم الفرع',
      accessor: (item: Branch) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800">{item.name}</span>
          {item.isMain && (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
              الفرع الرئيسي
            </span>
          )}
        </div>
      ),
    },
    { header: 'كود الفرع', accessor: (item: Branch) => <span className="font-mono font-bold text-slate-700">{item.code}</span> },
    {
      header: 'الشركة التابع لها',
      accessor: (item: Branch) => (
        <span className="inline-flex items-center gap-1 font-bold text-[#582949]">
          <Building2 size={13} />
          {item.company?.name || '—'}
        </span>
      ),
    },
    { header: 'الهاتف', accessor: (item: Branch) => item.phone || '—' },
    { header: 'العنوان', accessor: (item: Branch) => item.address || '—' },
    {
      header: 'الحالة',
      accessor: (item: Branch) => (
        <span
          className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
            item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {item.isActive ? 'نشط' : 'معطل'}
        </span>
      ),
    },
    {
      header: 'الإجراءات',
      accessor: (item: Branch) => (
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            title="تعديل"
            onClick={() => {
              setSelectedBranch(item);
              setIsModalOpen(true);
            }}
            className="text-blue-600 hover:text-blue-800 p-1"
          >
            <Pencil size={16} />
          </button>
          <button
            title="حذف"
            onClick={() => {
              setSelectedBranch(item);
              setIsDeleteDialogOpen(true);
            }}
            className="text-rose-600 hover:text-rose-800 p-1"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen font-sans text-slate-800" dir="rtl">
      <PageHeader
        title="إدارة الفروع"
        subtitle="إدارة فروع الصيدليات والمنافذ التابعة لكل شركة"
        action={
          <button
            onClick={() => {
              setSelectedBranch(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-[#00A8A8] hover:bg-[#009292] text-white px-5 py-2.5 rounded-xl transition shadow text-xs font-bold"
          >
            <Plus size={16} /> إضافة فرع جديد
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="بحث بالاسم أو الكود أو الهاتف..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="border border-slate-300 rounded-xl px-4 py-2.5 w-72 text-xs focus:outline-none focus:border-[#00A8A8] bg-white shadow-xs"
          />

          <select
            value={companyIdFilter}
            onChange={(e) => {
              const val = e.target.value;
              if (val) setSearchParams({ companyId: val });
              else setSearchParams({});
              setPage(1);
            }}
            className="border border-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-[#00A8A8] bg-white shadow-xs"
          >
            <option value="">جميع الشركات</option>
            {companiesData?.items?.map((c: Company) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable
          data={data?.items || []}
          columns={columns}
          isLoading={isLoading}
          onRowClick={(item) => {
            setSelectedBranch(item);
            setIsModalOpen(true);
          }}
        />

        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs">
          <span className="text-slate-500 font-bold">إجمالي الفروع: {data?.total || 0}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-50 hover:bg-slate-100 font-bold"
            >
              السابق
            </button>
            <span className="px-3 py-1 font-bold text-slate-700">{page}</span>
            <button
              disabled={!data?.items || data.items.length < 10}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-50 hover:bg-slate-100 font-bold"
            >
              التالي
            </button>
          </div>
        </div>
      </div>

      <BranchFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        branch={selectedBranch}
        defaultCompanyId={companyIdFilter}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['branches'] })}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => selectedBranch && deleteMutation.mutate(selectedBranch.id)}
        title="حذف فرع"
        message={`هل أنت متأكد من حذف فرع "${selectedBranch?.name}"؟`}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="danger"
      />
    </div>
  );
};
