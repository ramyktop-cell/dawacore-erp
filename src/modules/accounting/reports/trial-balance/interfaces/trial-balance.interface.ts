import { AccountType } from '@prisma/client';
import { ReportMeta } from 'src/shared/report-kit';

/**
 * TrialBalanceRow
 * ───────────────
 * صف واحد لكل حساب طرفي.
 *
 * الأرصدة موزّعة على مدين/دائن — لا توجد أرصدة سالبة.
 * `closingBalance` موقّع للفرز: موجب = مدين، سالب = دائن.
 */
export interface TrialBalanceRow {
  // ─── هوية الحساب
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  level: number;

  // ─── الرصيد الافتتاحي (قبل fromDate)
  openingDebit: number;
  openingCredit: number;
  /** موقّع: موجب = مدين، سالب = دائن */
  openingBalance: number;

  // ─── حركة الفترة
  movementDebit: number;
  movementCredit: number;
  /** موقّع */
  movementBalance: number;

  // ─── الرصيد الختامي
  closingDebit: number;
  closingCredit: number;
  /** موقّع — يُستخدم للفرز */
  closingBalance: number;
}

/**
 * TrialBalanceSummary
 * ───────────────────
 * الإجماليات وفحص التوازن.
 */
export interface TrialBalanceSummary {
  // ─── إحصاءات
  totalAccounts: number;
  accountsWithActivity: number;

  // ─── الأرصدة الافتتاحية
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  openingDifference: number;

  // ─── حركات الفترة
  totalMovementDebit: number;
  totalMovementCredit: number;
  movementDifference: number;

  // ─── الأرصدة الختامية
  totalClosingDebit: number;
  totalClosingCredit: number;
  closingDifference: number;

  /** true إذا كان closingDifference < 0.01 */
  isBalanced: boolean;
}

/**
 * TrialBalanceResponse
 * ────────────────────
 * الشكل الكامل لاستجابة التقرير.
 */
export interface TrialBalanceResponse {
  meta: ReportMeta;
  summary: TrialBalanceSummary;
  rows: TrialBalanceRow[];
}
