import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, DashboardOverview, DssRecommendationsResult } from '../api/dashboard';
import { PageHeader } from '../components/common/PageHeader';
import {
  TrendingUp,
  ShoppingBag,
  Users,
  Truck,
  AlertTriangle,
  Package,
  RefreshCw,
  Clock,
  CreditCard,
  Banknote,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Calendar,
  Wallet,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronLeft,
  BrainCircuit,
  Sparkles,
  Zap,
  TrendingDown,
  PhoneCall,
  BadgePercent,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeDssTab, setActiveDssTab] = useState<'REORDER' | 'EXPIRY' | 'DEAD_STOCK'>('REORDER');

  const userJson = typeof window !== 'undefined' ? localStorage.getItem('dawacore_user') : null;
  const userObj = userJson ? JSON.parse(userJson) : null;
  const companyId = userObj?.companyId || '11111111-0000-0000-0000-000000000001';

  const { data: rawData, isLoading, refetch, isFetching } = useQuery<DashboardOverview>({
    queryKey: ['dashboard', { companyId, date }],
    queryFn: () => dashboardApi.get({ companyId, date }),
  });

  // بيانات افتراضية آمنة لضمان ظهور كافة الكروت والرسوم البيانية فوراً على الهاتف والتابلت حتى أثناء التحميل
  const data: DashboardOverview = useMemo(() => {
    if (rawData && rawData.summary) return rawData;
    const defaultTrend = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      return {
        date: d.toISOString().split('T')[0],
        day: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
        sales: 0,
      };
    });
    return {
      kpis: [],
      salesChart: { labels: [], datasets: [], weeklyTrend: defaultTrend },
      expenseChart: { labels: [], data: [], colors: [] },
      recentActivities: [],
      alerts: [],
      pendingApprovals: { count: 0, items: [] },
      openShifts: 0,
      summary: {
        salesToday: 0,
        salesMonth: 0,
        expensesToday: 0,
        invoicesCount: 0,
        totalCustomerDebt: 0,
        totalSupplierDebt: 0,
        expiringSoon: 0,
        pendingExpensesCount: 0,
        pendingExpensesAmount: 0,
      },
      payments: { CASH: 0, BANK_TRANSFER: 0, CARD: 0, CREDIT: 0 },
      weeklyTrend: defaultTrend,
      lowStock: [],
      recentSales: [],
      mainAccounts: [],
      activeShift: null,
    };
  }, [rawData]);

  const {
    data: dssData,
    isLoading: isDssLoading,
    refetch: refetchDss,
    isFetching: isDssFetching,
  } = useQuery<DssRecommendationsResult>({
    queryKey: ['dashboard-dss', { companyId }],
    queryFn: () => dashboardApi.getDssRecommendations({ companyId }),
  });

  const {
    data: securityAlertsData,
    refetch: refetchSecurityAlerts,
  } = useQuery({
    queryKey: ['dashboard-security-alerts', { companyId }],
    queryFn: () => dashboardApi.getSecurityAlerts({ companyId, limit: 10 }),
    refetchInterval: 8000,
  });

  // حساب أقصى قيمة للمبيعات في الأسبوع لضبط ارتفاع أعمدة الرسم البياني
  const maxWeeklySale = useMemo(() => {
    if (!data?.weeklyTrend || data.weeklyTrend.length === 0) return 1000;
    const max = Math.max(...data.weeklyTrend.map((d) => d.sales));
    return max > 0 ? max : 1000;
  }, [data?.weeklyTrend]);

  // إجمالي مبالغ طرق السداد
  const totalPayments = useMemo(() => {
    if (!data?.payments) return 0;
    return Object.values(data.payments).reduce((sum, val) => sum + Number(val || 0), 0);
  }, [data?.payments]);

  // إجمالي المصروفات من المخطط
  const totalExpensesDistributed = useMemo(() => {
    if (!data?.expenseChart?.data) return 0;
    return data.expenseChart.data.reduce((sum, v) => sum + Number(v || 0), 0);
  }, [data?.expenseChart]);

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5 sm:space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="لوحة تحكم المدير ودعم القرار (DSS & Executive Dashboard)"
        subtitle="المتابعة الذكية للمبيعات، النواقص، قرارات التوريد والتصفية، والسيولة النقدية"
        action={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <Calendar size={15} className="text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent"
              />
            </div>
            <button
              onClick={() => navigate('/pos')}
              className="flex items-center gap-2 rounded-xl bg-[#00A8A8] hover:bg-[#009292] text-white px-4 py-2 text-xs font-bold shadow-md transition"
              title="الانتقال لنقطة البيع الفورية (F4)"
            >
              <span>🛒</span>
              <span>نقطة البيع (POS)</span>
            </button>
            <button
              onClick={() => {
                refetch();
                refetchDss();
                refetchSecurityAlerts();
              }}
              disabled={isFetching || isDssFetching}
              className="flex items-center gap-2 rounded-xl bg-[#582949] hover:bg-[#431f38] text-white px-4 py-2 text-xs font-bold shadow-md transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={isFetching || isDssFetching ? 'animate-spin' : ''} />
              <span>تحديث البيانات والتحليلات</span>
            </button>
          </div>
        }
      />

      {/* 🛡️ قسم إشعارات الرقابة الأمنية لنقاط البيع (عند فتح الكونسول أو محاولة التلاعب) */}
      {securityAlertsData?.alerts && securityAlertsData.alerts.length > 0 && (
        <div className="rounded-3xl border-2 border-rose-200 bg-white p-5 shadow-md space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900">
                    سجل إشعارات الرقابة الأمنية لنقاط البيع (POS Console & Anti-Tamper Log)
                  </h3>
                  {securityAlertsData.unreadCount > 0 && (
                    <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-black text-white animate-pulse">
                      {securityAlertsData.unreadCount} تنبيه جديد
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  يُسجّل تلقائياً أي محاولة لفتح الكونسول (F12 / DevTools) أو تعديل قيم السلة في أجهزة الكاشير
                </p>
              </div>
            </div>
            {securityAlertsData.unreadCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await dashboardApi.acknowledgeAllSecurityAlerts(
                    companyId,
                    userObj?.name || 'المدير',
                  );
                  refetchSecurityAlerts();
                }}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 text-xs font-bold transition cursor-pointer"
              >
                ✓ تأكيد مراجعة الكل
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {securityAlertsData.alerts.slice(0, 4).map((secAlert) => (
              <div
                key={secAlert.id}
                className={`rounded-2xl border p-3.5 flex items-start justify-between gap-3 ${
                  secAlert.acknowledged
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-rose-50/70 border-rose-300'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        secAlert.acknowledged
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {secAlert.acknowledged ? 'تمت المراجعة' : 'غير مقروء'}
                    </span>
                    <span className="text-xs font-black text-rose-900">
                      الكاشير: {secAlert.cashierName}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {new Date(secAlert.createdAt).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">{secAlert.reason}</p>
                  <p className="text-[11px] text-slate-500">
                    السلة وقت الحدث: {secAlert.cartItemsCount} أصناف — الإجمالي:{' '}
                    {Number(secAlert.cartTotal || 0).toLocaleString('en-US')} ج.س
                  </p>
                </div>
                {!secAlert.acknowledged && (
                  <button
                    type="button"
                    onClick={async () => {
                      await dashboardApi.acknowledgeSecurityAlert(
                        secAlert.id,
                        userObj?.name || 'المدير',
                      );
                      refetchSecurityAlerts();
                    }}
                    className="shrink-0 rounded-lg bg-white border border-rose-300 hover:bg-rose-100 text-rose-700 px-2.5 py-1 text-[11px] font-bold transition cursor-pointer"
                  >
                    تمت المراجعة
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🧠 مركز دعم اتخاذ القرارات الذكي (EXECUTIVE DECISION SUPPORT SYSTEM - DSS) */}
      {/* ========================================================================= */}

      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-4 sm:p-6 text-white shadow-xl border border-indigo-500/20 relative overflow-hidden">
        {/* خلفية جمالية */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* رأس قسم دعم القرار */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-400 to-indigo-500 p-0.5 shadow-lg flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <BrainCircuit className="text-teal-400" size={24} />
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black tracking-wide text-white">
                  مركز دعم اتخاذ القرار (Executive Decision Hub)
                </h2>
                <span className="flex items-center gap-1 text-[10px] font-bold bg-teal-400/20 text-teal-300 px-2.5 py-0.5 rounded-full border border-teal-400/30">
                  <Sparkles size={11} />
                  محرك التحليل الاستباقي (DSS)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                توصيات تشغيلية مدعومة رياضياً لحماية الأرباح، تسريع دورة المخزون، وتحرير رأس المال المجمد
              </p>
            </div>
          </div>

          {/* تبويبات قرارات الـ DSS */}
          <div className="flex flex-wrap items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-sm">
            <button
              onClick={() => setActiveDssTab('REORDER')}
              className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeDssTab === 'REORDER'
                  ? 'bg-teal-500 text-slate-900 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Zap size={14} />
              <span>قرارات الشراء وإعادة الطلب</span>
              {dssData?.executiveSummary?.urgentReorders ? (
                <span className="bg-rose-500 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                  {Number(dssData.executiveSummary.urgentReorders).toLocaleString('en-US')}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setActiveDssTab('EXPIRY')}
              className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeDssTab === 'EXPIRY'
                  ? 'bg-amber-400 text-slate-900 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <TrendingDown size={14} />
              <span>تصفية الصلاحيات والخصومات</span>
              {dssData?.executiveSummary?.criticalExpiryBatches ? (
                <span className="bg-rose-500 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                  {Number(dssData.executiveSummary.criticalExpiryBatches).toLocaleString('en-US')}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setActiveDssTab('DEAD_STOCK')}
              className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeDssTab === 'DEAD_STOCK'
                  ? 'bg-purple-400 text-slate-900 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Layers size={14} />
              <span>رأس المال المجمد (الراكد)</span>
              {dssData?.executiveSummary?.deadItemsCount ? (
                <span className="bg-purple-600 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                  {Number(dssData.executiveSummary.deadItemsCount).toLocaleString('en-US')}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* كروت المؤشرات الاستراتيجية للـ DSS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 my-4 sm:my-5 relative z-10">
          {/* كارت 1: مخاطر النفاد والشراء */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 hover:border-teal-500/40 transition">
            <div className="flex items-center justify-between text-teal-400 mb-1">
              <span className="text-xs font-bold">أصناف مهددة بالنفاد (قبل 7 أيام)</span>
              <Zap size={16} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-white" dir="ltr">
                {Number(dssData?.executiveSummary?.urgentReorders || 0).toLocaleString('en-US')}
              </span>
              <span className="text-xs text-slate-300">أصناف تتطلب أمر شراء استباقي</span>
            </div>
            <p className="text-[11px] text-teal-300/80 mt-2 font-medium">
              محسوبة بناءً على سرعة الاستهلاك الفعلي آخر 30 يوماً
            </p>
          </div>

          {/* كارت 2: قيمة الخسارة المحتملة من الانتهاء */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 hover:border-amber-400/40 transition">
            <div className="flex items-center justify-between text-amber-400 mb-1">
              <span className="text-xs font-bold">الخسارة المالية المهددة بالتلف</span>
              <TrendingDown size={16} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-amber-300" dir="ltr">
                {Number(dssData?.executiveSummary?.totalPotentialLoss || 0).toLocaleString('en-US')}
              </span>
              <span className="text-xs text-slate-300">ج.م (قيمة تكلفة)</span>
            </div>
            <p className="text-[11px] text-amber-200/80 mt-2 font-medium">
              تصفيتها فوراً بالخصومات المقترحة ينقذ السيولة قبل انتهاء الصلاحية
            </p>
          </div>

          {/* كارت 3: رأس المال المجمد في البضاعة الراكدة */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 hover:border-purple-400/40 transition">
            <div className="flex items-center justify-between text-purple-300 mb-1">
              <span className="text-xs font-bold">رأس المال المجمد (بدون حركة 60 يوم)</span>
              <Layers size={16} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-purple-200" dir="ltr">
                {Number(dssData?.executiveSummary?.totalFrozenCapital || 0).toLocaleString('en-US')}
              </span>
              <span className="text-xs text-slate-300">ج.م مجمدة بالمخازن</span>
            </div>
            <p className="text-[11px] text-purple-200/80 mt-2 font-medium">
              يوصى بعمل عروض مجمعة (Bundling) لتحرير السيولة فوراً
            </p>
          </div>
        </div>

        {/* تفاصيل التوصيات التفاعلية بناءً على التبويب المختار */}
        <div className="relative z-10 bg-slate-900/80 rounded-2xl border border-white/10 overflow-hidden">
          {isDssLoading ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              جاري تشغيل خوارزميات محرك دعم القرارات ومسح المبيعات التاريخية...
            </div>
          ) : activeDssTab === 'REORDER' ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-teal-300">
                  ⚡ جدول التوصيات الذكية لإعادة الطلب وتفادي نفاد الأصناف:
                </span>
                <span className="text-slate-400 text-[11px]">
                  معدل التغطية المستهدف: 30 يوماً قادمة
                </span>
              </div>
              {dssData?.reorderRecommendations?.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  كافة الأصناف لديها تغطية مخزنية كافية ولا توجد مخاطر نفاد وشيكة.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                        <th className="py-2.5 px-3">الصنف</th>
                        <th className="py-2.5 px-3">المخزون الحالي</th>
                        <th className="py-2.5 px-3">البيع اليومي (Velocity)</th>
                        <th className="py-2.5 px-3">الأيام المتبقية</th>
                        <th className="py-2.5 px-3">الكمية المقترحة للطلب</th>
                        <th className="py-2.5 px-3">الميزانية التقديرية</th>
                        <th className="py-2.5 px-3">أفضل مورد سابق</th>
                        <th className="py-2.5 px-3">التوصية والقرار الفوري</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dssData?.reorderRecommendations.map((rec) => (
                        <tr key={rec.medicineId} className="hover:bg-white/5 transition">
                          <td className="py-3 px-3">
                            <div className="font-bold text-white">{rec.name}</div>
                            <span className="text-[10px] text-slate-400 font-mono">{rec.code}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`font-mono font-bold ${
                                rec.currentStock === 0
                                  ? 'text-rose-400'
                                  : rec.currentStock <= rec.minStockLevel
                                  ? 'text-amber-400'
                                  : 'text-slate-200'
                              }`}
                            >
                              {rec.currentStock} وحدة
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-teal-300">
                            {rec.dailyVelocity} / يوم
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                                rec.daysRemaining <= 3
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {rec.daysRemaining === 0 ? 'نافد الآن!' : `${rec.daysRemaining} يوم`}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                            +{rec.suggestedOrderQty} وحدة
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-300">
                            {Number(rec.estimatedBudget || 0).toLocaleString('en-US')} ج.م
                          </td>
                          <td className="py-3 px-3">
                            {rec.bestSupplier ? (
                              <div>
                                <div className="text-white font-medium">{rec.bestSupplier.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                  <PhoneCall size={10} />
                                  {rec.bestSupplier.phone}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">مورد جديد</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <a
                              href={`/purchasing/orders?medicineId=${rec.medicineId}&qty=${rec.suggestedOrderQty}`}
                              className="inline-flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold px-3 py-1.5 rounded-xl text-[11px] transition shadow-md"
                            >
                              <span>إنشاء أمر شراء فوري</span>
                              <ArrowRight size={12} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeDssTab === 'EXPIRY' ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-amber-300">
                  ⏳ مستشار تصفية الصلاحيات والخصومات المقترحة لتفادي الهدر:
                </span>
                <span className="text-slate-400 text-[11px]">
                  أصناف قاربت على الانتهاء خلال الـ 90 يوماً القادمة
                </span>
              </div>
              {dssData?.expiryRiskRecommendations?.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  لا توجد دفعات قريبة الانتهاء مهددة بالخسارة حالياً.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                        <th className="py-2.5 px-3">الصنف والتشغيلة</th>
                        <th className="py-2.5 px-3">الرصيد المتاح</th>
                        <th className="py-2.5 px-3">أيام الصلاحية</th>
                        <th className="py-2.5 px-3">المبيعات المتوقعة</th>
                        <th className="py-2.5 px-3">الكمية المهددة بالتلف</th>
                        <th className="py-2.5 px-3">الخسارة المحتملة</th>
                        <th className="py-2.5 px-3">الخصم المقترح للتصفية</th>
                        <th className="py-2.5 px-3">القرار الموصى به</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dssData?.expiryRiskRecommendations.map((exp) => (
                        <tr key={exp.batchId} className="hover:bg-white/5 transition">
                          <td className="py-3 px-3">
                            <div className="font-bold text-white">{exp.tradeName}</div>
                            <span className="text-[10px] text-amber-400 font-mono">
                              تشغيلة: {exp.batchNumber}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-200">{exp.quantity}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                                exp.daysToExpiry <= 30
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {exp.daysToExpiry} يوم متبقي
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400">
                            {exp.projectedSalesUntilExpiry} وحدة
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-rose-400">
                            {exp.unsoldRiskQty} وحدة
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-rose-300">
                            {Number(exp.potentialLoss || 0).toLocaleString('en-US')} ج.م
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
                                -{exp.suggestedMarkdownPercent}%
                              </span>
                              <span className="line-through text-slate-500 text-[10px] font-mono">
                                {exp.salePrice}
                              </span>
                              <span className="text-emerald-400 font-mono text-xs">
                                {exp.suggestedSalePrice} ج.م
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-[11px] text-slate-300 max-w-xs leading-relaxed">
                              {exp.decisionPrompt}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-bold text-purple-300">
                  🧊 تحليل رأس المال المجمد في البضاعة الراكدة (Dead Stock):
                </span>
                <span className="text-slate-400 text-[11px]">
                  أصناف يتوفر لها مخزون ولم تسجل أي حركة بيع خلال آخر 60 يوماً
                </span>
              </div>
              {dssData?.deadStockRecommendations?.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  المخزون متداول بشكل صحي ولا توجد بضائع راكدة مجمدة لرأس المال.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                        <th className="py-2.5 px-3">الصنف</th>
                        <th className="py-2.5 px-3">الرصيد الراكد</th>
                        <th className="py-2.5 px-3">متوسط التكلفة</th>
                        <th className="py-2.5 px-3">رأس المال المجمد</th>
                        <th className="py-2.5 px-3">فترة الركود</th>
                        <th className="py-2.5 px-3">القرار الإداري المقترح</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dssData?.deadStockRecommendations.map((dead) => (
                        <tr key={dead.medicineId} className="hover:bg-white/5 transition">
                          <td className="py-3 px-3">
                            <div className="font-bold text-white">{dead.name}</div>
                            <span className="text-[10px] text-slate-400 font-mono">{dead.code}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-purple-200 font-bold">
                            {dead.currentStock} وحدة
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400">
                            {dead.avgCost} ج.م
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-purple-300">
                            {Number(dead.frozenCapital || 0).toLocaleString('en-US')} ج.م
                          </td>
                          <td className="py-3 px-3">
                            <span className="bg-purple-900/60 border border-purple-500/30 text-purple-200 text-[10px] px-2 py-0.5 rounded-md font-mono font-bold">
                              أكثر من {dead.daysWithoutSales} يوم
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-[11px] text-slate-300 max-w-sm leading-relaxed">
                              {dead.suggestedAction}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== التنبيهات الإدارية العاجلة (Alerts) إن وجدت ===== */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.alerts.map((alert, idx) => (
            <a
              key={idx}
              href={alert.link}
              className={`p-3.5 rounded-2xl border flex items-start gap-3 transition hover:shadow-md ${
                alert.severity === 'high'
                  ? 'bg-rose-50/70 border-rose-200 text-rose-800'
                  : 'bg-amber-50/70 border-amber-200 text-amber-800'
              }`}
            >
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  alert.severity === 'high' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                {alert.severity === 'high' ? <AlertCircle size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black">{alert.title}</h4>
                <p className="text-[11px] opacity-90 mt-0.5">{alert.description}</p>
              </div>
              <ChevronLeft size={16} className="shrink-0 self-center opacity-60" />
            </a>
          ))}
        </div>
      )}

      {/* عرض الكروت والرسوم البيانية دائماً على جميع الشاشات (الهاتف، التابلت، والكمبيوتر) */}
      {(
        <>
          {/* ===== 1. بطاقات المؤشرات القيادية السريعة المرتبطة بالتقارير (Interactive KPI Cards) ===== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            {/* 1. مبيعات اليوم -> تقرير المبيعات اليومية */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/reports/daily-sales')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/reports/daily-sales')}
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-emerald-50/40 to-teal-50/70 border border-emerald-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 to-[#00A8A8]" />
              <div>
                <div className="flex items-center justify-between text-emerald-800 mb-2.5 mt-0.5">
                  <span className="text-xs font-black">مبيعات اليوم</span>
                  <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-[#00A8A8] text-white shadow-md shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                    <TrendingUp size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-900 font-mono tracking-tight">
                  <span dir="ltr">{Number(data.summary.salesToday || 0).toLocaleString('en-US')}</span>{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[10px] font-bold text-emerald-700">
                <span>{Number(data.summary.invoicesCount || 0).toLocaleString('en-US')} فاتورة مصدرة</span>
                <span className="inline-flex items-center gap-0.5 text-[#00A8A8] group-hover:translate-x-[-2px] transition-transform">
                  <span>تقرير اليوم</span>
                  <ArrowUpRight size={12} />
                </span>
              </div>
            </div>

            {/* 2. مبيعات الشهر الحالي -> سجل فواتير المبيعات */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/sales/invoices')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/sales/invoices')}
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-teal-50/40 to-cyan-50/70 border border-teal-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#00A8A8] to-[#1F3A5F]" />
              <div>
                <div className="flex items-center justify-between text-[#1F3A5F] mb-2.5 mt-0.5">
                  <span className="text-xs font-black">مبيعات الشهر</span>
                  <div className="p-2 rounded-xl bg-gradient-to-br from-[#00A8A8] to-[#1F3A5F] text-white shadow-md shadow-teal-600/20 group-hover:scale-110 transition-transform">
                    <ShoppingBag size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-900 font-mono tracking-tight">
                  <span dir="ltr">{Number(data.summary.salesMonth || 0).toLocaleString('en-US')}</span>{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-teal-200/60 flex items-center justify-between text-[10px] font-bold text-teal-800">
                <span>إجمالي الشهر</span>
                <span className="inline-flex items-center gap-0.5 text-[#00A8A8] group-hover:translate-x-[-2px] transition-transform">
                  <span>سجل الفواتير</span>
                  <ArrowUpRight size={12} />
                </span>
              </div>
            </div>

            {/* 3. مصروفات اليوم -> سندات الصرف والمصروفات */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/expenses')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/expenses')}
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-rose-50/40 to-pink-50/70 border border-rose-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-rose-500 to-[#582949]" />
              <div>
                <div className="flex items-center justify-between text-rose-800 mb-2.5 mt-0.5">
                  <span className="text-xs font-black">مصروفات اليوم</span>
                  <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-[#582949] text-white shadow-md shadow-rose-500/20 group-hover:scale-110 transition-transform">
                    <Wallet size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-900 font-mono tracking-tight">
                  <span dir="ltr">{Number(data.summary.expensesToday || 0).toLocaleString('en-US')}</span>{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-rose-200/60 flex items-center justify-between text-[10px] font-bold text-rose-700">
                <span>سندات صرف معتمدة</span>
                <span className="inline-flex items-center gap-0.5 text-[#582949] group-hover:translate-x-[-2px] transition-transform">
                  <span>سندات الصرف</span>
                  <ArrowUpRight size={12} />
                </span>
              </div>
            </div>

            {/* 4. الوردية النشطة -> شاشة الورديات والصندوق */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/shifts')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/shifts')}
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-indigo-50/40 to-slate-100/80 border border-indigo-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#1F3A5F] to-indigo-600" />
              <div>
                <div className="flex items-center justify-between text-[#1F3A5F] mb-2.5 mt-0.5">
                  <span className="text-xs font-black">الوردية النشطة</span>
                  <div className="p-2 rounded-xl bg-gradient-to-br from-[#1F3A5F] to-indigo-600 text-white shadow-md shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                    <Clock size={16} />
                  </div>
                </div>
                <p className="text-sm font-black text-slate-900 truncate">
                  {data.activeShift ? data.activeShift.cashier : 'مغلقة حالياً'}
                </p>
                <p className="text-[10px] text-indigo-700 mt-1 font-mono font-bold truncate">
                  {data.activeShift
                    ? `وردية #${data.activeShift.shiftNumber} (${Number(data.activeShift.expectedCash || 0).toLocaleString('en-US')} ج.س)`
                    : 'لا توجد وردية مفتوحة'}
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-indigo-200/60 flex items-center justify-between text-[10px] font-bold text-[#1F3A5F]">
                <span>حركة الصندوق</span>
                <span className="inline-flex items-center gap-0.5 text-indigo-600 group-hover:translate-x-[-2px] transition-transform">
                  <span>إدارة الورديات</span>
                  <ArrowUpRight size={12} />
                </span>
              </div>
            </div>

            {/* 5. مديونية العملاء -> شاشة العملاء والمديونيات */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/customers')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/customers')}
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-amber-50/50 to-orange-50/70 border border-amber-200/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#B8892B] to-amber-500" />
              <div>
                <div className="flex items-center justify-between text-amber-900 mb-2.5 mt-0.5">
                  <span className="text-xs font-black">ديون العملاء (AR)</span>
                  <div className="p-2 rounded-xl bg-gradient-to-br from-[#B8892B] to-amber-500 text-white shadow-md shadow-amber-500/20 group-hover:scale-110 transition-transform">
                    <Users size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-900 font-mono tracking-tight">
                  <span dir="ltr">{Number(data.summary.totalCustomerDebt || 0).toLocaleString('en-US')}</span>{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-amber-200/70 flex items-center justify-between text-[10px] font-bold text-amber-800">
                <span>ذمم مدينة آجلة</span>
                <span className="inline-flex items-center gap-0.5 text-[#B8892B] group-hover:translate-x-[-2px] transition-transform">
                  <span>كشوف العملاء</span>
                  <ArrowUpRight size={12} />
                </span>
              </div>
            </div>

            {/* 6. مستحقات الموردين -> شاشة الموردين وكشف الحساب */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/suppliers')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/suppliers')}
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-fuchsia-50/40 to-purple-50/70 border border-purple-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#582949] to-purple-600" />
              <div>
                <div className="flex items-center justify-between text-[#582949] mb-2.5 mt-0.5">
                  <span className="text-xs font-black">مستحقات الموردين (AP)</span>
                  <div className="p-2 rounded-xl bg-gradient-to-br from-[#582949] to-purple-600 text-white shadow-md shadow-purple-500/20 group-hover:scale-110 transition-transform">
                    <Truck size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-900 font-mono tracking-tight">
                  <span dir="ltr">{Number(data.summary.totalSupplierDebt || 0).toLocaleString('en-US')}</span>{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-purple-200/60 flex items-center justify-between text-[10px] font-bold text-[#582949]">
                <span>ذمم دائنة للموردين</span>
                <span className="inline-flex items-center gap-0.5 text-purple-700 group-hover:translate-x-[-2px] transition-transform">
                  <span>حسابات الموردين</span>
                  <ArrowUpRight size={12} />
                </span>
              </div>
            </div>
          </div>

          {/* ===== 2. الرسوم البيانية والمؤشرات المرئية ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* مخطط حركة مبيعات الأسبوع */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md transition">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-xs font-black text-[#1F3A5F]">
                    حركة المبيعات لآخر 7 أيام (Daily Sales Trend)
                  </h3>
                  <p className="text-[11px] text-slate-400">تتبع حجم المبيعات اليومية بالجنيه السوداني</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/reports/daily-sales')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00A8A8] hover:text-[#582949] bg-teal-50/80 hover:bg-teal-100/80 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    <span>تقرير المبيعات التفصيلي</span>
                    <ArrowUpRight size={12} />
                  </button>
                  <span className="text-xs font-mono font-bold text-white bg-gradient-to-r from-[#582949] to-[#00A8A8] px-2.5 py-1 rounded-lg shadow-2xs">
                    7 أيام
                  </span>
                </div>
              </div>

              {/* Native Responsive Bar Chart */}
              <div className="h-56 flex items-end justify-between gap-3 pt-6 px-2 border-b border-slate-100">
                {data.weeklyTrend?.map((item, idx) => {
                  const heightPercent =
                    maxWeeklySale > 0 ? Math.round((item.sales / maxWeeklySale) * 100) : 0;
                  const isToday = idx === data.weeklyTrend.length - 1;
                  return (
                    <div key={item.date} className="flex-1 flex flex-col items-center gap-2 group relative">
                      {/* Tooltip on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-800 text-white text-[10px] font-mono py-0.5 px-2 rounded-md whitespace-nowrap shadow-lg pointer-events-none z-10">
                        {Number(item.sales || 0).toLocaleString('en-US')} ج.س
                      </div>

                      {/* Bar */}
                      <div className="w-full max-w-[42px] bg-slate-100 rounded-t-xl overflow-hidden h-40 flex items-end">
                        <div
                          style={{ height: `${Math.max(8, heightPercent)}%` }}
                          className={`w-full rounded-t-xl transition-all duration-500 ${
                            isToday
                              ? 'bg-gradient-to-t from-[#582949] to-[#00A8A8]'
                              : 'bg-gradient-to-t from-slate-300 to-teal-500 group-hover:from-teal-600 group-hover:to-teal-400'
                          }`}
                        />
                      </div>

                      {/* Day Label */}
                      <div className="text-center">
                        <span
                          className={`text-[11px] font-bold ${
                            isToday ? 'text-[#582949]' : 'text-slate-500'
                          }`}
                        >
                          {item.day}
                        </span>
                        <p className="text-[9px] font-mono text-slate-400">{item.date.slice(5)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>* يتم تحديث المبيعات لحظة بلحظة مع كل فاتورة معتمدة</span>
                <span className="font-mono text-slate-600 font-bold">
                  أعلى يوم: {Number(maxWeeklySale || 0).toLocaleString('en-US')} ج.س
                </span>
              </div>
            </div>

            {/* توزيع طرق السداد (Donut Breakdown) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-800">توزيع المتحصلات اليومية</h3>
                <p className="text-[11px] text-slate-400 mb-4">نسب السداد (نقداً، بنكك، آجل)</p>

                <div className="space-y-3.5">
                  {/* نقداً */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Banknote size={14} className="text-emerald-600" />
                        <span>نقدياً (Cash)</span>
                      </span>
                      <span className="font-mono font-bold text-emerald-700">
                        {Number(data.payments.CASH || 0).toLocaleString('en-US')} ج.س
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${
                            totalPayments > 0
                              ? Math.round(((data.payments.CASH || 0) / totalPayments) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* بنكك والتحويلات */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <CreditCard size={14} className="text-teal-600" />
                        <span>بنكك / شبكة (POS)</span>
                      </span>
                      <span className="font-mono font-bold text-teal-700">
                        {Number(data.payments.BANK_TRANSFER || 0).toLocaleString('en-US')} ج.س
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-teal-500 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${
                            totalPayments > 0
                              ? Math.round(((data.payments.BANK_TRANSFER || 0) / totalPayments) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* آجل */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Users size={14} className="text-amber-600" />
                        <span>مبيعات آجلة (Credit)</span>
                      </span>
                      <span className="font-mono font-bold text-amber-700">
                        {Number(data.payments.CREDIT || 0).toLocaleString('en-US')} ج.س
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${
                            totalPayments > 0
                              ? Math.round(((data.payments.CREDIT || 0) / totalPayments) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">إجمالي متحصلات اليوم:</span>
                <span className="text-sm font-black font-mono text-[#582949]">
                  {Number(totalPayments || 0).toLocaleString('en-US')} ج.س
                </span>
              </div>
            </div>
          </div>

          {/* ===== 3. قسم سندات الصرف المعلقة وتوزيع المصروفات ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* طلبات الصرف بانتظار الاعتماد */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-amber-200 bg-amber-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2 text-amber-800">
                  <Wallet size={16} />
                  <h3 className="text-xs font-black">طلبات سندات الصرف بانتظار الاعتماد</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full font-mono">
                    {data.pendingApprovals?.count || 0} سندات معلقة
                  </span>
                  <a
                    href="/expenses?status=PENDING"
                    className="text-xs font-bold text-[#00A8A8] hover:underline"
                  >
                    عرض الكل ←
                  </a>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {!data.pendingApprovals?.items || data.pendingApprovals.items.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs font-bold">
                    لا توجد طلبات صرف معلقة حالياً، جميع السندات معتمدة ومصروفة.
                  </div>
                ) : (
                  data.pendingApprovals.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 hover:bg-amber-50/20 transition flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-slate-800">
                            {item.expenseNumber}
                          </span>
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                            {item.expenseType}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          بواسطة {item.creator?.name || 'الكاشير'} • {item.account?.name}
                        </p>
                      </div>

                      <div className="text-left flex items-center gap-3">
                        <span className="text-sm font-black font-mono text-[#582949]">
                          {Number(item.amount || 0).toLocaleString('en-US')} ج.س
                        </span>
                        <a
                          href="/expenses?status=PENDING"
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1 transition shadow-2xs"
                        >
                          مراجعة
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* توزيع المصروفات حسب النوع لشهر الحالي */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-800">توزيع المصروفات حسب البند</h3>
                <p className="text-[11px] text-slate-400 mb-4">المصروفات المعتمدة للشهر الحالي</p>

                <div className="space-y-3">
                  {!data.expenseChart?.labels || data.expenseChart.labels.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      لا توجد مصروفات مسجلة لهذا الشهر
                    </div>
                  ) : (
                    data.expenseChart.labels.map((type, idx) => {
                      const amount = data.expenseChart.data[idx] || 0;
                      const percent =
                        totalExpensesDistributed > 0
                          ? Math.round((amount / totalExpensesDistributed) * 100)
                          : 0;
                      const color = data.expenseChart.colors[idx] || '#8B5CF6';

                      return (
                        <div key={type}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold text-slate-700 truncate max-w-[140px]">{type}</span>
                            <span className="font-mono text-slate-500 font-bold">
                              {Number(amount || 0).toLocaleString('en-US')} ج.س ({percent}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${percent}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">إجمالي مصروفات الشهر:</span>
                <span className="text-sm font-black font-mono text-rose-600">
                  {Number(totalExpensesDistributed || 0).toLocaleString('en-US')} ج.س
                </span>
              </div>
            </div>
          </div>

          {/* ===== 4. الجداول التشغيلية: آخر النشاطات ونواقص المخزون ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* آخر الفواتير والنشاطات الحية */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2 bg-gradient-to-l from-[#582949]/5 via-slate-50 to-teal-50/40">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} className="text-[#00A8A8]" />
                  <h3 className="text-xs font-black text-[#1F3A5F]">
                    أحدث فواتير المبيعات وسندات الصرف (Live Stream)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/sales/invoices')}
                  className="text-[11px] font-bold text-[#00A8A8] hover:text-[#582949] transition cursor-pointer inline-flex items-center gap-1"
                >
                  <span>عرض سجل الفواتير</span>
                  <ArrowUpRight size={12} />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="py-2.5 px-4 text-right">الرقم المرجعي</th>
                      <th className="py-2.5 px-4 text-right">النوع</th>
                      <th className="py-2.5 px-4 text-right">الطرف / العميل</th>
                      <th className="py-2.5 px-4 text-right">المبلغ</th>
                      <th className="py-2.5 px-4 text-right">الوقت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!data.recentActivities || data.recentActivities.length === 0) &&
                    data.recentSales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          لا توجد عمليات مسجلة اليوم حتى الآن
                        </td>
                      </tr>
                    ) : (
                      (data.recentActivities || []).slice(0, 7).map((act) => (
                        <tr key={act.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-4 font-mono font-bold text-[#582949]">
                            {act.number}
                          </td>
                          <td className="py-2.5 px-4 font-bold">
                            {act.type === 'SALE' ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700">
                                مبيعات
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700">
                                سند صرف
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {act.type === 'SALE'
                              ? act.customerName || 'عميل نقدي'
                              : act.description || 'مصروف عام'}
                          </td>
                          <td
                            className={`py-2.5 px-4 font-mono font-bold ${
                              act.type === 'SALE' ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {Number(act.amount || 0).toLocaleString('en-US')} ج.س
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-400 text-[10px]">
                            {new Date(act.date).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* تنبيهات المخزون المنخفض */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between">
              <div>
                <div className="px-5 py-3.5 border-b border-amber-200 bg-amber-50 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-amber-800">
                    <Package size={16} />
                    <h3 className="text-xs font-black">نواقص المخزون الحرجة (≤ 10)</h3>
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full font-mono">
                    {data.lowStock.length} أصناف
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
                  {data.lowStock.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      المخزون في الحدود الآمنة تماماً
                    </div>
                  ) : (
                    data.lowStock.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 hover:bg-amber-50/40 transition flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1 pl-2">
                          <p className="text-xs font-bold text-slate-800 truncate">{item.medicine}</p>
                          <p className="text-[10px] text-slate-400 truncate">{item.scientificName}</p>
                        </div>
                        <div className="text-left shrink-0">
                          <span
                            className={`text-xs font-mono font-black ${
                              item.quantity <= 3 ? 'text-rose-600' : 'text-amber-600'
                            }`}
                          >
                            {item.quantity} وحدة
                          </span>
                          <p className="text-[9px] font-mono text-slate-400">
                            تنتهي: {new Date(item.expiryDate).toLocaleDateString('en-GB')}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <a
                  href="/purchasing/orders"
                  className="text-xs font-bold text-[#00A8A8] hover:underline"
                >
                  إنشاء أمر شراء عاجل للنواقص ←
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;