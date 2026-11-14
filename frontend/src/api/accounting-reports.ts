import axios from 'axios';
// ═══════════════════════════════════════════════════════════════
// Types & Interfaces (بدون تغيير — للتوافق العكسي)
// ═══════════════════════════════════════════════════════════════
// ==================== ميزان المراجعة ====================
export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  level?: number;
  isLeaf?: boolean;
  openingDebit: number;
  openingCredit: number;
  movementDebit: number;
  movementCredit: number;
  closingDebit: number;
  closingCredit: number;
  closingBalance: number;
}
export interface TrialBalanceTotals {
  openingDebit: number;
  openingCredit: number;
  movementDebit: number;
  movementCredit: number;
  closingDebit: number;
  closingCredit: number;
  isBalanced: boolean;
  difference: number;
}
export interface TrialBalanceResponse {
  meta: {
    title: string;
    companyName: string;
    branchName?: string;
    level: number;
    fromDate: string;
    toDate: string;
    generatedAt: string;
    generatedBy: { id: string; name: string };
  };
  data: TrialBalanceRow[];
  totals: TrialBalanceTotals;
}
// ==================== دفتر الأستاذ العام ====================
export interface GeneralLedgerEntry {
  journalEntryId: string;
  entryNumber: string;
  date: string;
  description: string;
  source: string;
  referenceId?: string;
  lineNotes?: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface GeneralLedgerResponse {
  meta: {
    title: string;
    companyName: string;
    branchName?: string;
    fromDate: string;
    toDate: string;
    generatedAt: string;
    generatedBy: { id: string; name: string };
  };
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
    level: number;
  };
  openingBalance: { debit: number; credit: number; net: number };
  entries: GeneralLedgerEntry[];
  totals: { totalDebit: number; totalCredit: number; entriesCount: number };
  closingBalance: { debit: number; credit: number; net: number };
  pagination: {
    page: number;
    limit: number;
    totalEntries: number;
    totalPages: number;
  };
}
// ==================== قائمة الدخل ====================
export interface IncomeStatementItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  percentageOfRevenue?: number;
}

export interface IncomeStatementSection {
  title: string;
  items: IncomeStatementItem[];
  total: number;
}

export interface IncomeStatementResponse {
  meta: {
    title: string;
    companyName: string;
    branchName?: string;
    fromDate: string;
    toDate: string;
    generatedAt: string;
    generatedBy: { id: string; name: string };
  };
  revenues: IncomeStatementSection;
  costOfGoodsSold: IncomeStatementSection;
  grossProfit: number;
  grossProfitMargin: number;
  operatingExpenses: IncomeStatementSection;
  netProfit: number;
  netProfitMargin: number;
  status: 'PROFIT' | 'LOSS' | 'BREAK_EVEN';
}
// ==================== الميزانية العمومية ====================
export interface BalanceSheetItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  balance: number;
}
export interface BalanceSheetSection {
  title: string;
  items: BalanceSheetItem[];
  total: number;
}
export interface BalanceSheetResponse {
  meta: {
    title: string;
    companyName: string;
    branchName?: string;
    asOfDate: string;
    generatedAt: string;
    generatedBy: { id: string; name: string };
  };
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  difference: number;
}
// ═══════════════════════════════════════════════════════════════
// Adapters: New ReportKit Shape → Old Frontend Shape
// ═══════════════════════════════════════════════════════════════
const BASE = '/api/reports';

/**
 * Adapter لميزان المراجعة.
 * Backend: { meta, summary, rows }
 * Frontend: { meta, data, totals }
 */
function adaptTrialBalance(apiRes: any): TrialBalanceResponse {
  const summary = apiRes.summary || {};
  return {
    meta: apiRes.meta,
    data: apiRes.rows || [],
    totals: {
      openingDebit: Number(summary.totalOpeningDebit ?? 0),
      openingCredit: Number(summary.totalOpeningCredit ?? 0),
      movementDebit: Number(summary.totalMovementDebit ?? 0),
      movementCredit: Number(summary.totalMovementCredit ?? 0),
      closingDebit: Number(summary.totalClosingDebit ?? 0),
      closingCredit: Number(summary.totalClosingCredit ?? 0),
      isBalanced: summary.isBalanced ?? false,
      difference: Number(summary.closingDifference ?? 0),
    },
  };
}

/**
 * Adapter لدفتر الأستاذ العام.
 * Backend: { meta, summary, accounts: [...] }
 * Frontend: { meta, account, openingBalance, entries, totals, closingBalance, pagination }
 */
