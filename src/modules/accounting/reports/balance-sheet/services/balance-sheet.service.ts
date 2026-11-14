import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import {
  BaseReportService,
  CacheOptions,
  CACHE_SERVICE,
  ICacheService,
  ReportContext,
  ReportMetaBuilder,
  ReportMeta,
  DateTzUtil,
} from 'src/shared/report-kit';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  BalanceSheetFilterDto,
  BalanceSheetCompareMode,
} from '../dto/balance-sheet-filter.dto';
import {
  BalanceSheetResponse,
  BalanceSheetSummary,
  BalanceSheetGroup,
  BalanceSheetLine,
  BalanceSheetRatio,
  BalanceSheetDrillDownResponse,
} from '../interfaces/balance-sheet.interface';

// ─────────────────────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────────────────────

interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  level: number;
  parentId: string | null;
  isLeaf: boolean;
  children: AccountNode[];
  balance: number; // موقّع: موجب = مدين، سالب = دائن
  previousBalance: number;
}

interface SumMap {
  [accountId: string]: { debit: number; credit: number };
}

interface DateRanges {
  asOfDate: string;
  asOfDateEnd: Date;
  previousAsOfDate: string | null;
  previousAsOfDateEnd: Date | null;
  fiscalYearStart: Date;
  fiscalYearStartStr: string;
  prevFiscalYearStart: Date | null;
  comparison: {
    mode: BalanceSheetCompareMode;
    asOfDate: string;
    previousAsOfDate: string | null;
    label: string | null;
  };
  fiscalYear: {
    startMonth: number;
    startDate: string;
    label: string;
  };
}

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

/**
 * BalanceSheetService
 * ───────────────────
 * تقرير الميزانية العمومية (Balance Sheet).
 *
 * الميزات الرئيسية:
 *   ⚡ Cache تلقائي مع عزل per-tenant
 *   🌳 شجرة حسابية 5 مستويات + Drill-Down
 *   🔢 Hybrid Retained Earnings (تراكمي + صافي السنة)
 *   📊 5 مؤشرات مالية تحليلية
 *   ✅ فحص التوازن التلقائي (Assets = Liab + Equity)
 */
@Injectable()
export class BalanceSheetService extends BaseReportService<
  BalanceSheetFilterDto,
  BalanceSheetResponse
