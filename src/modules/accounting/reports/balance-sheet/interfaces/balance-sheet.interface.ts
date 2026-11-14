import { ReportMeta } from 'src/shared/report-kit';

/**
 * BalanceSheetLine
 * ────────────────
 * صف واحد في الميزانية العمومية.
 *
 * يدعم سطوراً افتراضية (Virtual) مثل:
 *   - Retained Earnings (مُحسب تراكمياً)
 *   - Current Period Net Income (مُحسب للفترة الحالية)
 */
export interface BalanceSheetLine {
  // ─── هوية الحساب
  /** null للسطور الافتراضية (Virtual) */
  accountId: string | null;
  accountCode: string;
  accountName: string;
  level: number;
  isLeaf: boolean;
  hasChildren: boolean;
  parentId: string | null;

  // ─── الرصيد الحالي (asOfDate)
  /**
   * موقّع: موجب = مدين، سالب = دائن.
   *   Assets    : balance > 0 (مدين)
   *   Liab/Equity: balance < 0 (دائن)
   */
  balance: number;

  /** للعرض: |balance| */
  absoluteBalance: number;

  /** عرض المدين/الدائن (واحد فقط غير صفر) */
  debit: number;
  credit: number;

  // ─── المقارنة (null لو compareMode=NONE)
  previousBalance: number | null;
  variance: number | null;
  variancePercentage: number | null;

  // ─── مؤشر السطر الافتراضي
  /** true للسطور المُشتقة (Retained Earnings, Net Income) */
  isVirtual: boolean;

  // ─── روابط Drill-Down (نفس نمط Income Statement)
  /** للحسابات غير الطرفية → drill-down */
  drillUrl: string | null;

  /** للحسابات الطرفية → General Ledger */
  entriesUrl: string | null;
}

/**
 * BalanceSheetGroup
 * ─────────────────
 * مجموعة (Assets / Liabilities / Equity).
 */
export interface BalanceSheetGroup {
  groupKey: 'ASSETS' | 'LIABILITIES' | 'EQUITY';
  groupLabel: string;
  lines: BalanceSheetLine[];

  /** إجمالي المجموعة (بالقيمة المطلقة) */
  total: number;

  previousTotal: number | null;
  variance: number | null;
  variancePercentage: number | null;
}

/**
 * BalanceSheetRatio
 * ─────────────────
 * مؤشر مالي محسوب.
 */
export interface BalanceSheetRatio {
  key: 'currentRatio' | 'workingCapital' | 'debtToEquity' | 'debtRatio' | 'equityRatio';
  label: string;
  value: number;
  /** هل القيمة موجبة/سليمة؟ (لتلوين KPI) */
  isHealthy: boolean;
  hint?: string;
}

/**
 * BalanceSheetSummary
 * ───────────────────
 * ملخص الميزانية + فحص التوازن + المؤشرات.
 */
export interface BalanceSheetSummary {
  // ─── إجماليات الفترة الحالية
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;

  // ─── تفصيل الأصول والخصوم
  currentAssets: number;
  nonCurrentAssets: number;
  currentLiabilities: number;
  nonCurrentLiabilities: number;

  // ─── المقارنة (null لو compareMode=NONE)
  previousTotalAssets: number | null;
  previousTotalLiabilities: number | null;
  previousTotalEquity: number | null;

  // ─── الفروقات
  assetsVariance: number | null;
  liabilitiesVariance: number | null;
  equityVariance: number | null;

  // ─── فحص التوازن (الأهم!)
  /** assets − (liabilities + equity) */
  balanceDifference: number;
  isBalanced: boolean;

  // ─── Retained Earnings
  /** أرباح السنوات السابقة (تراكمي ما قبل بداية السنة) */
  retainedEarnings: number;

  /** صافي دخل السنة الحالية (من بداية السنة حتى asOfDate) */
  currentPeriodNetIncome: number;

  // ─── المؤشرات المالية
  ratios: BalanceSheetRatio[];
}

/**
 * BalanceSheetResponse
 * ────────────────────
 * الشكل الكامل لاستجابة الميزانية العمومية.
 */
export interface BalanceSheetResponse {
  meta: ReportMeta;
  summary: BalanceSheetSummary;
  groups: BalanceSheetGroup[];

  // ─── معلومات المقارنة
  comparison: {
    mode: 'NONE' | 'PREVIOUS_YEAR_SAME_DATE' | 'PREVIOUS_YEAR_END';
    asOfDate: string;
    previousAsOfDate: string | null;
    label: string | null;
  };

  // ─── معلومات السنة المالية
  fiscalYear: {
    startMonth: number;
    startDate: string;
    label: string;
  };
}

/**
 * BalanceSheetDrillDownResponse
 * ─────────────────────────────
 * استجابة استعلام التنقل الشجري للميزانية العمومية.
 */
export interface BalanceSheetDrillDownResponse {
  parent: { id: string; code: string; name: string };
  lines: BalanceSheetLine[];
  comparison: {
    mode: 'NONE' | 'PREVIOUS_YEAR_SAME_DATE' | 'PREVIOUS_YEAR_END';
    asOfDate: string;
    previousAsOfDate: string | null;
    label: string | null;
  };
}
