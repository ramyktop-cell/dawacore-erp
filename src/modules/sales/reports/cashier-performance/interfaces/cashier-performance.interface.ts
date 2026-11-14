import { ReportMeta } from 'src/shared/report-kit';

/**
 * CashierStat
 * ───────────
 * إحصائيات كاشير واحد خلال الفترة.
 */
export interface CashierStat {
  /** معرف الكاشير */
  cashierId: string;

  /** اسم الكاشير */
  cashierName: string;

  /** ترتيب الكاشير في القائمة (1 = الأول) */
  rank: number;

  // ─── الفواتير
  /** إجمالي عدد الفواتير (بما فيها المرتجعة) */
  invoicesCount: number;

  /** عدد الفواتير المكتملة */
  completedInvoicesCount: number;

  /** عدد الفواتير المرتجعة */
  returnedInvoicesCount: number;

  // ─── الأرقام المالية
  /** إجمالي المبيعات قبل الخصم */
  grossSales: number;

  /** إجمالي الخصومات */
  totalDiscounts: number;

  /** إجمالي المرتجعات */
  returns: number;

  /** صافي المبيعات = grossSales - totalDiscounts - returns */
  netSales: number;

  /** إجمالي المبالغ المحصلة */
  totalCollected: number;

  // ─── المقاييس المشتقة
  /** متوسط الفاتورة = netSales / completedInvoicesCount */
  avgTicket: number;

  /** نسبة المرتجعات = returns / grossSales × 100 */
  returnRate: number;

  // ─── التوقيت
  /** أول فاتورة خلال الفترة */
  firstSaleAt: string | null;

  /** آخر فاتورة خلال الفترة */
  lastSaleAt: string | null;
}

/**
 * CashierPerformanceSummary
 * ─────────────────────────
 * الملخص التنفيذي للتقرير.
 */
export interface CashierPerformanceSummary {
  /** عدد الكاشيرين النشطين في الفترة */
  totalCashiers: number;

  /** إجمالي الفواتير */
  totalInvoicesCount: number;

  /** إجمالي المبيعات (gross) */
  totalGrossSales: number;

  /** إجمالي المرتجعات */
  totalReturns: number;

  /** صافي المبيعات الكلي */
  totalNetSales: number;

  /** متوسط الفاتورة العام = totalNetSales / totalCompletedInvoices */
  overallAvgTicket: number;

  /** أفضل كاشير (الأعلى netSales) */
  bestCashier: {
    cashierId: string;
    cashierName: string;
    netSales: number;
  } | null;
}

/**
 * DailyTrendPoint
 * ───────────────
 * نقطة في الاتجاه الزمني اليومي (للرسم البياني).
 *
 * البنية: لكل يوم، نعرض مساهمة كل كاشير.
 */
export interface DailyTrendPoint {
  /** التاريخ بصيغة YYYY-MM-DD */
  date: string;

  /** إجمالي المبيعات (netSales) لهذا اليوم */
  totalSales: number;

  /** إجمالي عدد الفواتير لهذا اليوم */
  totalInvoices: number;

  /** مساهمات كل كاشير في هذا اليوم */
  byCashier: Array<{
    cashierId: string;
    cashierName: string;
    sales: number;
    invoicesCount: number;
  }>;
}

/**
 * CashierPerformanceInvoice
 * ─────────────────────────
 * صف فاتورة في القائمة التفصيلية.
 */
export interface CashierPerformanceInvoice {
  saleId: string;
  invoiceNumber: string;
  createdAt: string;
  cashierId: string;
  cashierName: string;
  customerName?: string;
  paymentMethod: string;
  subTotal: number;
  discountTotal: number;
  grandTotal: number;
  paidAmount: number;
  status: string;
  itemsCount: number;
}

/**
 * CashierPerformanceResponse
 * ──────────────────────────
 * الشكل الكامل لاستجابة التقرير.
 */
export interface CashierPerformanceResponse {
  /** بيانات وصفية موحدة (من report-kit) */
  meta: ReportMeta;

  /** الملخص التنفيذي */
  summary: CashierPerformanceSummary;

  /** إحصائيات كل كاشير (مرتبة حسب sortBy) */
  cashiers: CashierStat[];

  /** الاتجاه الزمني اليومي (لرسم بياني) */
  dailyTrend: DailyTrendPoint[];

  /** تفاصيل الفواتير (اختياري — محدود بـ limit) */
  invoices: CashierPerformanceInvoice[];
}
