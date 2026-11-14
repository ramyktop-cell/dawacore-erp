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

      <div className="bg-white rounded-3xl p-5 sm:p-7 text-slate-800 shadow-md border border-slate-200/90 relative overflow-hidden">
        {/* شريط علوي متدرج مطابق لتصميم الهوية */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-[#00A8A8] via-emerald-400 to-amber-400" />

        {/* رأس قسم دعم القرار */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 pt-1">
          {/* العنوان والأيقونة (يمين) */}
          <div className="space-y-2">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0D9488] to-[#0F766E] text-white shadow-md shadow-teal-600/20 flex items-center justify-center shrink-0">
                <BrainCircuit size={28} />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-800 leading-tight">
                  مركز دعم اتخاذ القرار
                </h2>
                <div className="text-xs font-semibold text-slate-500 tracking-wide">
                  Executive Decision Hub
                </div>
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold bg-[#E6F7F5] text-[#0F766E] px-3 py-0.5 rounded-full border border-teal-200/80">
                  <Package size={12} />
                  <span>محرك التحليل الاستباقي (DSS)</span>
                </span>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              توصيات تشغيلية مدعومة بتحليل بيانات لحماية الأرباح، تسريع دورة المخزون، وتقليل المخزون الراكد.
            </p>
          </div>

          {/* أزرار التبويبات والفلترة (يسار) */}
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              onClick={() => setActiveDssTab('REORDER')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                activeDssTab === 'REORDER'
                  ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
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
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                activeDssTab === 'EXPIRY'
                  ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
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
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                activeDssTab === 'DEAD_STOCK'
                  ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-xs'
                  : 'bg-slate-100/90 text-slate-700 border-slate-200 hover:bg-slate-200/70'
              }`}
            >
              <Layers size={14} />
              <span>رأس المال المجمد (راكد)</span>
              {dssData?.executiveSummary?.deadItemsCount ? (
                <span className="bg-violet-700 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                  {dssData.executiveSummary.deadItemsCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* كروت المؤشرات الاستراتيجية الـ 3 بالتصميم المطابق للصورة */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4 relative z-10">
          {/* كارت 1 (يمين): أصناف مهددة بالنفاد (تركواز / أخضر) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setActiveDssTab('REORDER')}
            className="relative overflow-hidden bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer flex flex-col justify-between"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-teal-500 to-emerald-400" />
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-xs sm:text-sm font-bold text-slate-700">
                  أصناف مهددة بالنفاد (قبل 7 أيام)
                </div>
                <div className="mt-2.5 pr-3 border-r-3 border-teal-500 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900">
                    {dssData?.executiveSummary?.urgentReorders || 0}
                  </span>
                  <span className="text-lg sm:text-xl font-black text-slate-800">أصناف</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-full bg-[#E6F7F5] text-teal-600 flex items-center justify-center shrink-0">
                <Zap size={20} />
              </div>
            </div>
            <div className="bg-[#EAF8F6] text-teal-950 rounded-xl px-3.5 py-2.5 text-[11px] font-semibold flex items-center justify-between gap-2">
              <Package size={16} className="text-teal-600 shrink-0" />
              <span className="leading-relaxed">
                محسوبة بناءً على سرعة الاستهلاك الفعلي لآخر 30 يوماً.
              </span>
            </div>
          </div>

          {/* كارت 2 (وسط): الخسارة المالية المهددة بالتلف (برتقالي / كهرماني) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setActiveDssTab('EXPIRY')}
            className="relative overflow-hidden bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer flex flex-col justify-between"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-amber-500 to-amber-300" />
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-xs sm:text-sm font-bold text-slate-700">
                  الخسارة المالية المهددة بالتلف
                </div>
                <div className="mt-2.5 pr-3 border-r-3 border-amber-400 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900">
                    {(dssData?.executiveSummary?.totalPotentialLoss || 0).toLocaleString()}
                  </span>
                  <span className="text-base sm:text-lg font-black text-slate-800">ج.س</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-full bg-[#FEF3C7] text-amber-600 flex items-center justify-center shrink-0">
                <TrendingDown size={20} />
              </div>
            </div>
            <div className="bg-[#FFF6E5] text-amber-950 rounded-xl px-3.5 py-2.5 text-[11px] font-semibold flex items-center justify-between gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span className="leading-relaxed">
                تصفيتها فوراً بالخصومات المقترحة قبل انتهاء الصلاحية.
              </span>
            </div>
          </div>

          {/* كارت 3 (يسار): رأس المال المجمد (بنفسجي) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setActiveDssTab('DEAD_STOCK')}
            className="relative overflow-hidden bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer flex flex-col justify-between"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-purple-600 to-violet-400" />
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-xs sm:text-sm font-bold text-slate-700">
                  رأس المال المجمد (بدون حركة 60 يوم)
                </div>
                <div className="mt-2.5 pr-3 border-r-3 border-purple-400 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900">
                    {(dssData?.executiveSummary?.totalFrozenCapital || 0).toLocaleString()}
                  </span>
                  <span className="text-base sm:text-lg font-black text-slate-800">ج.س</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-full bg-[#F3E8FF] text-purple-600 flex items-center justify-center shrink-0">
                <Layers size={20} />
              </div>
            </div>
            <div className="bg-[#F5EEFF] text-purple-950 rounded-xl px-3.5 py-2.5 text-[11px] font-semibold flex items-center justify-between gap-2">
              <BadgePercent size={16} className="text-purple-600 shrink-0" />
              <span className="leading-relaxed">
                يوصى بعمل عروض مجمعة (Bundling) أو تحرير السيولة فوراً.
              </span>
            </div>
          </div>
        </div>

        {/* تفاصيل التوصيات التفاعلية بناءً على التبويب المختار */}
        <div className="relative z-10 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {isDssLoading ? (
            <div className="p-8 text-center text-slate-500 text-xs font-semibold">
              جاري تشغيل خوارزميات محرك دعم القرارات ومسح المبيعات التاريخية...
            </div>
          ) : activeDssTab === 'REORDER' ? (
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <span className="flex items-center gap-1.5 text-sm sm:text-base font-black text-slate-800">
                  <Zap size={18} className="text-amber-500 fill-amber-400" />
                  <span>جدول التوصيات الذكية لإعادة الطلب وتفادي نفاد الأصناف</span>
                </span>
                <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-xl text-[11px] font-bold">
                  <Calendar size={13} className="text-slate-500" />
                  <span>معدل التغطية المستهدف: 30 يوماً قادمة</span>
                </span>
              </div>
              {dssData?.reorderRecommendations?.length === 0 ? (
                <div className="py-10 px-6 text-center bg-gradient-to-b from-slate-50/70 via-teal-50/25 to-emerald-50/40 border border-slate-100 rounded-2xl">
                  <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-[#E6F7F5] flex items-center justify-center relative">
                    <Package size={36} className="text-[#0F766E]" />
                    <CheckCircle2
                      size={20}
                      className="text-emerald-600 bg-white rounded-full absolute bottom-1.5 left-1.5"
                    />
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-800">
                    كافة الأصناف لديها تغطية مخزنية كافية ولا توجد حالات نفاد وشيكة.
                  </div>
                  <div className="text-xs text-slate-500 font-semibold mt-1">
                    معدل التغطية الحالي يلبي خطة التشغيل ويضمن استمرارية التوريد خلال 30 يوماً قادمة.
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 text-[11px] font-bold">
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
                    <tbody className="divide-y divide-slate-100">
                      {dssData?.reorderRecommendations.map((rec) => (
                        <tr key={rec.medicineId} className="hover:bg-teal-50/30 transition">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{rec.name}</div>
                            <span className="text-[10px] text-slate-400 font-mono">{rec.code}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`font-mono font-bold ${
                                rec.currentStock === 0
                                  ? 'text-rose-600'
                                  : rec.currentStock <= rec.minStockLevel
                                  ? 'text-amber-600'
                                  : 'text-slate-700'
                              }`}
                            >
                              {rec.currentStock} وحدة
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[#00A8A8]">
                            {rec.dailyVelocity} / يوم
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                                rec.daysRemaining <= 3
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {rec.daysRemaining === 0 ? 'نافد الآن!' : `${rec.daysRemaining} يوم`}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-emerald-600">
                            +{rec.suggestedOrderQty} وحدة
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-slate-700">
                            {rec.estimatedBudget.toLocaleString()} ج.س
                          </td>
                          <td className="py-3 px-3">
                            {rec.bestSupplier ? (
                              <div>
                                <div className="text-slate-800 font-bold">{rec.bestSupplier.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                  <PhoneCall size={10} />
                                  {rec.bestSupplier.phone}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">مورد جديد</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <a
                              href={`/purchasing/orders?medicineId=${rec.medicineId}&qty=${rec.suggestedOrderQty}`}
                              className="inline-flex items-center gap-1.5 bg-[#00A8A8] hover:bg-[#009292] text-white font-bold px-3 py-1.5 rounded-xl text-[11px] transition shadow-xs"
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                <span className="font-black text-amber-700">
                  ⏳ مستشار تصفية الصلاحيات والخصومات المقترحة لتفادي الهدر:
                </span>
                <span className="text-slate-500 text-[11px] font-medium">
                  أصناف قاربت على الانتهاء خلال الـ 90 يوماً القادمة
                </span>
              </div>
              {dssData?.expiryRiskRecommendations?.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs font-medium bg-slate-50/60 rounded-xl">
                  لا توجد دفعات قريبة الانتهاء مهددة بالخسارة حالياً.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 text-[11px] font-bold">
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
                    <tbody className="divide-y divide-slate-100">
                      {dssData?.expiryRiskRecommendations.map((exp) => (
                        <tr key={exp.batchId} className="hover:bg-amber-50/30 transition">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{exp.tradeName}</div>
                            <span className="text-[10px] text-amber-700 font-mono">
                              تشغيلة: {exp.batchNumber}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-700">{exp.quantity}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                                exp.daysToExpiry <= 30
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {exp.daysToExpiry} يوم متبقي
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {exp.projectedSalesUntilExpiry} وحدة
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-rose-600">
                            {exp.unsoldRiskQty} وحدة
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-rose-700">
                            {exp.potentialLoss.toLocaleString()} ج.س
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
                                -{exp.suggestedMarkdownPercent}%
                              </span>
                              <span className="line-through text-slate-400 text-[10px] font-mono">
                                {exp.salePrice}
                              </span>
                              <span className="text-emerald-600 font-mono text-xs">
                                {exp.suggestedSalePrice} ج.س
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-[11px] text-slate-600 max-w-xs leading-relaxed">
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                <span className="font-black text-violet-700">
                  🧊 تحليل رأس المال المجمد في البضاعة الراكدة (Dead Stock):
                </span>
                <span className="text-slate-500 text-[11px] font-medium">
                  أصناف يتوفر لها مخزون ولم تسجل أي حركة بيع خلال آخر 60 يوماً
                </span>
              </div>
              {dssData?.deadStockRecommendations?.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs font-medium bg-slate-50/60 rounded-xl">
                  المخزون متداول بشكل صحي ولا توجد بضائع راكدة مجمدة لرأس المال.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 text-[11px] font-bold">
                        <th className="py-2.5 px-3">الصنف</th>
                        <th className="py-2.5 px-3">الرصيد الراكد</th>
                        <th className="py-2.5 px-3">متوسط التكلفة</th>
                        <th className="py-2.5 px-3">رأس المال المجمد</th>
                        <th className="py-2.5 px-3">فترة الركود</th>
                        <th className="py-2.5 px-3">القرار الإداري المقترح</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dssData?.deadStockRecommendations.map((dead) => (
                        <tr key={dead.medicineId} className="hover:bg-violet-50/30 transition">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{dead.name}</div>
                            <span className="text-[10px] text-slate-400 font-mono">{dead.code}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-violet-700 font-bold">
                            {dead.currentStock} وحدة
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {dead.avgCost} ج.س
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-violet-700">
                            {dead.frozenCapital.toLocaleString()} ج.س
                          </td>
                          <td className="py-3 px-3">
                            <span className="bg-violet-50 border border-violet-200 text-violet-700 text-[10px] px-2 py-0.5 rounded-md font-mono font-bold">
                              أكثر من {dead.daysWithoutSales} يوم
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-[11px] text-slate-600 max-w-sm leading-relaxed">
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
          {/* ===== 1. بطاقات المؤشرات القيادية السريعة المرتبطة بالتقارير (Interactive KPI Cards) ===== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* 1. مبيعات اليوم -> تقرير المبيعات اليومية */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/reports/daily-sales')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/reports/daily-sales')}
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-emerald-50/30 to-emerald-50/70 border border-emerald-200/80 shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
              <div>
                <div className="flex items-center justify-between text-emerald-700 mb-2 mt-0.5">
                  <span className="text-xs font-black">مبيعات اليوم</span>
                  <div className="p-2 rounded-xl bg-emerald-100/80 text-emerald-600 group-hover:scale-110 transition-transform">
                    <TrendingUp size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-800 font-mono tracking-tight">
                  {data.summary.salesToday.toLocaleString()}{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[10px] font-bold text-emerald-700">
                <span>{data.summary.invoicesCount} فاتورة مصدرة</span>
                <span className="inline-flex items-center gap-0.5 text-emerald-600 group-hover:translate-x-[-2px] transition-transform">
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
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-teal-50/30 to-cyan-50/70 border border-teal-200/80 shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#00A8A8] to-cyan-500" />
              <div>
                <div className="flex items-center justify-between text-[#00A8A8] mb-2 mt-0.5">
                  <span className="text-xs font-black">مبيعات الشهر</span>
                  <div className="p-2 rounded-xl bg-teal-100/80 text-[#00A8A8] group-hover:scale-110 transition-transform">
                    <ShoppingBag size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-800 font-mono tracking-tight">
                  {data.summary.salesMonth.toLocaleString()}{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-teal-200/60 flex items-center justify-between text-[10px] font-bold text-teal-700">
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
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-rose-50/30 to-pink-50/60 border border-rose-200/80 shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-400 to-pink-500" />
              <div>
                <div className="flex items-center justify-between text-rose-600 mb-2 mt-0.5">
                  <span className="text-xs font-black">مصروفات اليوم</span>
                  <div className="p-2 rounded-xl bg-rose-100/80 text-rose-600 group-hover:scale-110 transition-transform">
                    <Wallet size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-800 font-mono tracking-tight">
                  {(data.summary.expensesToday || 0).toLocaleString()}{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-rose-200/60 flex items-center justify-between text-[10px] font-bold text-rose-600">
                <span>سندات صرف معتمدة</span>
                <span className="inline-flex items-center gap-0.5 text-rose-600 group-hover:translate-x-[-2px] transition-transform">
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
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-indigo-50/30 to-sky-50/60 border border-indigo-200/80 shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-400 to-sky-500" />
              <div>
                <div className="flex items-center justify-between text-indigo-600 mb-2 mt-0.5">
                  <span className="text-xs font-black">الوردية النشطة</span>
                  <div className="p-2 rounded-xl bg-indigo-100/80 text-indigo-600 group-hover:scale-110 transition-transform">
                    <Clock size={16} />
                  </div>
                </div>
                <p className="text-sm font-black text-slate-800 truncate">
                  {data.activeShift ? data.activeShift.cashier : 'مغلقة حالياً'}
                </p>
                <p className="text-[10px] text-indigo-600 mt-1 font-mono font-bold truncate">
                  {data.activeShift
                    ? `وردية #${data.activeShift.shiftNumber} (${data.activeShift.expectedCash.toLocaleString()} ج.س)`
                    : 'لا توجد وردية مفتوحة'}
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-indigo-200/60 flex items-center justify-between text-[10px] font-bold text-indigo-600">
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
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-amber-50/35 to-orange-50/60 border border-amber-200/80 shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <div>
                <div className="flex items-center justify-between text-amber-700 mb-2 mt-0.5">
                  <span className="text-xs font-black">ديون العملاء (AR)</span>
                  <div className="p-2 rounded-xl bg-amber-100/80 text-amber-600 group-hover:scale-110 transition-transform">
                    <Users size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-800 font-mono tracking-tight">
                  {data.summary.totalCustomerDebt.toLocaleString()}{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-amber-200/60 flex items-center justify-between text-[10px] font-bold text-amber-700">
                <span>ذمم مدينة آجلة</span>
                <span className="inline-flex items-center gap-0.5 text-amber-600 group-hover:translate-x-[-2px] transition-transform">
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
              className="group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-white via-purple-50/30 to-violet-50/60 border border-purple-200/80 shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-400 to-violet-500" />
              <div>
                <div className="flex items-center justify-between text-purple-700 mb-2 mt-0.5">
                  <span className="text-xs font-black">مستحقات الموردين (AP)</span>
                  <div className="p-2 rounded-xl bg-purple-100/80 text-purple-600 group-hover:scale-110 transition-transform">
                    <Truck size={16} />
                  </div>
                </div>
                <p className="text-xl font-black text-slate-800 font-mono tracking-tight">
                  {data.summary.totalSupplierDebt.toLocaleString()}{' '}
                  <span className="text-[10px] font-bold text-slate-500">ج.س</span>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-purple-200/60 flex items-center justify-between text-[10px] font-bold text-purple-700">
                <span>ذمم دائنة للموردين</span>
                <span className="inline-flex items-center gap-0.5 text-purple-600 group-hover:translate-x-[-2px] transition-transform">
                  <span>حسابات الموردين</span>
                  <ArrowUpRight size={12} />
                </span>
              </div>
            </div>
          </div>

          {/* ===== 2. الرسوم البيانية والمؤشرات المرئية ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* مخطط حركة مبيعات الأسبوع */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-md transition">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-xs font-black text-slate-800">
                    حركة المبيعات لآخر 7 أيام (Daily Sales Trend)
                  </h3>
                  <p className="text-[11px] text-slate-400">تتبع حجم المبيعات اليومية بالجنيه السوداني</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/reports/daily-sales')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00A8A8] hover:text-teal-700 bg-teal-50 hover:bg-teal-100/80 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    <span>تقرير المبيعات التفصيلي</span>
                    <ArrowUpRight size={12} />
                  </button>
                  <span className="text-xs font-mono font-bold text-[#00A8A8] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
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