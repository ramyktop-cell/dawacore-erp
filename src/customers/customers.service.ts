import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerPaymentDto } from './dto/customer-payment.dto';
import { AccountingService } from '../accounting/accounting.service';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/security.policy';
import { DateTzUtil } from '../shared/report-kit/utils/date-tz.util';
import { customerLedgerAmount } from './customer-ledger-amount';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingService: AccountingService,
  ) {}

  private scope(actor: AuthenticatedUser, companyId?: string, branchId?: string) {
    if (!actor?.companyId) throw new ForbiddenException('تسجيل الدخول بشركة صحيحة مطلوب');
    if (companyId && companyId !== actor.companyId) throw new ForbiddenException('لا يمكنك الوصول إلى عميل شركة أخرى');
    if (actor.branchId && branchId && branchId !== actor.branchId) throw new ForbiddenException('لا يمكنك الوصول إلى عميل فرع آخر');
    return { companyId: actor.companyId, branchId: actor.branchId || branchId };
  }

  /**
   * إنشاء عميل جديد مع تسجيل الرصيد الافتتاحي في سجل الحركات
   */
  async create(dto: CreateCustomerDto, actor: AuthenticatedUser) {
    const scope = this.scope(actor, dto.companyId, dto.branchId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, companyId: scope.companyId, isActive: true },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('الفرع غير موجود أو غير نشط أو لا يتبع شركة المستخدم');
    const existing = await this.prisma.customer.findFirst({
      where: {
        companyId: dto.companyId,
        branchId: dto.branchId,
        phone: dto.phone,
      },
    });

    if (existing) {
      throw new ConflictException('رقم الهاتف مسجل مسبقاً لعميل آخر في هذا الفرع');
    }

    const { initialBalance = 0, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      // 1. إنشاء العميل
      const customer = await tx.customer.create({
        data: {
          ...rest,
          creditLimit: new Prisma.Decimal(dto.creditLimit || 0),
          currentDebt: new Prisma.Decimal(initialBalance),
        },
        include: {
          company: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      });

      // 2. تسجيل الرصيد الافتتاحي في سجل الحركات (إذا كان > 0)
      if (initialBalance > 0) {
        await tx.customerTransaction.create({
          data: {
            customerId: customer.id,
            type: 'OPENING_BALANCE',
            amount: new Prisma.Decimal(initialBalance),
            balanceAfter: new Prisma.Decimal(initialBalance),
            description: `الرصيد الافتتاحي للعميل عند إنشاء الحساب`,
            createdBy: actor.id,
          },
        });
      }

      return customer;
    });
  }

  /**
   * جلب قائمة العملاء مع إمكانية التصفية والبحث
   */
  async findAll(params: {
    companyId?: string;
    branchId?: string;
    search?: string;
    hasDebt?: boolean;
    page?: number;
    limit?: number;
  }, actor: AuthenticatedUser) {
    const { companyId, branchId, search, hasDebt, page = 1, limit = 20 } = params;
    const scope = this.scope(actor, companyId, branchId);
    const where: Prisma.CustomerWhereInput = { companyId: scope.companyId };
    if (scope.branchId) where.branchId = scope.branchId;
    if (hasDebt) where.currentDebt = { gt: 0 };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { nationalId: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          company: { select: { id: true, name: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        company: { select: { id: true, name: true } },
      },
    });
    if (!customer) throw new NotFoundException('العميل غير موجود');
    this.scope(actor, customer.companyId, customer.branchId);
    return customer;
  }

  /**
   * الحصول على كشف حساب العميل (Ledger)
   */
  async getLedger(customerId: string, fromDate: string | undefined, toDate: string | undefined, actor: AuthenticatedUser) {
    const customer = await this.findOne(customerId, actor);
    const parseDate = (value?: string) => {
      if (!value) return undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new BadRequestException('التاريخ غير صالح');
      return value;
    };
    const fromDay = parseDate(fromDate);
    const toDay = parseDate(toDate);
    if (fromDay && toDay && fromDay > toDay) throw new BadRequestException('تاريخ البداية بعد النهاية');
    const company = await this.prisma.company.findUnique({ where: { id: customer.companyId }, select: { timezone: true } });
    const timezone = company?.timezone || 'Africa/Cairo';
    const where: any = { customerId };
    if (fromDay) where.createdAt = { gte: DateTzUtil.dayStart(fromDay, timezone) };
    if (toDay) {
      const nextDay = new Date(`${toDay}T00:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      where.createdAt = { ...where.createdAt, lt: DateTzUtil.dayStart(nextDay.toISOString().slice(0, 10), timezone) };
    }

    const transactions = await this.prisma.customerTransaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return {
      customer,
      transactions: transactions.map(transaction => ({ ...transaction, amount: customerLedgerAmount(transaction.type, transaction.amount).toString() })),
      totalDebt: Number(customer.currentDebt),
    };
  }

  /**
   * تحديث بيانات العميل (بدون تغيير الرصيد)
   */
  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser) {
    await this.findOne(id, actor);
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...dto,
        creditLimit: dto.creditLimit !== undefined ? new Prisma.Decimal(dto.creditLimit) : undefined,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        company: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * التحقق من صلاحية العميل للبيع الآجل
   * تُستخدم في وحدة POS قبل إنشاء الفاتورة
   */
  async validateCredit(customerId: string, newInvoiceTotal: number, actor: AuthenticatedUser): Promise<{ valid: boolean; currentDebt: number; creditLimit: number; newTotalDebt: number }> {
    const customer = await this.findOne(customerId, actor);
    if (!customer.isActive) {
      throw new BadRequestException('هذا العميل غير نشط ولا يمكن البيع له');
    }

    const currentDebt = Number(customer.currentDebt);
    const creditLimit = Number(customer.creditLimit);

    // إذا كان الحد الائتماني صفراً، لا يوجد سقف مقيد
    if (creditLimit === 0) {
      return { valid: true, currentDebt, creditLimit: 0, newTotalDebt: currentDebt + newInvoiceTotal };
    }

    const newTotalDebt = currentDebt + newInvoiceTotal;
    if (newTotalDebt > creditLimit) {
      throw new BadRequestException(
        `تجاوز الحد الائتماني! الرصيد الحالي (${currentDebt}) + قيمة الفاتورة (${newInvoiceTotal}) = ${newTotalDebt} > الحد المسموح (${creditLimit})`
      );
    }

    return { valid: true, currentDebt, creditLimit, newTotalDebt };
  }

  /**
   * تسجيل حركة جديدة على حساب العميل (تُستخدم من نقاط البيع والمحاسبة)
   */
  async recordTransaction(data: {
    customerId: string;
    type: string;
    amount: number;
    referenceId?: string;
    description?: string;
    userId: string;
  }) {
    const customer = await this.prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) throw new NotFoundException('العميل غير موجود');

    return this.prisma.$transaction(async (tx) => {
      // حساب الرصيد الجديد
      const newDebt = (customer.currentDebt as Prisma.Decimal).plus(data.amount);

      // تحديث رصيد العميل
      await tx.customer.update({
        where: { id: data.customerId },
        data: { currentDebt: newDebt },
      });

      // تسجيل الحركة
      const transaction = await tx.customerTransaction.create({
        data: {
          customerId: data.customerId,
          type: data.type,
          amount: new Prisma.Decimal(data.amount),
          balanceAfter: newDebt,
          referenceId: data.referenceId,
          description: data.description,
          createdBy: data.userId,
        },
      });

      return transaction;
    });
  }

  /**
   * تسجيل سند قبض / سداد مديونية من العميل
   */
  async recordPayment(customerId: string, dto: CustomerPaymentDto, actor: AuthenticatedUser) {
    if (dto.amount <= 0) {
      throw new BadRequestException('مبلغ السند يجب أن يكون أكبر من الصفر');
    }

    const customer = await this.findOne(customerId, actor);
    const effectiveBranchId = dto.branchId || customer.branchId;
    this.scope(actor, customer.companyId, effectiveBranchId);
    const effectiveCompanyId = customer.companyId;
    const currentYear = new Date().getFullYear();
    const paymentAmountDec = new Prisma.Decimal(dto.amount);
    const previousDebtDec = new Prisma.Decimal(customer.currentDebt);
    if (paymentAmountDec.greaterThan(previousDebtDec)) throw new BadRequestException('مبلغ السند أكبر من مديونية العميل الحالية');

    return this.prisma.$transaction(async (tx) => {
      // 1. توليد رقم تسلسلي فريد لسند القبض
      let seqNumber = 1;
      try {
        if (typeof (tx as any).documentSequence?.upsert === 'function') {
          const seq = await (tx as any).documentSequence.upsert({
            where: {
              type_year_branchId: {
                type: 'RECEIPT',
                year: currentYear,
                branchId: effectiveBranchId,
              },
            },
            update: {
              lastValue: { increment: 1 },
            },
            create: {
              type: 'RECEIPT',
              year: currentYear,
              branchId: effectiveBranchId,
              lastValue: 1,
            },
          });
          seqNumber = seq.lastValue;
        } else {
          throw new BadRequestException('تسلسل سندات القبض غير متاح');
        }
      } catch (error) {
        throw new BadRequestException('تعذر توليد رقم سند قبض ذري');
      }

      const receiptNumber = `REC-${currentYear}-${String(seqNumber).padStart(5, '0')}`;

      // 2. خصم شرطي ذري لمنع تحصيلين متزامنين من تجاوز المديونية.
      const debtUpdate = await tx.customer.updateMany({
        where: { id: customer.id, companyId: actor.companyId, currentDebt: { gte: paymentAmountDec } },
        data: { currentDebt: { decrement: paymentAmountDec } },
      });
      if (debtUpdate.count !== 1) throw new BadRequestException('تغيرت مديونية العميل أو لم تعد كافية؛ أعد تحميل الصفحة');
      const refreshed = await tx.customer.findUnique({ where: { id: customer.id }, select: { currentDebt: true } });
      if (!refreshed) throw new NotFoundException('العميل غير موجود');
      const newDebtDec = new Prisma.Decimal(refreshed.currentDebt);

      // 3. صياغة البيان
      const method = dto.paymentMethod || 'CASH';
      const methodArabic =
        method === 'CARD' ? 'بطاقة بنكية' :
        method === 'TRANSFER' ? 'تحويل بنكي / بنكك' :
        method === 'CHECK' ? 'شيك' : 'نقداً';

      const desc =
        dto.notes?.trim() ||
        `سند قبض رقم ${receiptNumber} (${methodArabic})${dto.referenceNo ? ` - مرجع: ${dto.referenceNo}` : ''}`;

      // 4. تسجيل الحركة في سجل كشف حساب العميل
      const transaction = await tx.customerTransaction.create({
        data: {
          customerId: customer.id,
          type: 'PAYMENT',
          amount: paymentAmountDec,
          balanceAfter: newDebtDec,
          referenceId: receiptNumber,
          description: desc,
          createdBy: actor.id,
        },
      });

      // 5. إذا كان السداد نقداً، تسجيل حركة إيداع في خزينة وردية الكاشير النشطة
      if (method === 'CASH') {
        let shift = null;
        if (!dto.shiftId) throw new BadRequestException('سند القبض النقدي يتطلب وردية المستخدم المفتوحة');
        shift = await tx.shift.findFirst({ where: { id: dto.shiftId, companyId: actor.companyId, branchId: effectiveBranchId, userId: actor.id, status: 'OPEN' } });
        if (!shift) throw new BadRequestException('الوردية غير مفتوحة أو لا تخص المستخدم والفرع الحاليين');

        if (shift) {
          await tx.cashMovement.create({
            data: {
              shiftId: shift.id,
              type: 'CASH_IN',
              amount: paymentAmountDec,
              reason: `سند قبض من العميل: ${customer.name} (#${receiptNumber})`,
              authorizedBy: actor.id,
            },
          });

          await tx.shift.update({
            where: { id: shift.id },
            data: {
              expectedCash: { increment: paymentAmountDec },
            },
          });
        }
      }

      // 6. صندوق صادر محاسبي دائم داخل نفس المعاملة؛ لا تضيع الحركة عند تعطل الترحيل.
      await tx.accountingOutbox.create({
        data: {
          eventType: 'CUSTOMER_PAYMENT_RECEIVED',
          status: 'PENDING',
          payload: { companyId: effectiveCompanyId, branchId: effectiveBranchId, receiptNumber, customerName: customer.name, amount: Number(paymentAmountDec), method, methodArabic, userId: actor.id },
        },
      });

      return {
        id: transaction.id,
        receiptNumber,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        previousDebt: Number(previousDebtDec),
        amount: Number(paymentAmountDec),
        remainingDebt: Number(newDebtDec),
        paymentMethod: method,
        referenceNo: dto.referenceNo || null,
        notes: dto.notes || '',
        createdAt: transaction.createdAt,
        createdBy: actor.id,
        accountingStatus: 'PENDING',
        branchName: customer.branch?.name || 'الفرع الرئيسي',
        companyName: customer.company?.name || 'مجموعة صيدليات داواكور العالمية',
      };
    });
  }

  /**
   * استخراج بيانات سند قبض محدد برقم السند
   */
  async getReceiptVoucher(receiptNumber: string, actor: AuthenticatedUser) {
    const transaction = await this.prisma.customerTransaction.findFirst({
      where: {
        referenceId: receiptNumber,
        type: 'PAYMENT',
      },
      include: {
        customer: {
          include: {
            branch: { select: { id: true, name: true, code: true } },
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`سند القبض رقم ${receiptNumber} غير موجود`);
    }
    this.scope(actor, transaction.customer.companyId, transaction.customer.branchId);

    const receiptAmount = new Prisma.Decimal(transaction.amount).abs();
    const previousDebt = new Prisma.Decimal(transaction.balanceAfter).plus(receiptAmount).toFixed(2);

    return {
      id: transaction.id,
      receiptNumber: transaction.referenceId,
      customerId: transaction.customer.id,
      customerName: transaction.customer.name,
      customerPhone: transaction.customer.phone,
      customerAddress: transaction.customer.address,
      previousDebt,
      amount: receiptAmount.toFixed(2),
      remainingDebt: Number(transaction.balanceAfter),
      description: transaction.description,
      notes: transaction.description,
      createdAt: transaction.createdAt,
      createdBy: transaction.createdBy,
      branchName: transaction.customer.branch?.name || 'الفرع الرئيسي',
      companyName: transaction.customer.company?.name || 'مجموعة صيدليات داواكور العالمية',
    };
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const customer = await this.findOne(id, actor);
    if (Number(customer.currentDebt) > 0) {
      throw new ConflictException('لا يمكن حذف عميل عليه مديونية قائمة');
    }
    return this.prisma.customer.delete({ where: { id } });
  }
}
