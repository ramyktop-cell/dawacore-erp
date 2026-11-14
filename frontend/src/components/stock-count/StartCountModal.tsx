import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { stockCountApi } from '../../api/stock-count';
import { branchesApi } from '../../api/branches';
import { medicinesApi } from '../../api/medicines';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (stockCountId: string) => void;
}

export const StartCountModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [branchId, setBranchId] = useState('');
  const [countType, setCountType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [notes, setNotes] = useState('');

  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup'],
    queryFn: () => branchesApi.getAll({ limit: 100 }),
    enabled: isOpen,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['medicines-categories'],
    queryFn: () => medicinesApi.getCategories(),
    enabled: isOpen && countType === 'PARTIAL',
  });

  const mutation = useMutation({
    mutationFn: () =>
      stockCountApi.start({
        branchId,
        countType,
        categoryFilter: countType === 'PARTIAL' ? categoryFilter : undefined,
        notes,
      }),
    onSuccess: (data) => {
      onSuccess(data.id);
      resetForm();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'فشل بدء الجرد';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });

  const resetForm = () => {
    setBranchId('');
    setCountType('FULL');
    setCategoryFilter('');
    setNotes('');
  };

  const handleSubmit = () => {
    if (!branchId) {
      alert('يجب اختيار الفرع');
      return;
    }
    if (countType === 'PARTIAL' && !categoryFilter) {
      alert('يجب اختيار التصنيف المستهدف للجرد الجزئي');
      return;
    }
    mutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="w-[550px] bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h2 className="text-xl font-bold text-slate-800">بدء محضر جرد جديد</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800">
            <p className="font-bold mb-1">⚠️ تنبيه التجميد اللحظي</p>
            <p>
              سيتم <strong>تجميد بيع الأصناف المحددة</strong> تلقائياً في نقطة البيع (POS) لمنع تضارب الأرصدة،
              وسيتم تحريرها فوراً عند الاعتماد النهائي أو الإلغاء (أو بعد مهلة الأمان: 24 ساعة).
            </p>
          </div>
        </div>

        <div className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">الفرع *</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 cursor-pointer"
            >
              <option value="">اختر الفرع...</option>
              {branchesData?.items?.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">نطاق الجرد *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCountType('FULL')}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-right cursor-pointer ${
                  countType === 'FULL'
                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                جرد شامل
                <p className="text-xs font-normal mt-1 text-slate-500">
                  كافة الأدوية والدفعات المتوفرة بالفرع
                </p>
              </button>
              <button
                type="button"
                onClick={() => setCountType('PARTIAL')}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-right cursor-pointer ${
                  countType === 'PARTIAL'
                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                جرد جزئي
                <p className="text-xs font-normal mt-1 text-slate-500">
                  تصنيف علاجي محدد فقط
                </p>
              </button>
            </div>
          </div>

          {countType === 'PARTIAL' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                التصنيف الدوائي *
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600 cursor-pointer"
              >
                <option value="">اختر التصنيف المطلوب جرده...</option>
                {categoriesData?.map((cat: string) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ملاحظات وتوجيهات
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-600"
              placeholder="مثال: جرد دوري لربع السنة الأول"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm cursor-pointer"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !branchId}
            className="px-6 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 text-sm font-medium cursor-pointer"
          >
            {mutation.isPending ? 'جاري تثبيت الأرصدة والتجميد...' : 'تأكيد وبدء العد'}
          </button>
        </div>
      </div>
    </div>
  );
};
