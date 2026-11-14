import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, FiscalYearStatus } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  OpenFiscalYearDto,
  CloseFiscalYearDto,
  ReopenFiscalYearDto,
} from '../dto/fiscal-year.dto';
import {
  FiscalYearSummary,
  OpenFiscalYearResult,
  CloseFiscalYearResult,
  ClosingEntryPreview,
} from '../interfaces/fiscal-year.interface';
import { SettingsService } from 'src/modules/settings';

@Injectable()
export class FiscalYearService {
  private readonly logger = new Logger(FiscalYearService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  // 1. قراءة

  async listFiscalYears(companyId: string): Promise<FiscalYearSummary[]> {
    const rows = await this.prisma.fiscalYear.findMany({
      where: { companyId },
      orderBy: { year: 'desc' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getFiscalYear(companyId: string, year: number): Promise<FiscalYearSummary> {
    const fy = await this.prisma.fiscalYear.findUnique({
      where: { companyId_year: { companyId, year } },
    });
    if (!fy) {
      throw new NotFoundException(`السنة المالية ${year} غير موجودة`);
    }
    return this.toSummary(fy);
  }

  // 2. فتح سنة مالية

  async openFiscalYear(
    dto: OpenFiscalYearDto,
    companyId: string,
    userId: string,
  ): Promise<OpenFiscalYearResult> {
    const { year, notes } = dto;

    return this.prisma.$transaction(async (tx) => {
      // ─── 1. تحقق: السنة غير موجودة
      const exists = await tx.fiscalYear.findUnique({
        where: { companyId_year: { companyId, year } },
      });
      if (exists) {
        throw new ConflictException(`السنة المالية ${year} موجودة مسبقاً`);
      }

      // ─── 2. تحقق: السنة السابقة (إن وُجدت) يجب أن تكون CLOSED
      const prevYear = await tx.fiscalYear.findUnique({
        where: { companyId_year: { companyId, year: year - 1 } },
      });

      if (prevYear && prevYear.status !== FiscalYearStatus.CLOSED) {
        throw new BadRequestException(
          `لا يمكن فتح السنة ${year} قبل إقفال السنة ${year - 1} نهائياً ` +
            `(الحالة الحالية: ${prevYear.status})`,
        );
      }

      // ─── 3. إنشاء السنة الجديدة
      const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

      const newFiscalYear = await tx.fiscalYear.create({
        data: {
          companyId,
          year,
          startDate,
          endDate,
          status: FiscalYearStatus.OPEN,
          openedAt: new Date(),
          openedBy: userId,
          notes,
        },
      });

      this.logger.log(`✅ فُتحت السنة المالية ${year} للشركة ${companyId}`);

      // ─── 4. ترحيل الأرصدة (إن وُجدت سنة سابقة)
      let carryForward = null;

      if (prevYear && prevYear.status === FiscalYearStatus.CLOSED) {
        const result = await this.carryForwardBalances(
          tx,
          companyId,
          year - 1,
          newFiscalYear,
          userId,
        );
        carryForward = result;
      }

      return {
        fiscalYear: this.toSummary(newFiscalYear),
        carryForward,
      };
    });
  }

  // 3. إقفال سنة مالية

  async closeFiscalYear(
    dto: CloseFiscalYearDto,
    companyId: string,
    userId: string,
  ): Promise<CloseFiscalYearResult | ClosingEntryPreview> {
    const { year, retainedEarningsAccountId, notes, dryRun } = dto;

    // ─── 1. جلب السنة
    const fiscalYear = await this.prisma.fiscalYear.findUnique({
      where: { companyId_year: { companyId, year } },
    });

    if (!fiscalYear) {
      throw new NotFoundException(`السنة المالية ${year} غير موجودة`);
    }

    if (fiscalYear.status !== FiscalYearStatus.OPEN) {
      throw new BadRequestException(
        `السنة ${year} ليست مفتوحة (الحالة: ${fiscalYear.status})`,
      );
    }

    // ─── 2. تحديد حساب الأرباح المحتجزة
    const retainedAcc = await this.resolveRetainedEarningsAccount(
      companyId,
      retainedEarningsAccountId,
    );

    // ─── 3. بناء قيد الإقفال (preview)
    const preview = await this.buildClosingEntryPreview(
      companyId,
      fiscalYear,
      retainedAcc,
    );

    // ─── 4. Dry-run: أعرض فقط
    if (dryRun) {
      return preview;
    }

    // ─── 5. Optimistic lock: حول السنة إلى CLOSING
    const locked = await this.prisma.fiscalYear.updateMany({
      where: { id: fiscalYear.id, status: FiscalYearStatus.OPEN },
      data: { status: FiscalYearStatus.CLOSING, closedBy: userId },
    });

    if (locked.count === 0) {
      throw new ConflictException(
        'السنة قيد الإقفال من قبل مستخدم آخر. حاول بعد قليل.',
      );
    }

    // ─── 6. تنفيذ الإقفال داخل transaction
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 6.1. إنشاء قيد الإقفال
        const closingEntry = await tx.journalEntry.create({
          data: {
            companyId,
            entryNumber: `CLS-${year}`,
            date: fiscalYear.endDate,
            description: `قيد الإقفال السنوي وتصفير الأرباح والخسائر لسنة ${year}`,
            source: 'CLOSING_ENTRY',
            fiscalYearId: fiscalYear.id,
            isClosingEntry: true,
            createdBy: userId,
            lines: {
              create: preview.lines.map((l) => ({
                accountId: l.accountId,
                debit: new Prisma.Decimal(l.debit),
                credit: new Prisma.Decimal(l.credit),
                notes: l.notes,
              })),
            },
          },
        });

        // 6.2. اقفل السنة
        const closed = await tx.fiscalYear.update({
          where: { id: fiscalYear.id },
          data: {
            status: FiscalYearStatus.CLOSED,
            closedAt: new Date(),
            closedBy: userId,
            closingEntryId: closingEntry.id,
            notes: notes || fiscalYear.notes,
          },
        });

        this.logger.log(
          `🔒 أُقفلت السنة ${year}. القيد: ${closingEntry.entryNumber}، صافي: ${preview.netIncome}`,
        );

        return {
          fiscalYear: this.toSummary(closed),
          closingEntry: {
            id: closingEntry.id,
            entryNumber: closingEntry.entryNumber,
            date: closingEntry.date.toISOString(),
          },
          netIncome: preview.netIncome,
          isProfit: preview.netIncome > 0,
        };
      });
    } catch (error) {
      // ─── Rollback: أعد السنة إلى OPEN
      await this.prisma.fiscalYear.update({
        where: { id: fiscalYear.id },
        data: { status: FiscalYearStatus.OPEN, closedBy: null },
      });
      this.logger.error(`❌ فشل إقفال السنة ${year}: ${(error as Error).message}`);
      throw error;
    }
  }

  // 4. إعادة فتح سنة

  async reopenFiscalYear(
    dto: ReopenFiscalYearDto,
    companyId: string,
    userId: string,
  ): Promise<FiscalYearSummary> {
    const { year, reason } = dto;

    return this.prisma.$transaction(async (tx) => {
      const fy = await tx.fiscalYear.findUnique({
        where: { companyId_year: { companyId, year } },
      });

      if (!fy) {
        throw new NotFoundException(`السنة المالية ${year} غير موجودة`);
      }

      if (fy.status !== FiscalYearStatus.CLOSED) {
        throw new BadRequestException(
          `السنة ${year} ليست مقفلة (الحالة: ${fy.status})`,
        );
      }

      // ─── 1. احذف قيد الإقفال
      if (fy.closingEntryId) {
        await tx.journalLine.deleteMany({
          where: { journalEntryId: fy.closingEntryId },
        });
        await tx.journalEntry.delete({
          where: { id: fy.closingEntryId },
        });
      }

      // ─── 2. أعد السنة إلى OPEN
      const reopened = await tx.fiscalYear.update({
        where: { id: fy.id },
        data: {
          status: FiscalYearStatus.OPEN,
          closedAt: null,
          closedBy: null,
          closingEntryId: null,
          notes: `[REOPENED by ${userId}]: ${reason}\n${fy.notes ?? ''}`,
        },
      });

      // ─── 3. سجّل في AuditLog (إن وُجد)
      try {
        await tx.auditLog.create({
          data: {
            companyId,
            userId,
            action: 'FISCAL_YEAR_REOPENED',
            entityType: 'FiscalYear',
            entityId: fy.id,
            changes: {
              year,
              reason,
              previousStatus: 'CLOSED',
            },
          },
        });
      } catch {
        // تجاهل لو auditLog غير موجود
      }

      this.logger.warn(`🔓 أُعيد فتح السنة ${year} بواسطة ${userId}`);

      return this.toSummary(reopened);
    });
  }

  // 5. Helpers — بناء قيد الإقفال

  private async buildClosingEntryPreview(
    companyId: string,
    fiscalYear: { id: string; year: number; endDate: Date; status: FiscalYearStatus },
    retainedAcc: { id: string; code: string; name: string },
  ): Promise<ClosingEntryPreview> {
    // 1. جلب كل حسابات الإيرادات والمصروفات الطرفية
    const pnlAccounts = await this.prisma.account.findMany({
      where: {
        companyId,
        isLeaf: true,
        type: { in: ['REVENUE', 'EXPENSE'] },
      },
      select: { id: true, code: true, name: true, type: true },
    });

    const accountIds = pnlAccounts.map((a) => a.id);

    if (accountIds.length === 0) {
      throw new BadRequestException(
        'لا توجد حسابات إيرادات أو مصروفات طرفية',
      );
    }

    // 2. حساب الحركة خلال السنة حصراً (باستثناء قيود الإقفال السابقة)
    const movements = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          companyId,
          fiscalYearId: fiscalYear.id,
          isClosingEntry: false,
        },
      },
      _sum: { debit: true, credit: true },
    });

    const movementMap = new Map(
      movements.map((m) => [
        m.accountId,
        {
          debit: new Prisma.Decimal(m._sum.debit ?? 0),
          credit: new Prisma.Decimal(m._sum.credit ?? 0),
        },
      ]),
    );

    // 3. بناء الأسطر
    const lines: ClosingEntryPreview['lines'] = [];
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    for (const acc of pnlAccounts) {
      const mov = movementMap.get(acc.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };

      // الرصيد الصافي: موجب = مدين، سالب = دائن
      const net = mov.debit.minus(mov.credit);

      if (net.isZero()) continue;

      if (net.greaterThan(0)) {
        // حساب مدين (عادة مصروف) → اقفله بوضعه دائناً
        lines.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          type: acc.type,
          debit: 0,
          credit: Number(net),
          notes: `إقفال حساب ${acc.name} لسنة ${fiscalYear.year}`,
        });
        totalCredit = totalCredit.plus(net);
      } else {
        // حساب دائن (عادة إيراد) → اقفله بوضعه مديناً
        const abs = net.abs();
        lines.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          type: acc.type,
          debit: Number(abs),
          credit: 0,
          notes: `إقفال حساب ${acc.name} لسنة ${fiscalYear.year}`,
        });
        totalDebit = totalDebit.plus(abs);
      }
    }

    // 4. صافي الدخل
    // totalDebit = إجمالي أرصدة الإيرادات المُقفَلة
    // totalCredit = إجمالي أرصدة المصروفات المُقفَلة
    const totalRevenue = Number(totalDebit);
    const totalExpense = Number(totalCredit);
    const netIncome = totalDebit.minus(totalCredit).toNumber();

    // 5. سطر الأرباح المحتجزة
    if (netIncome > 0) {
      // ربح صافٍ → دائن
      lines.push({
        accountId: retainedAcc.id,
        accountCode: retainedAcc.code,
        accountName: retainedAcc.name,
        type: 'EQUITY',
        debit: 0,
        credit: netIncome,
        notes: `ترحيل صافي أرباح سنة ${fiscalYear.year}`,
      });
      totalCredit = totalCredit.plus(netIncome);
    } else if (netIncome < 0) {
      // خسارة صافية → مدين
      const absLoss = Math.abs(netIncome);
      lines.push({
        accountId: retainedAcc.id,
        accountCode: retainedAcc.code,
        accountName: retainedAcc.name,
        type: 'EQUITY',
        debit: absLoss,
        credit: 0,
        notes: `ترحيل صافي خسائر سنة ${fiscalYear.year}`,
      });
      totalDebit = totalDebit.plus(absLoss);
    }

    return {
      year: fiscalYear.year,
      fiscalYearStatus: fiscalYear.status,
      totalRevenue,
      totalExpense,
      netIncome,
      retainedEarningsAccount: {
        id: retainedAcc.id,
        code: retainedAcc.code,
        name: retainedAcc.name,
      },
      lines,
      totals: {
        totalDebit: Number(totalDebit),
        totalCredit: Number(totalCredit),
        isBalanced: totalDebit.equals(totalCredit),
      },
    };
  }

  // 6. Helpers — ترحيل الأرصدة الافتتاحية

  private async carryForwardBalances(
    tx: Prisma.TransactionClient,
    companyId: string,
    fromYear: number,
    newFiscalYear: { id: string; year: number; startDate: Date },
    userId: string,
  ): Promise<{ entriesCount: number; openingEntryId: string | null; accountsAffected: number }> {
    // 1. جلب الحسابات الدائمة الطرفية
    const balanceSheetAccounts = await tx.account.findMany({
      where: {
        companyId,
        isLeaf: true,
        type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] },
      },
      select: { id: true, code: true, name: true, type: true },
    });

    if (balanceSheetAccounts.length === 0) {
      return { entriesCount: 0, openingEntryId: null, accountsAffected: 0 };
    }

    const accountIds = balanceSheetAccounts.map((a) => a.id);

    // 2. تجميع الحركات حتى نهاية السنة المقفلة
    const endOfFromYear = new Date(Date.UTC(fromYear, 11, 31, 23, 59, 59, 999));

    const aggregates = await tx.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          companyId,
          date: { lte: endOfFromYear },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const aggregateMap = new Map(
      aggregates.map((a) => [
        a.accountId,
        {
          debit: new Prisma.Decimal(a._sum.debit ?? 0),
          credit: new Prisma.Decimal(a._sum.credit ?? 0),
        },
      ]),
    );

    // 3. بناء الأسطر
    const openingLines: Array<{
      accountId: string;
      debit: number;
      credit: number;
      notes: string;
    }> = [];

    for (const acc of balanceSheetAccounts) {
      const bal = aggregateMap.get(acc.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };

      const net = bal.debit.minus(bal.credit);

      if (net.isZero()) continue;

      if (net.greaterThan(0)) {
        openingLines.push({
          accountId: acc.id,
          debit: Number(net),
          credit: 0,
          notes: `رصيد افتتاحي مرحّل من ${fromYear}`,
        });
      } else {
        openingLines.push({
          accountId: acc.id,
          debit: 0,
          credit: Number(net.abs()),
          notes: `رصيد افتتاحي مرحّل من ${fromYear}`,
        });
      }
    }

    if (openingLines.length === 0) {
      return { entriesCount: 0, openingEntryId: null, accountsAffected: 0 };
    }

    // 4. إنشاء القيد الافتتاحي
    const openingEntry = await tx.journalEntry.create({
      data: {
        companyId,
        entryNumber: `OPN-${newFiscalYear.year}`,
        date: newFiscalYear.startDate,
        description: `قيد الأرصدة الافتتاحية المرحّلة من سنة ${fromYear}`,
        source: 'OPENING_BALANCE',
        fiscalYearId: newFiscalYear.id,
        isOpeningEntry: true,
        createdBy: userId,
        lines: {
          create: openingLines.map((l) => ({
            accountId: l.accountId,
            debit: new Prisma.Decimal(l.debit),
            credit: new Prisma.Decimal(l.credit),
            notes: l.notes,
          })),
        },
      },
    });

    // 5. ربط القيد بالسنة
    await tx.fiscalYear.update({
      where: { id: newFiscalYear.id },
      data: { openingEntryId: openingEntry.id },
    });

    this.logger.log(
      `📌 رُحّلت الأرصدة من ${fromYear}: ${openingLines.length} حساب`,
    );

    return {
      entriesCount: openingLines.length,
      openingEntryId: openingEntry.id,
      accountsAffected: openingLines.length,
    };
  }

  // 7. Helpers — إيجاد حساب الأرباح المحتجزة

  private async resolveRetainedEarningsAccount(
    companyId: string,
    accountId?: string,
  ): Promise<{ id: string; code: string; name: string }> {
    // 1. أولوية للـ ID المُمرَّر
    if (accountId) {
      const acc = await this.prisma.account.findFirst({
        where: {
          id: accountId,
          companyId,
          isActive: true,
          isLeaf: true,
          type: 'EQUITY',
        },
        select: { id: true, code: true, name: true },
      });

      if (!acc) {
        throw new BadRequestException(
          'حساب الأرباح المحتجزة غير صالح (يجب أن يكون طرفياً، نشطاً، من نوع EQUITY)',
        );
      }
      return acc;
    }

    // 2. قراءة كود الحساب من SettingsService
    const configuredCode = await this.settingsService.getValue(
      companyId,
      'defaultRetainedEarningsAccountCode',
    );
    if (configuredCode) {
      const acc = await this.prisma.account.findFirst({
        where: {
          companyId,
          code: configuredCode,
          isActive: true,
          isLeaf: true,
          type: 'EQUITY',
        },
        select: { id: true, code: true, name: true },
      });
      if (acc) return acc;
    }

    // 3. وإلا: ابحث عن حساب marked isRetainedEarnings
    const marked = await this.prisma.account.findFirst({
      where: {
        companyId,
        isRetainedEarnings: true,
        isActive: true,
        isLeaf: true,
        type: 'EQUITY',
      },
      select: { id: true, code: true, name: true },
    });

    if (marked) return marked;

    // 4. وإلا: ابحث عن أي حساب بكود 3-2-xx أو 32 أو 3-1-02 أو 3102
    const fallback = await this.prisma.account.findFirst({
      where: {
        companyId,
        isActive: true,
        isLeaf: true,
        type: 'EQUITY',
        OR: [
          { code: { startsWith: '3-2' } },
          { code: { startsWith: '32' } },
          { code: { startsWith: '3-1-02' } },
          { code: { startsWith: '3102' } },
        ],
      },
      select: { id: true, code: true, name: true },
    });

    if (fallback) return fallback;

    throw new BadRequestException(
      'حساب الأرباح المحتجزة غير محدد. حدّده في الإعدادات أو مرّره في الطلب.',
    );
  }

  // 8. Helpers — التحويل

  private toSummary(fy: any): FiscalYearSummary {
    return {
      id: fy.id,
      year: fy.year,
      startDate: fy.startDate.toISOString().split('T')[0],
      endDate: fy.endDate.toISOString().split('T')[0],
      status: fy.status,
      openedAt: fy.openedAt?.toISOString() ?? null,
      openedBy: fy.openedBy,
      closedAt: fy.closedAt?.toISOString() ?? null,
      closedBy: fy.closedBy,
      closingEntryId: fy.closingEntryId,
      openingEntryId: fy.openingEntryId,
      notes: fy.notes,
      createdAt: fy.createdAt.toISOString(),
      updatedAt: fy.updatedAt.toISOString(),
    };
  }
}
