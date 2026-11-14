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
  IncomeStatementFilterDto,
  IncomeStatementCompareMode,
} from '../dto/income-statement-filter.dto';
import { DrillDownFilterDto } from '../dto/drill-down-filter.dto';
import {
  IncomeStatementResponse,
  IncomeStatementSummary,
  IncomeStatementGroup,
  IncomeStatementLine,
  DrillDownResult,
} from '../interfaces/income-statement.interface';

// ─────────────────────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────────────────────

interface DateRange {
  from: Date;
  to: Date;
  fromStr: string;
  toStr: string;
  prevFrom: Date | null;
  prevTo: Date | null;
  prevFromStr: string | null;
  prevToStr: string | null;
  comparison: {
    mode: IncomeStatementCompareMode;
    previousFromDate: string | null;
    previousToDate: string | null;
    label: string | null;
  };
}

interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  level: number;
  parentId: string | null;
  isLeaf: boolean;
  children: AccountNode[];
  currentAmount: number;
  previousAmount: number | null;
}

/**
 * IncomeStatementService
 * ──────────────────────
 * تقرير قائمة الدخل مع المقارنة (Comparative).
 *
 * ملاحظات معمارية:
 *   - لا يوجد COGS منفصل → القائمة مبسّطة: Revenue − Expenses = Net Income.
 *   - العزل عبر `Account.companyId` و `JournalEntry.companyId` مباشر.
 *   - يدعم Drill-Down شجري عبر `drillDown()`.
 */
