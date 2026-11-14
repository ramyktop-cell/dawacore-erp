import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BaseReportService,
  CacheOptions,
  CACHE_SERVICE,
  ICacheService,
  ReportContext,
  ReportMetaBuilder,
  DateTzUtil,
} from 'src/shared/report-kit';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { TrialBalanceFilterDto } from '../dto/trial-balance-filter.dto';
import {
  TrialBalanceResponse,
  TrialBalanceSummary,
  TrialBalanceRow,
} from '../interfaces/trial-balance.interface';

/**
 * TrialBalanceService
 * ───────────────────
 * تقرير ميزان المراجعة.
 *
 * المنطق المحاسبي:
 *   1. الرصيد الافتتاحي = مجموع كل الحركات قبل fromDate
 *   2. حركة الفترة = الحركات بين fromDate و toDate
 *   3. الرصيد الختامي = الافتتاحي + حركة الفترة
 *   4. فحص التوازن = |إجمالي المدين − إجمالي الدائن| < 0.01
 *
 * يعتمد على الحسابات الطرفية (isLeaf) افتراضياً.
 *
 * العزل الأمني:
 *   - Account.companyId و JournalEntry.companyId مباشران
 *   - Branch يُفلتر على JournalEntry.branchId (لا على Account)
 */
@Injectable()
export class TrialBalanceService extends BaseReportService<
  TrialBalanceFilterDto,
  TrialBalanceResponse
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
    return 'ميزان المراجعة';
  }

  /**
   * تقرير محاسبي — يتغير مع كل قيد يومية.
   * TTL قصير (120s) مثل daily-sales.
   */
  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 120, enabled: true };
  }

  // ─────────────────────────────────────────────
  // Report logic
  // ─────────────────────────────────────────────

  protected async buildReport(
    filters: TrialBalanceFilterDto,
    ctx: ReportContext,
  ): Promise<TrialBalanceResponse> {
    const tz = ctx.timezone;

    // ─── 1. النطاق الزمني
    const fromDateStr = filters.fromDate || DateTzUtil.todayInTz(tz);
    const toDateStr = filters.toDate || DateTzUtil.todayInTz(tz);
    const { from, to } = DateTzUtil.range(fromDateStr, toDateStr, tz);

    // ─── 2. فلترة الحسابات
    const onlyLeaf = filters.onlyLeaf !== false; // default true
    const showZeroBalances = filters.showZeroBalances === true;
    const showEmptyAccounts = filters.showEmptyAccounts === true;

    const accounts = await this.prisma.account.findMany({
      where: {
        companyId: ctx.companyId,
        ...(onlyLeaf ? { isLeaf: true } : {}),
        ...(filters.accountId ? { id: filters.accountId } : {}),
        ...(filters.accountType ? { type: filters.accountType as any } : {}),
        ...(filters.level ? { level: filters.level } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        level: true,
      },
      orderBy: { code: 'asc' },
    });

    if (accounts.length === 0) {
      return this.emptyResponse(ctx.meta);
    }

    const accountIds = accounts.map((a) => a.id);

    // ─── 3. شرط العزل الأساسي للـ JournalEntry
    const baseJournalEntryWhere: Prisma.JournalEntryWhereInput = {
      companyId: ctx.companyId,
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };

    // ─── 4. الاستعلامات المتوازية: افتتاحي + حركة
    const [openingBalances, movements] = await Promise.all([
      // 4.1. الرصيد الافتتاحي (قبل fromDate)
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          journalEntry: {
            ...baseJournalEntryWhere,
            date: { lt: from },
          },
        },
        _sum: { debit: true, credit: true },
      }),

      // 4.2. حركة الفترة
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          journalEntry: {
            ...baseJournalEntryWhere,
            date: { gte: from, lte: to },
          },
        },
        _sum: { debit: true, credit: true },
      }),
    ]);

    // ─── 5. بناء الخرائط
    const openingMap = new Map<string, { debit: number; credit: number }>();
    for (const row of openingBalances) {
      openingMap.set(row.accountId, {
        debit: Number(row._sum.debit ?? 0),
        credit: Number(row._sum.credit ?? 0),
      });
    }

    const movementMap = new Map<string, { debit: number; credit: number }>();
    for (const row of movements) {
      movementMap.set(row.accountId, {
        debit: Number(row._sum.debit ?? 0),
        credit: Number(row._sum.credit ?? 0),
      });
    }

    // ─── 6. التجميع
    const rows: TrialBalanceRow[] = [];
    let totalOpeningDebit = 0;
    let totalOpeningCredit = 0;
    let totalMovementDebit = 0;
    let totalMovementCredit = 0;
    let totalClosingDebit = 0;
    let totalClosingCredit = 0;
    let accountsWithActivity = 0;

    for (const account of accounts) {
      const rawOpening = openingMap.get(account.id) ?? {
        debit: 0,
        credit: 0,
      };
      const movement = movementMap.get(account.id) ?? { debit: 0, credit: 0 };

      // الرصيد الافتتاحي الصافي (موقّع)
      const netOpeningRaw = rawOpening.debit - rawOpening.credit;
      const openingDebit = netOpeningRaw > 0 ? netOpeningRaw : 0;
      const openingCredit = netOpeningRaw < 0 ? Math.abs(netOpeningRaw) : 0;

      // حركة الفترة
      const movementDebit = movement.debit;
      const movementCredit = movement.credit;
      const netMovement = movementDebit - movementCredit;

      // الرصيد الختامي الصافي (معالجة انقلاب الرصيد)
      const netClosing = netOpeningRaw + netMovement;
      const closingDebit = netClosing > 0 ? netClosing : 0;
      const closingCredit = netClosing < 0 ? Math.abs(netClosing) : 0;

      // ─── 7. الفلترة
      const hasActivity =
        openingDebit > 0 ||
        openingCredit > 0 ||
        movementDebit > 0 ||
        movementCredit > 0;

      if (!showEmptyAccounts && !hasActivity) continue;

      const isZeroClosing = closingDebit === 0 && closingCredit === 0;
      if (!showZeroBalances && isZeroClosing && hasActivity) continue;

      if (hasActivity) accountsWithActivity++;

      // ─── 8. الصف
      rows.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        level: account.level,

        openingDebit: this.round2(openingDebit),
        openingCredit: this.round2(openingCredit),
        openingBalance: this.round2(netOpeningRaw),

        movementDebit: this.round2(movementDebit),
        movementCredit: this.round2(movementCredit),
        movementBalance: this.round2(netMovement),

        closingDebit: this.round2(closingDebit),
        closingCredit: this.round2(closingCredit),
        closingBalance: this.round2(netClosing),
      });

      // ─── 9. الإجماليات
      totalOpeningDebit += openingDebit;
      totalOpeningCredit += openingCredit;
      totalMovementDebit += movementDebit;
      totalMovementCredit += movementCredit;
      totalClosingDebit += closingDebit;
      totalClosingCredit += closingCredit;
    }

    // ─── 10. الترتيب
    const sortBy = filters.sortBy || 'accountCode';
    const sortOrder = filters.sortOrder || 'asc';
    const direction = sortOrder === 'desc' ? -1 : 1;

    const sortKeyMap = {
      accountCode: 'accountCode',
      accountName: 'accountName',
      openingBalance: 'openingBalance',
      movement: 'movementBalance',
      closingBalance: 'closingBalance',
    } as const;

    const sortKey = sortKeyMap[sortBy as keyof typeof sortKeyMap] ?? 'accountCode';

    rows.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        // localeCompare للـ accountCode يعطي 1-100-01 < 1-100-02 < 1-100-10
        return aVal.localeCompare(bVal, 'en', { numeric: true }) * direction;
      }

      return ((aVal as number) - (bVal as number)) * direction;
    });

    // ─── 11. الملخص
    const closingDifference = Math.abs(totalClosingDebit - totalClosingCredit);
    const openingDifference = Math.abs(
      totalOpeningDebit - totalOpeningCredit,
    );
    const movementDifference = Math.abs(
      totalMovementDebit - totalMovementCredit,
    );

    const summary: TrialBalanceSummary = {
      totalAccounts: rows.length,
      accountsWithActivity,

      totalOpeningDebit: this.round2(totalOpeningDebit),
      totalOpeningCredit: this.round2(totalOpeningCredit),
      openingDifference: this.round2(openingDifference),

      totalMovementDebit: this.round2(totalMovementDebit),
      totalMovementCredit: this.round2(totalMovementCredit),
      movementDifference: this.round2(movementDifference),

      totalClosingDebit: this.round2(totalClosingDebit),
      totalClosingCredit: this.round2(totalClosingCredit),
      closingDifference: this.round2(closingDifference),

      isBalanced: closingDifference < 0.01,
    };

    // ─── 12. الاستجابة
    return {
      meta: ctx.meta,
      summary,
      rows,
    };
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * استجابة فارغة موحّدة عند غياب الحسابات.
   */
  private emptyResponse(meta: ReportContext['meta']): TrialBalanceResponse {
    return {
      meta,
      summary: {
        totalAccounts: 0,
        accountsWithActivity: 0,
        totalOpeningDebit: 0,
        totalOpeningCredit: 0,
        openingDifference: 0,
        totalMovementDebit: 0,
        totalMovementCredit: 0,
        movementDifference: 0,
        totalClosingDebit: 0,
        totalClosingCredit: 0,
        closingDifference: 0,
        isBalanced: true, // متوازن تلقائياً عند الفراغ
      },
      rows: [],
    };
  }
}
