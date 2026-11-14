import { ReportMeta } from 'src/shared/report-kit';

/**
 * HourlySales
 * ───────────
 * بيانات مبيعات ساعة واحدة (0-23).
 */
export interface HourlySales {
  /** رقم الساعة (0-23) */
  hour: number;

  /** تسمية عربية (مثال: "01 ص"، "12 م") */
  hourLabel: string;

  /** عدد الفواتير في هذه الساعة */
  invoicesCount: number;

  /** إجمالي المبيعات (بعد خصم المرتجعات) */
  totalSales: number;
}

/**
 * TopProductItem
 * ──────────────
 * بيانات صنف واحد من أعلى 10 أصناف مبيعاً.
 */
export interface TopProductItem {
  /** معرف الصنف (Medicine) */
  medicineId: string;

  /** الاسم التجاري */
  tradeName: string;

  /** إجمالي الكمية المباعة */
  totalQuantity: number;

  /** إجمالي قيمة البيع */
  totalSales: number;
}

/**
 * DailySalesSummary
 * ─────────────────
 * الملخص التنفيذي للتقرير.
 */
export interface DailySalesSummary {
  /** إجمالي عدد الفواتير (بما فيها المرتجعة) */
  totalInvoicesCount: number;

  /** عدد الفواتير المكتملة */
  completedInvoicesCount: number;

  /** عدد الفواتير المرتجعة */
  returnedInvoicesCount: number;

  /** إجمالي المبيعات قبل الخصم */
  grossSales: number;

  /** إجمالي الخصومات */
  totalDiscounts: number;

  /** صافي المبيعات = grossSales − totalDiscounts − totalReturns */
  netSales: number;

  /** إجمالي المرتجعات */
  totalReturns: number;

  /** إجمالي المبالغ المحصلة فعلياً */
  totalCollected: number;
}

/**
 * PaymentBreakdown
 * ────────────────
 * تفصيل طريقة دفع واحدة.
 */
export interface PaymentBreakdown {
  /** كود طريقة الدفع (CASH, BANK, ...) */
  method: string;

  /** المبلغ الإجمالي (بعد خصم المرتجعات) */
  amount: number;

  /** النسبة من إجمالي المدفوعات */
  percentage: number;
}

/**
 * CashierSalesSummary
 * ───────────────────
 * أداء كاشير واحد.
 */
export interface CashierSalesSummary {
  /** معرف الكاشير */
  cashierId: string;

  /** اسم الكاشير */
  cashierName: string;

  /** عدد الفواتير */
  invoicesCount: number;

  /** إجمالي المبيعات (بدون خصم المرتجعات) */
  totalSales: number;

  /** إجمالي المرتجعات */
  returns: number;

  /** الصافي = totalSales − returns */
  netTotal: number;
}

/**
 * DailySalesInvoice
 * ─────────────────
 * فاتورة واحدة في قائمة التفاصيل.
 */
export interface DailySalesInvoice {
  /** معرف البيع */
  saleId: string;

  /** رقم الفاتورة */
  invoiceNumber: string;

  /** تاريخ الإنشاء (ISO string) */
  createdAt: string;

  /** اسم الكاشير */
  cashierName: string;

  /** اسم العميل (أو "نقدي / عميل عام") */
  customerName?: string;

  /** طريقة الدفع */
  paymentMethod: string;

  /** المجموع قبل الخصم */
  subTotal: number;

  /** إجمالي الخصم */
  discountTotal: number;

  /** الإجمالي النهائي */
  grandTotal: number;

  /** المدفوع */
  paidAmount: number;

  /** حالة الفاتورة */
  status: string;

  /** عدد الأصناف في الفاتورة */
  itemsCount: number;
}

/**
 * DailySalesResponse
 * ──────────────────
 * الشكل الكامل لاستجابة التقرير.
 */
export interface DailySalesResponse {
  /** بيانات وصفية موحدة (من report-kit) */
  meta: ReportMeta;

  /** الملخص التنفيذي */
  summary: DailySalesSummary;

  /** تفصيل طرق الدفع */
  paymentBreakdown: PaymentBreakdown[];

  /** أداء الكاشيرين */
  cashierBreakdown: CashierSalesSummary[];

  /** التحليل الساعي (24 ساعة كاملة) */
  hourlyBreakdown: HourlySales[];

  /** أعلى 10 أصناف مبيعاً */
  topProducts: TopProductItem[];

  /** تفاصيل الفواتير */
  invoices: DailySalesInvoice[];
}
