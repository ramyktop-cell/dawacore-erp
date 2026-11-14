import { AccountType } from '@prisma/client';
import { ReportMeta } from 'src/shared/report-kit';

/**
 * GeneralLedgerCounterparty
 * ─────────────────────────
 * الطرف المقابل (عميل أو مورد) المرتبط بسطر القيد.
 *
 * إذا وُجد customer  → نعرضه.
 * إذا وُجد supplier  → نعرضه.
 * إذا لم يوجد         → NONE.
 */
export interface GeneralLedgerCounterparty {
  type: 'CUSTOMER' | 'SUPPLIER' | 'NONE';
  id?: string;
  name?: string;
}

/**
 * GeneralLedgerEntry
 * ──────────────────
 * صف قيد واحد في كشف الحساب.
 *
 * ⚠️ الرصيد الجاري (runningBalance) محسوب من الافتتاحي:
 *    runningBalance[i] = openingBalance + Σ(debit[0..i]) − Σ(credit[0..i])
 *    القيمة موقّعة (موجب = مدين، سالب = دائن).
 */
export interface GeneralLedgerEntry {
  /** معرف سطر القيد */
  journalLineId: string;

  /** معرف القيد نفسه */
  journalEntryId: string;

  /** رقم القيد (مثال: JV-2026-0001) */
  entryNumber: string;

  /** تاريخ القيد (ISO) */
  date: string;

  /** البيان */
  description: string;

  /** مرجع القيد (فاتورة، إذن، ...) — اختياري */
  referenceId: string | null;

  /** مصدر القيد (MANUAL, PURCHASE, SALE, ...) */
  source: string;

  /** مدين */
  debit: number;

  /** دائن */
  credit: number;

  /**
   * الرصيد الجاري بعد هذا القيد.
   * موقّع: موجب = مدين، سالب = دائن.
   */
  runningBalance: number;

  /** الطرف المقابل (عميل/مورد) */
  counterparty: GeneralLedgerCounterparty;
}

/**
 * AccountLedger
 * ─────────────
 * كشف حساب واحد — يشمل كل قيوده ورصيده الجاري.
 */
export interface AccountLedger {
  // ─── هوية الحساب
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  level: number;

  // ─── الرصيد الافتتاحي (قبل fromDate)
  /** موقّع: موجب = مدين، سالب = دائن */
  openingBalance: number;
  /** عرض المدين (0 لو الرصيد سالب) */
  openingDebit: number;
  /** عرض الدائن (0 لو الرصيد موجب) */
  openingCredit: number;

  // ─── إجماليات الفترة
  totalDebit: number;
  totalCredit: number;

  // ─── الرصيد الختامي (بعد toDate)
  /** موقّع: موجب = مدين، سالب = دائن */
  closingBalance: number;
  closingDebit: number;
  closingCredit: number;

  // ─── إحصاءات القيود
  /** العدد الكلي للقيود في الفترة (من DB) */
  totalEntries: number;

  /** عدد القيود المعروضة فعلياً (بعد التقطيع) */
  displayedEntries: number;

  /** هل تم تقطيع النتائج؟ (totalEntries > entriesPerAccount) */
  isTruncated: boolean;

  // ─── القيود
  entries: GeneralLedgerEntry[];
}

/**
 * GeneralLedgerSummary
 * ────────────────────
 * ملخص التقرير.
 */
export interface GeneralLedgerSummary {
  /** عدد الحسابات المعروضة */
  accountsCount: number;

  /** عدد الحسابات ذات نشاط في الفترة */
  accountsWithActivity: number;

  /** إجمالي القيود عبر كل الحسابات المعروضة */
  totalEntriesDisplayed: number;

  /** إجمالي المدين عبر كل الحسابات */
  totalDebit: number;

  /** إجمالي الدائن */
  totalCredit: number;

  /** الفرق (للمعلومية — GL كامل متوازن نظرياً) */
  difference: number;

  /** true إذا كان difference < 0.01 */
  isBalanced: boolean;
}

/**
 * GeneralLedgerResponse
 * ─────────────────────
 * الشكل الكامل لاستجابة التقرير.
 */
export interface GeneralLedgerResponse {
  meta: ReportMeta;
  summary: GeneralLedgerSummary;
  accounts: AccountLedger[];
}
