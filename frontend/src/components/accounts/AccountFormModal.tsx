import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { accountsApi, AccountNode } from '../../api/accounts';
import { X, Save, AlertCircle } from 'lucide-react';

interface AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: AccountNode | null;
  defaultParent?: AccountNode | null;
  companyId: string;
  onSuccess: () => void;
}

const ACCOUNT_TYPES = [
  { value: 'ASSET', label: 'أصول (Assets)', color: 'text-emerald-700 bg-emerald-50' },
  { value: 'LIABILITY', label: 'خصوم (Liabilities)', color: 'text-amber-700 bg-amber-50' },
  { value: 'EQUITY', label: 'حقوق ملكية (Equity)', color: 'text-indigo-700 bg-indigo-50' },
  { value: 'REVENUE', label: 'إيرادات (Revenue)', color: 'text-teal-700 bg-teal-50' },
  { value: 'EXPENSE', label: 'مصروفات (Expense)', color: 'text-rose-700 bg-rose-50' },
];

const LEVELS = [
  { value: 1, label: 'مستوى 1: حساب رئيسي (Main)' },
  { value: 2, label: 'مستوى 2: حساب فرعي (Sub-Group)' },
  { value: 3, label: 'مستوى 3: حساب تفصيلي (Detail)' },
  { value: 4, label: 'مستوى 4: حساب تحليلي (Analytical)' },
  { value: 5, label: 'مستوى 5: حساب تشغيلي (Operational)' },
];

export const AccountFormModal: React.FC<AccountFormModalProps> = ({
  isOpen,
  onClose,
  account,
  defaultParent,
  companyId,
  onSuccess,
}) => {
  const isEditing = !!account && !defaultParent;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('ASSET');
  const [level, setLevel] = useState(1);
  const [parentId, setParentId] = useState('');
  const [isLeaf, setIsLeaf] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // جلب الحسابات المحتملة لتكون آباء (حسابات المستوى السابق level - 1)
  const { data: potentialParents } = useQuery({
    queryKey: ['potential-parents', companyId, level],
    queryFn: () => accountsApi.getAll({ companyId, level: level - 1 }),
    enabled: isOpen && level > 1,
  });

  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      if (account && !defaultParent) {
        // حالة التعديل
        setCode(account.code);
        setName(account.name);
        setType(account.type);
        setLevel(account.level);
        setParentId(account.parentId || '');
        setIsLeaf(account.isLeaf);
        setIsActive(account.isActive);
      } else if (defaultParent) {
        // إضافة ابن لحساب محدد
        setCode(`${defaultParent.code}-`);
        setName('');
        setType(defaultParent.type);
        setLevel(Math.min(5, defaultParent.level + 1));
        setParentId(defaultParent.id);
        setIsLeaf(true);
        setIsActive(true);
      } else {
        // حساب رئيسي جديد
        setCode('');
        setName('');
        setType('ASSET');
        setLevel(1);
        setParentId('');
        setIsLeaf(false);
        setIsActive(true);
      }
    }
  }, [isOpen, account, defaultParent]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEditing && account) {
        return accountsApi.update(account.id, {
          name,
          type,
          parentId: level > 1 ? parentId : undefined,
          isLeaf,
          isActive,
        });
      } else {
        return accountsApi.create({
          companyId,
          code,
          name,
          type,
          level,
          parentId: level > 1 ? parentId : undefined,
          isLeaf,
          isActive,
        });
      }
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'حدث خطأ أثناء حفظ الحساب';
      setErrorMessage(Array.isArray(msg) ? msg.join('، ') : msg);
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!name.trim()) {
      setErrorMessage('يرجى إدخال اسم الحساب');
      return;
    }
    if (!isEditing && !code.trim()) {
      setErrorMessage('يرجى إدخال كود أو رقم الحساب');
      return;
    }
    if (level > 1 && !parentId) {
      setErrorMessage(`حسابات المستوى (${level}) يجب أن ترتبط بحساب أب من المستوى (${level - 1})`);
      return;
    }

    saveMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#582949] to-[#3a1b30] text-white">
          <div>
            <h3 className="text-base font-black">
              {isEditing ? `تعديل الحساب: ${account?.name}` : defaultParent ? `إضافة حساب فرعي تحت: ${defaultParent.name}` : 'إضافة حساب مالي جديد'}
            </h3>
            <p className="text-[11px] text-teal-300 font-medium">
              دليل الحسابات الشجري المحاسبي (5 مستويات)
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* المستوى */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                مستوى الحساب الهرمي <span className="text-rose-500">*</span>
              </label>
              <select
                disabled={isEditing || !!defaultParent}
                value={level}
                onChange={(e) => {
                  const newLevel = Number(e.target.value);
                  setLevel(newLevel);
                  if (newLevel === 1) {
                    setParentId('');
                    setIsLeaf(false);
                  } else {
                    setIsLeaf(true);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#00A8A8] focus:outline-none disabled:bg-slate-100"
              >
                {LEVELS.map((lvl) => (
                  <option key={lvl.value} value={lvl.value}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>

            {/* نوع الحساب */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نوع الحساب <span className="text-rose-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={level > 1 && !!parentId}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#00A8A8] focus:outline-none disabled:bg-slate-100"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* الحساب الأب (عند level > 1) */}
          {level > 1 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الحساب الأب (المستوى {level - 1}) <span className="text-rose-500">*</span>
              </label>
              <select
                value={parentId}
                disabled={isEditing || !!defaultParent}
                onChange={(e) => {
                  const pId = e.target.value;
                  setParentId(pId);
                  const selected = potentialParents?.find((p) => p.id === pId);
                  if (selected) {
                    setType(selected.type);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#00A8A8] focus:outline-none disabled:bg-slate-100"
              >
                <option value="">-- اختر الحساب الأب --</option>
                {potentialParents?.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name} (مستوى {p.level})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* كود الحساب */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم / كود الحساب <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={isEditing}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="مثال: 1-1-01"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-[#00A8A8] focus:outline-none disabled:bg-slate-100"
              />
            </div>

            {/* اسم الحساب */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم الحساب <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: بنك الخرطوم فرع الرياض"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#00A8A8] focus:outline-none"
              />
            </div>
          </div>

          {/* خيارات الحساب الطرفي والنشاط */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={isLeaf}
                onChange={(e) => setIsLeaf(e.target.checked)}
                className="rounded text-[#00A8A8] focus:ring-[#00A8A8] h-4 w-4"
              />
              <span>حساب طرفي يقبل الترحيل المباشر (Leaf Account)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded text-[#00A8A8] focus:ring-[#00A8A8] h-4 w-4"
              />
              <span>الحساب نشط وفعال</span>
            </label>
          </div>

          {/* زر الحفظ */}
          <div className="pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-[#00A8A8] hover:bg-[#009292] text-white px-5 py-2 text-xs font-bold shadow transition disabled:opacity-50"
            >
              <Save size={15} />
              {saveMutation.isPending ? 'جاري الحفظ...' : isEditing ? 'تحديث الحساب' : 'حفظ الحساب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
