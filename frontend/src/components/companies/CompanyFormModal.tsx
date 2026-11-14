import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { companiesApi, Company } from '../../api/companies';
import { X, Upload, Image as ImageIcon, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { compressImage, formatBytes, CompressionResult } from '../../utils/image-compression';

interface CompanyFormData {
  name: string;
  taxNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  logoUrl?: string;
  isActive: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  company?: Company | null;
  onSuccess: () => void;
}

export const CompanyFormModal: React.FC<Props> = ({ isOpen, onClose, company, onSuccess }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressionStats, setCompressionStats] = useState<CompressionResult | null>(null);
  const [compressError, setCompressError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CompanyFormData>({
    defaultValues: { isActive: true, logoUrl: '/logo.png' },
  });

  const currentLogo = watch('logoUrl');

  useEffect(() => {
    setCompressionStats(null);
    setCompressError(null);
    if (company) {
      reset({
        name: company.name,
        taxNumber: company.taxNumber || '',
        phone: company.phone || '',
        email: company.email || '',
        address: company.address || '',
        logoUrl: company.logoUrl || '/logo.png',
        isActive: company.isActive,
      });
    } else {
      reset({ name: '', taxNumber: '', phone: '', email: '', address: '', logoUrl: '/logo.png', isActive: true });
    }
  }, [company, reset]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCompressError('يرجى اختيار ملف صورة صالح (PNG, JPG, WebP)');
      return;
    }

    try {
      setCompressing(true);
      setCompressError(null);
      // ضغط وتصغير الصورة لأقصى أبعاد 300x300 وبجودة 82% WebP
      const result = await compressImage(file, 300, 0.82);
      setValue('logoUrl', result.dataUrl, { shouldDirty: true });
      setCompressionStats(result);
    } catch (err: any) {
      setCompressError(err.message || 'حدث خطأ أثناء معالجة وضغط الصورة');
    } finally {
      setCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResetToDefault = () => {
    setValue('logoUrl', '/logo.png', { shouldDirty: true });
    setCompressionStats(null);
    setCompressError(null);
  };

  const mutation = useMutation({
    mutationFn: (data: CompanyFormData) => {
      data = { ...data, name: data.name.trim(), email: data.email?.trim() || undefined };
      if (company) return companiesApi.update(company.id, data);
      return companiesApi.create(data);
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
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h2 className="text-xl font-bold text-[#582949]">
            {company ? 'تعديل بيانات الشركة' : 'إضافة شركة جديدة'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4 mt-4 text-xs">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشركة *</label>
            <input
              {...register('name', { required: 'اسم الشركة مطلوب' })}
              placeholder="مثال: شركة داواكور للرعاية الصحية"
              className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
            />
            {errors.name && <p className="text-red-500 text-[11px] mt-1">{errors.name.message}</p>}
          </div>

          {/* قسم رفع وضغط الشعار */}
          <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ImageIcon size={15} className="text-[#00A8A8]" />
                شعار الشركة (مضغوط لتوفير المساحة)
              </label>
              {currentLogo && currentLogo !== '/logo.png' && (
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="text-[11px] text-rose-500 hover:text-rose-700 flex items-center gap-1 font-semibold"
                >
                  <Trash2 size={12} />
                  استعادة الشعار الافتراضي
                </button>
              )}
            </div>

            <div className="flex items-center gap-3.5">
              {/* مربع معاينة الشعار */}
              <div className="relative w-16 h-16 rounded-xl border border-slate-200 bg-white p-1.5 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                <img
                  src={currentLogo || '/logo.png'}
                  alt="الشعار"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/logo.png';
                  }}
                />
              </div>

              {/* زر رفع الصورة المضغوطة */}
              <div className="flex-1 space-y-1.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={compressing}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#00A8A8] hover:bg-[#008f8f] text-white font-bold text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <Upload size={14} />
                  {compressing ? 'جارٍ ضغط وتجهيز الصورة...' : 'رفع صورة شعار (ضغط تلقائي ⚡)'}
                </button>

                <p className="text-[10px] text-slate-400 leading-tight">
                  تُضغط الصورة تلقائياً بأعلى كفاءة (300×300 بكسل بحجم ~15-25 KB) لتوفير المساحة وسرعة طباعة الفواتير والتقارير.
                </p>
              </div>
            </div>

            {/* بطاقة نجاح الضغط والتوفير */}
            {compressionStats && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-[11px] font-medium">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <span>
                  تم ضغط الشعار بنجاح: من <strong>{formatBytes(compressionStats.originalSize)}</strong> إلى{' '}
                  <strong className="text-emerald-700">{formatBytes(compressionStats.compressedSize)}</strong>{' '}
                  (توفير {compressionStats.compressionRatio}% من المساحة 🚀)
                </span>
              </div>
            )}

            {compressError && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-xl text-[11px]">
                <AlertCircle size={15} className="shrink-0" />
                <span>{compressError}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الضريبي</label>
              <input
                {...register('taxNumber')}
                placeholder="مثال: TX-123456"
                className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
              <input
                {...register('phone')}
                placeholder="مثال: +249123456789"
                className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
            <input
              {...register('email')}
              type="email"
              placeholder="info@company.com"
              className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">العنوان والمقر الرئيسي</label>
            <input
              {...register('address')}
              placeholder="الخرطوم / القاهرة"
              className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-[#00A8A8] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              {...register('isActive')}
              className="rounded border-slate-300 text-[#00A8A8] focus:ring-[#00A8A8] h-4 w-4"
            />
            <label htmlFor="isActive" className="text-xs font-bold text-slate-700 cursor-pointer">
              الشركة نشطة
            </label>
          </div>

          {mutation.isError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
              {(() => {
                const error = mutation.error as { response?: { status?: number; data?: { message?: string | string[] } } };
                const message = error.response?.data?.message;
                if (Array.isArray(message)) return message.join('، ');
                return message || 'تعذر حفظ الشركة. تحقق من الاتصال بالخادم وصلاحيات الحساب ثم أعد المحاولة.';
              })()}
            </div>
          )}
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
              disabled={mutation.isPending || compressing}
              className="px-5 py-2 rounded-xl bg-[#00A8A8] font-bold text-white hover:bg-[#008A8A] text-xs shadow-md transition disabled:opacity-50"
            >
              {mutation.isPending ? 'جارٍ الحفظ...' : company ? 'حفظ التعديلات' : 'إضافة الشركة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
