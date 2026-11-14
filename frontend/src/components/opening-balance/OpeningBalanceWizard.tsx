import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { openingBalanceApi } from '../../api/opening-balance';
import { branchesApi } from '../../api/branches';
import { accountsApi, AccountNode } from '../../api/accounts';
import { useAuthStore } from '../../stores/auth.store';
import {
  X,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Warehouse,
  Wallet,
  Users,
  Building2,
  Banknote,
  AlertTriangle,
  Save,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (documentId: string) => void;
}

interface WizardItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
  referenceType?: string;
}

export const OpeningBalanceWizard: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  // ✅ استخراج companyId من السياق
  const companyId = useAuthStore((s) => s.user?.companyId) || '';
  const userBranchId = useAuthStore((s) => s.user?.branchId) || '';

  const [step, setStep] = useState(1);
  const [branchId, setBranchId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [inventoryValue, setInventoryValue] = useState(0);
  const [cashValue, setCashValue] = useState(0);
  const [bankValue, setBankValue] = useState(0);
  const [customersValue, setCustomersValue] = useState(0);
  const [fixedAssetsValue, setFixedAssetsValue] = useState(0);
  const [suppliersValue, setSuppliersValue] = useState(0);
  const [loansValue, setLoansValue] = useState(0);

  const { data: branchesData } = useQuery({
    queryKey: ['branches-lookup', companyId],
    queryFn: () => branchesApi.getAll({ companyId, limit: 100 }),
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen && userBranchId) setBranchId(userBranchId);
  }, [isOpen, userBranchId]);

  const { data: accountsTree } = useQuery({
    queryKey: ['accounts-tree', companyId],
    queryFn: () => accountsApi.getTree(companyId),
    enabled: isOpen,
  });

  const { data: suggested } = useQuery({
    queryKey: ['opening-balance-suggest', companyId, branchId],
    queryFn: () => openingBalanceApi.suggest(companyId, branchId),
    enabled: isOpen && !!branchId,
  });

  useEffect(() => {
    if (suggested) {
      setInventoryValue(suggested.inventory || 0);
      setCashValue(suggested.cash || 0);
      setBankValue(suggested.bank || 0);
      setCustomersValue(suggested.customers || 0);
      setSuppliersValue(suggested.suppliers || 0);
    }
  }, [suggested]);

  // دالة ذكية للبحث عن الحساب بالأكواد المتعددة أو البديلة
  const findAccountByCodes = (codes: string[]): AccountNode | null => {
    if (!accountsTree) return null;
    const search = (nodes: AccountNode[]): AccountNode | null => {
      for (const node of nodes) {
        if (codes.includes(node.code) && node.isLeaf) return node;
        const found = search(node.children || []);
        if (found) return found;
      }
      return null;
    };
    return search(accountsTree);
  };

  const findAccountByCode = (code: string) => findAccountByCodes([code]);

  const totalDebit = inventoryValue + cashValue + bankValue + customersValue + fixedAssetsValue;
  const totalCredit = suppliersValue + loansValue;
  
  // ✅ الصحيح:
  const suggestedCapital = totalDebit - totalCredit;

  // شروط التوازن الحقيقية:
  // 1. رأس المال لا يمكن أن يكون سالباً (إفلاس)
  // 2. يجب أن يكون هناك بند واحد على الأقل بإجمالي > 0
  // 3. لا يمكن أن يكون المستند فارغاً
  const isBalanced =
    suggestedCapital >= 0 &&
    totalDebit > 0 &&
    (inventoryValue + cashValue + bankValue + customersValue + fixedAssetsValue + suppliersValue + loansValue) > 0;

  const wizardItems: WizardItem[] = useMemo(() => {
    const items: WizardItem[] = [];

    const addItem = (codes: string[], debit: number, credit: number, description: string, refType: string) => {
      const account = findAccountByCodes(codes);
      if (!account || (debit === 0 && credit === 0)) return;
      items.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        debit,
        credit,
        description,
        referenceType: refType,
      });
    };

    addItem(['1-1-03', '1-2-01', '1104', '1-1-03-01'], inventoryValue, 0, 'رصيد المخزون الافتتاحي المقيم', 'BATCH');
    addItem(['1-1-01-01', '1-1-01', '1101', '1-1-01-02'], cashValue, 0, 'رصيد الخزينة النقدية الافتتاحية', 'CASH');
    addItem(['1-1-02-02', '1-1-02-01-01', '1-1-02', '1102'], bankValue, 0, 'رصيد الحساب البنكي الافتتاحي', 'CASH');
    addItem(['1-1-04', '1105'], customersValue, 0, 'مديونيات العملاء الافتتاحية', 'CUSTOMER');
    addItem(['1-2', '1-3-01', '1201'], fixedAssetsValue, 0, 'الأصول الثابتة والتجهيزات', 'FIXED_ASSET');
    addItem(['2-1-01', '2101'], 0, suppliersValue, 'مستحقات الموردين الافتتاحية', 'SUPPLIER');
    addItem(['2-2-01', '2-2', '2201'], 0, loansValue, 'الالتزامات والقروض طويلة الأجل', 'LOAN');
    addItem(['3-1-01', '3101'], 0, suggestedCapital, 'رأس المال الافتتاحي المتوازن', 'CAPITAL');

    return items;
  }, [inventoryValue, cashValue, bankValue, customersValue, fixedAssetsValue, suppliersValue, loansValue, suggestedCapital, accountsTree]);

  const expectedItemsCount =
    [inventoryValue, cashValue, bankValue, customersValue, fixedAssetsValue, suppliersValue, loansValue]
      .filter((value) => Number(value) > 0).length + (suggestedCapital > 0 ? 1 : 0);
  const hasMissingAccounts = wizardItems.length !== expectedItemsCount;

  const mutation = useMutation({
    mutationFn: () =>
      openingBalanceApi.create({
        companyId,
        branchId,
        effectiveDate,
        notes,
        items: wizardItems.map((item) => ({
          accountId: item.accountId,
          debit: item.debit,
          credit: item.credit,
          description: item.description,
          referenceType: item.referenceType,
        })),
      }),
    onSuccess: (data: any) => {
      onSuccess(data.id);
      resetForm();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'فشل حفظ المسودة';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });

  const resetForm = () => {
    setStep(1);
    setBranchId('');
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setInventoryValue(0);
    setCashValue(0);
    setBankValue(0);
    setCustomersValue(0);
    setFixedAssetsValue(0);
    setSuppliersValue(0);
    setLoansValue(0);
  };

  const handleNext = () => {
    if (step === 1 && !branchId) {
      alert('يجب تحديد الفرع أولاً');
      return;
    }
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    if (!isBalanced) {
      alert('المستند غير متوازن حسابياً. تأكد من تطابق المدين مع الدائن.');
      return;
    }
    if (wizardItems.length === 0) {
      alert('لا توجد بنود صالحة للترحيل.');
      return;
    }
    if (hasMissingAccounts) {
      alert('دليل الحسابات لا يحتوي كل الحسابات الطرفية المطلوبة للقيم المدخلة. أكمل تهيئة دليل الحسابات أولاً.');
      return;
    }
    mutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="w-[820px] max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex justify-between items-center border-b border-slate-100 p-5">
          <div>
            <h2 className="text-xl font-bold text-slate-800">إدخال الأرصدة الافتتاحية للمنشأة</h2>
            <p className="text-xs text-slate-500">
              المرحلة {step} من 4 —{' '}
              {step === 1
                ? 'المعلومات الأساسية وتحديد الفرع'
                : step === 2
                ? 'الأصول والموجودات (مدين)'
                : step === 3
                ? 'الخصوم وحقوق الملكية (دائن)'
                : 'مراجعة اتزان القيد المحاسبي'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex-1 flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    s <= step ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {s < step ? <CheckCircle2 size={16} /> : s}
                </div>
                {s < 4 && (
                  <div className={`flex-1 h-1 rounded-full ${s < step ? 'bg-violet-600' : 'bg-slate-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الفرع التابع *</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200 cursor-pointer"
                >
                  <option value="">اختر الفرع المستهدف...</option>
                  {branchesData?.items?.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">تاريخ السريان المالي *</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">البيان العام / ملاحظات</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-violet-200"
                  placeholder="مثال: قيد افتتاح السنة المالية وبدء التشغيل الفعلي..."
                />
              </div>

              {suggested && (
                <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
                  <p className="text-xs font-bold text-violet-800 mb-1">💡 جلب ذكي للبيانات</p>
                  <p className="text-xs text-violet-700">
                    تم سحب أرصدة المخازن والعملاء المتاحة حالياً تلقائياً لتسهيل المطابقة.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-bold text-blue-800">
                  إجمالي الأصول (الجانب المدين): {totalDebit.toLocaleString()} ج.س
                </p>
              </div>

              <AssetInput
                label="رصيد المخزون الافتتاحي"
                icon={<Warehouse size={16} />}
                value={inventoryValue}
                onChange={setInventoryValue}
                hint="مجموع (الكمية × تكلفة الشراء) لكافة الدفعات الحالية"
              />

              <AssetInput
                label="النقدية بالخزينة (الصندوق)"
                icon={<Wallet size={16} />}
                value={cashValue}
                onChange={setCashValue}
                hint="المبلغ النقدي الفعلي في الخزينة والدرج"
              />

              <AssetInput
                label="الأرصدة البنكية"
                icon={<Banknote size={16} />}
                value={bankValue}
                onChange={setBankValue}
                hint="إجمالي الحسابات البنكية المفتوحة"
              />

              <AssetInput
                label="مديونيات العملاء (ذمم مدينة)"
                icon={<Users size={16} />}
                value={customersValue}
                onChange={setCustomersValue}
                hint="مستحقات الصيدلية لدى العملاء والشركات"
              />

              <AssetInput
                label="الأصول الثابتة والتجهيزات"
                icon={<Building2 size={16} />}
                value={fixedAssetsValue}
                onChange={setFixedAssetsValue}
                hint="أثاث، أجهزة طبية، مكيفات، وغيرها"
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                <p className="text-xs font-bold text-rose-800">
                  الخصوم وحقوق الملكية (الجانب الدائن)
                </p>
              </div>

              <AssetInput
                label="مستحقات الموردين (ذمم دائنة)"
                icon={<Building2 size={16} />}
                value={suppliersValue}
                onChange={setSuppliersValue}
                hint="المديونيات الواجب سدادها لشركات الأدوية والموزعين"
                variant="credit"
              />

              <AssetInput
                label="القروض والالتزامات الأخرى"
                icon={<Banknote size={16} />}
                value={loansValue}
                onChange={setLoansValue}
                hint="أي تمويلات أو التزامات مستقبلية"
                variant="credit"
              />

              <div className="p-4 bg-violet-50 border-2 border-violet-300 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-violet-800">رأس المال الافتتاحي المتوازن</p>
                    <p className="text-xs text-violet-600">المعادلة: الأصول - الخصوم = حقوق الملكية</p>
                  </div>
                  <p className="text-2xl font-black text-violet-700 font-mono">
                    {suggestedCapital.toLocaleString()} ج.س
                  </p>
                </div>
                {suggestedCapital < 0 && (
                  <p className="text-xs text-rose-600 mt-2 font-bold">
                    ⚠️ تنبيه: إجمالي الخصوم أكبر من الأصول (رأس مال سالب). يرجى التحقق من المدخلات.
                  </p>
                )}
                {suggestedCapital === 0 && totalDebit > 0 && (
                  <p className="text-xs text-amber-600 mt-2 font-bold">
                    ⚠️ رأس المال صفر! تأكد من إدخال جميع الأصول والخصوم.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg border ${isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-sm font-bold ${isBalanced ? 'text-emerald-800' : 'text-rose-800'}`}>
                    {isBalanced ? '✅ القيد المحاسبي متوازن' : '❌ لا يمكن الترحيل - تحقق من البيانات'}
                  </span>
                  <div className="text-sm font-mono font-bold">
                    <span className="text-slate-600 font-sans">المدين: </span>
                    <span className="text-slate-800">{totalDebit.toLocaleString()}</span>
                    <span className="text-slate-400 mx-2">|</span>
                    <span className="text-slate-600 font-sans">الدائن: </span>
                    <span className="text-slate-800">{(totalCredit + suggestedCapital).toLocaleString()}</span>
                  </div>
                </div>
                {!isBalanced && (
                  <p className="text-xs text-rose-700 mt-2">
                    {suggestedCapital < 0
                      ? 'رأس المال سالب — يجب أن تكون الأصول أكبر من الخصوم.'
                      : 'لا توجد قيم صالحة للحفظ.'}
                  </p>
                )}
              </div>

              {(() => {
                const requiredCodes = ['1-2-01', '1-1-01', '1-1-02', '1-1-04', '1-3-01', '2-1-01', '2-2-01', '3-1-01'];
                const missingCodes = requiredCodes.filter((code) => !findAccountByCode(code));

                if (missingCodes.length > 0) {
                  return (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
                      <AlertTriangle size={16} className="text-rose-600 mt-0.5" />
                      <div className="text-xs text-rose-800">
                        <p className="font-bold">⚠️ حسابات مفقودة من شجرة الحسابات:</p>
                        <p className="font-mono mt-1">{missingCodes.join(', ')}</p>
                        <p className="mt-1">يرجى إضافتها إلى شجرة الحسابات أولاً.</p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="py-2 px-3 text-right">الحساب المحاسبي</th>
                      <th className="py-2 px-3 text-right">البيان</th>
                      <th className="py-2 px-3 text-center">مدين</th>
                      <th className="py-2 px-3 text-center">دائن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wizardItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3">
                          <span className="font-mono text-slate-500 ml-1">{item.accountCode}</span>
                          <span className="text-slate-800 font-medium">{item.accountName}</span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">{item.description}</td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700">
                          {item.debit > 0 ? item.debit.toLocaleString() : '—'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-700">
                          {item.credit > 0 ? item.credit.toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                    <tr>
                      <td colSpan={2} className="py-2 px-3 text-left">الإجمالي المتوازن:</td>
                      <td className="py-2 px-3 text-center font-mono text-violet-700">
                        {totalDebit.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-violet-700">
                        {(totalCredit + suggestedCapital).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center border-t border-slate-100 p-4 bg-slate-50">
          <button
            onClick={step === 1 ? onClose : handleBack}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-white text-sm font-medium cursor-pointer"
          >
            <ArrowRight size={16} />
            {step === 1 ? 'إلغاء' : 'السابق'}
          </button>

          {step < 4 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 text-sm font-medium cursor-pointer"
            >
              التالي
              <ArrowLeft size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!isBalanced || hasMissingAccounts || mutation.isPending}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
            >
              <Save size={16} />
              {mutation.isPending ? 'جاري الحفظ...' : 'حفظ كمسودة للتأكيد'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const AssetInput: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  variant?: 'debit' | 'credit';
}> = ({ label, icon, value, onChange, hint, variant = 'debit' }) => {
  const color = variant === 'debit' ? 'text-blue-600' : 'text-rose-600';
  return (
    <div className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <label className="text-sm font-medium text-slate-700">{label}</label>
      </div>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0.00"
        className="w-full rounded-lg border border-slate-300 p-2 text-sm font-mono text-left focus:ring-2 focus:ring-violet-200 focus:border-violet-600"
      />
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
};
