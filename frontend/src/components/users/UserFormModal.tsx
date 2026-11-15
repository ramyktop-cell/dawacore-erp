import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { usersApi } from '../../api/users';
import { companiesApi } from '../../api/companies';
import { branchesApi } from '../../api/branches';
import { getBusinessTerminology } from '../../utils/business-terminology';
import { X, ShieldCheck } from 'lucide-react';

// ============ مخطط التحقق من الصحة (Zod Schema) ============
const userSchema = z.object({
  companyId: z.string().min(1, 'الشركة مطلوبة'),
  branchId: z.string().optional(),
  fullName: z.string().min(2, 'الاسم الكامل مطلوب'),
  username: z.string().min(3, 'اسم الدخول يجب أن يكون 3 أحرف على الأقل'),
  password: z
    .string()
    .min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    .optional()
    .or(z.literal('')),
  role: z.enum([
    'COMPANY_ADMIN',
    'BRANCH_MANAGER',
    'CASHIER',
    'ACCOUNTANT',
    'STORE_KEEPER',
    'INVENTORY',
    'SUPER_ADMIN',
  ]),
  phone: z.string().min(9, 'رقم الهاتف مطلوب'),
  email: z.string().email('البريد الإلكتروني غير صالح').optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

type UserFormData = z.infer<typeof userSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
  onSuccess: () => void;
}

export const UserFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
}) => {
  const isEdit = !!user;

  // ============ جلب الشركات ============
  const { data: companiesData } = useQuery({
    queryKey: ['companies-lookup'],
    queryFn: () => companiesApi.getAll({ limit: 100 }),
    enabled: isOpen,
  });

  // ============ إعداد النموذج ============
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema) as any,
    defaultValues: {
      isActive: true,
      role: 'CASHIER',
    },
  });

  const selectedCompanyId = watch('companyId');
  const selectedCompany = companiesData?.items?.find(
    (c: any) => c.id === selectedCompanyId,
  );
  const selectedCompanyTerms = getBusinessTerminology(
    selectedCompany?.businessType || 'PHARMACY',
  );

  // ============ جلب الفروع بناءً على الشركة المختارة ============
  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup', selectedCompanyId],
    queryFn: () =>
      branchesApi.getAll({ companyId: selectedCompanyId, limit: 100 }),
    enabled: isOpen && !!selectedCompanyId,
  });

  // ============ تعبئة النموذج عند التعديل أو الفتح ============
  useEffect(() => {
    if (user) {
      reset({
        companyId: user.companyId,
        branchId: user.branchId || '',
        fullName: user.name || user.fullName || '',
        username: user.username,
        password: '',
        role: user.role === 'INVENTORY' ? 'STORE_KEEPER' : user.role,
        phone: user.phone || '',
        email: user.email || '',
        isActive: user.isActive ?? true,
      });
    } else {
      reset({
        companyId: companiesData?.items?.[0]?.id || '',
        branchId: '',
        fullName: '',
        username: '',
        password: '',
        role: 'CASHIER',
        phone: '',
        email: '',
        isActive: true,
      });
    }
  }, [user, reset, companiesData]);

  // ============ تحديد الشركة تلقائياً إذا لم تكن محددة ============
  useEffect(() => {
    if (!isEdit && isOpen && companiesData?.items?.length > 0 && !selectedCompanyId) {
      reset((prev) => ({
        ...prev,
        companyId: companiesData.items[0].id,
      }));
    }
  }, [companiesData, isEdit, isOpen, selectedCompanyId, reset]);

  // ============ دالة الحفظ (Create / Update) ============
  const mutation = useMutation({
    mutationFn: (data: UserFormData) => {
      // بناء الـ Payload بشكل نظيف
      const payload: any = {
        companyId: data.companyId,
        fullName: data.fullName,
        username: data.username,
        role: data.role,
        phone: data.phone,
        isActive: data.isActive,
      };

      // branchId: إرسال فقط إذا كان غير فارغ
      if (data.branchId && data.branchId.trim() !== '') {
        payload.branchId = data.branchId.trim();
      }

      // email: إرسال فقط إذا كان غير فارغ
      if (data.email && data.email.trim() !== '') {
        payload.email = data.email.trim();
      }

      // password: إرسال فقط إذا كان غير فارغ (في حالة التعديل)
      if (data.password && data.password.trim() !== '') {
        payload.password = data.password.trim();
      } else if (!isEdit) {
        // في حالة الإنشاء، كلمة المرور إلزامية
        throw new Error('كلمة المرور مطلوبة لإنشاء مستخدم جديد');
      }

      if (isEdit) {
        return usersApi.update(user.id, payload);
      }
      return usersApi.create(payload);
    },
    onSuccess: () => {
      onSuccess();
      onClose();
      reset();
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message || error?.message || 'حدث خطأ';
      alert(Array.isArray(message) ? message.join('\n') : message);
    },
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      dir="rtl"
    >
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl p-6 overflow-y-auto">
        {/* ============ ترويسة النافذة ============ */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="p-2 rounded-lg bg-violet-50 text-violet-600">
              <ShieldCheck size={20} />
            </div>
            <h2 className="text-xl font-bold">
              {isEdit ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((data: any) => mutation.mutate(data))}
          className="space-y-4 mt-4"
        >
          {/* ============ الصف 1: الشركة والفرع ============ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                الشركة *
              </label>
              <select
                {...register('companyId')}
                disabled={isEdit}
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 disabled:bg-slate-100 bg-white"
              >
                <option value="">اختر الشركة...</option>
                {companiesData?.items?.map((company: any) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              {errors.companyId && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.companyId.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                الفرع
              </label>
              <select
                {...register('branchId')}
                disabled={!selectedCompanyId}
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 disabled:bg-slate-100 bg-white"
              >
                <option value="">بدون فرع (مستخدم عام)</option>
                {branchesData?.items?.map((branch: any) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} {branch.code ? `(${branch.code})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                اتركه فارغاً للمستخدم العام (مدير الشركة)
              </p>
            </div>
          </div>

          {/* ============ نشاط الشركة (للقراءة فقط - يورث من الشركة) ============ */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 flex items-center justify-between gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                نشاط الشركة التابع لها المستخدم (للقراءة فقط)
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                يتبع المستخدم نشاط الشركة المختارة تلقائياً ولا يُخزن نشاط مستقل للمستخدم
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white border border-teal-200 px-3 py-1.5 text-xs font-black text-[#582949] shrink-0">
              <span>{selectedCompanyTerms.icon}</span>
              <span>{selectedCompanyTerms.labelAr}</span>
            </div>
          </div>

          {/* ============ الصف 2: الاسم واسم الدخول ============ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                الاسم الكامل *
              </label>
              <input
                {...register('fullName')}
                placeholder="مثال: أحمد محمد عثمان"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600"
              />
              {errors.fullName && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                اسم الدخول (Username) *
              </label>
              <input
                {...register('username')}
                disabled={isEdit}
                dir="ltr"
                placeholder="مثال: ahmed_pos"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 disabled:bg-slate-100 font-mono"
              />
              {errors.username && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.username.message}
                </p>
              )}
            </div>
          </div>

          {/* ============ الصف 3: كلمة المرور والدور ============ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                كلمة المرور {isEdit ? '(اتركها فارغة لعدم التغيير)' : '*'}
              </label>
              <input
                type="password"
                {...register('password')}
                dir="ltr"
                placeholder="******"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 font-mono"
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                الدور والصلاحية *
              </label>
              <select
                {...register('role')}
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 bg-white"
              >
                <option value="COMPANY_ADMIN">مدير الشركة (COMPANY_ADMIN)</option>
                <option value="BRANCH_MANAGER">مدير فرع (BRANCH_MANAGER)</option>
                <option value="CASHIER">كاشير (CASHIER)</option>
                <option value="ACCOUNTANT">محاسب (ACCOUNTANT)</option>
                <option value="STORE_KEEPER">أمين مخزن (STORE_KEEPER)</option>
                <option value="SUPER_ADMIN">مدير عام للنظام (SUPER_ADMIN)</option>
              </select>
              {errors.role && (
                <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>
              )}
            </div>
          </div>

          {/* ============ الصف 4: الهاتف والبريد ============ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                رقم الهاتف *
              </label>
              <input
                {...register('phone')}
                dir="ltr"
                placeholder="+249..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 font-mono"
              />
              {errors.phone && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.phone.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                {...register('email')}
                dir="ltr"
                placeholder="user@example.com"
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600"
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          {/* ============ حالة الحساب ============ */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <input
              type="checkbox"
              id="isActiveUser"
              {...register('isActive')}
              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
            />
            <label
              htmlFor="isActiveUser"
              className="text-sm font-medium text-slate-700 cursor-pointer"
            >
              حساب المستخدم نشط ومفعّل لتسجيل الدخول
            </label>
          </div>

          {/* ============ أزرار الحفظ والإلغاء ============ */}
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
              className="px-6 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 text-sm font-medium shadow-sm transition-colors"
            >
              {mutation.isPending
                ? 'جاري الحفظ...'
                : isEdit
                ? 'تحديث'
                : 'إضافة مستخدم'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