> {
  constructor(
    prisma: PrismaService,
    metaBuilder: ReportMetaBuilder,
    @Inject(CACHE_SERVICE) cache: ICacheService,
  ) {
    super(prisma, metaBuilder, cache);
  }

  // ─────────────────────────────────────────────
  // Report config
  // ─────────────────────────────────────────────

  protected getReportTitle(): string {
    return 'الميزانية العمومية';
  }

  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 120, enabled: true };
  }

  // ═══════════════════════════════════════════════════════════
  // buildReport
  // ═══════════════════════════════════════════════════════════

  protected async buildReport(
    filters: BalanceSheetFilterDto,
    ctx: ReportContext,
  ): Promise<BalanceSheetResponse> {
    const tz = ctx.timezone;
    const dates = this.computeDateRanges(filters, tz);

    const includeInactive = filters.includeInactive === true;
    const hideZero = filters.hideZeroBalances !== false;
    const showRE = filters.showRetainedEarnings !== false;
    const maxLevel = filters.level ?? 5;

    // ─── 1. جلب جميع الحسابات (لشجرة الميزانية + احتساب أرباح وخسائر السنة)
    const accounts = await this.prisma.account.findMany({
      where: {
        companyId: ctx.companyId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        level: true,
        parentId: true,
        isLeaf: true,
      },
      orderBy: { code: 'asc' },
    });

    if (accounts.length === 0) {
      return this.emptyResponse(ctx.meta, dates);
    }

    const accountIds = accounts.map((a) => a.id);

    // ─── 2. الاستعلامات المتوازية
    const baseJournalWhere = (dateFilter: { lte?: Date; lt?: Date }) => ({
      companyId: ctx.companyId,
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      date: dateFilter,
    });

    const [currentSums, previousSums, beforeFySums, beforePrevFySums] = await Promise.all([
      // Q1: الأرصدة حتى asOfDate
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          journalEntry: baseJournalWhere({ lte: dates.asOfDateEnd }),
        },
        _sum: { debit: true, credit: true },
      }),

      // Q2: أرصدة المقارنة (لو مفعّلة)
      dates.previousAsOfDateEnd
        ? this.prisma.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: { in: accountIds },
              journalEntry: baseJournalWhere({ lte: dates.previousAsOfDateEnd }),
            },
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve([]),

      // Q3: الأرصدة قبل بداية السنة المالية الحالية (Retained Earnings)
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          journalEntry: baseJournalWhere({ lt: dates.fiscalYearStart }),
        },
        _sum: { debit: true, credit: true },
      }),

      // Q4: الأرصدة قبل بداية السنة المالية المقارنة (Previous Retained Earnings)
      dates.prevFiscalYearStart
        ? this.prisma.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: { in: accountIds },
              journalEntry: baseJournalWhere({ lt: dates.prevFiscalYearStart }),
            },
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve([]),
    ]);

    const currentMap = this.toSumMap(currentSums);
    const previousMap = this.toSumMap(previousSums);
    const beforeFyMap = this.toSumMap(beforeFySums);
    const beforePrevFyMap = this.toSumMap(beforePrevFySums);

    const hasComparison = dates.previousAsOfDate !== null;

    // ─── 3. بناء الشجرة للحسابات الميزانية (ASSET, LIABILITY, EQUITY)
    const bsAccounts = accounts.filter(
      (a) =>
        a.type === AccountType.ASSET ||
        a.type === AccountType.LIABILITY ||
        a.type === AccountType.EQUITY,
    );

    const roots = this.buildTree(bsAccounts, currentMap, previousMap, hasComparison);

    // ─── 4. فلترة hideZero
    const filteredRoots = hideZero ? roots.filter((r) => this.hasMovement(r)) : roots;

    // ─── 5. تجميع كل أنواع الحسابات (ASSET, LIABILITY, EQUITY)
    const assetRoots = filteredRoots.filter((r) => r.type === AccountType.ASSET);
    const liabilityRoots = filteredRoots.filter((r) => r.type === AccountType.LIABILITY);
    const equityRoots = filteredRoots.filter((r) => r.type === AccountType.EQUITY);

    // ─── 6. حساب Retained Earnings + Current Period Net Income
    const { retainedEarnings, currentPeriodNetIncome } = this.computeEarnings(
      accounts,
      currentMap,
      beforeFyMap,
    );

    const prevEarnings = hasComparison
      ? this.computePreviousEarnings(accounts, beforePrevFyMap, previousMap)
      : null;

    // ─── 7. تصنيف الأصول والخصوم (متداول/غير متداول)
    const classification = this.classifyAccounts(bsAccounts);

    // ─── 8. بناء المجموعات
    const assetsGroup = this.buildGroup(
      'ASSETS',
      'الأصول',
      assetRoots,
      maxLevel,
      filters,
      hasComparison,
    );

    const liabilitiesGroup = this.buildGroup(
      'LIABILITIES',
      'الخصوم',
      liabilityRoots,
      maxLevel,
      filters,
      hasComparison,
    );

    // equityGroup يحتاج إضافة السطور الافتراضية
    const equityGroup = this.buildEquityGroup(
      equityRoots,
      maxLevel,
      filters,
      hasComparison,
      retainedEarnings,
      currentPeriodNetIncome,
      showRE,
      dates,
      prevEarnings,
    );

    // ─── 9. إجماليات الفترة الحالية
    const totalAssets = assetRoots.reduce((s, r) => s + Math.abs(r.balance), 0);
    const totalLiabilities = liabilityRoots.reduce((s, r) => s + Math.abs(r.balance), 0);
    const totalEquityReal = equityRoots.reduce((s, r) => s + Math.abs(r.balance), 0);
    const totalEquity = showRE
      ? totalEquityReal + retainedEarnings + currentPeriodNetIncome
      : totalEquityReal;

    // ─── 10. تصنيفات متداول/غير متداول
    const currentAssets = this.sumByClassification(assetRoots, bsAccounts, 'CURRENT');
    const nonCurrentAssets = totalAssets - currentAssets;
    const currentLiabilities = this.sumByClassification(
      liabilityRoots,
      bsAccounts,
      'CURRENT_LIAB',
    );
    const nonCurrentLiabilities = totalLiabilities - currentLiabilities;

    // ─── 11. المقارنة
    const previousTotalAssets = hasComparison
      ? assetRoots.reduce((s, r) => s + Math.abs(r.previousBalance), 0)
      : null;
    const previousTotalLiabilities = hasComparison
      ? liabilityRoots.reduce((s, r) => s + Math.abs(r.previousBalance), 0)
      : null;
    const previousTotalEquity = hasComparison
      ? equityRoots.reduce((s, r) => s + Math.abs(r.previousBalance), 0) +
        (showRE && prevEarnings
          ? prevEarnings.previousRetained + prevEarnings.previousCurrentNI
          : 0)
      : null;

    // ─── 12. فحص التوازن
    const totalLiabAndEquity = totalLiabilities + totalEquity;
    const balanceDifference = Math.abs(totalAssets - totalLiabAndEquity);

    // ─── 13. المؤشرات
    const ratios = this.computeRatios(
      currentAssets,
      currentLiabilities,
      totalLiabilities,
      totalEquity,
      totalAssets,
    );

    // ─── 14. الملخص
    const summary: BalanceSheetSummary = {
      totalAssets: this.round2(totalAssets),
      totalLiabilities: this.round2(totalLiabilities),
      totalEquity: this.round2(totalEquity),

      currentAssets: this.round2(currentAssets),
      nonCurrentAssets: this.round2(nonCurrentAssets),
      currentLiabilities: this.round2(currentLiabilities),
      nonCurrentLiabilities: this.round2(nonCurrentLiabilities),

      previousTotalAssets:
        previousTotalAssets === null ? null : this.round2(previousTotalAssets),
      previousTotalLiabilities:
        previousTotalLiabilities === null ? null : this.round2(previousTotalLiabilities),
      previousTotalEquity:
        previousTotalEquity === null ? null : this.round2(previousTotalEquity),

      assetsVariance:
        previousTotalAssets === null
          ? null
          : this.round2(totalAssets - previousTotalAssets),
      liabilitiesVariance:
        previousTotalLiabilities === null
          ? null
          : this.round2(totalLiabilities - previousTotalLiabilities),
      equityVariance:
        previousTotalEquity === null
          ? null
          : this.round2(totalEquity - previousTotalEquity),

      balanceDifference: this.round2(balanceDifference),
      isBalanced: balanceDifference < 0.01,

      retainedEarnings: this.round2(retainedEarnings),
      currentPeriodNetIncome: this.round2(currentPeriodNetIncome),

      ratios,
    };

    // ─── 15. الاستجابة
    return {
      meta: ctx.meta,
      summary,
      groups: [assetsGroup, liabilitiesGroup, equityGroup],
      comparison: dates.comparison,
      fiscalYear: dates.fiscalYear,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // drillDown
  // ═══════════════════════════════════════════════════════════

  /**
   * يفتح شجرة الحسابات للأبناء المباشرين لحساب معين.
   */
  async drillDown(
    parentAccountId: string,
    companyId: string,
    asOfDate?: string,
    tz = 'Africa/Cairo',
    branchId?: string,
  ): Promise<BalanceSheetDrillDownResponse> {
    // 1. تحقق من الأب
    const parent = await this.prisma.account.findFirst({
      where: { id: parentAccountId, companyId },
      select: { id: true, code: true, name: true },
    });

    if (!parent) throw new NotFoundException('الحساب الأب غير موجود');

    // 2. جلب الأرصدة حتى asOfDate
    const effectiveAsOfDate = asOfDate || DateTzUtil.todayInTz(tz);
    const asOfDateEnd = DateTzUtil.dayEnd(effectiveAsOfDate, tz);

    const accounts = await this.prisma.account.findMany({
      where: {
        companyId,
        type: {
          in: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY],
        },
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        level: true,
        parentId: true,
        isLeaf: true,
      },
      orderBy: { code: 'asc' },
    });

    if (accounts.length === 0) {
      return {
        parent: { id: parent.id, code: parent.code, name: parent.name },
        lines: [],
        comparison: {
          mode: 'NONE',
          asOfDate: effectiveAsOfDate,
          previousAsOfDate: null,
          label: null,
        },
      };
    }

    const accountIds = accounts.map((a) => a.id);

    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          companyId,
          ...(branchId ? { branchId } : {}),
          date: { lte: asOfDateEnd },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const currentMap = this.toSumMap(sums);
    const roots = this.buildTree(accounts, currentMap, {}, false);
    const parentNode = this.findNode(roots, parent.id);

    if (!parentNode) {
      return {
        parent: { id: parent.id, code: parent.code, name: parent.name },
        lines: [],
        comparison: {
          mode: 'NONE',
          asOfDate: effectiveAsOfDate,
          previousAsOfDate: null,
          label: null,
        },
      };
    }

    const lines: BalanceSheetLine[] = parentNode.children
      .filter((c) => Math.abs(c.balance) > 0.01)
      .map((child) => this.nodeToLine(child, effectiveAsOfDate, branchId));

    return {
      parent: { id: parent.id, code: parent.code, name: parent.name },
      lines,
      comparison: {
        mode: 'NONE',
        asOfDate: effectiveAsOfDate,
        previousAsOfDate: null,
        label: null,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers — Data Processing
  // ═══════════════════════════════════════════════════════════

  private toSumMap(rows: any[]): SumMap {
    const map: SumMap = {};
    for (const r of rows) {
      map[r.accountId] = {
        debit: Number(r._sum?.debit ?? 0),
        credit: Number(r._sum?.credit ?? 0),
      };
    }
    return map;
  }

  /**
   * يبني شجرة الحسابات ويحسب الرصيد الموقّع.
   * ASSET: sign = +1 (debit طبيعي)
   * LIABILITY/EQUITY: sign = -1 (credit طبيعي)
   */
  private buildTree(
    accounts: any[],
    currentMap: SumMap,
    previousMap: SumMap,
    hasComparison: boolean,
  ): AccountNode[] {
    const nodeMap = new Map<string, AccountNode>();

    for (const acc of accounts) {
      const cur = currentMap[acc.id] ?? { debit: 0, credit: 0 };
      const prev = previousMap[acc.id] ?? { debit: 0, credit: 0 };

      nodeMap.set(acc.id, {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        level: acc.level,
        parentId: acc.parentId,
        isLeaf: acc.isLeaf,
        children: [],
        balance: cur.debit - cur.credit,
        previousBalance: hasComparison ? prev.debit - prev.credit : 0,
      });
    }

    // ربط الأبناء
    const roots: AccountNode[] = [];
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Aggregate bottom-up
    const aggregate = (node: AccountNode): void => {
      for (const child of node.children) {
        aggregate(child);
        node.balance += child.balance;
        node.previousBalance += child.previousBalance;
      }
    };
    for (const root of roots) aggregate(root);

    return roots;
  }

  private hasMovement(node: AccountNode): boolean {
    if (Math.abs(node.balance) > 0.01) return true;
    if (Math.abs(node.previousBalance) > 0.01) return true;
    return false;
  }

  private findNode(roots: AccountNode[], id: string): AccountNode | null {
    const stack = [...roots];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (n.id === id) return n;
      stack.push(...n.children);
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers — Earnings (Retained + Current)
  // ═══════════════════════════════════════════════════════════

  /**
   * يحسب:
   *   - retainedEarnings     : 32-account balance + (Revenue − Expense) before FY
   *   - currentPeriodNetIncome: (Revenue − Expense) from FY start to asOfDate
   */
  private computeEarnings(
    accounts: any[],
    currentMap: SumMap,
    beforeFyMap: SumMap,
  ): { retainedEarnings: number; currentPeriodNetIncome: number } {
    // صافي الأرباح التراكمي قبل بداية السنة الحالية
    let revenueBeforeFy = 0;
    let expenseBeforeFy = 0;

    for (const acc of accounts) {
      const s = beforeFyMap[acc.id];
      if (!s) continue;
      if (acc.type === AccountType.REVENUE) {
        revenueBeforeFy += s.credit - s.debit;
      } else if (acc.type === AccountType.EXPENSE) {
        expenseBeforeFy += s.debit - s.credit;
      }
    }

    const priorEarnings = revenueBeforeFy - expenseBeforeFy;

    // رصيد حساب 32 (الأرباح المبقاة المسجل دفترياً) إن وُجد
    let account32Balance = 0;
    for (const acc of accounts) {
      const clean = acc.code.replace(/-/g, '');
      if (clean.startsWith('32')) {
        const s = currentMap[acc.id];
        if (s) {
          account32Balance += s.credit - s.debit; // equity: credit-side natural
        }
      }
    }

    // صافي السنة الحالية = current - beforeFY
    let revenueAtAsOf = 0;
    let expenseAtAsOf = 0;
    for (const acc of accounts) {
      const s = currentMap[acc.id];
      if (!s) continue;
      if (acc.type === AccountType.REVENUE) revenueAtAsOf += s.credit - s.debit;
      else if (acc.type === AccountType.EXPENSE) expenseAtAsOf += s.debit - s.credit;
    }

    const currentPeriodNetIncome =
      revenueAtAsOf - revenueBeforeFy - (expenseAtAsOf - expenseBeforeFy);

    return {
      retainedEarnings: this.round2(account32Balance + priorEarnings),
      currentPeriodNetIncome: this.round2(currentPeriodNetIncome),
    };
  }

  private computePreviousEarnings(
    accounts: any[],
    beforePrevFyMap: SumMap,
    previousMap: SumMap,
  ): { previousRetained: number; previousCurrentNI: number } {
    let revenueBeforeFy = 0;
    let expenseBeforeFy = 0;
    for (const acc of accounts) {
      const s = beforePrevFyMap[acc.id];
      if (!s) continue;
      if (acc.type === AccountType.REVENUE) revenueBeforeFy += s.credit - s.debit;
      else if (acc.type === AccountType.EXPENSE) expenseBeforeFy += s.debit - s.credit;
    }
    const priorEarnings = revenueBeforeFy - expenseBeforeFy;

    let account32Balance = 0;
    for (const acc of accounts) {
      const clean = acc.code.replace(/-/g, '');
      if (clean.startsWith('32')) {
        const s = previousMap[acc.id];
        if (s) account32Balance += s.credit - s.debit;
      }
    }

    let revenueAtPrev = 0;
    let expenseAtPrev = 0;
    for (const acc of accounts) {
      const s = previousMap[acc.id];
      if (!s) continue;
      if (acc.type === AccountType.REVENUE) revenueAtPrev += s.credit - s.debit;
      else if (acc.type === AccountType.EXPENSE) expenseAtPrev += s.debit - s.credit;
    }

    return {
      previousRetained: this.round2(account32Balance + priorEarnings),
      previousCurrentNI: this.round2(
        revenueAtPrev - revenueBeforeFy - (expenseAtPrev - expenseBeforeFy),
      ),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers — Classification
  // ═══════════════════════════════════════════════════════════

  private classifyAccounts(
    accounts: any[],
  ): Map<string, 'CURRENT' | 'NON_CURRENT' | 'CURRENT_LIAB' | 'NON_CURRENT_LIAB' | null> {
    const map = new Map<
      string,
      'CURRENT' | 'NON_CURRENT' | 'CURRENT_LIAB' | 'NON_CURRENT_LIAB' | null
    >();

    for (const acc of accounts) {
      const code = acc.code;
      if (acc.type === AccountType.ASSET) {
        map.set(acc.id, this.isCurrentAsset(code) ? 'CURRENT' : 'NON_CURRENT');
      } else if (acc.type === AccountType.LIABILITY) {
        map.set(acc.id, this.isCurrentLiability(code) ? 'CURRENT_LIAB' : 'NON_CURRENT_LIAB');
      } else {
        map.set(acc.id, null);
      }
    }
    return map;
  }

  private isCurrentAsset(code: string): boolean {
    if (code.includes('-')) return code.startsWith('1-1');
    return code.startsWith('10') || code.startsWith('11');
  }

  private isCurrentLiability(code: string): boolean {
    if (code.includes('-')) return code.startsWith('2-1');
    return code.startsWith('20') || code.startsWith('21');
  }

  private sumByClassification(
    roots: AccountNode[],
    accounts: any[],
    classification: 'CURRENT' | 'CURRENT_LIAB',
  ): number {
    const map = this.classifyAccounts(accounts);
    const classifiedIds = new Set<string>();
    for (const [id, cls] of map.entries()) {
      if (cls === classification) classifiedIds.add(id);
    }

    let total = 0;
    const visit = (node: AccountNode): void => {
      if (classifiedIds.has(node.id) && node.isLeaf) {
        total += Math.abs(node.balance);
      } else {
        for (const child of node.children) visit(child);
      }
    };
    for (const root of roots) visit(root);

    return total;
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers — Groups & Lines
  // ═══════════════════════════════════════════════════════════

  private buildGroup(
    groupKey: 'ASSETS' | 'LIABILITIES' | 'EQUITY',
    groupLabel: string,
    roots: AccountNode[],
    maxLevel: number,
    filters: BalanceSheetFilterDto,
    hasComparison: boolean,
  ): BalanceSheetGroup {
    const lines: BalanceSheetLine[] = [];

    const visit = (node: AccountNode): void => {
      if (node.level <= maxLevel) {
        lines.push(this.nodeToLine(node, filters.asOfDate, filters.branchId));
      }
      for (const child of node.children) visit(child);
    };

    for (const root of roots) visit(root);

    const total = roots.reduce((s, r) => s + Math.abs(r.balance), 0);
    const previousTotal = hasComparison
      ? roots.reduce((s, r) => s + Math.abs(r.previousBalance), 0)
      : null;

    let variance: number | null = null;
    let variancePercentage: number | null = null;
    if (previousTotal !== null) {
      variance = total - previousTotal;
      variancePercentage =
        previousTotal === 0 ? null : (variance / Math.abs(previousTotal)) * 100;
    }

    return {
      groupKey,
      groupLabel,
      lines,
      total: this.round2(total),
      previousTotal: previousTotal === null ? null : this.round2(previousTotal),
      variance: variance === null ? null : this.round2(variance),
      variancePercentage:
        variancePercentage === null ? null : this.round2(variancePercentage),
    };
  }

  private buildEquityGroup(
    roots: AccountNode[],
    maxLevel: number,
    filters: BalanceSheetFilterDto,
    hasComparison: boolean,
    retainedEarnings: number,
    currentPeriodNetIncome: number,
    showRE: boolean,
    dates: DateRanges,
    prevEarnings: { previousRetained: number; previousCurrentNI: number } | null,
  ): BalanceSheetGroup {
    const group = this.buildGroup(
      'EQUITY',
      'حقوق الملكية',
      roots,
      maxLevel,
      filters,
      hasComparison,
    );

    if (showRE) {
      // سطر الأرباح المبقاة
      group.lines.push(
        this.buildVirtualLine(
          '32-CALC',
          'الأرباح المبقاة (تراكمي)',
          retainedEarnings,
          filters,
          hasComparison,
          prevEarnings?.previousRetained ?? null,
        ),
      );

      // سطر صافي دخل السنة الحالية
      group.lines.push(
        this.buildVirtualLine(
          '33-CALC',
          'صافي دخل السنة الحالية',
          currentPeriodNetIncome,
          filters,
          hasComparison,
          prevEarnings?.previousCurrentNI ?? null,
        ),
      );

      group.total = this.round2(group.total + retainedEarnings + currentPeriodNetIncome);
      if (group.previousTotal !== null && prevEarnings) {
        group.previousTotal = this.round2(
          group.previousTotal + prevEarnings.previousRetained + prevEarnings.previousCurrentNI,
        );
      }

      if (group.previousTotal !== null) {
        group.variance = this.round2(group.total - group.previousTotal);
        group.variancePercentage =
          group.previousTotal === 0
            ? null
            : this.round2((group.variance / Math.abs(group.previousTotal)) * 100);
      }
    }

    return group;
  }

  private buildVirtualLine(
    code: string,
    name: string,
    amount: number,
    filters: BalanceSheetFilterDto,
    hasComparison: boolean,
    previousAmount: number | null = null,
  ): BalanceSheetLine {
    const prevBal = hasComparison && previousAmount !== null ? -previousAmount : null;
    let variance: number | null = null;
    let variancePercentage: number | null = null;
    if (prevBal !== null) {
      variance = -amount - prevBal;
      variancePercentage = prevBal === 0 ? null : (variance / Math.abs(prevBal)) * 100;
    }

    return {
      accountId: null,
      accountCode: code,
      accountName: name,
      level: 2,
      isLeaf: true,
      hasChildren: false,
      parentId: null,
      balance: -amount, // equity: credit-side
      absoluteBalance: this.round2(Math.abs(amount)),
      debit: amount < 0 ? this.round2(Math.abs(amount)) : 0,
      credit: amount > 0 ? this.round2(amount) : 0,
      previousBalance: prevBal !== null ? this.round2(prevBal) : null,
      variance: variance === null ? null : this.round2(variance),
      variancePercentage:
        variancePercentage === null ? null : this.round2(variancePercentage),
      isVirtual: true,
      drillUrl: null,
      entriesUrl: null,
    };
  }

  private nodeToLine(
    node: AccountNode,
    asOfDate?: string,
    branchId?: string,
  ): BalanceSheetLine {
    const balance = node.balance;
    const absolute = Math.abs(balance);
    const hasChildren = node.children.length > 0;
    const isLeaf = !hasChildren && node.isLeaf;

    let variance: number | null = null;
    let variancePercentage: number | null = null;
    if (Math.abs(node.previousBalance) > 0.001) {
      variance = balance - node.previousBalance;
      variancePercentage =
        node.previousBalance === 0
          ? null
          : (variance / Math.abs(node.previousBalance)) * 100;
    }

    return {
      accountId: node.id,
      accountCode: node.code,
      accountName: node.name,
      level: node.level,
      isLeaf,
      hasChildren,
      parentId: node.parentId,
      balance: this.round2(balance),
      absoluteBalance: this.round2(absolute),
      debit: balance > 0 ? this.round2(balance) : 0,
      credit: balance < 0 ? this.round2(Math.abs(balance)) : 0,
      previousBalance:
        Math.abs(node.previousBalance) > 0.001
          ? this.round2(node.previousBalance)
          : null,
      variance: variance === null ? null : this.round2(variance),
      variancePercentage:
        variancePercentage === null ? null : this.round2(variancePercentage),
      isVirtual: false,
      drillUrl: hasChildren
        ? this.buildDrillUrl(node.id, asOfDate, branchId)
        : null,
      entriesUrl: isLeaf
        ? this.buildEntriesUrl(node.id, asOfDate, branchId)
        : null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers — Ratios
  // ═══════════════════════════════════════════════════════════

  private computeRatios(
    currentAssets: number,
    currentLiabilities: number,
    totalLiabilities: number,
    totalEquity: number,
    totalAssets: number,
  ): BalanceSheetRatio[] {
    const ratios: BalanceSheetRatio[] = [];

    // Current Ratio
    if (currentLiabilities > 0.01) {
      const cr = currentAssets / currentLiabilities;
      ratios.push({
        key: 'currentRatio',
        label: 'نسبة التداول',
        value: this.round2(cr),
        isHealthy: cr >= 1.5,
        hint: 'الأصول المتداولة / الخصوم المتداولة',
      });
    }

    // Working Capital
    ratios.push({
      key: 'workingCapital',
      label: 'رأس المال العامل',
      value: this.round2(currentAssets - currentLiabilities),
      isHealthy: currentAssets - currentLiabilities > 0,
      hint: 'الأصول المتداولة − الخصوم المتداولة',
    });

    // Debt to Equity
    if (totalEquity > 0.01) {
      const dte = totalLiabilities / totalEquity;
      ratios.push({
        key: 'debtToEquity',
        label: 'المديونية / حقوق الملكية',
        value: this.round2(dte),
        isHealthy: dte <= 2.0,
        hint: 'إجمالي الخصوم / إجمالي حقوق الملكية',
      });
    }

    // Debt Ratio
    if (totalAssets > 0.01) {
      const dr = totalLiabilities / totalAssets;
      ratios.push({
        key: 'debtRatio',
        label: 'نسبة المديونية',
        value: this.round2(dr * 100),
        isHealthy: dr <= 0.6,
        hint: '% من الأصول',
      });

      // Equity Ratio
      const er = totalEquity / totalAssets;
      ratios.push({
        key: 'equityRatio',
        label: 'نسبة حقوق الملكية',
        value: this.round2(er * 100),
        isHealthy: er >= 0.4,
        hint: '% من الأصول',
      });
    }

    return ratios;
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers — Dates
  // ═══════════════════════════════════════════════════════════

  private computeDateRanges(filters: BalanceSheetFilterDto, tz: string): DateRanges {
    const asOfDate = filters.asOfDate || filters.toDate || DateTzUtil.todayInTz(tz);
    const asOfDateEnd = DateTzUtil.dayEnd(asOfDate, tz);

    const startMonth = filters.fiscalYearStartMonth ?? 1;
    const fiscalYearStart = this.computeFiscalYearStart(asOfDate, startMonth, tz);
    const fiscalYearStartStr = DateTzUtil.formatInTz(fiscalYearStart, tz, 'yyyy-MM-dd');

    const mode: BalanceSheetCompareMode = filters.compareMode || 'PREVIOUS_YEAR_SAME_DATE';

    let previousAsOfDate: string | null = null;
    let previousAsOfDateEnd: Date | null = null;
    let prevFiscalYearStart: Date | null = null;
    let label: string | null = null;

    if (mode === 'PREVIOUS_YEAR_SAME_DATE') {
      previousAsOfDate = this.shiftYear(asOfDate, -1);
      previousAsOfDateEnd = DateTzUtil.dayEnd(previousAsOfDate, tz);
      prevFiscalYearStart = this.computeFiscalYearStart(previousAsOfDate, startMonth, tz);
      label = `نفس التاريخ ${previousAsOfDate.substring(0, 4)}`;
    } else if (mode === 'PREVIOUS_YEAR_END') {
      // آخر يوم من السنة المالية السابقة
      const prevEndUtc = new Date(Date.parse(fiscalYearStartStr + 'T00:00:00Z'));
      prevEndUtc.setUTCDate(prevEndUtc.getUTCDate() - 1);
      previousAsOfDate = prevEndUtc.toISOString().split('T')[0];
      previousAsOfDateEnd = DateTzUtil.dayEnd(previousAsOfDate, tz);
      prevFiscalYearStart = this.computeFiscalYearStart(previousAsOfDate, startMonth, tz);
      label = `نهاية السنة المالية ${previousAsOfDate.substring(0, 4)}`;
    }

    return {
      asOfDate,
      asOfDateEnd,
      previousAsOfDate,
      previousAsOfDateEnd,
      fiscalYearStart,
      fiscalYearStartStr,
      prevFiscalYearStart,
      comparison: {
        mode,
        asOfDate,
        previousAsOfDate,
        label,
      },
      fiscalYear: {
        startMonth,
        startDate: fiscalYearStartStr,
        label: `السنة المالية ${fiscalYearStartStr.substring(0, 4)} (من ${fiscalYearStartStr})`,
      },
    };
  }

  private computeFiscalYearStart(asOfDate: string, startMonth: number, tz: string): Date {
    const [y, m] = asOfDate.split('-').map(Number);
    const fyStartYear = m >= startMonth ? y : y - 1;
    const fyStartStr = `${fyStartYear}-${String(startMonth).padStart(2, '0')}-01`;
    return DateTzUtil.dayStart(fyStartStr, tz);
  }

  private shiftYear(dateStr: string, delta: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const newYear = y + delta;
    const lastDay = new Date(Date.UTC(newYear, m, 0)).getUTCDate();
    const newDay = Math.min(d, lastDay);
    return `${newYear}-${String(m).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers — URLs
  // ═══════════════════════════════════════════════════════════

  private buildDrillUrl(
    accountId: string,
    asOfDate?: string,
    branchId?: string,
  ): string {
    const params = new URLSearchParams();
    params.set('parentAccountId', accountId);
    if (asOfDate) params.set('asOfDate', asOfDate);
    if (branchId) params.set('branchId', branchId);
    return `/reports/balance-sheet/drill?${params.toString()}`;
  }

  private buildEntriesUrl(
    accountId: string,
    asOfDate?: string,
    branchId?: string,
  ): string {
    const params = new URLSearchParams();
    params.set('accountId', accountId);
    if (asOfDate) params.set('toDate', asOfDate);
    if (branchId) params.set('branchId', branchId);
    return `/reports/general-ledger?${params.toString()}`;
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers — Empty Response
  // ═══════════════════════════════════════════════════════════

  private emptyResponse(meta: ReportMeta, dates: DateRanges): BalanceSheetResponse {
    const hasComparison = dates.previousAsOfDate !== null;

    const emptyGroup = (
      key: 'ASSETS' | 'LIABILITIES' | 'EQUITY',
      label: string,
    ): BalanceSheetGroup => ({
      groupKey: key,
      groupLabel: label,
      lines: [],
      total: 0,
      previousTotal: hasComparison ? 0 : null,
      variance: null,
      variancePercentage: null,
    });

    return {
      meta,
      summary: {
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        currentAssets: 0,
        nonCurrentAssets: 0,
        currentLiabilities: 0,
        nonCurrentLiabilities: 0,
        previousTotalAssets: hasComparison ? 0 : null,
        previousTotalLiabilities: hasComparison ? 0 : null,
        previousTotalEquity: hasComparison ? 0 : null,
        assetsVariance: null,
        liabilitiesVariance: null,
        equityVariance: null,
        balanceDifference: 0,
        isBalanced: true,
        retainedEarnings: 0,
        currentPeriodNetIncome: 0,
        ratios: [],
      },
      groups: [
        emptyGroup('ASSETS', 'الأصول'),
        emptyGroup('LIABILITIES', 'الخصوم'),
        emptyGroup('EQUITY', 'حقوق الملكية'),
      ],
      comparison: dates.comparison,
      fiscalYear: dates.fiscalYear,
    };
  }
}
