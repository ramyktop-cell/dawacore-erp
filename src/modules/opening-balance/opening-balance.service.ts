import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from '../../accounting/accounting.service';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { AuthenticatedUser } from '../../auth/security.policy';

@Injectable()
export class OpeningBalanceService {
  private readonly logger = new Logger(OpeningBalanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingService: AccountingService,
  ) {}

  private assertScope(doc: { companyId: string; branchId: string }, actor: AuthenticatedUser) {
    if (!actor?.id || doc.companyId !== actor.companyId) throw new ForbiddenException('المستند خارج نطاق شركة المستخدم');
    if (actor.branchId && doc.branchId !== actor.branchId) throw new ForbiddenException('المستند خارج نطاق فرع المستخدم');
  }

  async getAll(params: { branchId?: string }, actor: AuthenticatedUser) {
    const where: any = { companyId: actor.companyId };
    const effectiveBranchId = actor.branchId || params?.branchId;
    if (effectiveBranchId) where.branchId = effectiveBranchId;

    return this.prisma.openingBalance.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true, username: true } },
        postedBy: { select: { id: true, name: true, username: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string, actor: AuthenticatedUser) {
    const doc = await this.prisma.openingBalance.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true, username: true } },
        postedBy: { select: { id: true, name: true, username: true } },
        items: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
                isLeaf: true,
              },
            },
          },
        },
        journalEntry: {
          include: {
            lines: {
              include: {
                account: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException('مستند الأرصدة الافتتاحية غير موجود');
    }
    this.assertScope(doc, actor);
    return doc;
  }

  async suggest(companyId: string, branchId: string, actor: AuthenticatedUser) {
    const effectiveCompanyId = actor.companyId;
    const effectiveBranchId = branchId;
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId: actor.companyId } });
    if (!branch || (actor.branchId && actor.branchId !== branchId)) throw new ForbiddenException('الفرع خارج نطاق المستخدم');

    // 1. حساب قيمة المخزون الحالي (كمية * سعر التكلفة)
    const batches = await this.prisma.batch.findMany({
      where: { branchId: effectiveBranchId, isFrozen: false },
      select: { quantityInBase: true, costPrice: true },
    });
    const inventory = batches.reduce(
      (sum, b) => sum + Number(b.quantityInBase || 0) * Number(b.costPrice || 0),
      0,
    );

    // 2. حساب مديونيات العملاء
    const customers = await this.prisma.customer.findMany({
      where: { companyId: effectiveCompanyId, branchId: effectiveBranchId },
      select: { currentDebt: true },
    });
    const customersTotal = customers.reduce(
      (sum, c) => sum + Number(c.currentDebt || 0),
      0,
    );

    // 3. حساب مستحقات الموردين
    const suppliers = await this.prisma.supplier.findMany({
      where: { companyId: effectiveCompanyId, OR: [{ branchId: effectiveBranchId }, { branchId: null }] },
      select: { currentDebt: true },
    });
    const suppliersTotal = suppliers.reduce(
      (sum, s) => sum + Number(s.currentDebt || 0),
      0,
    );

    // 4. النقدية والبنوك
    let cash = 0;
    const cashAccount = await this.prisma.account.findFirst({
      where: {
        companyId: effectiveCompanyId,
        code: { in: ['1-1-01-01', '1-1-01', '1101'] },
      },
    });
    if (cashAccount) cash = Number(cashAccount.balance || 0);

    let bank = 0;
    const bankAccount = await this.prisma.account.findFirst({
      where: {
        companyId: effectiveCompanyId,
        code: { in: ['1-1-02-02', '1-1-02-01-01', '1-1-02', '1102'] },
      },
    });
    if (bankAccount) bank = Number(bankAccount.balance || 0);

    const suggestedCapital = inventory + cash + bank + customersTotal - suppliersTotal;

    return {
      inventory: Math.round(inventory * 100) / 100,
      customers: Math.round(customersTotal * 100) / 100,
      suppliers: Math.round(suppliersTotal * 100) / 100,
      cash: Math.round(cash * 100) / 100,
      bank: Math.round(bank * 100) / 100,
      suggestedCapital: Math.round(suggestedCapital * 100) / 100,
    };
  }

  async create(dto: CreateOpeningBalanceDto, actor: AuthenticatedUser) {
    // ✅ منع التواريخ المستقبلية
    const effectiveDate = new Date(dto.effectiveDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (effectiveDate > today) {
      throw new BadRequestException(
        'لا يمكن إدخال أرصدة افتتاحية بتاريخ مستقبلي. الرجاء اختيار تاريخ اليوم أو تاريخ سابق.',
      );
    }

    if (!actor?.id || dto.companyId !== actor.companyId) throw new ForbiddenException('الشركة خارج نطاق المستخدم');
    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, companyId: actor.companyId, isActive: true } });
    if (!branch || (actor.branchId && actor.branchId !== branch.id)) throw new ForbiddenException('الفرع خارج نطاق المستخدم أو غير نشط');
    const effectiveCompanyId = actor.companyId;
    if (!dto.items?.length) throw new BadRequestException('يجب إدخال بند واحد على الأقل');

    const accountIds = [...new Set(dto.items.map((item) => item.accountId))];
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds }, companyId: effectiveCompanyId, isActive: true, isLeaf: true },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) throw new BadRequestException('يوجد حساب غير صالح أو رئيسي أو خارج شركة المستخدم');
    for (const item of dto.items) {
      const debit = Number(item.debit || 0);
      const credit = Number(item.credit || 0);
      if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) {
        throw new BadRequestException('كل بند يجب أن يحتوي على مبلغ مدين أو دائن موجب فقط');
      }
    }

    // التحقق من عدم وجود مستند معتمد مسبقاً لنفس الفرع
    const existingPosted = await this.prisma.openingBalance.findFirst({
      where: { branchId: dto.branchId, status: 'POSTED' },
    });
    if (existingPosted) {
      throw new BadRequestException(
        `تم اعتماد وترحيل الأرصدة الافتتاحية لهذا الفرع مسبقاً برقم (${existingPosted.documentNumber}). لا يمكن إنشاء مستند جديد.`,
      );
    }

    // حساب المجاميع
    const totalDebit = dto.items.reduce((sum, item) => sum + Number(item.debit || 0), 0);
    const totalCredit = dto.items.reduce((sum, item) => sum + Number(item.credit || 0), 0);
    const difference = totalDebit - totalCredit;

    const effectiveUserId = actor.id;

    return this.prisma.$transaction(async (tx) => {
      // توليد الرقم التسلسلي OB-YYYY-XXXXX بدون تعارض
      const currentYear = new Date().getFullYear();
      let lastVal = 1;
      try {
        const seq = await tx.documentSequence.upsert({
          where: {
            type_year_branchId: {
              type: 'OPENING_BALANCE',
              year: currentYear,
              branchId: dto.branchId,
            },
          },
          update: { lastValue: { increment: 1 } },
          create: {
            type: 'OPENING_BALANCE',
            year: currentYear,
            branchId: dto.branchId,
            lastValue: 1,
          },
        });
        lastVal = seq.lastValue;
      } catch {
        throw new BadRequestException('تسلسل الأرصدة الافتتاحية غير متاح');
      }

      let documentNumber = `OB-${currentYear}-${String(lastVal).padStart(5, '0')}`;
      while (await tx.openingBalance.findUnique({ where: { documentNumber } })) {
        lastVal++;
        documentNumber = `OB-${currentYear}-${String(lastVal).padStart(5, '0')}`;
      }

      const doc = await tx.openingBalance.create({
        data: {
          companyId: effectiveCompanyId!,
          branchId: dto.branchId,
          documentNumber,
          effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : new Date(),
          status: 'DRAFT',
          totalDebit,
          totalCredit,
          difference,
          notes: dto.notes,
          createdById: effectiveUserId,
          items: {
            create: dto.items.map((item) => ({
              accountId: item.accountId,
              debit: Number(item.debit || 0),
              credit: Number(item.credit || 0),
              description: item.description,
              referenceType: item.referenceType,
              referenceId: item.referenceId,
            })),
          },
        },
        include: {
          branch: true,
          createdBy: true,
          items: { include: { account: true } },
        },
      });

      this.logger.log(`✅ تم إنشاء مسودة الأرصدة الافتتاحية ${documentNumber}`);
      return doc;
    });
  }

  async post(id: string, actor: AuthenticatedUser) {
    const doc = await this.prisma.openingBalance.findUnique({
      where: { id },
      include: {
        items: { include: { account: true } },
        branch: true,
      },
    });

    if (!doc) throw new NotFoundException('مستند الأرصدة الافتتاحية غير موجود');
    this.assertScope(doc, actor);
    if (doc.status !== 'DRAFT') {
      throw new BadRequestException('لا يمكن ترحيل مستند ليس بحالة مسودة');
    }

    const diff = Math.abs(Number(doc.difference));
    if (diff > 0.01) {
      throw new BadRequestException(`المستند غير متوازن حسابياً. الفارق: ${diff} ج.س`);
    }

    if (doc.items.length === 0) {
      throw new BadRequestException('لا توجد بنود في المستند للترحيل');
    }

    // ترحيل القيد عبر AccountingService.createAutoEntry
    const journalLines = doc.items.map((item) => ({
      accountCode: item.account.code,
      debit: Number(item.debit || 0),
      credit: Number(item.credit || 0),
      notes: item.description || `رصيد افتتاحي: ${item.account.name}`,
    }));

    const effectiveCreatedBy = actor.id;

    const entry = await this.accountingService.createAutoEntry({
      companyId: doc.companyId,
      branchId: doc.branchId,
      description: doc.notes || `قيد الأرصدة الافتتاحية للمنشأة - ${doc.documentNumber}`,
      source: 'OPENING_BALANCE',
      referenceId: doc.documentNumber,
      createdBy: effectiveCreatedBy,
      lines: journalLines,
    });

    const claimed = await this.prisma.openingBalance.updateMany({
      where: { id, status: 'DRAFT' },
      data: {
        status: 'POSTED',
        postedAt: new Date(),
        postedById: effectiveCreatedBy,
        journalEntryId: entry.id,
      },
    });
    if (claimed.count !== 1) throw new BadRequestException('تم ترحيل المستند أو تغيير حالته بواسطة مستخدم آخر');
    const updated = await this.prisma.openingBalance.findUniqueOrThrow({
      where: { id },
      include: { branch: true, createdBy: true, postedBy: true, items: { include: { account: true } }, journalEntry: true },
    });

    this.logger.log(`✅ تم ترحيل الأرصدة الافتتاحية ${doc.documentNumber} بنجاح وقيد رقم ${entry.entryNumber}`);
    return updated;
  }

  async cancel(id: string, reason: string, actor: AuthenticatedUser) {
    const doc = await this.prisma.openingBalance.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('المستند غير موجود');
    this.assertScope(doc, actor);
    if (doc.status === 'POSTED') {
      throw new BadRequestException('لا يمكن إلغاء مستند بعد اعتماده وترحيله لدفتر اليومية');
    }

    const cancelled = await this.prisma.openingBalance.updateMany({
      where: { id, status: 'DRAFT' },
      data: {
        status: 'CANCELLED',
        cancelReason: reason || 'إلغاء بطلب المستخدم',
      },
    });
    if (cancelled.count !== 1) throw new BadRequestException('تم تغيير حالة المستند بواسطة مستخدم آخر');
    return this.prisma.openingBalance.findUniqueOrThrow({ where: { id }, include: { branch: true, createdBy: true, items: { include: { account: true } } } });
  }
}