function adaptGeneralLedger(apiRes: any, requestedAccountId: string): GeneralLedgerResponse {
  const accounts = apiRes.accounts || [];
  const account =
    accounts.find((a: any) => a.accountId === requestedAccountId) || accounts[0] || null;

  if (!account) {
    return {
      meta: apiRes.meta,
      account: { id: requestedAccountId, code: '', name: '', type: '', level: 0 },
      openingBalance: { debit: 0, credit: 0, net: 0 },
      entries: [],
      totals: { totalDebit: 0, totalCredit: 0, entriesCount: 0 },
      closingBalance: { debit: 0, credit: 0, net: 0 },
      pagination: { page: 1, limit: 100, totalEntries: 0, totalPages: 0 },
    };
  }

  return {
    meta: apiRes.meta,
    account: {
      id: account.accountId,
      code: account.accountCode,
      name: account.accountName,
      type: account.accountType,
      level: account.level,
    },
    openingBalance: {
      debit: Number(account.openingDebit ?? 0),
      credit: Number(account.openingCredit ?? 0),
      net: Number(account.openingBalance ?? 0),
    },
    entries: (account.entries || []).map((e: any) => ({
      journalEntryId: e.journalEntryId,
      entryNumber: e.entryNumber,
      date: e.date,
      description: e.description,
      source: e.source,
      referenceId: e.referenceId,
      lineNotes: null,
      debit: Number(e.debit ?? 0),
      credit: Number(e.credit ?? 0),
      runningBalance: Number(e.runningBalance ?? 0),
    })),
    totals: {
      totalDebit: Number(account.totalDebit ?? 0),
      totalCredit: Number(account.totalCredit ?? 0),
      entriesCount: account.displayedEntries ?? account.entries?.length ?? 0,
    },
    closingBalance: {
      debit: Number(account.closingDebit ?? 0),
      credit: Number(account.closingCredit ?? 0),
      net: Number(account.closingBalance ?? 0),
    },
    pagination: {
      page: 1,
      limit: account.displayedEntries ?? 100,
      totalEntries: account.totalEntries ?? 0,
      totalPages: 1,
    },
  };
}

/**
 * Adapter لقائمة الدخل.
 * Backend: { meta, summary, groups: [REVENUE, EXPENSE] }
 * Frontend: { meta, revenues, costOfGoodsSold, grossProfit, ..., operatingExpenses, netProfit, ... }
 *
 * ملاحظة: Backend لا يفصل COGS — كل المصروفات في مجموعة واحدة.
 */
function adaptIncomeStatement(apiRes: any): IncomeStatementResponse {
  const groups = apiRes.groups || [];
  const summary = apiRes.summary || {};
  const revenueGroup =
    groups.find((g: any) => g.groupKey === 'REVENUE') || { lines: [], total: 0 };
  const expenseGroup =
    groups.find((g: any) => g.groupKey === 'EXPENSE') || { lines: [], total: 0 };

  const totalRevenue = Math.abs(Number(summary.totalRevenue ?? revenueGroup.total ?? 0));

  const mapItems = (lines: any[]): IncomeStatementItem[] =>
    (lines || [])
      .filter((l: any) => l.isLeaf || !l.hasChildren)
      .map((l: any) => ({
        accountId: l.accountId,
        accountCode: l.accountCode,
        accountName: l.accountName,
        amount: Math.abs(Number(l.amount ?? 0)),
        percentageOfRevenue: totalRevenue
          ? (Math.abs(Number(l.amount ?? 0)) / totalRevenue) * 100
          : undefined,
      }));

  const netProfit = Number(summary.netIncome ?? 0);
  const status: 'PROFIT' | 'LOSS' | 'BREAK_EVEN' =
    netProfit > 0.01 ? 'PROFIT' : netProfit < -0.01 ? 'LOSS' : 'BREAK_EVEN';

  return {
    meta: apiRes.meta,
    revenues: {
      title: 'الإيرادات',
      items: mapItems(revenueGroup.lines),
      total: totalRevenue,
    },
    costOfGoodsSold: {
      title: 'تكلفة البضاعة المباعة',
      items: [],
      total: 0,
    },
    grossProfit: totalRevenue,
    grossProfitMargin: totalRevenue > 0 ? 100 : 0,
    operatingExpenses: {
      title: 'المصروفات',
      items: mapItems(expenseGroup.lines),
      total: Math.abs(Number(summary.totalExpenses ?? expenseGroup.total ?? 0)),
    },
    netProfit,
    netProfitMargin: Number(summary.netIncomeMargin ?? 0),
    status,
  };
}

/**
 * Adapter للميزانية العمومية.
 * Backend: { meta, summary, groups: [ASSETS, LIABILITIES, EQUITY] }
 * Frontend: { meta, assets, liabilities, equity, totalAssets, totalLiabilitiesAndEquity, isBalanced, difference }
 */
