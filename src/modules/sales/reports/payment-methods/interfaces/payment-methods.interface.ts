import { ReportMeta } from 'src/shared/report-kit';

/**
 * PaymentMethodStat
 * ─────────────────
 * إحصائيات طريقة دفع واحدة.
 */
export interface PaymentMethodStat {
  /** كود طريقة الدفع (CASH, CARD, ...) */
  method: string;

  /** الاسم المعروض بالعربية */
  methodLabel: string;

  /** ترتيب الطريقة (1 = الأعلى) */
  rank: number;

  // ─── الفواتير
  /** عدد الفواتير المكتملة */
  completedCount: number;

  /** عدد الفواتير المرتجعة */
  returnedCount: number;

  /** إجمالي عدد الفواتير */
  totalCount: number;

  // ─── الأرقام
  /** إجمالي المبيعات (gross) */
  grossAmount: number;

  /** إجمالي المرتجعات */
  returnsAmount: number;

  /** الصافي (gross - returns) */
  netAmount: number;

  /** النسبة من إجمالي الصافي */
  percentage: number;

  // ─── المقاييس المشتقة
  /** متوسط الفاتورة = netAmount / completedCount */
  avgTicket: number;

  /** نسبة المرتجعات = returnsAmount / grossAmount × 100 */
  returnRate: number;
}

/**
 * PaymentMethodsSummary
 * ─────────────────────
 * الملخص التنفيذي.
 */
export interface PaymentMethodsSummary {
  /** عدد طرق الدفع المستخدمة فعلياً */
  activeMethodsCount: number;

  /** إجمالي الفواتير */
  totalInvoicesCount: number;

  /** إجمالي المبيعات (gross) */
  totalGrossAmount: number;

  /** إجمالي المرتجعات */
  totalReturnsAmount: number;

  /** صافي المبيعات */
  totalNetAmount: number;

  /** متوسط الفاتورة العام */
  overallAvgTicket: number;

  /** الطريقة الأكثر استخداماً (بعدد الفواتير) */
  mostUsedMethod: {
    method: string;
    methodLabel: string;
    count: number;
  } | null;

  /** الطريقة الأعلى قيمة (netAmount) */
  topMethodByAmount: {
    method: string;
    methodLabel: string;
    amount: number;
  } | null;
}

/**
 * PaymentTrendPoint
 * ─────────────────
 * نقطة في الاتجاه اليومي (stacked chart).
 */
export interface PaymentTrendPoint {
  /** التاريخ (YYYY-MM-DD) */
  date: string;

  /** إجمالي مبيعات اليوم (net) */
  totalAmount: number;

  /** إجمالي عدد الفواتير */
  totalCount: number;

  /** مساهمة كل طريقة دفع */
  byMethod: Array<{
    method: string;
    methodLabel: string;
    amount: number;
    count: number;
  }>;
}

/**
 * PaymentMethodsResponse
 * ──────────────────────
 * الشكل الكامل للاستجابة.
 */
export interface PaymentMethodsResponse {
  /** بيانات وصفية موحدة */
  meta: ReportMeta;

  /** الملخص التنفيذي */
  summary: PaymentMethodsSummary;

  /** إحصائيات كل طريقة (مرتّبة) */
  methods: PaymentMethodStat[];

  /** الاتجاه اليومي لكل طريقة */
  dailyTrend: PaymentTrendPoint[];
}
