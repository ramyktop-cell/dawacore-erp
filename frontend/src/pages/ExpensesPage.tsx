import React, { useState, useEffect } from 'react';
import { expensesApi, Expense, ExpenseStats } from '../api/expenses';
import { ExpenseFormModal } from '../components/expenses/ExpenseFormModal';
import { RejectExpenseModal } from '../components/expenses/RejectExpenseModal';
import { ExpensePrintModal } from '../components/expenses/ExpensePrintModal';
import { usePosStore } from '../stores/pos.store';
import { useAuthStore } from '../stores/auth.store';

export const ExpensesPage: React.FC = () => {
  const { user } = useAuthStore();
  const pos = usePosStore();
  const companyId = user?.companyId || '';
  const branchId = user?.branchId || '';
  const activeShiftId =
    pos.cashierId === user?.id && pos.branchId === branchId ? pos.activeShiftId : null;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [destinationFilter, setDestinationFilter] = useState<'ALL' | 'CASH' | 'BANK'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'EXPENSE' | 'LIABILITY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [rejectingExpense, setRejectingExpense] = useState<Expense | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [selectedExpenseForPrint, setSelectedExpenseForPrint] = useState<Expense | null>(null);

  const loadData = async () => {
    if (!companyId) {
      setExpenses([]);
      setStats(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [list, statsData] = await Promise.all([
        expensesApi.getAll({
          companyId,
          branchId: branchId || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          paidFrom: destinationFilter !== 'ALL' ? destinationFilter : undefined,
          category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        }),
        expensesApi.getStats({ companyId, branchId: branchId || undefined }),
      ]);
      setExpenses(list);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load expenses data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId, branchId, statusFilter, destinationFilter, categoryFilter]);

  const handleApprove = async (id: string) => {
    try {
      setApprovingId(id);
      await expensesApi.approve(id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'فشل اعتماد سند الصرف');
    } finally {
      setApprovingId(null);
    }
  };

  const filteredExpenses = expenses.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.expenseNumber.toLowerCase().includes(query) ||
      item.expenseType.toLowerCase().includes(query) ||
      (item.paidTo && item.paidTo.toLowerCase().includes(query)) ||
      (item.account?.name && item.account.name.toLowerCase().includes(query)) ||
      (item.account?.code && item.account.code.toLowerCase().includes(query)) ||
      (item.description && item.description.toLowerCase().includes(query)) ||
      (item.referenceNo && item.referenceNo.toLowerCase().includes(query))
    );
  });

  return (
    <div className="p-6 space-y-6 font-sans" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-50 text-2xl text-[#582949] shadow-inner">
            📤
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">سندات الصرف والمدفوعات (المصروفات والالتزامات)</h1>
            <p className="text-xs font-bold text-slate-400">
              صرف المصروفات التشغيلية وسداد التزامات ومستحقات الموردين والجهات الخارجية من الخزينة أو البنك
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#582949] px-5 py-2.5 text-xs font-black text-white hover:bg-[#481D3E] shadow-md transition cursor-pointer"
        >
          <span>➕</span>
          <span>إصدار سند صرف جديد</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">إجمالي المنصرف المعتمد</span>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black font-mono text-[#582949]">
              {(stats?.approvedTotalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-xs font-bold text-slate-500">ج.س</span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold block mt-1">{stats?.approvedCount || 0} سند معتمد ومصروف</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">المنصرف من الخزينة نقداً</span>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black font-mono text-amber-700">
              {(stats?.approvedCashAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-xs font-bold text-slate-500">ج.س</span>
          </div>
          <span className="text-[10px] text-amber-600 font-bold block mt-1">💵 نقدية الخزينة والصناديق</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">المنصرف من الحسابات البنكية</span>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black font-mono text-blue-700">
              {(stats?.approvedBankAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-xs font-bold text-slate-500">ج.س</span>
          </div>
          <span className="text-[10px] text-blue-600 font-bold block mt-1">🏦 تحويلات وشيكات بنكية</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-xs">
          <span className="text-[11px] font-bold text-amber-800 block mb-1">بانتظار اعتماد الإدارة</span>
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black font-mono text-amber-700">
              {(stats?.pendingAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-xs font-bold text-amber-800">ج.س</span>
          </div>
          <span className="text-[10px] text-amber-700 font-bold block mt-1">{stats?.pendingCount || 0} سند معلق يحتاج اعتماد</span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* فلتر جهة الصرف */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setDestinationFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                destinationFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              كافة المصادر
            </button>
            <button
              onClick={() => setDestinationFilter('CASH')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                destinationFilter === 'CASH'
                  ? 'bg-[#582949] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              💵 الخزينة
            </button>
            <button
              onClick={() => setDestinationFilter('BANK')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                destinationFilter === 'BANK'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏦 البنك
            </button>
          </div>

          {/* فلتر تصنيف السند */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                categoryFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              كافة الأغراض
            </button>
            <button
              onClick={() => setCategoryFilter('EXPENSE')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                categoryFilter === 'EXPENSE'
                  ? 'bg-[#582949] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              💼 مصروفات تشغيلية
            </button>
            <button
              onClick={() => setCategoryFilter('LIABILITY')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                categoryFilter === 'LIABILITY'
                  ? 'bg-[#00A8A8] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🤝 سداد التزامات وموردين
            </button>
          </div>

          {/* فلتر الحالة */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-[#582949] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setStatusFilter('APPROVED')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'APPROVED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              معتمد
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              معلق ({stats?.pendingCount || 0})
            </button>
          </div>
        </div>

        <div className="w-full lg:w-72">
          <input
            type="text"
            placeholder="بحث بالرقم، البند، المستفيد، الحساب..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:border-[#582949] focus:outline-none"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">رقم السند والتاريخ</th>
                <th className="p-3.5">بند الصرف والغرض</th>
                <th className="p-3.5">المدفوع له / المستفيد</th>
                <th className="p-3.5">الحساب في الشجرة</th>
                <th className="p-3.5">جهة الصرف</th>
                <th className="p-3.5">المبلغ</th>
                <th className="p-3.5">المرجع / الشيك</th>
                <th className="p-3.5">المُنشئ</th>
                <th className="p-3.5">حالة الاعتماد</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400 font-bold">
                    جاري تحميل سندات الصرف والمدفوعات...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400 font-bold">
                    لا توجد سندات صرف مطابقة للفلاتر الحالية
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3.5 font-bold">
                      <div className="text-[#582949] font-black">{exp.expenseNumber}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(exp.createdAt).toLocaleDateString('ar-EG')}
                      </div>
                    </td>

                    <td className="p-3.5 font-bold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span>{exp.expenseType}</span>
                        {exp.category === 'LIABILITY' && (
                          <span className="rounded bg-teal-50 px-1.5 py-0.2 text-[9px] font-black text-[#00A8A8] border border-teal-200">
                            سداد التزام
                          </span>
                        )}
                      </div>
                      {exp.description && (
                        <div className="text-[10px] font-normal text-slate-500 max-w-xs truncate mt-0.5" title={exp.description}>
                          {exp.description}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 font-bold text-slate-700">
                      {exp.paidTo || '—'}
                    </td>

                    <td className="p-3.5 font-bold">
                      <span className="inline-block rounded bg-purple-50 px-2 py-0.5 text-[10px] font-black text-[#582949]">
                        {exp.account?.code}
                      </span>
                      <div className="text-slate-700 text-[11px] mt-0.5">{exp.account?.name}</div>
                    </td>

                    <td className="p-3.5 font-bold">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
                          exp.paidFrom === 'BANK'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {exp.paidFrom === 'BANK' ? '🏦 بنك' : '💵 خزينة'}
                      </span>
                      {exp.shift && (
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          وردية #{exp.shift.shiftNumber}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 font-mono font-black text-sm text-[#582949]">
                      {Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td className="p-3.5 font-mono text-[11px] text-slate-500">
                      {exp.referenceNo || '—'}
                    </td>

                    <td className="p-3.5 font-bold text-slate-600">
                      <div>{exp.creator?.name || 'غير معروف'}</div>
                    </td>

                    <td className="p-3.5">
                      {exp.status === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 border border-emerald-200">
                          <span>✓</span> معتمد ومصروف
                        </span>
                      )}
                      {exp.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700 border border-amber-200 animate-pulse">
                          <span>⏳</span> بانتظار الاعتماد
                        </span>
                      )}
                      {exp.status === 'REJECTED' && (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-black text-rose-700 border border-rose-200">
                            <span>✕</span> مرفوض
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedExpenseForPrint(exp)}
                          title="معاينة وطباعة سند الصرف"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#582949] hover:border-pink-300 transition cursor-pointer"
                        >
                          🖨️
                        </button>
                        {exp.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleApprove(exp.id)}
                              disabled={approvingId === exp.id}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                              title="اعتماد وصرف السند وإنشاء القيد المحاسبي"
                            >
                              {approvingId === exp.id ? '...' : 'اعتماد'}
                            </button>
                            <button
                              onClick={() => setRejectingExpense(exp)}
                              className="rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 text-[10px] font-black transition cursor-pointer"
                              title="رفض السند مع ذكر السبب"
                            >
                              رفض
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <ExpenseFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={loadData}
        companyId={companyId}
        branchId={branchId}
        shiftId={activeShiftId || undefined}
      />

      <RejectExpenseModal
        isOpen={!!rejectingExpense}
        expense={rejectingExpense}
        onClose={() => setRejectingExpense(null)}
        onSuccess={loadData}
      />

      <ExpensePrintModal
        isOpen={!!selectedExpenseForPrint}
        onClose={() => setSelectedExpenseForPrint(null)}
        expense={selectedExpenseForPrint}
      />
    </div>
  );
};

export default ExpensesPage;
