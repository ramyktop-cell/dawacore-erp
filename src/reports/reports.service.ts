import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface StatementItem {
  date: Date;
  entryNumber: string;
  docType: string;
  referenceId: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * تقرير كشف حساب العميل التفصيلي (CSTDTLST)
   */
  async getCustomerStatement(customerId: string, fromDate: string, toDate: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        company: { select: { id: true, name: true } },
      },
    });

    if (!customer) throw new NotFoundException('العميل غير موجود');

    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    // 1. حساب الرصيد الافتتاحي الدقيق
    const priorMovement = await this.prisma.journalLine.aggregate({
      where: {
        customerId,
        journalEntry: {
          date: { lt: from },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const priorDebit = priorMovement._sum.debit || new Prisma.Decimal(0);
    const priorCredit = priorMovement._sum.credit || new Prisma.Decimal(0);
    const initialBalance = (customer.currentDebt || new Prisma.Decimal(0)).plus(priorDebit).minus(priorCredit);

    // 2. جلب حركات الفترة مع حساب الرصيد التراكمي المباشر عبر PostgreSQL Window Function
    const rawLines: any[] = await this.prisma.$queryRaw`
      SELECT 
        je."date" as "docDate",
        je."entryNumber",
        je."source" as "docType",
        je."referenceId",
        COALESCE(jel."description", je."description") as "description",
        jel."debit",
        jel."credit",
        ${initialBalance} + SUM(jel."debit" - jel."credit") OVER (
          ORDER BY je."date" ASC, je."createdAt" ASC, jel."id" ASC
        ) as "runningBalance"
      FROM "JournalLine" jel
      JOIN "JournalEntry" je ON jel."journalEntryId" = je."id"
      WHERE jel."customerId" = ${customerId}
        AND je."date" >= ${from}
        AND je."date" <= ${to}
      ORDER BY je."date" ASC, je."createdAt" ASC;
    `;

    // 3. تجميع إجماليات الفترة
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    const items: StatementItem[] = rawLines.map((row) => {
      totalDebit = totalDebit.plus(row.debit);
      totalCredit = totalCredit.plus(row.credit);
      return {
        date: row.docDate,
        entryNumber: row.entryNumber,
        docType: row.docType,
        referenceId: row.referenceId || '',
        description: row.description || '',
        debit: Number(row.debit).toFixed(2),
        credit: Number(row.credit).toFixed(2),
        runningBalance: Number(row.runningBalance).toFixed(2),
      };
    });

    const closingBalance = items.length > 0 
      ? items[items.length - 1].runningBalance 
      : initialBalance.toFixed(2);

    return {
      customer: {
        id: customer.id,
        code: customer.phone,
        name: customer.name,
        phone: customer.phone,
        nationalId: customer.nationalId,
        creditLimit: Number(customer.creditLimit).toFixed(2),
        branch: (customer as any).branch,
        company: (customer as any).company,
      },
      period: { from: fromDate, to: toDate },
      openingBalance: initialBalance.toFixed(2),
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      closingBalance,
      items,
    };
  }

  /**
   * تقرير الأرصدة التجميعية للمدينين (CUSTBAL)
   */
  async getCustomerBalancesSummary(branchId?: string, asOfDate?: string) {
    const targetDate = asOfDate ? new Date(asOfDate) : new Date();
    targetDate.setHours(23, 59, 59, 999);

    const result: any[] = await this.prisma.$queryRaw`
      SELECT 
        c."id",
        c."name",
        c."phone",
        c."currentDebt" as "openingBalance",
        COALESCE(SUM(jel."debit"), 0) as "totalDebit",
        COALESCE(SUM(jel."credit"), 0) as "totalCredit",
        c."currentDebt" + COALESCE(SUM(jel."debit" - jel."credit"), 0) as "currentBalance"
      FROM "Customer" c
      LEFT JOIN "JournalLine" jel ON c."id" = jel."customerId"
      LEFT JOIN "JournalEntry" je ON jel."journalEntryId" = je."id" 
        AND je."date" <= ${targetDate}
      WHERE (${branchId}::text IS NULL OR c."branchId" = ${branchId})
      GROUP BY c."id", c."name", c."phone", c."currentDebt"
      ORDER BY "currentBalance" DESC;
    `;

    return result.map((r) => ({
      id: r.id,
      code: r.phone,
      name: r.name,
      phone: r.phone,
      openingBalance: Number(r.openingBalance).toFixed(2),
      totalDebit: Number(r.totalDebit).toFixed(2),
      totalCredit: Number(r.totalCredit).toFixed(2),
      currentBalance: Number(r.currentBalance).toFixed(2),
    }));
  }

  /**
   * قائمة العملاء للبحث والاختيار السريع
   */
  async getCustomers(query?: string) {
    return this.prisma.customer.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query } },
              { nationalId: { contains: query } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }
}
