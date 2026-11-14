import { round2 } from '../utils/round.util';
import type { AgingBucketsTotals } from './aging.interface';

/**
 * مفاتيح شرائح الأعمار.
 */
export type AgingBucketKey =
  | 'CURRENT'
  | 'DAYS_31_60'
  | 'DAYS_61_90'
  | 'OVER_90';

/**
 * مستويات المخاطر.
 */
export type AgingRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * عتبات الشرائح (قابلة للتخصيص).
 */
export interface AgingThresholds {
  /** الحد الأعلى للشريحة الأولى (افتراضي: 30) */
  bucket1: number;
  /** الحد الأعلى للشريحة الثانية (افتراضي: 60) */
  bucket2: number;
  /** الحد الأعلى للشريحة الثالثة (افتراضي: 90) */
  bucket3: number;
}

/**
 * العتبات الافتراضية (30/60/90).
 */
export const DEFAULT_AGING_THRESHOLDS: AgingThresholds = {
  bucket1: 30,
  bucket2: 60,
  bucket3: 90,
};

/**
 * تعريف شريحة واحدة.
 */
export interface AgingBucketDef {
  key: AgingBucketKey;
  label: string;
  fromDays: number;
  /** null = لا حد أعلى */
  toDays: number | null;
  riskLevel: AgingRiskLevel;
}

// ─────────────────────────────────────────────────────────────
// Pure Functions
// ─────────────────────────────────────────────────────────────

/**
 * يبني تعريفات الشرائح الأربع بناءً على العتبات.
 *
 * @example
 * buildBucketDefinitions({ bucket1: 30, bucket2: 60, bucket3: 90 })
 * // → [
 * //   { key: 'CURRENT',    label: 'جاري (0-30 يوم)',   fromDays: 0,  toDays: 30,   riskLevel: 'LOW' },
 * //   { key: 'DAYS_31_60', label: 'متأخر (31-60)',     fromDays: 31, toDays: 60,   riskLevel: 'MEDIUM' },
 * //   { key: 'DAYS_61_90', label: 'متأخر (61-90)',     fromDays: 61, toDays: 90,   riskLevel: 'HIGH' },
 * //   { key: 'OVER_90',    label: 'متأخر (+90)',       fromDays: 91, toDays: null, riskLevel: 'CRITICAL' },
 * // ]
 */
export function buildBucketDefinitions(
  thresholds: AgingThresholds = DEFAULT_AGING_THRESHOLDS,
): AgingBucketDef[] {
  return [
    {
      key: 'CURRENT',
      label: `جاري (0-${thresholds.bucket1} يوم)`,
      fromDays: 0,
      toDays: thresholds.bucket1,
      riskLevel: 'LOW',
    },
    {
      key: 'DAYS_31_60',
      label: `متأخر (${thresholds.bucket1 + 1}-${thresholds.bucket2})`,
      fromDays: thresholds.bucket1 + 1,
      toDays: thresholds.bucket2,
      riskLevel: 'MEDIUM',
    },
    {
      key: 'DAYS_61_90',
      label: `متأخر (${thresholds.bucket2 + 1}-${thresholds.bucket3})`,
      fromDays: thresholds.bucket2 + 1,
      toDays: thresholds.bucket3,
      riskLevel: 'HIGH',
    },
    {
      key: 'OVER_90',
      label: `متأخر (+${thresholds.bucket3})`,
      fromDays: thresholds.bucket3 + 1,
      toDays: null,
      riskLevel: 'CRITICAL',
    },
  ];
}

/**
 * يحسب عدد الأيام بين تاريخين.
 * يستخدم `Math.floor` (مطابق للـ legacy code).
 */
export function computeDaysOverdue(asOfDate: Date, invoiceDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((asOfDate.getTime() - invoiceDate.getTime()) / msPerDay);
}

/**
 * يحدد الشريحة المناسبة لعدد الأيام.
 *   - أيام سالبة (تاريخ مستقبلي) → CURRENT
 *   - 0..bucket1 → CURRENT
 *   - bucket1+1..bucket2 → DAYS_31_60
 *   - bucket2+1..bucket3 → DAYS_61_90
 *   - أكبر من bucket3 → OVER_90
 */
export function computeBucket(
  daysOverdue: number,
  thresholds: AgingThresholds = DEFAULT_AGING_THRESHOLDS,
): AgingBucketKey {
  if (daysOverdue < 0) return 'CURRENT';
  if (daysOverdue <= thresholds.bucket1) return 'CURRENT';
  if (daysOverdue <= thresholds.bucket2) return 'DAYS_31_60';
  if (daysOverdue <= thresholds.bucket3) return 'DAYS_61_90';
  return 'OVER_90';
}

/**
 * يحسب مستوى المخاطر بناءً على أقدم فاتورة.
 */
export function computeRiskLevel(
  oldestDays: number,
  thresholds: AgingThresholds = DEFAULT_AGING_THRESHOLDS,
): AgingRiskLevel {
  if (oldestDays <= thresholds.bucket1) return 'LOW';
  if (oldestDays <= thresholds.bucket2) return 'MEDIUM';
  if (oldestDays <= thresholds.bucket3) return 'HIGH';
  return 'CRITICAL';
}

/**
 * يُرجع bucket totals فارغة.
 */
export function emptyBucketsTotals(): AgingBucketsTotals {
  return { current: 0, days31_60: 0, days61_90: 0, over90: 0 };
}

/**
 * يُضيف مبلغاً إلى الشريحة المناسبة (mutate).
 */
export function addToBuckets(
  totals: AgingBucketsTotals,
  bucket: AgingBucketKey,
  amount: number,
): void {
  switch (bucket) {
    case 'CURRENT':
      totals.current += amount;
      break;
    case 'DAYS_31_60':
      totals.days31_60 += amount;
      break;
    case 'DAYS_61_90':
      totals.days61_90 += amount;
      break;
    case 'OVER_90':
      totals.over90 += amount;
      break;
  }
}

/**
 * مجموع كل الشرائح.
 */
export function sumBuckets(totals: AgingBucketsTotals): number {
  return totals.current + totals.days31_60 + totals.days61_90 + totals.over90;
}

/**
 * يحوّل totals إلى نسب مئوية.
 * عند مجموع = 0 → كل النسب صفر.
 */
export function bucketsToPercentages(
  totals: AgingBucketsTotals,
): AgingBucketsTotals {
  const total = sumBuckets(totals);
  if (total === 0) return emptyBucketsTotals();
  return {
    current: round2((totals.current / total) * 100),
    days31_60: round2((totals.days31_60 / total) * 100),
    days61_90: round2((totals.days61_90 / total) * 100),
    over90: round2((totals.over90 / total) * 100),
  };
}

/**
 * يحسب متوسط عمر الدين لعدة فواتير.
 */
export function computeAverageAge(
  invoices: Array<{ ageInDays: number }>,
): number {
  if (invoices.length === 0) return 0;
  const sum = invoices.reduce((acc, inv) => acc + inv.ageInDays, 0);
  return round2(sum / invoices.length);
}
