import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { BranchStockReportPage } from './pages/reports/BranchStockReportPage';
import { PosPage } from './pages/PosPage';
import { CustomerDisplayPage } from './pages/CustomerDisplayPage';
import { CustomerStatementPage } from './pages/CustomerStatementPage';
import { CustomersPage } from './pages/CustomersPage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { BranchesPage } from './pages/BranchesPage';
import { ShiftsPage } from './pages/ShiftsPage';
import { SalesInvoicesPage } from './pages/SalesInvoicesPage';
import { PurchasingOrdersPage } from './pages/PurchasingOrdersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { JournalEntriesPage } from './pages/JournalEntriesPage';
import { AccountsPage } from './pages/AccountsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { MedicinesPage } from './pages/MedicinesPage';
import { BatchesPage } from './pages/BatchesPage';
import { TransfersPage } from './pages/TransfersPage';
import { StockCountPage } from './pages/StockCountPage';
import { CountSheetPage } from './pages/CountSheetPage';
import { OpeningBalancePage } from './pages/opening-balance/OpeningBalancePage';
import { OpeningBalanceDetailsPage } from './pages/opening-balance/OpeningBalanceDetailsPage';
import { AccountingReportsPage } from './pages/AccountingReportsPage';
import { FiscalYearsPage } from './pages/accounting/FiscalYearsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { BalanceSheetPage } from './pages/reports/balance-sheet/BalanceSheetPage';
import { ReportsHubPage } from './pages/reports/ReportsHubPage';
import { AgingReportPage } from './pages/reports/aging/AgingReportPage';
import { StockMovementPage } from './pages/reports/stock-movement/StockMovementPage';
import { ItemCardReportPage } from './pages/reports/ItemCardReportPage';

import { DailySalesPage } from './pages/reports/daily-sales/DailySalesPage';
import { AppSidebar } from './components/AppSidebar';
import { usePosStore } from './stores/pos.store';
import { licensingApi, LicenseStatus } from './api/licensing';
import { ActivationPage } from './pages/ActivationPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { getCurrentUser, getUserRole } from './utils/permissions';
import { usePlatformBrand } from './hooks/usePlatformBrand';

