import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  accountingReportsApi,
  TrialBalanceResponse,
  IncomeStatementResponse,
  BalanceSheetResponse,
  GeneralLedgerResponse,
} from '../api/accounting-reports';
import { accountsApi, AccountNode } from '../api/accounts';
import { PageHeader } from '../components/common/PageHeader';
import { getCurrentUser } from '../utils/permissions';
import { JournalEntryDetailModal } from '../components/accounting/JournalEntryDetailModal';
import {
  FileSpreadsheet,
  TrendingUp,
  Scale,
  BookOpen,
  Calendar,
  Filter,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  RefreshCw,
  ChevronLeft,
  Eye,
} from 'lucide-react';

type ReportTab = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'general-ledger';

interface AccountingReportsPageProps {
  defaultTab?: ReportTab;
}

export const AccountingReportsPage: React.FC<AccountingReportsPageProps> = ({ defaultTab }) => {
  const user = getCurrentUser();
  const companyId = user?.companyId || 'company-main';
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get('tab') as ReportTab;
  const queryAccountId = searchParams.get('accountId');
  const queryBranchId = searchParams.get('branchId') || user?.branchId || undefined;
  const queryFrom = searchParams.get('fromDate');
  const queryTo = searchParams.get('toDate');

  // الحالة العامة للتبويب والتواريخ
  const [activeTab, setActiveTab] = useState<ReportTab>(defaultTab || queryTab || 'trial-balance');

  // فلاتر دفتر الأستاذ
  const [selectedAccountId, setSelectedAccountId] = useState<string>(queryAccountId || '');

  // التواريخ الافتراضية: من أول السنة الحالية حتى اليوم (أو من معلمات الرابط)
  const currentYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState<string>(queryFrom || `${currentYear}-01-01`);
  const [toDate, setToDate] = useState<string>(queryTo || new Date().toISOString().split('T')[0]);
  const [asOfDate, setAsOfDate] = useState<string>(queryTo || new Date().toISOString().split('T')[0]);
  const [branchId, setBranchId] = useState<string | undefined>(queryBranchId || undefined);

  // مزامنة التبويب والحساب والتواريخ والفرع من معلمات الرابط (URL Search Params) لدعم الروابط المباشرة (Deep Linking)
  useEffect(() => {
    const tab = (searchParams.get('tab') as ReportTab) || defaultTab;
    if (tab) setActiveTab(tab);
    const accId = searchParams.get('accountId');
    if (accId) setSelectedAccountId(accId);
    const from = searchParams.get('fromDate');
    if (from) setFromDate(from);
    const to = searchParams.get('toDate');
    if (to) {
      setToDate(to);
      setAsOfDate(to);
    }
    const br = searchParams.get('branchId');
    if (br) setBranchId(br);
  }, [searchParams, defaultTab]);

  // دالة تبديل التبويب وتحديث الرابط مع الحفاظ على الفترة والفرع
  const handleTabChange = (tab: ReportTab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', tab);
      p.set('fromDate', fromDate);
      p.set('toDate', toDate);
      if (branchId) p.set('branchId', branchId);
      if (tab !== 'general-ledger') {
        p.delete('accountId');
      }
      return p;
    });
  };

  // دالة الانتقال المباشر من ميزان المراجعة إلى دفتر الأستاذ (Drill-Down)
  const handleAccountDrillDown = (accountId: string, _accountName?: string) => {
    if (!accountId) return;
    setSelectedAccountId(accountId);
    setActiveTab('general-ledger');
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', 'general-ledger');
      p.set('accountId', accountId);
      p.set('fromDate', fromDate);
      p.set('toDate', toDate);
      if (branchId) p.set('branchId', branchId);
      return p;
    });
  };

  // نافذة عرض تفاصيل القيد المحاسبي بالكامل (Drill-Down to Journal Entry)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState<boolean>(false);

  const handleEntryClick = (entryId?: string) => {
    if (!entryId) return;
    setSelectedEntryId(entryId);
    setIsEntryModalOpen(true);
  };

  // فلاتر ميزان المراجعة
  const [tbLevel, setTbLevel] = useState<number>(0); // 0 = كل المستويات
  const [showZeroBalances, setShowZeroBalances] = useState<boolean>(true);
  const [accountSearch, setAccountSearch] = useState<string>('');
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  // جلب قائمة الحسابات لدفتر الأستاذ
  const { data: accountsList } = useQuery({
    queryKey: ['accounts-leaf-list', companyId],
    queryFn: () => accountsApi.getAll({ companyId, isLeaf: true }),
    staleTime: 1000 * 60 * 5,
  });

  // اختيار أول حساب افتراضياً إذا لم يتم الاختيار
  React.useEffect(() => {
    if (!selectedAccountId && accountsList && accountsList.length > 0) {
      setSelectedAccountId(accountsList[0].id);
    }
  }, [accountsList, selectedAccountId]);

  // استعلام ميزان المراجعة
  const {
    data: trialBalance,
    isLoading: loadingTB,
    refetch: refetchTB,
  } = useQuery({
    queryKey: ['trial-balance', branchId, fromDate, toDate, tbLevel, showZeroBalances],
    queryFn: () =>
      accountingReportsApi.getTrialBalance({
        branchId,
        fromDate,
        toDate,
        level: tbLevel > 0 ? tbLevel : undefined,
        showZeroBalances: showZeroBalances ? 'true' : 'false',
      }),
    enabled: activeTab === 'trial-balance',
  });

  // استعلام قائمة الدخل
  const {
    data: incomeStatement,
    isLoading: loadingIncome,
    refetch: refetchIncome,
  } = useQuery({
    queryKey: ['income-statement', branchId, fromDate, toDate],
    queryFn: () => accountingReportsApi.getIncomeStatement({ branchId, fromDate, toDate }),
    enabled: activeTab === 'income-statement',
  });

  // استعلام الميزانية العمومية
  const {
    data: balanceSheet,
    isLoading: loadingBS,
    refetch: refetchBS,
  } = useQuery({
    queryKey: ['balance-sheet', branchId, asOfDate],
    queryFn: () => accountingReportsApi.getBalanceSheet({ branchId, asOfDate }),
    enabled: activeTab === 'balance-sheet',
  });

  // استعلام كشف الحساب / دفتر الأستاذ
  const {
    data: generalLedger,
    isLoading: loadingGL,
    refetch: refetchGL,
  } = useQuery({
    queryKey: ['general-ledger', selectedAccountId, branchId, fromDate, toDate],
    queryFn: () =>
      accountingReportsApi.getGeneralLedger(selectedAccountId, {
        branchId,
        fromDate,
        toDate,
        limit: 500,
      }),
    enabled: activeTab === 'general-ledger' && !!selectedAccountId,
  });

  // تصفية الحسابات في قائمة الاختيار
  const filteredAccounts = useMemo(() => {
    if (!accountsList) return [];
    if (!accountSearch.trim()) return accountsList;
    const term = accountSearch.toLowerCase();
    return accountsList.filter(
      (a) => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term),
    );
  }, [accountsList, accountSearch]);

  // دالة الطباعة السريعة
  const handlePrint = () => {
    window.print();
  };

  const [exportingExcel, setExportingExcel] = useState<boolean>(false);

  // دالة تصدير ملف Excel
  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      if (activeTab === 'trial-balance') {
        await accountingReportsApi.downloadExcel('trial-balance', {
          branchId,
          fromDate,
          toDate,
          level: tbLevel > 0 ? tbLevel : undefined,
          showZeroBalances: showZeroBalances ? 'true' : 'false',
        });
      } else if (activeTab === 'income-statement') {
        await accountingReportsApi.downloadExcel('income-statement', { branchId, fromDate, toDate });
      } else if (activeTab === 'balance-sheet') {
        await accountingReportsApi.downloadExcel('balance-sheet', { branchId, asOfDate });
      } else if (activeTab === 'general-ledger' && selectedAccountId) {
        await accountingReportsApi.downloadExcel(
          'general-ledger',
          { branchId, fromDate, toDate },
          selectedAccountId,
        );
      }
    } catch (err) {
      console.error('Excel export failed:', err);
      alert('فشل تصدير ملف Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  // دالة تصدير الـ PDF
  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      if (activeTab === 'trial-balance') {
        await accountingReportsApi.downloadPdf('trial-balance', {
          branchId,
          fromDate,
          toDate,
          level: tbLevel > 0 ? tbLevel : undefined,
          showZeroBalances: showZeroBalances ? 'true' : 'false',
        });
      } else if (activeTab === 'income-statement') {
        await accountingReportsApi.downloadPdf('income-statement', { branchId, fromDate, toDate });
      } else if (activeTab === 'balance-sheet') {
        await accountingReportsApi.downloadPdf('balance-sheet', { branchId, asOfDate });
      } else if (activeTab === 'general-ledger' && selectedAccountId) {
        await accountingReportsApi.downloadPdf(
          'general-ledger',
          { branchId, fromDate, toDate },
          selectedAccountId,
        );
      }
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('خدمة الـ PDF قيد الإعداد وسيتم تفعيل تنزيل المستند المباشر فوراً.');
    } finally {
      setExportingPdf(false);
    }
  };

  // تنسيق الأرقام مع فواصل الآلاف وخانتين عشريتين
  const fmt = (val?: number) => {
    if (val === undefined || val === null) return '-';
    if (Math.abs(val) < 0.005) return '-';
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const selectedAccount = useMemo(() => {
    return accountsList?.find((a) => a.id === selectedAccountId);
  }, [accountsList, selectedAccountId]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto min-h-screen text-slate-800 print:p-0 print:m-0 print:max-w-full print:bg-white" dir="rtl">
      {/* ترويسة رسمية للطباعة الورقية */}
      <div className="hidden print:block mb-6 text-center border-b-2 border-slate-800 pb-4">
        <h1 className="text-2xl font-black text-slate-900">مجموعة صيدليات داواكور العالمية</h1>
        <h2 className="text-base font-bold text-slate-700 mt-1">
          {activeTab === 'trial-balance' && 'تقرير ميزان المراجعة العام بالأرصدة والحركات'}
          {activeTab === 'income-statement' && 'قائمة الدخل ومجمع الأرباح والخسائر (P&L)'}
          {activeTab === 'balance-sheet' && `الميزانية العمومية والمركز المالي كما في ${asOfDate}`}
          {activeTab === 'general-ledger' &&
            `كشف حساب الأستاذ العام: ${selectedAccount ? `${selectedAccount.code} — ${selectedAccount.name}` : ''}`}
        </h2>
        <div className="mt-2 text-xs text-slate-600 flex justify-between px-2">
          <span>
            {activeTab === 'balance-sheet'
              ? `تاريخ المركز المالي: ${asOfDate}`
              : `الفترة من: ${fromDate} إلى: ${toDate}`}
          </span>
          <span>تاريخ الطباعة: {new Date().toLocaleString('ar-EG')}</span>
        </div>
      </div>

      {/* الترويسة الرئيسية */}
      <div className="print:hidden">
        <PageHeader
          title="مركز التقارير والقوائم المالية الختامية"
          subtitle="استعراض ميزان المراجعة، قائمة الدخل، الميزانية العمومية، وكشوفات دفتر الأستاذ بدقة القيد المزدوج"
          action={
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                طباعة التقرير
              </button>
              <button
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl shadow hover:bg-emerald-700 transition disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exportingExcel ? 'جاري التحميل...' : 'تصدير Excel 📊'}
              </button>
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#582949] rounded-xl shadow hover:bg-[#431f38] transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exportingPdf ? 'جاري التحميل...' : 'تصدير PDF 📥'}
              </button>
            </div>
          }
        />
      </div>

      {/* شريط التبويبات الرئيسي */}
      <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-slate-200 pb-2 print:hidden">
        <button
          onClick={() => handleTabChange('trial-balance')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'trial-balance'
              ? 'bg-[#582949] text-white shadow'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          ميزان المراجعة العام
        </button>

        <button
          onClick={() => handleTabChange('income-statement')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'income-statement'
              ? 'bg-[#582949] text-white shadow'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          قائمة الدخل والأرباح والخسائر
        </button>

        <button
          onClick={() => handleTabChange('balance-sheet')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'balance-sheet'
              ? 'bg-[#582949] text-white shadow'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Scale className="w-4 h-4" />
          الميزانية العمومية والمركز المالي
        </button>

        <button
          onClick={() => handleTabChange('general-ledger')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'general-ledger'
              ? 'bg-[#582949] text-white shadow'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          دفتر الأستاذ وكشف الحساب
        </button>
      </div>

      {/* شريط الفلاتر والمعايير */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {activeTab !== 'balance-sheet' ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">من تاريخ:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:outline-none focus:border-[#582949]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">إلى تاريخ:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:outline-none focus:border-[#582949]"
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">المركز المالي كما في تاريخ:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:outline-none focus:border-[#582949]"
              />
            </div>
          )}

          {/* فلاتر إضافية لميزان المراجعة */}
          {activeTab === 'trial-balance' && (
            <>
              <div className="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
                <span className="text-xs font-bold text-slate-500">المستوى:</span>
                <select
                  value={tbLevel}
                  onChange={(e) => setTbLevel(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:outline-none focus:border-[#582949]"
                >
                  <option value={0}>جميع المستويات</option>
                  <option value={1}>المستوى 1 (رئيسي)</option>
                  <option value={2}>المستوى 2 (فرعي)</option>
                  <option value={3}>المستوى 3 (تفصيلي)</option>
                  <option value={4}>المستوى 4 (تحليلي)</option>
                  <option value={5}>المستوى 5 (تشغيلي)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showZeroBalances}
                  onChange={(e) => setShowZeroBalances(e.target.checked)}
                  className="rounded text-[#582949] focus:ring-[#582949]"
                />
                عرض الحسابات الصفرية
              </label>
            </>
          )}

          {/* اختيار الحساب لدفتر الأستاذ */}
          {activeTab === 'general-ledger' && (
            <div className="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
              <span className="text-xs font-bold text-slate-500">الحساب:</span>
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedAccountId(newId);
                  setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('tab', 'general-ledger');
                    p.set('accountId', newId);
                    return p;
                  });
                }}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:outline-none focus:border-[#582949] max-w-[280px]"
              >
                {selectedAccountId && !accountsList?.some((a) => a.id === selectedAccountId) && (
                  <option value={selectedAccountId}>
                    {trialBalance?.data?.find((r) => r.accountId === selectedAccountId)?.accountCode || ''} - {trialBalance?.data?.find((r) => r.accountId === selectedAccountId)?.accountName || 'الحساب المحدد'}
                  </option>
                )}
                {accountsList?.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (activeTab === 'trial-balance') refetchTB();
            if (activeTab === 'income-statement') refetchIncome();
            if (activeTab === 'balance-sheet') refetchBS();
            if (activeTab === 'general-ledger') refetchGL();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث البيانات
        </button>
      </div>

      {/* ترويسة خاصة للطباعة فقط */}
      <div className="hidden print:block mb-8 text-center border-b-2 border-slate-900 pb-4">
        <h2 className="text-xl font-black text-slate-900">مجموعة صيدليات داواكور العالمية</h2>
        <h1 className="text-lg font-bold text-slate-800 mt-1">
          {activeTab === 'trial-balance' && 'ميزان المراجعة العام بالأرصدة والحركات'}
          {activeTab === 'income-statement' && 'قائمة الدخل ومجمع الأرباح والخسائر'}
          {activeTab === 'balance-sheet' && `الميزانية العمومية والمركز المالي - كما في ${asOfDate}`}
          {activeTab === 'general-ledger' && `دفتر الأستاذ وكشف حساب: ${generalLedger?.account?.name || ''}`}
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          {activeTab !== 'balance-sheet' ? `للفترة من ${fromDate} إلى ${toDate}` : `تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}`}
        </p>
      </div>

      {/* ========================================================= */}
      {/* 1. تبويب ميزان المراجعة */}
      {/* ========================================================= */}
      {activeTab === 'trial-balance' && (
        <div>
          {loadingTB ? (
            <div className="p-12 text-center text-slate-500 font-bold animate-pulse">
              جاري حساب وتجميع ميزان المراجعة...
            </div>
          ) : !trialBalance || trialBalance.data.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
              لا توجد قيود أو حسابات مطابقة لمعايير البحث المحددة.
            </div>
          ) : (
            <div className="space-y-4">
              {/* شريط حالة التوازن */}
              <div
                className={`flex items-center justify-between p-4 rounded-2xl border ${
                  trialBalance.totals.isBalanced
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  {trialBalance.totals.isBalanced ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                  )}
                  <div>
                    <h3 className="text-sm font-bold">
                      {trialBalance.totals.isBalanced
                        ? 'ميزان المراجعة متزن رياضياً ومحاسبياً بنسبة 100%'
                        : 'تنبيه: ميزان المراجعة غير متزن! يوجد فارق في أطراف القيد'}
                    </h3>
                    <p className="text-xs opacity-80">
                      إجمالي الحركات: {fmt(trialBalance.totals.movementDebit)} ر.س | فارق الأرصدة:{' '}
                      {fmt(trialBalance.totals.difference)} ر.س
                    </p>
                  </div>
                </div>
                <div className="text-left font-mono font-bold text-sm">
                  {trialBalance.totals.isBalanced ? 'BALANCED' : 'UNBALANCED'}
                </div>
              </div>

              {/* جدول ميزان المراجعة */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead>
                      <tr className="bg-[#582949] text-white font-bold border-b border-[#431f38]">
                        <th rowSpan={2} className="p-3 border-l border-white/20">كود الحساب</th>
                        <th rowSpan={2} className="p-3 border-l border-white/20">اسم الحساب</th>
                        <th rowSpan={2} className="p-3 border-l border-white/20 text-center">النوع</th>
                        <th colSpan={2} className="p-2 border-l border-white/20 text-center bg-[#431f38]">الرصيد الافتتاحي</th>
                        <th colSpan={2} className="p-2 border-l border-white/20 text-center bg-[#36182c]">حركات الفترة</th>
                        <th colSpan={2} className="p-2 border-l border-white/20 text-center bg-[#431f38]">الرصيد الختامي</th>
                        <th rowSpan={2} className="p-3 text-center w-24">كشف الحساب</th>
                      </tr>
                      <tr className="bg-[#431f38] text-white text-[11px] font-bold">
                        <th className="p-2 border-l border-white/20 text-center">مدين</th>
                        <th className="p-2 border-l border-white/20 text-center">دائن</th>
                        <th className="p-2 border-l border-white/20 text-center">مدين</th>
                        <th className="p-2 border-l border-white/20 text-center">دائن</th>
                        <th className="p-2 border-l border-white/20 text-center">مدين</th>
                        <th className="p-2 text-center">دائن</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {trialBalance.data.map((row) => {
                        const isClickable = Boolean(row.accountId && row.isLeaf !== false);
                        return (
                          <tr
                            key={row.accountId || `tb-row-${row.accountCode}`}
                            onClick={() => {
                              if (!isClickable) return;
                              handleAccountDrillDown(row.accountId, row.accountName);
                            }}
                            className={`transition-colors font-mono ${
                              isClickable
                                ? 'hover:bg-purple-50/70 cursor-pointer group'
                                : 'bg-slate-50/50 cursor-default opacity-85'
                            }`}
                            title={
                              isClickable
                                ? 'انقر لعرض كشف حساب الأستاذ العام'
                                : row.isLeaf === false
                                ? 'حساب رئيسي (تجميعي) — لا توجد قيود مباشرة'
                                : 'حساب تجميعي'
                            }
                          >
                            <td className="p-3 font-bold text-[#582949] border-l border-slate-100">
                              <div className="flex items-center justify-between">
                                <span>{row.accountCode}</span>
                                {isClickable && (
                                  <ChevronLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-[#582949] transition-opacity" />
                                )}
                              </div>
                            </td>
                            <td
                              className={`p-3 font-sans font-bold border-l border-slate-100 ${
                                isClickable
                                  ? 'text-slate-800 group-hover:text-[#582949] transition-colors'
                                  : 'text-slate-600'
                              }`}
                            >
                              {row.accountName}
                            </td>
                            <td className="p-3 font-sans text-center text-slate-500 border-l border-slate-100">
                              {row.accountType}
                            </td>
                            <td className="p-3 text-left border-l border-slate-100 text-slate-700">
                              {fmt(row.openingDebit)}
                            </td>
                            <td className="p-3 text-left border-l border-slate-100 text-slate-700">
                              {fmt(row.openingCredit)}
                            </td>
                            <td className="p-3 text-left border-l border-slate-100 font-bold text-blue-700">
                              {fmt(row.movementDebit)}
                            </td>
                            <td className="p-3 text-left border-l border-slate-100 font-bold text-indigo-700">
                              {fmt(row.movementCredit)}
                            </td>
                            <td className="p-3 text-left border-l border-slate-100 font-bold text-emerald-700">
                              {fmt(row.closingDebit)}
                            </td>
                            <td className="p-3 text-left border-l border-slate-100 font-bold text-rose-700">
                              {fmt(row.closingCredit)}
                            </td>
                            <td className="p-2 text-center">
                              {isClickable ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAccountDrillDown(row.accountId, row.accountName);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-semibold rounded-lg bg-[#582949]/10 text-[#582949] group-hover:bg-[#582949] group-hover:text-white transition-all shadow-sm"
                                  title="عرض كشف حساب الأستاذ العام"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>كشف</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-sans px-2 py-0.5 rounded bg-slate-100">
                                  رئيسي
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300 font-mono">
                        <td colSpan={3} className="p-3 text-center font-sans text-xs border-l border-slate-200">
                          الإجمالي الكلي العام
                        </td>
                        <td className="p-3 text-left border-l border-slate-200">
                          {fmt(trialBalance.totals.openingDebit)}
                        </td>
                        <td className="p-3 text-left border-l border-slate-200">
                          {fmt(trialBalance.totals.openingCredit)}
                        </td>
                        <td className="p-3 text-left border-l border-slate-200 text-blue-800 font-black">
                          {fmt(trialBalance.totals.movementDebit)}
                        </td>
                        <td className="p-3 text-left border-l border-slate-200 text-indigo-800 font-black">
                          {fmt(trialBalance.totals.movementCredit)}
                        </td>
                        <td className="p-3 text-left border-l border-slate-200 text-emerald-800 font-black">
                          {fmt(trialBalance.totals.closingDebit)}
                        </td>
                        <td className="p-3 text-left border-l border-slate-200 text-rose-800 font-black">
                          {fmt(trialBalance.totals.closingCredit)}
                        </td>
                        <td className="p-3 text-center text-slate-400 font-sans text-[11px]">
                          -
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. تبويب قائمة الدخل والأرباح والخسائر */}
      {/* ========================================================= */}
      {activeTab === 'income-statement' && (
        <div>
          {loadingIncome ? (
            <div className="p-12 text-center text-slate-500 font-bold animate-pulse">
              جاري حساب الإيرادات والتكاليف وقائمة الدخل...
            </div>
          ) : !incomeStatement ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
              لا توجد بيانات متاحة لقائمة الدخل في هذه الفترة.
            </div>
          ) : (
            <div className="space-y-6">
              {/* بطاقات المؤشرات المالية الرئيسية (KPIs) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-bold text-slate-500 mb-1">إجمالي الإيرادات والمبيعات</div>
                  <div className="text-xl font-black text-emerald-700 font-mono">
                    {fmt(incomeStatement.revenues.total)} <span className="text-xs font-sans text-slate-500">ر.س</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-bold text-slate-500 mb-1">تكلفة البضاعة المباعة (COGS)</div>
                  <div className="text-xl font-black text-amber-700 font-mono">
                    {fmt(incomeStatement.costOfGoodsSold.total)} <span className="text-xs font-sans text-slate-500">ر.س</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-bold text-slate-500 mb-1">مجمل الربح (Gross Profit)</div>
                  <div className="text-xl font-black text-indigo-700 font-mono">
                    {fmt(incomeStatement.grossProfit)} <span className="text-xs font-sans text-slate-500">ر.س</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 mt-1">
                    الهامش: {incomeStatement.grossProfitMargin}%
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-bold text-slate-500 mb-1">المصروفات التشغيلية (OpEx)</div>
                  <div className="text-xl font-black text-rose-700 font-mono">
                    {fmt(incomeStatement.operatingExpenses.total)} <span className="text-xs font-sans text-slate-500">ر.س</span>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border shadow-sm ${
                    incomeStatement.netProfit >= 0
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-600 mb-1">صافي النتيجة التشغيلية</div>
                  <div
                    className={`text-xl font-black font-mono ${
                      incomeStatement.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                    }`}
                  >
                    {fmt(incomeStatement.netProfit)} <span className="text-xs font-sans">ر.س</span>
                  </div>
                  <div className="text-[11px] font-bold mt-1">
                    {incomeStatement.status === 'PROFIT' && '🟢 صافي أرباح تشغيلية'}
                    {incomeStatement.status === 'LOSS' && '🔴 صافي خسارة'}
                    {incomeStatement.status === 'BREAK_EVEN' && '⚪ نقطة التعادل'}
                    <span className="mr-1">({incomeStatement.netProfitMargin}%)</span>
                  </div>
                </div>
              </div>

              {/* تفاصيل بنود قائمة الدخل */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* قسم الإيرادات */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
                    <h3 className="font-bold text-emerald-900 text-sm">1. بنود الإيرادات والمبيعات</h3>
                    <span className="font-mono font-bold text-emerald-800">
                      {fmt(incomeStatement.revenues.total)} ر.س
                    </span>
                  </div>
                  <div className="p-4 divide-y divide-slate-100 text-xs">
                    {incomeStatement.revenues.items.length === 0 ? (
                      <p className="text-slate-400 text-center py-4">لا توجد إيرادات مسجلة</p>
                    ) : (
                      incomeStatement.revenues.items.map((item) => (
                        <div key={item.accountId} className="flex items-center justify-between py-2">
                          <span className="font-medium text-slate-800">
                            <span className="font-mono text-slate-400 ml-2">[{item.accountCode}]</span>
                            {item.accountName}
                          </span>
                          <span className="font-mono font-bold text-emerald-700">{fmt(item.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* قسم تكلفة المبيعات والمصروفات */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-rose-50/60 border-b border-rose-100 flex items-center justify-between">
                    <h3 className="font-bold text-rose-900 text-sm">2. تكلفة النشاط والمصروفات</h3>
                    <span className="font-mono font-bold text-rose-800">
                      {fmt(incomeStatement.costOfGoodsSold.total + incomeStatement.operatingExpenses.total)} ر.س
                    </span>
                  </div>
                  <div className="p-4 divide-y divide-slate-100 text-xs">
                    <div className="pb-2 font-bold text-slate-700">تكلفة البضاعة المباعة (COGS):</div>
                    {incomeStatement.costOfGoodsSold.items.map((item) => (
                      <div key={item.accountId} className="flex items-center justify-between py-1.5 pr-2">
                        <span className="text-slate-700">
                          <span className="font-mono text-slate-400 ml-2">[{item.accountCode}]</span>
                          {item.accountName}
                        </span>
                        <span className="font-mono font-bold text-amber-700">{fmt(item.amount)}</span>
                      </div>
                    ))}

                    <div className="pt-3 pb-2 font-bold text-slate-700">المصروفات التشغيلية والعمومية:</div>
                    {incomeStatement.operatingExpenses.items.map((item) => (
                      <div key={item.accountId} className="flex items-center justify-between py-1.5 pr-2">
                        <span className="text-slate-700">
                          <span className="font-mono text-slate-400 ml-2">[{item.accountCode}]</span>
                          {item.accountName}
                        </span>
                        <span className="font-mono font-bold text-rose-700">{fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. تبويب الميزانية العمومية والمركز المالي */}
      {/* ========================================================= */}
      {activeTab === 'balance-sheet' && (
        <div>
          {loadingBS ? (
            <div className="p-12 text-center text-slate-500 font-bold animate-pulse">
              جاري تدقيق الأصول والخصوم وحقوق الملكية...
            </div>
          ) : !balanceSheet ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
              لا توجد بيانات متاحة للميزانية العمومية في التاريخ المحدد.
            </div>
          ) : (
            <div className="space-y-6">
              {/* شريط التحقق من توازن المعادلة المحاسبية */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between ${
                  balanceSheet.isBalanced
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h3 className="text-sm font-bold">
                      المعادلة المحاسبية متطابقة: [إجمالي الأصول = إجمالي الخصوم + حقوق الملكية]
                    </h3>
                    <p className="text-xs opacity-80">
                      قيمة الطرفين: {fmt(balanceSheet.totalAssets)} ر.س | الفارق الدفتري: {fmt(balanceSheet.difference)} ر.س
                    </p>
                  </div>
                </div>
                <div className="text-left font-mono font-black text-emerald-800 text-sm">
                  100% MATCHED
                </div>
              </div>

              {/* بطاقات مقارنة طرفي المركز المالي */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* الطرف الأيمن: الأصول */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-[#582949] text-white flex items-center justify-between">
                    <h3 className="font-bold text-sm">جانب الأصول (Assets)</h3>
                    <span className="font-mono font-bold text-emerald-300 text-base">
                      {fmt(balanceSheet.totalAssets)} ر.س
                    </span>
                  </div>

                  <div className="p-4 space-y-4 text-xs">
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 font-bold text-slate-700">
                        <span>بنود الأصول المسجلة (Assets)</span>
                        <span className="font-mono text-emerald-700">
                          {fmt(balanceSheet.assets.total)} ر.س
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {balanceSheet.assets.items.length === 0 ? (
                          <p className="text-slate-400 text-center py-2">لا توجد أصول مسجلة</p>
                        ) : (
                          balanceSheet.assets.items.map((item) => (
                            <div key={item.accountId} className="flex items-center justify-between py-2">
                              <span className="text-slate-700">
                                <span className="font-mono text-slate-400 ml-2">[{item.accountCode}]</span>
                                {item.accountName}
                              </span>
                              <span className="font-mono font-bold text-slate-900">{fmt(item.balance)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* الطرف الأيسر: الالتزامات وحقوق الملكية */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
                    <h3 className="font-bold text-sm">الخصوم وحقوق الملكية (Liabilities & Equity)</h3>
                    <span className="font-mono font-bold text-emerald-400 text-base">
                      {fmt(balanceSheet.totalLiabilitiesAndEquity)} ر.س
                    </span>
                  </div>

                  <div className="p-4 space-y-4 text-xs">
                    {/* الالتزامات */}
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 font-bold text-slate-700">
                        <span>الالتزامات والخصوم (Liabilities)</span>
                        <span className="font-mono text-rose-700">
                          {fmt(balanceSheet.liabilities.total)} ر.س
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {balanceSheet.liabilities.items.length === 0 ? (
                          <p className="text-slate-400 text-center py-2">لا توجد خصوم أو التزامات قائمة</p>
                        ) : (
                          balanceSheet.liabilities.items.map((item) => (
                            <div key={item.accountId} className="flex items-center justify-between py-2">
                              <span className="text-slate-700">
                                <span className="font-mono text-slate-400 ml-2">[{item.accountCode}]</span>
                                {item.accountName}
                              </span>
                              <span className="font-mono font-bold text-rose-700">{fmt(item.balance)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* حقوق الملكية */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 font-bold text-slate-700">
                        <span>حقوق الملكية والأرباح (Equity)</span>
                        <span className="font-mono text-indigo-700">
                          {fmt(balanceSheet.equity.total)} ر.س
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {balanceSheet.equity.items.map((item) => (
                          <div key={item.accountId} className="flex items-center justify-between py-2">
                            <span className="text-slate-700">
                              <span className="font-mono text-slate-400 ml-2">[{item.accountCode}]</span>
                              {item.accountName}
                            </span>
                            <span className="font-mono font-bold text-indigo-800">{fmt(item.balance)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. تبويب كشف الحساب ودفتر الأستاذ */}
      {/* ========================================================= */}
      {activeTab === 'general-ledger' && (
        <div>
          {loadingGL ? (
            <div className="p-12 text-center text-slate-500 font-bold animate-pulse">
              جاري جلب تفاصيل حركات دفتر الأستاذ...
            </div>
          ) : !generalLedger ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
              يرجى اختيار الحساب المطلوب لعرض كشف الحساب التفصيلي.
            </div>
          ) : (
            <div className="space-y-4">
              {/* بطاقة ملخص الحساب */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => handleTabChange('trial-balance')}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#582949] bg-[#582949]/10 hover:bg-[#582949] hover:text-white rounded-xl transition border border-[#582949]/20 shadow-sm print:hidden group"
                    title="الرجوع إلى تقرير ميزان المراجعة"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>ميزان المراجعة</span>
                    <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-[#582949]/10 text-[#582949] font-mono font-bold text-xs">
                        {generalLedger.account.code}
                      </span>
                      <h2 className="text-base font-black text-slate-900">{generalLedger.account.name}</h2>
                      <span className="text-xs text-slate-400">({generalLedger.account.type})</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      عدد الحركات المسجلة في الفترة: {generalLedger.totals.entriesCount} قيد
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-bold">الرصيد الافتتاحي</span>
                    <span className="font-mono font-bold text-slate-800">
                      {fmt(generalLedger.openingBalance.net)} ر.س
                    </span>
                  </div>

                  <div className="bg-blue-50 px-3 py-2 rounded-xl border border-blue-200">
                    <span className="text-blue-600 block text-[10px] font-bold">إجمالي المدين</span>
                    <span className="font-mono font-bold text-blue-800">
                      {fmt(generalLedger.totals.totalDebit)} ر.س
                    </span>
                  </div>

                  <div className="bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-200">
                    <span className="text-indigo-600 block text-[10px] font-bold">إجمالي الدائن</span>
                    <span className="font-mono font-bold text-indigo-800">
                      {fmt(generalLedger.totals.totalCredit)} ر.س
                    </span>
                  </div>

                  <div className="bg-[#582949]/10 px-4 py-2 rounded-xl border border-[#582949]/20">
                    <span className="text-[#582949] block text-[10px] font-bold">الرصيد الختامي الصافي</span>
                    <span className="font-mono font-black text-[#582949] text-sm">
                      {fmt(generalLedger.closingBalance.net)} ر.س
                    </span>
                  </div>
                </div>
              </div>

              {/* جدول حركات دفتر الأستاذ */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="p-3">التاريخ</th>
                        <th className="p-3">رقم القيد</th>
                        <th className="p-3">البيان والوصف</th>
                        <th className="p-3 text-center">المصدر</th>
                        <th className="p-3 text-left">مدين</th>
                        <th className="p-3 text-left">دائن</th>
                        <th className="p-3 text-left">الرصيد التراكمي</th>
                        <th className="p-3 text-center w-20">عرض القيد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {/* سطر الرصيد الافتتاحي */}
                      <tr className="bg-slate-50/70 italic text-slate-500 font-sans">
                        <td className="p-3 font-mono">{fromDate}</td>
                        <td className="p-3">-</td>
                        <td className="p-3 font-bold text-slate-700">الرصيد الافتتاحي المنقول</td>
                        <td className="p-3 text-center">-</td>
                        <td className="p-3 text-left font-mono">{fmt(generalLedger.openingBalance.debit)}</td>
                        <td className="p-3 text-left font-mono">{fmt(generalLedger.openingBalance.credit)}</td>
                        <td className="p-3 text-left font-mono font-bold text-slate-800">
                          {fmt(generalLedger.openingBalance.net)}
                        </td>
                        <td className="p-3 text-center text-slate-400 font-sans text-xs">-</td>
                      </tr>

                      {generalLedger.entries.map((entry) => (
                        <tr
                          key={entry.journalEntryId + entry.date}
                          onClick={() => handleEntryClick(entry.journalEntryId)}
                          className="hover:bg-purple-50/70 transition-colors cursor-pointer group"
                          title="انقر لعرض تفاصيل القيد كاملاً"
                        >
                          <td className="p-3 text-slate-600">{entry.date.split('T')[0]}</td>
                          <td className="p-3 font-bold text-[#582949]">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span>{entry.entryNumber}</span>
                              <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-[#582949] transition-opacity" />
                            </div>
                          </td>
                          <td className="p-3 font-sans text-slate-800 font-medium group-hover:text-[#582949] transition-colors">
                            {entry.description || entry.lineNotes || '-'}
                          </td>
                          <td className="p-3 font-sans text-center">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                              {entry.source}
                            </span>
                          </td>
                          <td className="p-3 text-left text-blue-700 font-bold">{fmt(entry.debit)}</td>
                          <td className="p-3 text-left text-indigo-700 font-bold">{fmt(entry.credit)}</td>
                          <td
                            className={`p-3 text-left font-bold ${
                              entry.runningBalance >= 0 ? 'text-slate-900' : 'text-rose-600'
                            }`}
                          >
                            {fmt(entry.runningBalance)}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEntryClick(entry.journalEntryId);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-semibold rounded-lg bg-[#582949]/10 text-[#582949] group-hover:bg-[#582949] group-hover:text-white transition-all shadow-sm"
                              title="عرض تفاصيل القيد بالكامل"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>عرض</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* نافذة تفاصيل القيد المحاسبي بالكامل */}
      {isEntryModalOpen && selectedEntryId && (
        <JournalEntryDetailModal
          entryId={selectedEntryId}
          onClose={() => {
            setIsEntryModalOpen(false);
            setSelectedEntryId(null);
          }}
        />
      )}
    </div>
  );
};
