import {
  BaseAgingReportResponse,
  AgingPartnerRow,
  AgingDocumentItem,
  AgingSummaryBucket,
  AgingBucketsTotals,
  AgingReportSummary,
  AgingBucketKey,
  AgingRiskLevel,
  AgingThresholds,
} from 'src/shared/report-kit/aging';

export type {
  AgingPartnerRow,
  AgingDocumentItem,
  AgingSummaryBucket,
  AgingBucketsTotals,
  AgingReportSummary,
  AgingBucketKey,
  AgingRiskLevel,
  AgingThresholds,
};

/**
 * تفاصيل سطر المورد في تقرير أعمار الديون.
 */
export interface SupplierAgingRow extends AgingPartnerRow {
  /** معرف المورد المباشر */
  supplierId: string;
  /** اسم شركة المورد (إن وجد) */
  supplierCompanyName?: string;
  /** الرقم الضريبي */
  taxNumber?: string;
}

/**
 * الاستجابة الشاملة لتقرير أعمار ديون الموردين.
 */
export interface SupplierAgingResponse extends BaseAgingReportResponse {
  partnerType: 'SUPPLIER';
  /** مصفوفة الموردين (مطابقة لـ partners مع توفير الاسم الصريح) */
  suppliers: SupplierAgingRow[];
}
