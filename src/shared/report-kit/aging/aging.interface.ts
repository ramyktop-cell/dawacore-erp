import type { AgingBucketKey, AgingRiskLevel, AgingThresholds } from './aging-buckets';
import type { ReportMeta } from '../interfaces/report-meta.interface';

/**
 * توزيع المبالغ على الشرائح الأربع.
 */
export interface AgingBucketsTotals {
  current: number;
  days31_60: number;
  days61_90: number;
  over90: number;
}

/**
 * AgingInvoice
 * ────────────
 * فاتورة واحدة (بيع أو شراء) في تقرير الأعمار.
 */
export interface AgingInvoice {
  /** معرف الفاتورة (Sale.id أو PurchaseOrder.id) */
  invoiceId: string;

  /** رقم الفاتورة */
  invoiceNumber: string;

  /** تاريخ الفاتورة (ISO) */
  invoiceDate: string;

  /** عمر الدين بالأيام (asOfDate − invoiceDate) */
  ageInDays: number;

  /** الشريحة التي تنتمي إليها */
  bucket: AgingBucketKey;

  /** الإجمالي الأصلي */
  grandTotal: number;

  /** المدفوع */
  paidAmount: number;

  /** إجمالي المرتجعات (إن وُجدت) */
  returnsAmount: number;

  /**
   * المتبقي غير المسدد = max(0, grandTotal − paidAmount − returnsAmount)
   */
  outstandingAmount: number;

  /** رابط مباشر لعرض الفاتورة في نظام آخر */
  invoiceUrl: string;
}

/**
 * AgingRowBase
 * ────────────
 * صف أساسي موحّد لكل من العميل والمورد.
 */
export interface AgingRowBase {
  // ─── هوية الطرف
  /** معرف العميل/المورد */
  partyId: string;

  /** اسم العميل/المورد */
  partyName: string;

  /** رقم الهاتف (اختياري) */
  phone?: string;

  // ─── الإجماليات
  /** إجمالي الدين غير المسدد */
  totalOutstanding: number;

  /** عدد الفواتير غير المسددة */
  invoicesCount: number;

  /** عمر أقدم فاتورة بالأيام */
  oldestInvoiceDays: number;

  /** مستوى المخاطر (مبني على oldestInvoiceDays) */
  riskLevel: AgingRiskLevel;

  // ─── التوزيع
  /** توزيع الدين على الشرائح */
  buckets: AgingBucketsTotals;

  // ─── روابط
  /** رابط دفتر الأستاذ للطرف */
  entriesUrl: string;

  /** رابط drill-down لتفاصيل الفواتير */
  invoicesUrl: string;

  // ─── تفاصيل (اختياري — حسب includeInvoices)
  /** تفاصيل الفواتير (يُملأ عند طلبها فقط) */
  invoices?: AgingInvoice[];
}

/**
 * AgingSummaryBase
 * ────────────────
 * ملخص موحّد للتقريرين.
 */
export interface AgingSummaryBase {
  /** عدد الأطراف (عملاء أو موردين) */
  partiesCount: number;

  /** إجمالي الدين */
  totalOutstanding: number;

  /** إجمالي عدد الفواتير غير المسددة */
  totalInvoicesCount: number;

  // ─── توزيع الشرائح
  /** إجمالي كل شريحة */
  bucketsTotals: AgingBucketsTotals;

  /** النسب المئوية لكل شريحة */
  bucketsPercentages: AgingBucketsTotals;

  // ─── مقاييس
  /** متوسط عمر الدين */
  averageAgeDays: number;

  /** أكبر مدين (عميل/مورد) */
  topDebtor: {
    partyId: string;
    partyName: string;
    amount: number;
  } | null;

  /** عدد الأطراف في مستوى CRITICAL */
  criticalPartiesCount: number;
}

/**
 * AgingComparisonInfo
 * ───────────────────
 * معلومات المقارنة (فارغة حالياً — extensibility).
 */
export interface AgingComparisonInfo {
  mode: 'NONE';
  label: string | null;
}

// ─────────────────────────────────────────────────────────────
// Compatibility & Extended Interfaces
// ─────────────────────────────────────────────────────────────

/**
 * تفاصيل شريحة في الملخص.
 */
export interface AgingSummaryBucket {
  key: AgingBucketKey;
  label: string;
  fromDays: number;
  toDays: number | null;
  amount: number;
  percentage: number;
  riskLevel: AgingRiskLevel;
}

/**
 * فاتورة/مستند ذمة مفصل لشريك.
 */
export interface AgingDocumentItem extends Partial<AgingInvoice> {
  id: string;
  documentNumber: string;
  documentDate: string;
  dueDate?: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  ageInDays: number;
  bucket: AgingBucketKey;
  invoiceId?: string;
  daysOverdue?: number;
}

/**
 * بيانات شريك (عميل أو مورد) في تقرير أعمار الديون.
 */
export interface AgingPartnerRow extends Partial<AgingRowBase> {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  phone?: string;
  creditLimit?: number;
  currentBalance: number;
  buckets: AgingBucketsTotals;
  percentages: AgingBucketsTotals;
  oldestDocumentDate?: string;
  oldestDocumentDays: number;
  averageAgeDays: number;
  riskLevel: AgingRiskLevel;
  documentsCount: number;
  documents?: AgingDocumentItem[];
  oldestInvoiceDate?: string;
  oldestInvoiceDays?: number;
  invoices?: any[];
}

/**
 * ملخص تقرير أعمار الديون.
 */
export interface AgingReportSummary {
  totalPartners: number;
  partnersWithBalance: number;
  totalBalance: number;
  buckets: AgingSummaryBucket[];
  ratios: {
    overdueRatio: number;
    criticalRatio: number;
    averageDebtPerPartner: number;
  };
}

/**
 * الاستجابة الشاملة لتقرير أعمار الديون المشترك.
 */
export interface BaseAgingReportResponse {
  meta: ReportMeta;
  partnerType: 'CUSTOMER' | 'SUPPLIER';
  thresholds: AgingThresholds;
  summary: AgingReportSummary;
  partners: AgingPartnerRow[];
}
