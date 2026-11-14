import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { branchesApi, Branch } from '../../api/branches';
import { companiesApi, Company } from '../../api/companies';
import { X } from 'lucide-react';

interface BranchFormData {
  companyId: string;
  name: string;
  code: string;
  phone?: string;
  address?: string;
  isMain: boolean;
  isActive: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  branch?: Branch | null;
  defaultCompanyId?: string;
  onSuccess: () => void;
}

export const BranchFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  branch,
  defaultCompanyId,
  onSuccess,
}) => {
  const { data: companiesData, isError: companiesFailed } = useQuery({
    queryKey: ['companies-dropdown'],
    queryFn: () => companiesApi.getAll({ limit: 100 }),
    enabled: isOpen,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BranchFormData>({
    defaultValues: { isActive: true, isMain: false },
  });

  useEffect(() => {
    if (branch) {
      reset({
        companyId: branch.companyId,
        name: branch.name,
        code: branch.code,
        phone: branch.phone || '',
        address: branch.address || '',
        isMain: branch.isMain,
        isActive: branch.isActive,
      });
    } else {
      reset({
        companyId: defaultCompanyId || companiesData?.items?.[0]?.id || '',
        name: '',
        code: '',
        phone: '',
        address: '',
        isMain: false,
        isActive: true,
      });
    }
  }, [branch, defaultCompanyId, companiesData, reset]);

  const mutation = useMutation({
    mutationFn: (data: BranchFormData) => {
      data = { ...data, name: data.name.trim(), code: data.code.trim() };
      if (branch) return branchesApi.update(branch.id, data);
      return branchesApi.create(data);
    },
    onSuccess: () => {
      onSuccess();
      onClose();
      reset();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h2 className="text-xl font-bold text-[#582949]">
            {branch ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4 mt-4 text-xs">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الشركة التابع لها *</label>
            <select
              {...register('companyId', { required: 'يرجى اختيار الشركة' })}
              className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
            >
              <option value="">اختر الشركة...</option>
              {companiesData?.items?.map((c: Company) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.companyId && <p className="text-red-500 text-[11px] mt-1">{errors.companyId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفرع *</label>
              <input
                {...register('name', { required: 'اسم الفرع مطلوب' })}
                placeholder="مثال: فرع الصيدلية الرئيسي"
                className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
              />
              {errors.name && <p className="text-red-500 text-[11px] mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">كود الفرع الفريد *</label>
              <input
                {...register('code', { required: 'كود الفرع مطلوب' })}
                placeholder="مثال: BR-01"
                className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
              />
              {errors.code && <p className="text-red-500 text-[11px] mt-1">{errors.code.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">هاتف الفرع</label>
              <input
                {...register('phone')}
                placeholder="مثال: +249123456789"
                className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">عنوان الفرع</label>
              <input
                {...register('address')}
                placeholder="الشارع / المدينة"
                className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isMain"
                {...register('isMain')}
                className="rounded border-slate-300 text-[#00A8A8] focus:ring-[#00A8A8] h-4 w-4"
              />
              <label htmlFor="isMain" className="text-xs font-bold text-slate-700 cursor-pointer">
                الفرع الرئيسي للشركة
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isBranchActive"
                {...register('isActive')}
                className="rounded border-slate-300 text-[#00A8A8] focus:ring-[#00A8A8] h-4 w-4"
              />
              <label htmlFor="isBranchActive" className="text-xs font-bold text-slate-700 cursor-pointer">
                الفرع نشط
              </label>
            </div>
          </div>

          {companiesFailed && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">تعذر تحميل الشركات. تحقق من الاتصال بالخادم وصلاحيات الحساب.</p>}
          {mutation.isError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{(() => {
            const error = mutation.error as { response?: { data?: { message?: string | string[] } } };
            const message = error.response?.data?.message;
            return Array.isArray(message) ? message.join('، ') : message || 'تعذر حفظ الفرع. تحقق من الاتصال بالخادم وصلاحيات الحساب ثم أعد المحاولة.';
          })()}</div>}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-600 hover:bg-slate-200 text-xs"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-6 py-2 rounded-xl bg-[#00A8A8] text-white hover:bg-[#009292] disabled:opacity-50 text-xs font-bold shadow"
            >
              {mutation.isPending ? 'جاري الحفظ...' : branch ? 'تحديث الفرع' : 'حفظ الفرع'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
