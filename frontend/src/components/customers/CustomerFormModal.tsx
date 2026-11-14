import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { customersApi, Customer } from '../../api/customers';
import { branchesApi, Branch } from '../../api/branches';
import { getCurrentUser } from '../../utils/permissions';
import { X, UserPlus, UserCheck } from 'lucide-react';

const customerSchema = z.object({
  companyId: z.string().min(1, 'يرجى اختيار الشركة'),
  branchId: z.string().min(1, 'يرجى اختيار الفرع'),
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  phone: z.string().min(6, 'رقم الهاتف مطلوب'),
  nationalId: z.string().optional().or(z.literal('')),
  creditLimit: z.number().min(0, 'سقف الائتمان لا يمكن أن يكون سالباً').default(0),
  initialBalance: z.number().min(0, 'الرصيد الافتتاحي لا يمكن أن يكون سالباً').default(0),
  address: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

interface CustomerFormData {
  companyId: string;
  branchId: string;
  name: string;
  phone: string;
  nationalId?: string;
  creditLimit: number;
  initialBalance: number;
  address?: string;
  notes?: string;
  isActive: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSuccess?: (createdCustomer?: any) => void;
}

export const CustomerFormModal: React.FC<Props> = ({ isOpen, onClose, customer, onSuccess }) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema) as any,
    defaultValues: {
      creditLimit: 0,
      initialBalance: 0,
      isActive: true,
    },
  });

  const selectedCompanyId = watch('companyId');
  const currentUser = getCurrentUser();

  // جلب فروع الشركة المحددة
  const { data: branchesData } = useQuery({
    queryKey: ['branches-by-company', selectedCompanyId],
    queryFn: () => branchesApi.getAll({ companyId: selectedCompanyId, limit: 100 }),
    enabled: !!selectedCompanyId && isOpen,
  });

  useEffect(() => {
    if (!customer && branchesData?.items?.length > 0 && !watch('branchId')) {
      setValue('branchId', branchesData.items[0].id);
    }
  }, [branchesData, customer, setValue, watch]);

  useEffect(() => {
    if (!isOpen) return;
    if (customer) {
      reset({
        companyId: customer.companyId,
        branchId: customer.branchId,
        name: customer.name,
        phone: customer.phone,
        nationalId: customer.nationalId || '',
        creditLimit: Number(customer.creditLimit) || 0,
        initialBalance: 0,
        address: customer.address || '',
        notes: customer.notes || '',
        isActive: customer.isActive,
      });
    } else {
      reset({
        companyId: currentUser?.companyId || '',
        branchId: currentUser?.branchId || '',
        name: '',
        phone: '',
        nationalId: '',
        creditLimit: 0,
        initialBalance: 0,
        address: '',
        notes: '',
        isActive: true,
      });
    }
  }, [isOpen, customer?.id, reset, currentUser?.companyId, currentUser?.branchId]);

  const mutation = useMutation({
    mutationFn: (data: CustomerFormData) => {
      const payload: any = {
        ...data,
        creditLimit: Number(data.creditLimit) || 0,
        initialBalance: Number(data.initialBalance) || 0,
      };
      if (customer) {
        delete payload.initialBalance;
        delete payload.companyId;
        delete payload.branchId;
        return customersApi.update(customer.id, payload);
      }
      return customersApi.create(payload);
    },
    onSuccess: (res) => {
      onSuccess?.(res);
      onClose();
      reset();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir="rtl">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl p-6 overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
              {customer ? <UserCheck size={20} /> : <UserPlus size={20} />}
            </div>
            <h2 className="text-xl font-bold">
              {customer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">الشركة *</label>
              <input type="hidden" {...register('companyId')} />
              <input value="شركة المستخدم الحالية" readOnly className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm bg-slate-100" />
              {errors.companyId && <p className="text-red-500 text-xs mt-1">{errors.companyId.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">الفرع *</label>
              <select
                {...register('branchId')}
                disabled={!!customer || !selectedCompanyId}
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 disabled:bg-slate-100 disabled:cursor-not-allowed bg-white"
              >
                <option value="">{!selectedCompanyId ? 'اختر الشركة أولاً' : 'اختر الفرع...'}</option>
                {branchesData?.items?.map((b: Branch) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
              {errors.branchId && <p className="text-red-500 text-xs mt-1">{errors.branchId.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">اسم العميل *</label>
              <input
                {...register('name')}
                placeholder="مثال: د. أحمد عثمان"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">رقم الهاتف *</label>
              <input
                {...register('phone')}
                placeholder="0912345678"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-mono"
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">الرقم الوطني / الهوية</label>
              <input
                {...register('nationalId')}
                placeholder="1012345678"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">سقف الائتمان (ج.س)</label>
              <input
                type="number"
                step="0.01"
                {...register('creditLimit', { valueAsNumber: true })}
                placeholder="0.00"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-mono"
              />
              {errors.creditLimit && <p className="text-red-500 text-xs mt-1">{errors.creditLimit.message}</p>}
            </div>

            {!customer && (
              <div>
                <label className="block text-sm font-semibold text-slate-700">الرصيد الافتتاحي (ج.س)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('initialBalance', { valueAsNumber: true })}
                  placeholder="0.00"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-mono"
                />
                {errors.initialBalance && <p className="text-red-500 text-xs mt-1">{errors.initialBalance.message}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">العنوان</label>
              <input
                {...register('address')}
                placeholder="المدينة - الحي - الشارع"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">ملاحظات</label>
              <input
                {...register('notes')}
                placeholder="أي تفاصيل إضافية عن العميل..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
            <input
              type="checkbox"
              id="isActiveCustomer"
              {...register('isActive')}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
            />
            <label htmlFor="isActiveCustomer" className="text-sm font-medium text-slate-700 cursor-pointer">
              حساب العميل نشط ومفعل لعمليات البيع والآجل
            </label>
          </div>

          {mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {(mutation.error as any)?.response?.data?.message || 'حدث خطأ أثناء حفظ بيانات العميل'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-6 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 text-sm font-semibold shadow-sm transition-colors"
            >
              {mutation.isPending ? 'جاري الحفظ...' : customer ? 'تحديث البيانات' : 'حفظ العميل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
