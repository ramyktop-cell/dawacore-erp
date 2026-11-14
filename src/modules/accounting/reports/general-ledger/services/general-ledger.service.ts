import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { GeneralLedgerFilterDto } from '../dto/general-ledger-filter.dto';
import {
  GeneralLedgerResponse,
  GeneralLedgerSummary,
  GeneralLedgerEntry,
  GeneralLedgerCounterparty,
  AccountLedger,
} from '../interfaces/general-ledger.interface';

/**
 * GeneralLedgerService
 * ────────────────────
 * تقرير دفتر الأستاذ العام — كشف حساب مفصّل لكل حساب.
 *
 * يدعم وضعين:
 *   1. Single Account Mode  → عند تمرير accountId
 *   2. All Accounts Mode    → عند عدم تمريره (مع pagination)
 *
 * الميزات:
 *   ⚡ Cache تلقائي مع عزل per-tenant
 *   📊 Running Balance محسوب تراكمياً (ASC إلزامي)
 *   👤 Counterparty (عميل/مورد) لكل قيد
 *   ✂️  Truncation آمن (limit per account)
 */
@Injectable()
export class GeneralLedgerService extends BaseReportService<
  GeneralLedgerFilterDto,
  GeneralLedgerResponse
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
    return 'دفتر الأستاذ العام';
  }

  /**
   * GL أثقل من TB (يحتاج details) — TTL = 300s.
   */
  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 300, enabled: true };
  }

  // ─────────────────────────────────────────────
  // Report logic
  // ─────────────────────────────────────────────

  protected async buildReport(
    filters: GeneralLedgerFilterDto,
    ctx: ReportContext,
  ): Promise<GeneralLedgerResponse> {
    const tz = ctx.timezone;

    // ─── 1. إعدادات الفلاتر
    const entriesPerAccount = filters.entriesPerAccount ?? 100;
    const includeOpening = filters.includeOpeningBalance !== false;
    const hideZeroMovement = filters.hideZeroMovement !== false;
    const onlyLeaf = filters.onlyLeaf !== false;

    // ─── 2. النطاق الزمني
    const fromDateStr = filters.fromDate || DateTzUtil.todayInTz(tz);
    const toDateStr = filters.toDate || DateTzUtil.todayInTz(tz);
    const { from, to } = DateTzUtil.range(fromDateStr, toDateStr, tz);

    // ─── 3. جلب الحسابات
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

    // ─── 4. شرط العزل الأساسي
    const baseJournalEntryWhere: Prisma.JournalEntryWhereInput = {
      companyId: ctx.companyId,
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };

    // ─── 5. الاستعلامات المتوازية الثلاثة
    const [openingRows, entryRows, countRows] = await Promise.all([
      // 5.1. الافتتاحي (قبل fromDate)
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

      // 5.2. القيود خلال الفترة (ASC للرصيد الجاري)
      this.prisma.journalLine.findMany({
        where: {
          accountId: { in: accountIds },
          journalEntry: {
            ...baseJournalEntryWhere,
            date: { gte: from, lte: to },
          },
        },
        select: {
          id: true,
          accountId: true,
          debit: true,
          credit: true,
          journalEntry: {
            select: {
              id: true,
              entryNumber: true,
              date: true,
              description: true,
              referenceId: true,
              source: true,
            },
          },
          customer: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: [
          { journalEntry: { date: 'asc' } },
          { journalEntry: { id: 'asc' } },
          { id: 'asc' },
        ],
      }),

      // 5.3. عدد القيود لكل حساب (للـ truncation)
      this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          journalEntry: {
            ...baseJournalEntryWhere,
            date: { gte: from, lte: to },
          },
        },
        _count: { _all: true },
      }),
    ]);

    // ─── 6. بناء الخرائط
    const openingMap = new Map<string, { debit: number; credit: number }>();
    for (const row of openingRows) {
      openingMap.set(row.accountId, {
        debit: Number(row._sum.debit ?? 0),
        credit: Number(row._sum.credit ?? 0),
      });
    }

    const countMap = new Map<string, number>();
    for (const row of countRows) {
      countMap.set(row.accountId, row._count._all);
    }

    const entriesByAccount = new Map<string, typeof entryRows>();
    for (const row of entryRows) {
      const list = entriesByAccount.get(row.accountId) ?? [];
      list.push(row);
      entriesByAccount.set(row.accountId, list);
    }

    // ─── 7. بناء AccountLedger لكل حساب
    const ledgers: AccountLedger[] = [];

    for (const account of accounts) {
      const opening = openingMap.get(account.id) ?? { debit: 0, credit: 0 };
      const netOpening = opening.debit - opening.credit;

      const accountEntries = entriesByAccount.get(account.id) ?? [];
      const totalCount = countMap.get(account.id) ?? 0;

      // ─── 7.1 إجماليات الفترة
      let totalDebit = 0;
      let totalCredit = 0;

      // ─── 7.2 الرصيد الجاري (يُحسب على كل القيود قبل التقطيع)
      const startBalance = includeOpening ? netOpening : 0;
      let running = startBalance;

      const mappedEntries: GeneralLedgerEntry[] = [];
      for (const row of accountEntries) {
        const debit = Number(row.debit);
        const credit = Number(row.credit);

        totalDebit += debit;
        totalCredit += credit;
        running += debit - credit;

        mappedEntries.push({
          journalLineId: row.id,
          journalEntryId: row.journalEntry.id,
          entryNumber: row.journalEntry.entryNumber,
          date: row.journalEntry.date.toISOString(),
          description: row.journalEntry.description,
          referenceId: row.journalEntry.referenceId,
          source: row.journalEntry.source,
          debit: this.round2(debit),
          credit: this.round2(credit),
          runningBalance: this.round2(running),
          counterparty: this.mapCounterparty(row),
        });
      }

      // ─── 7.3 الرصيد الختامي
      const netClosing = startBalance + (totalDebit - totalCredit);

      // ─── 7.4 فلتر hideZeroMovement
      const hasMovement =
        accountEntries.length > 0 ||
        (includeOpening && Math.abs(netOpening) > 0.01);

      if (hideZeroMovement && !hasMovement) continue;

      // ─── 7.5 التقطيع
      const displayedEntries =
        entriesPerAccount === 0
          ? mappedEntries
          : mappedEntries.slice(0, entriesPerAccount);

      ledgers.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        level: account.level,

        openingBalance: this.round2(startBalance),
        openingDebit: startBalance > 0 ? this.round2(startBalance) : 0,
        openingCredit: startBalance < 0 ? this.round2(Math.abs(startBalance)) : 0,

        totalDebit: this.round2(totalDebit),
        totalCredit: this.round2(totalCredit),

        closingBalance: this.round2(netClosing),
        closingDebit: netClosing > 0 ? this.round2(netClosing) : 0,
        closingCredit: netClosing < 0 ? this.round2(Math.abs(netClosing)) : 0,

        totalEntries: totalCount,
        displayedEntries: displayedEntries.length,
        isTruncated: totalCount > displayedEntries.length,

        entries: displayedEntries,
      });
    }

    // ─── 8. الترتيب
    const sortBy = filters.sortAccountsBy || 'code';
    const sortOrder = filters.sortAccountsOrder || 'asc';
    const direction = sortOrder === 'desc' ? -1 : 1;

    ledgers.sort((a, b) => {
      if (sortBy === 'code') {
        return (
          a.accountCode.localeCompare(b.accountCode, 'en', { numeric: true }) *
          direction
        );
      }
      if (sortBy === 'name') {
        return a.accountName.localeCompare(b.accountName, 'ar') * direction;
      }
      // activity: عدد القيود
      return (a.totalEntries - b.totalEntries) * direction;
    });

    // ─── 9. الملخص (على كل الحسابات المفلترة)
    const totalDebit = ledgers.reduce((s, l) => s + l.totalDebit, 0);
    const totalCredit = ledgers.reduce((s, l) => s + l.totalCredit, 0);
    const difference = Math.abs(totalDebit - totalCredit);
    const totalEntriesDisplayed = ledgers.reduce(
      (s, l) => s + l.displayedEntries,
      0,
    );

    const summary: GeneralLedgerSummary = {
      accountsCount: ledgers.length,
      accountsWithActivity: ledgers.filter((l) => l.totalEntries > 0).length,
      totalEntriesDisplayed,
      totalDebit: this.round2(totalDebit),
      totalCredit: this.round2(totalCredit),
      difference: this.round2(difference),
      isBalanced: difference < 0.01,
    };

    // ─── 10. Pagination على الحسابات
    const limit = filters.limit ?? 100;
    const page = filters.page ?? 1;
    const startIndex = (page - 1) * limit;
    const paginatedLedgers = ledgers.slice(startIndex, startIndex + limit);

    // ─── 11. الاستجابة
    return {
      meta: ctx.meta,
      summary,
      accounts: paginatedLedgers,
    };
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * يُحدد الطرف المقابل لسطر القيد (عميل / مورد / لا شيء).
   */
  private mapCounterparty(row: {
    customer: { id: string; name: string } | null;
    supplier: { id: string; name: string } | null;
  }): GeneralLedgerCounterparty {
    if (row.customer) {
      return {
        type: 'CUSTOMER',
        id: row.customer.id,
        name: row.customer.name,
      };
    }
    if (row.supplier) {
      return {
        type: 'SUPPLIER',
        id: row.supplier.id,
        name: row.supplier.name,
      };
    }
    return { type: 'NONE' };
  }

  /**
   * استجابة فارغة موحّدة.
   */
  private emptyResponse(meta: ReportMeta): GeneralLedgerResponse {
    return {
      meta,
      summary: {
        accountsCount: 0,
        accountsWithActivity: 0,
        totalEntriesDisplayed: 0,
        totalDebit: 0,
        totalCredit: 0,
        difference: 0,
        isBalanced: true,
      },
      accounts: [],
    };
  }
}
