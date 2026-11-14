import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companiesApi, Company } from '../api/companies';
import { PageHeader } from '../components/common/PageHeader';
import { DataTable } from '../components/common/DataTable';
import { CompanyFormModal } from '../components/companies/CompanyFormModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Plus, Pencil, Trash2, GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const CompaniesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['companies', { search, page }],
    queryFn: () => companiesApi.getAll({ search, page, limit: 10 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsDeleteDialogOpen(false);
    },
  });

  const columns = [
    {
      header: 'الشركة',
      accessor: (item: Company) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg border border-slate-200 bg-white p-0.5 flex items-center justify-center shrink-0 shadow-2xs">
            <img
              src={item.logoUrl || '/logo.png'}
              alt={item.name}
              className="w-full h-full object-contain rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo.png';
              }}
            />
          </div>
          <span className="font-bold text-slate-800">{item.name}</span>
        </div>
      ),
    },
    { header: 'الرقم الضريبي', accessor: (item: Company) => item.taxNumber || '—' },
    { header: 'الهاتف', accessor: (item: Company) => item.phone || '—' },
    {
      header: 'عدد الفروع',
      accessor: (item: Company) => (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700">
          <GitBranch size={12} />
          {item._count?.branches || 0} فرع
        </span>
      ),
    },
    {
      header: 'الحالة',
      accessor: (item: Company) => (
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
      accessor: (item: Company) => (
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            title="عرض فروع الشركة"
            onClick={() => navigate(`/branches?companyId=${item.id}`)}
            className="text-[#00A8A8] hover:text-[#008A8A] font-bold p-1"
          >
            <GitBranch size={16} />
          </button>
          <button
            title="تعديل"
            onClick={() => {
              setSelectedCompany(item);
              setIsModalOpen(true);
            }}
            className="text-blue-600 hover:text-blue-800 p-1"
          >
            <Pencil size={16} />
          </button>
          <button
            title="حذف"
            onClick={() => {
              setSelectedCompany(item);
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
        title="إدارة الشركات"
        subtitle="إدارة بيانات الشركات والكيانات التجارية والفروع التابعة لها"
        action={
          <button
            onClick={() => {
              setSelectedCompany(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-[#00A8A8] hover:bg-[#009292] text-white px-5 py-2.5 rounded-xl transition shadow text-xs font-bold"
          >
            <Plus size={16} /> إضافة شركة جديدة
          </button>
        }
      />

      <div className="mb-4 flex items-center justify-between">
        <input
          type="text"
          placeholder="بحث بالاسم أو الرقم الضريبي أو الهاتف..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="border border-slate-300 rounded-xl px-4 py-2.5 w-80 text-xs focus:outline-none focus:border-[#00A8A8] bg-white shadow-xs"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable
          data={data?.items || []}
          columns={columns}
          isLoading={isLoading}
          onRowClick={(item) => {
            setSelectedCompany(item);
            setIsModalOpen(true);
          }}
        />

        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs">
          <span className="text-slate-500 font-bold">إجمالي الشركات: {data?.total || 0}</span>
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

      <CompanyFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        company={selectedCompany}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['companies'] })}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => selectedCompany && deleteMutation.mutate(selectedCompany.id)}
        title="حذف شركة"
        message={`هل أنت متأكد من حذف شركة "${selectedCompany?.name}"؟ سيؤدي ذلك لحذف الفروع المرتبطة بها أيضاً.`}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="danger"
      />
    </div>
  );
};
