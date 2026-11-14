import axios from 'axios';

// ═══════════════════════════════════════════════════════════════
// Types (بدون تغيير)
// ═══════════════════════════════════════════════════════════════

export interface BalanceSheetItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  level: number;
  isLeaf: boolean;
  balance: number;
  isSynthetic?: boolean;
  children?: BalanceSheetItem[];
}

export interface BalanceSheetSection {
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
    warnings?: string[];
  };
  assets: {
    currentAssets: BalanceSheetSection;
    fixedAssets: BalanceSheetSection;
    totalAssets: number;
  };
  liabilities: {
    currentLiabilities: BalanceSheetSection;
    longTermLiabilities: BalanceSheetSection;
    totalLiabilities: number;
  };
  equity: {
    items: BalanceSheetItem[];
    totalEquity: number;
    capital: number;
    retainedEarnings: number;
    currentPeriodProfit: number;
  };
  totals: {
    totalLiabilitiesAndEquity: number;
    difference: number;
    isBalanced: boolean;
  };
  comparison?: {
    asOfDate: string;
    totalAssets: { current: number; previous: number; change: number; changePercent: number };
    totalLiabilities: { current: number; previous: number; change: number; changePercent: number };
    totalEquity: { current: number; previous: number; change: number; changePercent: number };
  };
}

// ═══════════════════════════════════════════════════════════════
// Adapter
// ═══════════════════════════════════════════════════════════════

const BASE = '/api/reports/balance-sheet';

function classifyByCode(code: string): 'CURRENT' | 'FIXED' | 'CURRENT_LIAB' | 'LONG_TERM_LIAB' | 'CAPITAL' | 'RETAINED' | 'OTHER' {
  const clean = code.replace(/-/g, '');
  if (clean.startsWith('11') || code.startsWith('1-1')) return 'CURRENT';
  if (clean.startsWith('12') || clean.startsWith('13') || code.startsWith('1-2')) return 'FIXED';
  if (clean.startsWith('21') || code.startsWith('2-1')) return 'CURRENT_LIAB';
  if (clean.startsWith('22') || code.startsWith('2-2')) return 'LONG_TERM_LIAB';
  if (clean.startsWith('31') || code.startsWith('3-1')) return 'CAPITAL';
  if (clean.startsWith('32') || code.startsWith('3-2')) return 'RETAINED';
  return 'OTHER';
}

function mapLineToItem(line: any): BalanceSheetItem {
  return {
    accountId: line.accountId || line.accountCode,
    accountCode: line.accountCode,
    accountName: line.accountName,
    level: Number(line.level ?? 1),
    isLeaf: line.isLeaf ?? false,
    balance: Math.abs(Number(line.absoluteBalance ?? line.balance ?? 0)),
    isSynthetic: line.isVirtual ?? false,
  };
}

function adaptBalanceSheet(apiRes: any): BalanceSheetResponse {
  const summary = apiRes.summary || {};
  const groups: any[] = apiRes.groups || [];

  const assetsGroup = groups.find((g: any) => g.groupKey === 'ASSETS') || { lines: [], total: 0 };
  const liabilitiesGroup = groups.find((g: any) => g.groupKey === 'LIABILITIES') || { lines: [], total: 0 };
  const equityGroup = groups.find((g: any) => g.groupKey === 'EQUITY') || { lines: [], total: 0 };

  // تصنيف الأصول
  const currentAssetsItems: BalanceSheetItem[] = [];
  const fixedAssetsItems: BalanceSheetItem[] = [];

  for (const line of assetsGroup.lines || []) {
    if (!line.isLeaf && line.hasChildren) continue; // نعرض الأوراق فقط
    const cls = classifyByCode(line.accountCode || '');
    const item = mapLineToItem(line);
    if (cls === 'FIXED') fixedAssetsItems.push(item);
    else currentAssetsItems.push(item);
  }

  // تصنيف الخصوم
  const currentLiabItems: BalanceSheetItem[] = [];
  const longTermLiabItems: BalanceSheetItem[] = [];

  for (const line of liabilitiesGroup.lines || []) {
    if (!line.isLeaf && line.hasChildren) continue;
    const cls = classifyByCode(line.accountCode || '');
    const item = mapLineToItem(line);
    if (cls === 'LONG_TERM_LIAB') longTermLiabItems.push(item);
    else currentLiabItems.push(item);
  }

  // حقوق الملكية
  const equityItems: BalanceSheetItem[] = [];
  let capital = 0;
  for (const line of equityGroup.lines || []) {
    if (!line.isLeaf && line.hasChildren) continue;
    const cls = classifyByCode(line.accountCode || '');
    const item = mapLineToItem(line);
    equityItems.push(item);
    if (cls === 'CAPITAL') capital += item.balance;
  }

  const totalAssets = Number(summary.totalAssets ?? assetsGroup.total ?? 0);
  const totalLiabilities = Number(summary.totalLiabilities ?? liabilitiesGroup.total ?? 0);
  const totalEquity = Number(summary.totalEquity ?? equityGroup.total ?? 0);

  return {
    meta: {
      title: apiRes.meta?.title || 'الميزانية العمومية',
      companyName: apiRes.meta?.companyName || '',
      branchName: apiRes.meta?.branchName,
      asOfDate: apiRes.meta?.toDate || apiRes.meta?.fromDate || '',
      generatedAt: apiRes.meta?.generatedAt || new Date().toISOString(),
      generatedBy: apiRes.meta?.generatedBy || { id: '', name: '' },
      warnings: summary.isBalanced ? undefined : ['الميزانية غير متوازنة'],
    },
    assets: {
      currentAssets: { items: currentAssetsItems, total: Number(summary.currentAssets ?? 0) },
      fixedAssets: { items: fixedAssetsItems, total: Number(summary.nonCurrentAssets ?? 0) },
      totalAssets,
    },
    liabilities: {
      currentLiabilities: { items: currentLiabItems, total: Number(summary.currentLiabilities ?? 0) },
      longTermLiabilities: { items: longTermLiabItems, total: Number(summary.nonCurrentLiabilities ?? 0) },
      totalLiabilities,
    },
    equity: {
      items: equityItems,
      totalEquity,
      capital,
      retainedEarnings: Number(summary.retainedEarnings ?? 0),
      currentPeriodProfit: Number(summary.currentPeriodNetIncome ?? 0),
    },
    totals: {
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      difference: Number(summary.balanceDifference ?? 0),
      isBalanced: summary.isBalanced ?? false,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════

export const balanceSheetApi = {
  getReport: async (params?: {
    asOfDate?: string;
    branchId?: string;
    compareWithPrevious?: string;
  }) => {
    const res = await axios.get(BASE, { params });
    return adaptBalanceSheet(res.data);
  },
};
