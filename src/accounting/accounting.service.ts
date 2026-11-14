import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * إنشاء قيد يومية متوازن مع:
   * - التحقق من توازن المدين والدائن
   * - التأكد من أن الحسابات طرفية (isLeaf)
   * - تحديث أرصدة الحسابات التراكمية
   * - توليد رقم قيد تسلسلي (JV-YYYY-XXXX)
   */
  async createAutoEntry(data: {
    companyId: string;
    branchId?: string;
    description: string;
    source: string;
    referenceId?: string;
    createdBy?: string;
    lines: { accountCode: string; debit: number; credit: number; notes?: string }[];
  }) {
    if (!data.companyId) throw new BadRequestException('الشركة مطلوبة لإنشاء القيد');
    if (!data.lines || data.lines.length < 2) {
      throw new BadRequestException('القيد يجب أن يحتوي على سطرين محاسبيين على الأقل');
    }
    // 1. التحقق من التوازن الرياضي
    for (const line of data.lines) {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0)) {
        throw new BadRequestException('كل سطر يجب أن يحتوي على مدين أو دائن موجب، وليس الاثنين معاً');
      }
    }
    const totalDebit = data.lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
    const totalCredit = data.lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
    if (totalDebit <= 0) throw new BadRequestException('لا يمكن إنشاء قيد صفري');

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `القيد غير متوازن! المدين (${totalDebit}) ≠ الدائن (${totalCredit})`
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      // 2. توليد رقم قيد تسلسلي (JV-2026-0001)
      const currentYear = new Date().getFullYear();
      if (data.referenceId) {
        const existing = await tx.journalEntry.findFirst({
          where: { companyId: data.companyId, source: data.source, referenceId: data.referenceId },
          include: { lines: true },
        });
        if (existing) return existing;
      }
      const sequence = await tx.documentSequence.upsert({
        where: { type_year_branchId: { type: 'JOURNAL', year: currentYear, branchId: data.branchId || 'GLOBAL' } },
        update: { lastValue: { increment: 1 } },
        create: { type: 'JOURNAL', year: currentYear, branchId: data.branchId || 'GLOBAL', lastValue: 1 },
      });
      const entryNumber = `JV-${currentYear}-${String(sequence.lastValue).padStart(4, '0')}`;

      // 3. إنشاء رأس القيد
      const entry = await tx.journalEntry.create({
        data: {
          companyId: data.companyId,
          branchId: data.branchId,
          entryNumber,
          description: data.description,
          source: data.source,
          referenceId: data.referenceId,
          createdBy: data.createdBy || 'system',
        },
      });

      // 4. معالجة الأسطر باستخدام حسابات دليل الحسابات المعرفة مسبقاً
      for (const line of data.lines) {
        const account = await tx.account.findUnique({
          where: {
            companyId_code: {
              companyId: data.companyId,
              code: line.accountCode,
            },
          },
        });
        if (!account) throw new NotFoundException(`الحساب ${line.accountCode} غير معرف في دليل الحسابات`);
        if (!account.isActive) throw new BadRequestException(`الحساب ${line.accountCode} غير نشط`);

        // 4.2 التحقق من أن الحساب طرفي (isLeaf) قبل الترحيل
        if (!account.isLeaf) {
          throw new BadRequestException(
            `لا يمكن الترحيل على حساب رئيسي (Level ${account.level}): ${account.name} (${account.code})`,
          );
        }

        // 4.3 إنشاء سطر القيد
        await tx.journalLine.create({
          data: {
            journalEntryId: entry.id,
            accountId: account.id,
            debit: new Prisma.Decimal(line.debit || 0),
            credit: new Prisma.Decimal(line.credit || 0),
            notes: line.notes,
            description: line.notes,
          },
        });

        // 4.4 تحديث الرصيد التراكمي للحساب (المدين - الدائن)
        const netChange = new Prisma.Decimal(line.debit || 0).minus(new Prisma.Decimal(line.credit || 0));
        await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: netChange } },
        });
      }

      return entry;
    });
  }

  /**
   * جلب القيود مع تصفية حسب المصدر والشركة والصفحة
   */
  async findAll(params: {
    companyId?: string;
    source?: string;
    search?: string;
    page?: number | string;
    limit?: number | string;
  }) {
    const pageNum = params.page ? parseInt(String(params.page), 10) : 1;
    const limitNum = params.limit ? parseInt(String(params.limit), 10) : 20;
    const { companyId, source, search } = params;
    const where: Prisma.JournalEntryWhereInput = {};

    if (companyId) where.companyId = companyId;
    if (source) where.source = source;
    if (search) {
      where.OR = [
        { entryNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { referenceId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: {
              account: { select: { id: true, code: true, name: true, isLeaf: true, type: true } },
            },
          },
          branch: { select: { id: true, name: true } },
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { date: 'desc' },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  /**
   * جلب تفاصيل قيد محدد
   */
  async findOne(id: string, companyId?: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
        branch: true,
        company: true,
      },
    });

    if (!entry) {
      throw new NotFoundException('القيد غير موجود');
    }
    if (companyId && entry.companyId !== companyId) throw new NotFoundException('القيد غير موجود');

    return entry;
  }

  /**
   * استعراض دليل الحسابات وأرصدتها
   */
  async getAccounts(companyId?: string) {
    const where: Prisma.AccountWhereInput = {};
    if (companyId) where.companyId = companyId;

    return await this.prisma.account.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
    });
  }
}
