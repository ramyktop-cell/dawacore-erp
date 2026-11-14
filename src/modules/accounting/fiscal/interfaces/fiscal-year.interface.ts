import { FiscalYearStatus } from '@prisma/client';

/**
 * FiscalYearSummary
 * ملخص سنة مالية.
 */
export interface FiscalYearSummary {
  id: string;
  year: number;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  openedAt: string | null;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closingEntryId: string | null;
  openingEntryId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * ClosingEntryPreview
 * ───────────────────
 * معاينة قيد الإقفال (Dry-Run).
 */
export interface ClosingEntryPreview {
  year: number;
  fiscalYearStatus: FiscalYearStatus;
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  retainedEarningsAccount: {
    id: string;
    code: string;
    name: string;
  };
  lines: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    type: string;
    debit: number;
    credit: number;
    notes: string;
  }>;
  totals: {
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
  };
}

/**
 * OpenFiscalYearResult
 * نتيجة فتح سنة مالية.
 */
export interface OpenFiscalYearResult {
  fiscalYear: FiscalYearSummary;
  carryForward: {
    entriesCount: number;
    openingEntryId: string | null;
    accountsAffected: number;
  } | null;
}

/**
 * CloseFiscalYearResult
 * نتيجة إقفال سنة مالية.
 */
export interface CloseFiscalYearResult {
  fiscalYear: FiscalYearSummary;
  closingEntry: {
    id: string;
    entryNumber: string;
    date: string;
  };
  netIncome: number;
  isProfit: boolean;
}