// مكون التغليف الرئيسي الذي يعرض السايدبار مع الصفحات الإدارية ونقاط البيع
const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const { companyBrand } = usePlatformBrand();

  // إغلاق القائمة الجانبية تلقائياً على الجوال/التابلت عند الانتقال لصفحة جديدة
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  // اختصار عالمي لفتح شاشة البيع F4 من أي شاشة في النظام
  useEffect(() => {
    const handleGlobalF4 = (e: KeyboardEvent) => {
      if (e.key === 'F4' && !location.pathname.startsWith('/pos')) {
        e.preventDefault();
        navigate('/pos');
      }
    };
    window.addEventListener('keydown', handleGlobalF4);
    return () => window.removeEventListener('keydown', handleGlobalF4);
  }, [location.pathname, navigate]);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen w-full lg:w-screen lg:overflow-hidden bg-[#F4F6F8]" dir="rtl">
      {/* شريط علوي مدمج للهواتف والتابلت لفتح القائمة الجانبية */}
      <div className="sticky top-0 flex lg:hidden items-center justify-between bg-[#582949] text-white px-4 py-2.5 shadow-md shrink-0 z-30">
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-bold transition"
          aria-label="فتح القائمة"
        >
          <span className="text-base leading-none">☰</span>
          <span>القائمة</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="font-black text-sm tracking-wide">{companyBrand.displayName}</span>
          <img src={companyBrand.logoUrl || '/logo.png'} alt="Logo" className="w-7 h-7 rounded-lg object-cover border border-white/20" />
        </div>
      </div>

      {/* خلفية معتمة عند فتح القائمة على الجوال أو التابلت */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[1px] z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      <AppSidebar
        mobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <main className="flex-1 min-h-0 w-full lg:h-full lg:overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
};

// صفحة مؤقتة للأقسام قيد التطوير
const UnderConstructionPage: React.FC<{ title: string; icon: string }> = ({ title, icon }) => (
  <div className="flex h-full flex-col items-center justify-center p-8 text-center" dir="rtl">
    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#582949]/10 text-4xl shadow-inner">
      {icon}
    </div>
    <h2 className="text-2xl font-black text-[#582949]">{title}</h2>
    <p className="mt-2 text-sm text-slate-500 max-w-md">
      هذا القسم مجهز في قاعدة البيانات ونواة النظام الخلفي (Backend & Database) ويتم استعراض واجهته قريباً.
    </p>
    <a
      href="/"
      className="mt-6 rounded-xl bg-[#00A8A8] px-6 py-2.5 text-xs font-bold text-white shadow hover:bg-[#009292] transition"
    >
      العودة للرئيسية
    </a>
  </div>
);

// توجيه الصفحة الرئيسية بناءً على دور المستخدم
const HomeRoute: React.FC = () => {
  const role = getUserRole();
  if (role === 'CASHIER') {
    return <Navigate to="/pos" replace />;
  }
  if (role === 'INVENTORY' || role === 'STORE_KEEPER') {
    return <Navigate to="/medicines" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const { initSession, branchId, cashierId, activeShiftId } = usePosStore();

  const [licenseStatus, setLicenseStatus] = React.useState<LicenseStatus | null>(null);
  const [loadingLicense, setLoadingLicense] = React.useState(true);

  React.useEffect(() => {
    licensingApi
      .getStatus()
      .then((status) => {
        setLicenseStatus(status);
      })
      .catch((err) => {
        setLicenseStatus({
          isActivated: false,
          hwid: 'تعذر الاتصال بالخادم',
          error: 'يرجى التأكد من تشغيل خادم MadarCore Backend',
        });
      })
      .finally(() => {
        setLoadingLicense(false);
      });
  }, []);

  if (loadingLicense) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white font-sans" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-300">جاري فحص ترخيص النظام...</p>
        </div>
      </div>
    );
  }

  // إذا لم يكن النظام مفعلاً على هذا الجهاز، حظر كل الشاشات وعرض شاشة التفعيل فقط
  if (!licenseStatus?.isActivated) {
    return (
      <ActivationPage
        initialStatus={licenseStatus!}
        onActivated={(newStatus) => setLicenseStatus(newStatus)}
      />
    );
  }

  // شاشة الدخول وشاشة العميل تفتحان منفصلتين بدون سايدبار
  if (location.pathname === '/login') {
    return <LoginPage />;
  }

  if (location.pathname === '/customer-screen') {
    return <CustomerDisplayPage />;
  }

  // إذا لم يكن هناك مستخدم مسجل دخول، التوجيه لصفحة الدخول فوراً
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/settings" element={
          <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
            <SettingsPage />
          </ProtectedRoute>
        } />

        {/* نقاط البيع والمبيعات */}
        <Route
          path="/pos"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER']}>
              <PosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pos/held"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER']}>
              <PosPage />
            </ProtectedRoute>
          }
        />

        {/* فواتير المبيعات والورديات */}
        <Route
          path="/sales/invoices"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'ACCOUNTANT']}>
              <SalesInvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'ACCOUNTANT']}>
              <SalesInvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shifts"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'ACCOUNTANT']}>
              <ShiftsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/returns"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER']}>
              <ReturnsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/returns"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'CASHIER']}>
              <ReturnsPage />
            </ProtectedRoute>
          }
        />

        {/* المشتريات والموردين */}
        <Route
          path="/purchasing/orders"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER', 'ACCOUNTANT']}>
              <PurchasingOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchasing/receive"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER', 'ACCOUNTANT']}>
              <PurchasingOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER', 'ACCOUNTANT']}>
              <SuppliersPage />
            </ProtectedRoute>
          }
        />

        {/* إدارة الشركات والفروع */}
        <Route
          path="/companies"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN']}>
              <CompaniesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/branches"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN']}>
              <BranchesPage />
            </ProtectedRoute>
          }
        />

        {/* المستخدمين والأمان */}
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users-management"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER']}>
              <AuditLogsPage />
            </ProtectedRoute>
          }
        />

        {/* التقارير والعملاء */}
        <Route
          path="/customers"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/statement"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'CASHIER']}>
              <CustomerStatementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/statement"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'CASHIER']}>
              <CustomerStatementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer-statement"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'CASHIER']}>
              <CustomerStatementPage />
            </ProtectedRoute>
          }
        />

        {/* المخزون والأدوية */}
        <Route
          path="/medicines"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER', 'ACCOUNTANT', 'CASHIER']}>
              <MedicinesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/batches"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER', 'ACCOUNTANT', 'CASHIER']}>
              <BatchesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transfers"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER', 'ACCOUNTANT']}>
              <TransfersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock-count"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER']}>
              <StockCountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock-count/:id"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'INVENTORY', 'STORE_KEEPER']}>
              <CountSheetPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/opening-balance"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <OpeningBalancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/opening-balance/:id"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <OpeningBalanceDetailsPage />
            </ProtectedRoute>
          }
        />

        {/* التقارير ومركز التقارير الموحد */}
        <Route
          path="/reports"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <ReportsHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/hub"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <ReportsHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/trial-balance"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <AccountingReportsPage defaultTab="trial-balance" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/general-ledger"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <AccountingReportsPage defaultTab="general-ledger" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/income-statement"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <AccountingReportsPage defaultTab="income-statement" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/balance-sheet"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <BalanceSheetPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/aging"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <AgingReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/customers-aging"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <AgingReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/suppliers-aging"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <AgingReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/branch-stock"
          element={<ProtectedRoute allowedRoles={['SUPER_ADMIN','COMPANY_ADMIN','BRANCH_MANAGER','ACCOUNTANT','INVENTORY','STORE_KEEPER']}><BranchStockReportPage /></ProtectedRoute>}
        />
        <Route
          path="/reports/item-card"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'INVENTORY', 'STORE_KEEPER']}>
              <ItemCardReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/stock-card"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'INVENTORY', 'STORE_KEEPER']}>
              <ItemCardReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/stock-movement"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'INVENTORY', 'STORE_KEEPER']}>
              <StockMovementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/daily-sales"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'CASHIER']}>
              <DailySalesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/reports/balance-sheet"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <BalanceSheetPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/reports"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <AccountingReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/fiscal-years"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT']}>
              <FiscalYearsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/ledger"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT']}>
              <JournalEntriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ledger"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT']}>
              <JournalEntriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/accounts"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT']}>
              <AccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT']}>
              <AccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/expenses"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/expenses"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receipts"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <ReceiptsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounting/receipts"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <ReceiptsPage />
            </ProtectedRoute>
          }
        />

        {/* لوحة تحكم المدير */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* المسار الافتراضي لأي رابط غير معروف */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MainLayout>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

export default App;
