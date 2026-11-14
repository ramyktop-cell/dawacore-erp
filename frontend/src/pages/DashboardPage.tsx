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

  const { data, isLoading, refetch, isFetching } = useQuery<DashboardOverview>({
    queryKey: ['dashboard', { companyId, date }],
    queryFn: () => dashboardApi.get({ companyId, date }),
  });

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
                      {new Date(secAlert.createdAt).toLocaleString('ar-EG')}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">{secAlert.reason}</p>
                  <p className="text-[11px] text-slate-500">
                    السلة وقت الحدث: {secAlert.cartItemsCount} أصناف — الإجمالي:{' '}
                    {Number(secAlert.cartTotal || 0).toLocaleString()} ج.س
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

      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 text-white shadow-xl border border-indigo-500/20 relative overflow-hidden">
        {/* خلفية جمالية */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* رأس قسم دعم القرار */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-400 to-indigo-500 p-0.5 shadow-lg flex items-center justify-center">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <BrainCircuit className="text-teal-400" size={24} />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
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
          <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-sm">
            <button
              onClick={() => setActiveDssTab('REORDER')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeDssTab === 'REORDER'
                  ? 'bg-teal-500 text-slate-900 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Zap size={14} />
              <span>قرارات الشراء وإعادة الطلب</span>
              {dssData?.executiveSummary?.urgentReorders ? (
                <span className="bg-rose-500 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                  {dssData.executiveSummary.urgentReorders}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setActiveDssTab('EXPIRY')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeDssTab === 'EXPIRY'
                  ? 'bg-amber-400 text-slate-900 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <TrendingDown size={14} />
              <span>تصفية الصلاحيات والخصومات</span>
              {dssData?.executiveSummary?.criticalExpiryBatches ? (
                <span className="bg-rose-500 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                  {dssData.executiveSummary.criticalExpiryBatches}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setActiveDssTab('DEAD_STOCK')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeDssTab === 'DEAD_STOCK'
                  ? 'bg-purple-400 text-slate-900 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Layers size={14} />
              <span>رأس المال المجمد (الراكد)</span>
              {dssData?.executiveSummary?.deadItemsCount ? (
                <span className="bg-purple-600 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                  {dssData.executiveSummary.deadItemsCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* كروت المؤشرات الاستراتيجية للـ DSS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-5 relative z-10">
          {/* كارت 1: مخاطر النفاد والشراء */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 hover:border-teal-500/40 transition">
            <div className="flex items-center justify-between text-teal-400 mb-1">
              <span className="text-xs font-bold">أصناف مهددة بالنفاد (قبل 7 أيام)</span>
              <Zap size={16} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-white">
                {dssData?.executiveSummary?.urgentReorders || 0}
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
              <span className="text-2xl font-black font-mono text-amber-300">
                {(dssData?.executiveSummary?.totalPotentialLoss || 0).toLocaleString()}
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
              <span className="text-2xl font-black font-mono text-purple-200">
                {(dssData?.executiveSummary?.totalFrozenCapital || 0).toLocaleString()}
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
                            {rec.estimatedBudget.toLocaleString()} ج.م
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
                            {exp.potentialLoss.toLocaleString()} ج.م
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
                            {dead.frozenCapital.toLocaleString()} ج.م
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

      {isLoading ? (
        <div className="p-16 text-center text-slate-400 text-xs font-bold bg-white rounded-2xl border border-slate-200 shadow-2xs">
          جاري استخراج وتجميع المؤشرات اللحظية...
        </div>
      ) : data ? (
        <>
          {/* ===== 1. بطاقات المؤشرات القيادية السريعة (KPI Cards) ===== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            {/* مبيعات اليوم */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-emerald-600 mb-2">
                <span className="text-[11px] font-bold">مبيعات اليوم</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <TrendingUp size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-slate-800 font-mono">
                {data.summary.salesToday.toLocaleString()}{' '}
                <span className="text-[10px] font-normal text-slate-500">ج.س</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1 font-medium">
                {data.summary.invoicesCount} فاتورة مصدرة
              </p>
            </div>

            {/* مبيعات الشهر الحالي */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-[#00A8A8] mb-2">
                <span className="text-[11px] font-bold">مبيعات الشهر</span>
                <div className="p-2 rounded-xl bg-teal-50 text-[#00A8A8]">
                  <ShoppingBag size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-slate-800 font-mono">
                {data.summary.salesMonth.toLocaleString()}{' '}
                <span className="text-[10px] font-normal text-slate-500">ج.س</span>
              </p>
              <p className="text-[10px] text-teal-600 mt-1 font-bold">إجمالي التراكمي للشهر</p>
            </div>

            {/* مصروفات اليوم */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-rose-600 mb-2">
                <span className="text-[11px] font-bold">مصروفات اليوم</span>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <Wallet size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-slate-800 font-mono">
                {(data.summary.expensesToday || 0).toLocaleString()}{' '}
                <span className="text-[10px] font-normal text-slate-500">ج.س</span>
              </p>
              <p className="text-[10px] text-rose-600 mt-1 font-bold">سندات صرف معتمدة</p>
            </div>

            {/* الوردية النشطة */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-indigo-600 mb-2">
                <span className="text-[11px] font-bold">الورديات النشطة</span>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Clock size={16} />
                </div>
              </div>
              <p className="text-sm font-black text-slate-800 truncate">
                {data.activeShift ? data.activeShift.cashier : 'مغلقة حالياً'}
              </p>
              <p className="text-[10px] text-indigo-600 mt-1 font-mono">
                {data.activeShift
                  ? `وردية #${data.activeShift.shiftNumber} (${data.activeShift.expectedCash.toLocaleString()} ج.س)`
                  : 'لا توجد وردية مفتوحة'}
              </p>
            </div>

            {/* مديونية العملاء */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-amber-600 mb-2">
                <span className="text-[11px] font-bold">ديون العملاء (AR)</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Users size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-slate-800 font-mono">
                {data.summary.totalCustomerDebt.toLocaleString()}{' '}
                <span className="text-[10px] font-normal text-slate-500">ج.س</span>
              </p>
              <p className="text-[10px] text-amber-600 mt-1 font-bold">مستحقات آجلة طرف العملاء</p>
            </div>

            {/* مستحقات الموردين */}
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition">
              <div className="flex items-center justify-between text-purple-600 mb-2">
                <span className="text-[11px] font-bold">مستحقات الموردين (AP)</span>
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Truck size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-slate-800 font-mono">
                {data.summary.totalSupplierDebt.toLocaleString()}{' '}
                <span className="text-[10px] font-normal text-slate-500">ج.س</span>
              </p>
              <p className="text-[10px] text-purple-600 mt-1 font-bold">فواتير مشتريات مستحقة</p>
            </div>
          </div>

          {/* ===== 2. الرسوم البيانية والمؤشرات المرئية ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* مخطط حركة مبيعات الأسبوع */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xs font-black text-slate-800">
                    حركة المبيعات لآخر 7 أيام (Daily Sales Trend)
                  </h3>
                  <p className="text-[11px] text-slate-400">تتبع حجم المبيعات اليومية بالجنيه السوداني</p>
                </div>
                <span className="text-xs font-mono font-bold text-[#00A8A8] bg-teal-50 px-2.5 py-1 rounded-lg">
                  7 أيام
                </span>
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
                        {item.sales.toLocaleString()} ج.س
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
                  أعلى يوم: {maxWeeklySale.toLocaleString()} ج.س
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
                        {Number(data.payments.CASH || 0).toLocaleString()} ج.س
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
                        {Number(data.payments.BANK_TRANSFER || 0).toLocaleString()} ج.س
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
                        {Number(data.payments.CREDIT || 0).toLocaleString()} ج.س
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
                  {totalPayments.toLocaleString()} ج.س
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
                          {Number(item.amount).toLocaleString()} ج.س
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
                              {amount.toLocaleString()} ج.س ({percent}%)
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
                  {totalExpensesDistributed.toLocaleString()} ج.س
                </span>
              </div>
            </div>
          </div>

          {/* ===== 4. الجداول التشغيلية: آخر النشاطات ونواقص المخزون ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* آخر الفواتير والنشاطات الحية */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} className="text-[#00A8A8]" />
                  <h3 className="text-xs font-black text-slate-800">
                    أحدث فواتير المبيعات وسندات الصرف (Live Stream)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-500">سجل حركي مباشر</span>
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
                            {act.amount.toLocaleString()} ج.س
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-400 text-[10px]">
                            {new Date(act.date).toLocaleTimeString('ar-EG', {
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
                            تنتهي: {new Date(item.expiryDate).toLocaleDateString('ar-EG')}
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
      ) : null}
    </div>
  );
};

export default DashboardPage;