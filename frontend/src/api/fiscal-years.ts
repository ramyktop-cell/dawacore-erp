import axios from 'axios';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export type FiscalYearStatus = 'OPEN' | 'CLOSING' | 'CLOSED';

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

export interface ClosingEntryPreview {
  year: number;
  fiscalYearStatus: FiscalYearStatus;
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  retainedEarningsAccount: { id: string; code: string; name: string };
  lines: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    type: string;
    debit: number;
    credit: number;
    notes: string;
  }>;
  totals: { totalDebit: number; totalCredit: number; isBalanced: boolean };
}

export interface OpenFiscalYearResult {
  fiscalYear: FiscalYearSummary;
  carryForward: {
    entriesCount: number;
    openingEntryId: string | null;
    accountsAffected: number;
  } | null;
}

export interface CloseFiscalYearResult {
  fiscalYear: FiscalYearSummary;
  closingEntry: { id: string; entryNumber: string; date: string };
  netIncome: number;
  isProfit: boolean;
}

// ═══════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════

const BASE = '/api/accounting/fiscal-years';

export const fiscalYearsApi = {
  list: (): Promise<FiscalYearSummary[]> =>
    axios.get(BASE).then((r) => r.data),

  getOne: (year: number): Promise<FiscalYearSummary> =>
    axios.get(`${BASE}/${year}`).then((r) => r.data),

  open: (dto: { year: number; notes?: string }): Promise<OpenFiscalYearResult> =>
    axios.post(`${BASE}/open`, dto).then((r) => r.data),

  closePreview: (year: number): Promise<ClosingEntryPreview> =>
    axios
      .post(`${BASE}/close`, { year, dryRun: true })
      .then((r) => r.data),

  close: (dto: {
    year: number;
    retainedEarningsAccountId?: string;
    notes?: string;
  }): Promise<CloseFiscalYearResult> =>
    axios.post(`${BASE}/close`, dto).then((r) => r.data),

  reopen: (dto: { year: number; reason: string }): Promise<FiscalYearSummary> =>
    axios.post(`${BASE}/reopen`, dto).then((r) => r.data),
};
