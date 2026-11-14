import { ReportMeta } from 'src/shared/report-kit';

/**
 * IncomeStatementLine
 * ───────────────────
 * صف واحد في قائمة الدخل (حساب أو مجموعة).
 *
 * يحتوي على روابط Drill-Down:
 *   - `drillUrl`   : للحسابات غير الطرفية (يوجد أبناء)
 *   - `entriesUrl` : للحسابات الطرفية (ينتقل إلى GL)
 */
export interface IncomeStatementLine {
  // ─── هوية الحساب
  accountId: string;
  accountCode: string;
  accountName: string;
  level: number;
  isLeaf: boolean;
  hasChildren: boolean;
  parentId: string | null;

  // ─── المبالغ الحالية
  amount: number;

  // ─── المقارنة (null لو compareMode=NONE)
  previousAmount: number | null;
  variance: number | null;
  variancePercentage: number | null;

  // ─── روابط Drill-Down (متبادلان — واحد فقط يكون غير null)
  /** يُستخدم للحسابات غير الطرفية — ينتقل لصفحة drill-down */
  drillUrl: string | null;

  /** يُستخدم للحسابات الطرفية — ينتقل إلى General Ledger */
  entriesUrl: string | null;
}

/**
 * IncomeStatementGroup
 * ────────────────────
 * مجموعة (إيرادات / مصروفات) مع أسطرها.
 */
export interface IncomeStatementGroup {
  groupKey: 'REVENUE' | 'EXPENSE';
  groupLabel: string;
  lines: IncomeStatementLine[];
  total: number;
  previousTotal: number | null;
  variance: number | null;
  variancePercentage: number | null;
}

/**
 * IncomeStatementSummary
 * ──────────────────────
 * ملخص قائمة الدخل ومؤشرات الأداء المالي.
 */
export interface IncomeStatementSummary {
  // ─── الفترة الحالية
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;

  // ─── المقارنة (null لو compareMode=NONE)
  previousTotalRevenue: number | null;
  previousTotalExpenses: number | null;
  previousNetIncome: number | null;

  // ─── الفروقات المطلقة
  revenueVariance: number | null;
  expensesVariance: number | null;
  netIncomeVariance: number | null;

  // ─── الفروقات النسبية (%)
  revenueGrowth: number | null;
  expensesGrowth: number | null;
  netIncomeGrowth: number | null;

  // ─── الهوامش (Margins)
  netIncomeMargin: number; // (netIncome / totalRevenue) × 100
  previousNetIncomeMargin: number | null;
}

/**
 * IncomeStatementResponse
 * ───────────────────────
 * الشكل الكامل لاستجابة قائمة الدخل.
 */
export interface IncomeStatementResponse {
  meta: ReportMeta;
  summary: IncomeStatementSummary;
  groups: IncomeStatementGroup[];

  // ─── معلومات المقارنة
  comparison: {
    mode: 'NONE' | 'PREVIOUS_YEAR' | 'PREVIOUS_PERIOD';
    previousFromDate: string | null;
    previousToDate: string | null;
    label: string | null; // مثال: "نفس الفترة 2025"
  };
}

/**
 * IncomeStatementDrillDownResponse
 * ────────────────────────────────
 * استجابة استعلام التنقل الشجري (Drill-Down).
 */
export interface IncomeStatementDrillDownResponse {
  parent: { id: string; code: string; name: string };
  lines: IncomeStatementLine[];
  comparison: {
    mode: 'NONE' | 'PREVIOUS_YEAR' | 'PREVIOUS_PERIOD';
    previousFromDate: string | null;
    previousToDate: string | null;
    label: string | null;
  };
}

export type DrillDownResult = IncomeStatementDrillDownResponse;