function adaptBalanceSheet(apiRes: any): BalanceSheetResponse {
  const groups = apiRes.groups || [];
  const summary = apiRes.summary || {};

  const pickGroup = (key: string) =>
    groups.find((g: any) => g.groupKey === key) || { lines: [], total: 0 };

  const mapItems = (lines: any[]): BalanceSheetItem[] =>
    (lines || [])
      .filter((l: any) => l.isLeaf || !l.hasChildren)
      .map((l: any) => ({
        accountId: l.accountId || l.accountCode,
        accountCode: l.accountCode,
        accountName: l.accountName,
        balance: Math.abs(Number(l.absoluteBalance ?? l.balance ?? 0)),
      }));

  const assets = pickGroup('ASSETS');
  const liabilities = pickGroup('LIABILITIES');
  const equity = pickGroup('EQUITY');

  return {
    meta: apiRes.meta,
    assets: {
      title: 'الأصول',
      items: mapItems(assets.lines),
      total: Math.abs(Number(summary.totalAssets ?? assets.total ?? 0)),
    },
    liabilities: {
      title: 'الخصوم',
      items: mapItems(liabilities.lines),
      total: Math.abs(Number(summary.totalLiabilities ?? liabilities.total ?? 0)),
    },
    equity: {
      title: 'حقوق الملكية',
      items: mapItems(equity.lines),
      total: Math.abs(Number(summary.totalEquity ?? equity.total ?? 0)),
    },
    totalAssets: Number(summary.totalAssets ?? 0),
    totalLiabilitiesAndEquity:
      Number(summary.totalLiabilities ?? 0) + Number(summary.totalEquity ?? 0),
    isBalanced: summary.isBalanced ?? false,
    difference: Number(summary.balanceDifference ?? 0),
  };
}

// ═══════════════════════════════════════════════════════════════
// API Object (نفس الـ signatures — العميل لا يحتاج تعديل)
// ═══════════════════════════════════════════════════════════════

export const accountingReportsApi = {
  // ─────────────────────────────────────────────
  // Trial Balance
  // ─────────────────────────────────────────────
  getTrialBalance: async (params?: {
    branchId?: string;
    fromDate?: string;
    toDate?: string;
    level?: number;
    showZeroBalances?: string;
    showEmptyAccounts?: string;
    sortBy?: string;
  }): Promise<TrialBalanceResponse> => {
    const res = await axios.get(`${BASE}/trial-balance`, { params });
    return adaptTrialBalance(res.data);
  },

  // ─────────────────────────────────────────────
  // General Ledger
  // ─────────────────────────────────────────────
  getGeneralLedger: async (
    accountId: string,
    params?: {
      branchId?: string;
      fromDate?: string;
      toDate?: string;
      source?: string;
      sortBy?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<GeneralLedgerResponse> => {
    // ⚠️ accountId الآن يُمرَّر كـ query parameter (لا route)
    const res = await axios.get(`${BASE}/general-ledger`, {
      params: { ...params, accountId },
    });
    return adaptGeneralLedger(res.data, accountId);
  },

  // ─────────────────────────────────────────────
  // Income Statement
  // ─────────────────────────────────────────────
  getIncomeStatement: async (params?: {
    branchId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<IncomeStatementResponse> => {
    const res = await axios.get(`${BASE}/income-statement`, { params });
    return adaptIncomeStatement(res.data);
  },

  // ─────────────────────────────────────────────
  // Balance Sheet
  // ─────────────────────────────────────────────
  getBalanceSheet: async (params?: {
    branchId?: string;
    asOfDate?: string;
    fromDate?: string; // للتوافق مع الـ Frontend القديم
    toDate?: string;
  }): Promise<BalanceSheetResponse> => {
    // Backend الجديد يستخدم asOfDate — نحوّلها من toDate إن لم تكن موجودة
    const mappedParams: any = {
      branchId: params?.branchId,
      asOfDate: params?.asOfDate || params?.toDate,
    };
    const res = await axios.get(`${BASE}/balance-sheet`, { params: mappedParams });
    return adaptBalanceSheet(res.data);
  },

  // ─────────────────────────────────────────────
  // PDF Download
  // ─────────────────────────────────────────────
  downloadPdf: async (
    endpoint: 'trial-balance' | 'income-statement' | 'balance-sheet' | 'general-ledger',
    params: Record<string, any> = {},
    accountId?: string,
  ): Promise<void> => {
    // ⚠️ accountId في GL الآن يُمرَّر كـ query parameter
    const queryParams: any = { ...params };
    if (accountId && endpoint === 'general-ledger') {
      queryParams.accountId = accountId;
    }

    const url = `${BASE}/${endpoint}/export/pdf`; // ⚠️ /export/pdf بدلاً من /pdf

    const response = await axios.get(url, {
      params: queryParams,
      responseType: 'blob',
    });

    triggerDownload(
      response.data,
      'application/pdf',
      `${endpoint}_${new Date().toISOString().split('T')[0]}.pdf`,
    );
  },

  // ─────────────────────────────────────────────
  // Excel Download
  // ─────────────────────────────────────────────
  downloadExcel: async (
    endpoint: 'trial-balance' | 'income-statement' | 'balance-sheet' | 'general-ledger',
    params: Record<string, any> = {},
    accountId?: string,
  ): Promise<void> => {
    const queryParams: any = { ...params };
    if (accountId && endpoint === 'general-ledger') {
      queryParams.accountId = accountId;
    }

    const url = `${BASE}/${endpoint}/export/excel`; // ⚠️ /export/excel بدلاً من /excel

    const response = await axios.get(url, {
      params: queryParams,
      responseType: 'blob',
    });

    triggerDownload(
      response.data,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `${endpoint}_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  },
};

// ─────────────────────────────────────────────
// Helper: Trigger Browser Download
// ─────────────────────────────────────────────

function triggerDownload(blobData: any, mimeType: string, filename: string): void {
  const blob = new Blob([blobData], { type: mimeType });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