@Injectable()
export class IncomeStatementService extends BaseReportService<
  IncomeStatementFilterDto,
  IncomeStatementResponse
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
    return 'قائمة الدخل';
  }

  /**
   * قائمة الدخل تتغير مع كل قيد مرحّل — TTL قصير (180s).
   */
  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 180, enabled: true };
  }

  // ═══════════════════════════════════════════════════════════
  // buildReport — Main Income Statement
  // ═══════════════════════════════════════════════════════════

  protected async buildReport(
    filters: IncomeStatementFilterDto,
    ctx: ReportContext,
  ): Promise<IncomeStatementResponse> {
    const tz = ctx.timezone;
    const dates = this.computeDateRanges(filters, tz);
    const includeInactive = filters.includeInactive === true;
    const hideZero = filters.hideZeroMovement !== false;
    const maxLevel = filters.level ?? 5;

    // ─── 1. جلب الحسابات (REVENUE + EXPENSE)
    const accounts = await this.prisma.account.findMany({
      where: {
        companyId: ctx.companyId,
        type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
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

    // ─── 2. جلب تجميعات JournalLine (حالي + سابق متوازيان)
    const [currentSums, previousSums] = await Promise.all([
      this.fetchJournalSums(
        ctx.companyId,
        filters.branchId,
        accountIds,
        dates.from,
        dates.to,
      ),
      dates.prevFrom && dates.prevTo
        ? this.fetchJournalSums(
            ctx.companyId,
            filters.branchId,
            accountIds,
            dates.prevFrom,
            dates.prevTo,
          )
        : Promise.resolve(new Map<string, { debit: number; credit: number }>()),
    ]);

    // ─── 3. بناء الشجرة + التجميع
    const roots = this.buildTree(
      accounts,
      currentSums,
      previousSums,
      dates.prevFrom !== null,
    );

    // ─── 4. فلترة حسب hideZeroMovement
    const filteredRoots = hideZero
      ? roots.filter((r) => this.hasMovement(r))
      : roots;

    // ─── 5. بناء المجموعات
    const revenueGroup = this.buildGroup(
      'REVENUE',
      'الإيرادات',
      filteredRoots.filter((r) => r.type === AccountType.REVENUE),
      maxLevel,
      filters,
    );
    const expenseGroup = this.buildGroup(
      'EXPENSE',
      'المصروفات',
      filteredRoots.filter((r) => r.type === AccountType.EXPENSE),
      maxLevel,
      filters,
    );

    // ─── 6. الملخص
    const summary = this.buildSummary(
      revenueGroup,
      expenseGroup,
      dates.comparison.mode !== 'NONE',
    );

    return {
      meta: ctx.meta,
      summary,
      groups: [revenueGroup, expenseGroup],
      comparison: dates.comparison,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // drillDown — Tree Navigation
  // ═══════════════════════════════════════════════════════════

  /**
   * يعرض أبناء حساب معين (Drill-Down).
   *
   * ⚠️ لا يستخدم BaseReportService — استعلام خفيف بلا cache.
   */
  async drillDown(
    filters: DrillDownFilterDto,
    companyId: string,
    tzOverride?: string,
  ): Promise<DrillDownResult> {
    // ─── 1. تحقق أن الحساب الأب يخص الشركة
    const parent = await this.prisma.account.findFirst({
      where: { id: filters.parentAccountId, companyId },
      select: { id: true, code: true, name: true, type: true },
    });

    if (!parent) {
      throw new NotFoundException('الحساب الأب غير موجود');
    }

    let tz = tzOverride;
    if (!tz) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { timezone: true },
      });
      tz = company?.timezone ?? 'Africa/Cairo';
    }

    const dates = this.computeDateRanges(filters, tz);
    const hideZero = filters.hideZeroMovement !== false;

    // ─── 2. جلب كل حسابات الشركة (REVENUE + EXPENSE) لبناء الشجرة الكاملة
    const accounts = await this.prisma.account.findMany({
      where: {
        companyId,
        type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
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

    const accountIds = accounts.map((a) => a.id);

    // ─── 3. تجميعات JournalLine (حالي + سابق)
    const [currentSums, previousSums] = await Promise.all([
      this.fetchJournalSums(
        companyId,
        filters.branchId,
        accountIds,
        dates.from,
        dates.to,
      ),
      dates.prevFrom && dates.prevTo
        ? this.fetchJournalSums(
            companyId,
            filters.branchId,
            accountIds,
            dates.prevFrom,
            dates.prevTo,
          )
        : Promise.resolve(new Map<string, { debit: number; credit: number }>()),
    ]);

    // ─── 4. بناء الشجرة
    const roots = this.buildTree(
      accounts,
      currentSums,
      previousSums,
      dates.prevFrom !== null,
    );

    // ─── 5. ابحث عن العقدة الأب
    const parentNode = this.findNodeById(roots, parent.id);

    if (!parentNode || parentNode.children.length === 0) {
      return {
        parent: { id: parent.id, code: parent.code, name: parent.name },
        lines: [],
        comparison: dates.comparison,
      };
    }

    // ─── 6. تحويل الأبناء إلى Lines
    const lines: IncomeStatementLine[] = [];
    for (const child of parentNode.children) {
      if (hideZero && !this.hasMovement(child)) continue;
      lines.push(this.nodeToLine(child, filters));
    }

    return {
      parent: { id: parent.id, code: parent.code, name: parent.name },
      lines,
      comparison: dates.comparison,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════

  /**
   * جلب تجميعات JournalLine لكل حساب خلال فترة.
   */
  private async fetchJournalSums(
    companyId: string,
    branchId: string | undefined,
    accountIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, { debit: number; credit: number }>> {
    if (accountIds.length === 0) return new Map();

    const rows = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          companyId,
          ...(branchId ? { branchId } : {}),
          date: { gte: from, lte: to },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const map = new Map<string, { debit: number; credit: number }>();
    for (const r of rows) {
      map.set(r.accountId, {
        debit: Number(r._sum.debit ?? 0),
        credit: Number(r._sum.credit ?? 0),
      });
    }
    return map;
  }

  /**
   * بناء شجرة الحسابات + التجميع recursively.
   */
  private buildTree(
    accounts: Array<{
      id: string;
      code: string;
      name: string;
      type: AccountType;
      level: number;
      parentId: string | null;
      isLeaf: boolean;
    }>,
    currentSums: Map<string, { debit: number; credit: number }>,
    previousSums: Map<string, { debit: number; credit: number }>,
    hasComparison: boolean,
  ): AccountNode[] {
    const nodeMap = new Map<string, AccountNode>();

    for (const acc of accounts) {
      const cur = currentSums.get(acc.id) ?? { debit: 0, credit: 0 };
      const prev = hasComparison
        ? previousSums.get(acc.id) ?? { debit: 0, credit: 0 }
        : null;

      // REVENUE طبيعتها دائنة → نعرضها موجبة بـ (-1)
      // EXPENSE طبيعتها مدينة → نعرضها موجبة بـ (+1)
      const sign = acc.type === AccountType.REVENUE ? -1 : 1;

      nodeMap.set(acc.id, {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        level: acc.level,
        parentId: acc.parentId,
        isLeaf: acc.isLeaf,
        children: [],
        currentAmount: sign * (cur.debit - cur.credit),
        previousAmount: prev ? sign * (prev.debit - prev.credit) : null,
      });
    }

    // ربط الأبناء بالآباء
    const roots: AccountNode[] = [];
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // التجميع التراكمي (bottom-up)
    const aggregate = (node: AccountNode): void => {
      for (const child of node.children) {
        aggregate(child);
        node.currentAmount += child.currentAmount;
        if (node.previousAmount !== null && child.previousAmount !== null) {
          node.previousAmount += child.previousAmount;
        }
      }
    };
    for (const root of roots) aggregate(root);

    return roots;
  }

  /**
   * هل العقدة (أو أبناؤها) فيها حركة؟
   */
  private hasMovement(node: AccountNode): boolean {
    if (Math.abs(node.currentAmount) > 0.01) return true;
    if (
      node.previousAmount !== null &&
      Math.abs(node.previousAmount) > 0.01
    ) {
      return true;
    }
    return false;
  }

  /**
   * يبحث عن عقدة بالمعرف (DFS).
   */
  private findNodeById(
    roots: AccountNode[],
    id: string,
  ): AccountNode | null {
    const stack: AccountNode[] = [...roots];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.id === id) return node;
      stack.push(...node.children);
    }
    return null;
  }

  /**
   * يحوّل عقدة إلى Line مع روابط Drill-Down.
   */
  private nodeToLine(
    node: AccountNode,
    filters: IncomeStatementFilterDto | DrillDownFilterDto,
  ): IncomeStatementLine {
    const hasChildren = node.children.length > 0;
    const isLeaf = !hasChildren && node.isLeaf;

    let variance: number | null = null;
    let variancePercentage: number | null = null;

    if (node.previousAmount !== null) {
      variance = node.currentAmount - node.previousAmount;
      variancePercentage =
        node.previousAmount === 0
          ? null
          : (variance / Math.abs(node.previousAmount)) * 100;
    }

    return {
      accountId: node.id,
      accountCode: node.code,
      accountName: node.name,
      level: node.level,
      isLeaf,
      hasChildren,
      parentId: node.parentId,
      amount: this.round2(node.currentAmount),
      previousAmount:
        node.previousAmount === null
          ? null
          : this.round2(node.previousAmount),
      variance: variance === null ? null : this.round2(variance),
      variancePercentage:
        variancePercentage === null ? null : this.round2(variancePercentage),
      drillUrl: hasChildren ? this.buildDrillUrl(node.id, filters) : null,
      entriesUrl: isLeaf ? this.buildEntriesUrl(node.id, filters) : null,
    };
  }

  /**
   * بناء Group (Revenue أو Expense) مع lines مسطّحة.
   */
  private buildGroup(
    groupKey: 'REVENUE' | 'EXPENSE',
    groupLabel: string,
    roots: AccountNode[],
    maxLevel: number,
    filters: IncomeStatementFilterDto,
  ): IncomeStatementGroup {
    const lines: IncomeStatementLine[] = [];

    // DFS لنشر الشجرة بترتيب hierarchical
    const visit = (node: AccountNode): void => {
      if (node.level <= maxLevel) {
        lines.push(this.nodeToLine(node, filters));
      }
      for (const child of node.children) visit(child);
    };

    for (const root of roots) visit(root);

    // الإجمالي = مجموع الجذور (level 1)
    const total = roots.reduce((s, r) => s + r.currentAmount, 0);
    const hasComparison = roots.some((r) => r.previousAmount !== null);
    const previousTotal = hasComparison
      ? roots.reduce((s, r) => s + (r.previousAmount ?? 0), 0)
      : null;

    let variance: number | null = null;
    let variancePercentage: number | null = null;

    if (previousTotal !== null) {
      variance = total - previousTotal;
      variancePercentage =
        previousTotal === 0
          ? null
          : (variance / Math.abs(previousTotal)) * 100;
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

  /**
   * بناء الملخص التنفيذي.
   */
  private buildSummary(
    revenueGroup: IncomeStatementGroup,
    expenseGroup: IncomeStatementGroup,
    hasComparison: boolean,
  ): IncomeStatementSummary {
    const totalRevenue = revenueGroup.total;
    const totalExpenses = Math.abs(expenseGroup.total);
    const netIncome = totalRevenue - totalExpenses;

    const previousTotalRevenue =
      hasComparison ? revenueGroup.previousTotal : null;
    const previousTotalExpenses =
      hasComparison && expenseGroup.previousTotal !== null
        ? Math.abs(expenseGroup.previousTotal)
        : null;
    const previousNetIncome =
      previousTotalRevenue !== null && previousTotalExpenses !== null
        ? previousTotalRevenue - previousTotalExpenses
        : null;

    const revenueVariance =
      previousTotalRevenue === null
        ? null
        : totalRevenue - previousTotalRevenue;
    const expensesVariance =
      previousTotalExpenses === null
        ? null
        : totalExpenses - previousTotalExpenses;
    const netIncomeVariance =
      previousNetIncome === null ? null : netIncome - previousNetIncome;

    const revenueGrowth =
      previousTotalRevenue === null || previousTotalRevenue === 0
        ? null
        : (revenueVariance! / Math.abs(previousTotalRevenue)) * 100;
    const expensesGrowth =
      previousTotalExpenses === null || previousTotalExpenses === 0
        ? null
        : (expensesVariance! / Math.abs(previousTotalExpenses)) * 100;
    const netIncomeGrowth =
      previousNetIncome === null || previousNetIncome === 0
        ? null
        : (netIncomeVariance! / Math.abs(previousNetIncome)) * 100;

    const netIncomeMargin =
      totalRevenue === 0 ? 0 : (netIncome / totalRevenue) * 100;
    const previousNetIncomeMargin =
      previousTotalRevenue === null ||
      previousNetIncome === null ||
      previousTotalRevenue === 0
        ? null
        : (previousNetIncome / previousTotalRevenue) * 100;

    return {
      totalRevenue: this.round2(totalRevenue),
      totalExpenses: this.round2(totalExpenses),
      netIncome: this.round2(netIncome),
      previousTotalRevenue:
        previousTotalRevenue === null ? null : this.round2(previousTotalRevenue),
      previousTotalExpenses:
        previousTotalExpenses === null
          ? null
          : this.round2(previousTotalExpenses),
      previousNetIncome:
        previousNetIncome === null ? null : this.round2(previousNetIncome),
      revenueVariance:
        revenueVariance === null ? null : this.round2(revenueVariance),
      expensesVariance:
        expensesVariance === null ? null : this.round2(expensesVariance),
      netIncomeVariance:
        netIncomeVariance === null ? null : this.round2(netIncomeVariance),
      revenueGrowth:
        revenueGrowth === null ? null : this.round2(revenueGrowth),
      expensesGrowth:
        expensesGrowth === null ? null : this.round2(expensesGrowth),
      netIncomeGrowth:
        netIncomeGrowth === null ? null : this.round2(netIncomeGrowth),
      netIncomeMargin: this.round2(netIncomeMargin),
      previousNetIncomeMargin:
        previousNetIncomeMargin === null
          ? null
          : this.round2(previousNetIncomeMargin),
    };
  }

  /**
   * يحسب النطاق الزمني الحالي + السابق حسب compareMode.
   */
  private computeDateRanges(
    filters: {
      fromDate?: string;
      toDate?: string;
      compareMode?: IncomeStatementCompareMode;
    },
    tz: string,
  ): DateRange {
    const fromStr = filters.fromDate || DateTzUtil.todayInTz(tz);
    const toStr = filters.toDate || DateTzUtil.todayInTz(tz);
    const { from, to } = DateTzUtil.range(fromStr, toStr, tz);

    const mode: IncomeStatementCompareMode =
      filters.compareMode || 'PREVIOUS_YEAR';

    if (mode === 'NONE') {
      return {
        from,
        to,
        fromStr,
        toStr,
        prevFrom: null,
        prevTo: null,
        prevFromStr: null,
        prevToStr: null,
        comparison: {
          mode: 'NONE',
          previousFromDate: null,
          previousToDate: null,
          label: null,
        },
      };
    }

    let prevFromStr: string;
    let prevToStr: string;

    if (mode === 'PREVIOUS_YEAR') {
      prevFromStr = this.shiftYear(fromStr, -1);
      prevToStr = this.shiftYear(toStr, -1);
    } else {
      // PREVIOUS_PERIOD — نفس طول الفترة، مباشرة قبل fromDate
      const durationMs = to.getTime() - from.getTime();
      const prevToDate = new Date(from.getTime() - 1);
      const prevFromDate = new Date(prevToDate.getTime() - durationMs);
      prevFromStr = DateTzUtil.formatInTz(prevFromDate, tz, 'yyyy-MM-dd');
      prevToStr = DateTzUtil.formatInTz(prevToDate, tz, 'yyyy-MM-dd');
    }

    const prev = DateTzUtil.range(prevFromStr, prevToStr, tz);

    const label =
      mode === 'PREVIOUS_YEAR'
        ? `نفس الفترة ${prevFromStr.substring(0, 4)}`
        : `الفترة السابقة (${prevFromStr} — ${prevToStr})`;

    return {
      from,
      to,
      fromStr,
      toStr,
      prevFrom: prev.from,
      prevTo: prev.to,
      prevFromStr,
      prevToStr,
      comparison: {
        mode,
        previousFromDate: prevFromStr,
        previousToDate: prevToStr,
        label,
      },
    };
  }

  /**
   * يزيح السنة مع معالجة السنوات الكبيسة.
   */
  private shiftYear(dateStr: string, delta: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const newYear = y + delta;
    const lastDay = new Date(Date.UTC(newYear, m, 0)).getUTCDate();
    const newDay = Math.min(d, lastDay);
    return `${newYear}-${String(m).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
  }

  /**
   * يبني رابط Drill-Down لحساب غير طرفي.
   */
  private buildDrillUrl(
    accountId: string,
    filters: IncomeStatementFilterDto | DrillDownFilterDto,
  ): string {
    const params = new URLSearchParams();
    params.set('parentAccountId', accountId);
    if (filters.fromDate) params.set('fromDate', filters.fromDate);
    if (filters.toDate) params.set('toDate', filters.toDate);
    if (filters.compareMode) params.set('compareMode', filters.compareMode);
    if (filters.branchId) params.set('branchId', filters.branchId);
    return `/reports/income-statement/drill?${params.toString()}`;
  }

  /**
   * يبني رابط General Ledger لحساب طرفي.
   */
  private buildEntriesUrl(
    accountId: string,
    filters: IncomeStatementFilterDto | DrillDownFilterDto,
  ): string {
    const params = new URLSearchParams();
    params.set('accountId', accountId);
    if (filters.fromDate) params.set('fromDate', filters.fromDate);
    if (filters.toDate) params.set('toDate', filters.toDate);
    if (filters.branchId) params.set('branchId', filters.branchId);
    return `/reports/general-ledger?${params.toString()}`;
  }

  /**
   * استجابة فارغة موحّدة.
   */
  private emptyResponse(
    meta: ReportMeta,
    dates: DateRange,
  ): IncomeStatementResponse {
    const hasComparison = dates.comparison.mode !== 'NONE';

    const emptyGroup = (
      key: 'REVENUE' | 'EXPENSE',
      label: string,
    ): IncomeStatementGroup => ({
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
        totalRevenue: 0,
        totalExpenses: 0,
        netIncome: 0,
        previousTotalRevenue: hasComparison ? 0 : null,
        previousTotalExpenses: hasComparison ? 0 : null,
        previousNetIncome: hasComparison ? 0 : null,
        revenueVariance: null,
        expensesVariance: null,
        netIncomeVariance: null,
        revenueGrowth: null,
        expensesGrowth: null,
        netIncomeGrowth: null,
        netIncomeMargin: 0,
        previousNetIncomeMargin: null,
      },
      groups: [
        emptyGroup('REVENUE', 'الإيرادات'),
        emptyGroup('EXPENSE', 'المصروفات'),
      ],
      comparison: dates.comparison,
    };
  }
}
