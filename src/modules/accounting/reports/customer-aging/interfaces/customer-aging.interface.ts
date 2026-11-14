import { ReportMeta } from 'src/shared/report-kit';
import type {
  AgingRowBase,
  AgingSummaryBase,
  AgingInvoice,
  AgingComparisonInfo,
  AgingBucketsTotals,
  AgingBucketKey,
  AgingRiskLevel,
  AgingDocumentItem,
  AgingSummaryBucket,
} from 'src/shared/report-kit';

export type {
  AgingRowBase,
  AgingSummaryBase,
  AgingInvoice,
  AgingComparisonInfo,
  AgingBucketsTotals,
  AgingBucketKey,
  AgingRiskLevel,
  AgingDocumentItem,
  AgingSummaryBucket,
};

/**
 * CustomerAgingRow
 * ────────────────
 * صف عميل واحد في تقرير أعمار الديون.
 *
 * يمدّ `AgingRowBase` بخصائص خاصة بالعميل.
 */
export interface CustomerAgingRow extends AgingRowBase {
  // ─── خصائص العميل
  /** حد الائتمان المسموح */
  creditLimit: number;

  /** الرصيد الدفتري الحالي (Customer.currentDebt) */
  currentDebt: number;

  /** هل تجاوز حد الائتمان؟ */
  isOverCreditLimit: boolean;

  /** نسبة استخدام حد الائتمان (0-100+) */
  creditUtilization: number;

  // ─── التوافق العكسي (Compatibility Aliases)
  /** التوافق مع customerId */
  customerId?: string;
  /** التوافق مع partnerId */
  partnerId?: string;
  /** التوافق مع partnerCode */
  partnerCode?: string;
  /** التوافق مع partnerName */
  partnerName?: string;
  /** التوافق مع currentBalance */
  currentBalance?: number;
  /** التوافق مع oldestDocumentDays */
  oldestDocumentDays?: number;
  /** التوافق مع oldestDocumentDate */
  oldestDocumentDate?: string;
  /** التوافق مع oldestInvoiceDate */
  oldestInvoiceDate?: string;
  /** التوافق مع averageAgeDays */
  averageAgeDays?: number;
  /** التوافق مع documents */
  documents?: any[];
  /** التوافق مع documentsCount */
  documentsCount?: number;
  /** التوافق مع percentages */
  percentages?: AgingBucketsTotals;
}

/**
 * CustomerAgingSummary
 * ────────────────────
 * ملخص التقرير.
 *
 * يمدّ `AgingSummaryBase` بمعلومات إضافية عن الائتمان.
 */
export interface CustomerAgingSummary extends AgingSummaryBase {
  /** عدد العملاء الذين تجاوزوا حد الائتمان */
  overCreditLimitCount: number;

  /** إجمالي حد الائتمان الممنوح */
  totalCreditLimit: number;

  /** نسبة استخدام إجمالي الائتمان */
  overallCreditUtilization: number;

  // ─── التوافق العكسي (Compatibility Aliases)
  totalPartners?: number;
  partnersWithBalance?: number;
  totalBalance?: number;
  buckets?: any[];
  ratios?: {
    overdueRatio: number;
    criticalRatio: number;
    averageDebtPerPartner: number;
  };
}

/**
 * CustomerAgingResponse
 * ─────────────────────
 * الشكل الكامل لاستجابة التقرير.
 */
export interface CustomerAgingResponse {
  meta: ReportMeta;
  summary: CustomerAgingSummary;
  rows: CustomerAgingRow[];

  /** معلومات المقارنة (فارغة حالياً) */
  comparison: AgingComparisonInfo;

  /** معلومات العتبات المستخدمة */
  thresholds: {
    bucket1: number;
    bucket2: number;
    bucket3: number;
  };

  // ─── التوافق العكسي (Compatibility Aliases)
  customers?: CustomerAgingRow[];
  partners?: CustomerAgingRow[];
  partnerType?: 'CUSTOMER' | 'SUPPLIER';
}

/**
 * CustomerAgingDrillResponse
 * ──────────────────────────
 * استجابة Drill-Down لعميل واحد.
 */
export interface CustomerAgingDrillResponse {
  customer: {
    id: string;
    name: string;
    phone: string;
    creditLimit: number;
    currentDebt: number;
  };
  asOfDate: string;
  thresholds: {
    bucket1: number;
    bucket2: number;
    bucket3: number;
  };
  totalOutstanding: number;
  invoices: AgingInvoice[];
}
