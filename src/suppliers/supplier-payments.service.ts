import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Account,
  Prisma,
  SupplierPaymentMethod,
} from '@prisma/client';
import { createHash } from 'crypto';
import { AuthenticatedUser } from '../auth/security.policy';
import { PrismaService } from '../prisma/prisma.service';
import { SupplierDocumentsPdfService } from '../shared/supplier-documents/supplier-documents-pdf.service';
import {
  CreateSupplierPaymentDto,
  OutstandingSupplierInvoicesQueryDto,
} from './dto/supplier-payment.dto';

type PaymentWithDetails = Prisma.SupplierPaymentGetPayload<{
  include: {
    supplier: true;
    branch: { include: { company: true } };
    journalEntry: true;
    allocations: {
      include: {
        purchaseOrder: {
          include: {
            paymentAllocations: {
              include: { payment: { select: { id: true, paymentDate: true } } },
            },
            purchaseReturns: { select: { totalRefund: true } },
          },
        };
      };
    };
  };
}>;

@Injectable()
export class SupplierPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: SupplierDocumentsPdfService,
  ) {}

  async getOutstandingInvoices(
    supplierId: string,
    query: OutstandingSupplierInvoicesQueryDto,
    actor: AuthenticatedUser,
  ) {
    this.assertActor(actor);
    this.assertBranchAccess(query.branchId, actor);

    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: supplierId,
        companyId: actor.companyId,
        branchId: query.branchId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        companyName: true,
        currentDebt: true,
        branchId: true,
      },
    });
    if (!supplier) {
      throw new NotFoundException('المورد غير موجود أو خارج نطاق الشركة والفرع');
    }

    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        companyId: actor.companyId,
        branchId: query.branchId,
        supplierId,
        status: 'RECEIVED',
      },
      include: {
        paymentAllocations: { select: { amount: true } },
        purchaseReturns: { select: { id: true, totalRefund: true } },
      },
      orderBy: [{ receivedAt: 'asc' }, { orderNumber: 'asc' }],
    });

    const invoices = orders
      .map((order) => {
        const allocated = order.paymentAllocations.reduce(
          (sum, row) => sum.plus(row.amount),
          new Prisma.Decimal(0),
        );
        const returned = order.purchaseReturns.reduce(
          (sum, row) => sum.plus(row.totalRefund),
          new Prisma.Decimal(0),
        );
        const remaining = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          new Prisma.Decimal(order.totalAmount)
            .minus(order.paidAmount)
            .minus(allocated)
            .minus(returned),
        );
        const blockedReason = order.purchaseReturns.length
          ? 'توجد مرتجعات على الفاتورة؛ يلزم اعتماد تسويتها المحاسبية قبل السداد'
          : null;
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          invoiceNumber: order.invoiceNumber,
          receivedAt: order.receivedAt,
          totalAmount: Number(order.totalAmount),
          paidAtPurchase: Number(order.paidAmount),
          paidLater: Number(allocated.toFixed(2)),
          returnedAmount: Number(returned.toFixed(2)),
          remaining: Number(remaining.toFixed(2)),
          eligible: remaining.greaterThan(0) && !blockedReason,
          blockedReason,
        };
      })
      .filter((order) => order.remaining > 0);

    return {
      supplier: {
        ...supplier,
        currentDebt: Number(supplier.currentDebt),
      },
      invoices,
    };
  }

  async createPayment(
    supplierId: string,
    dto: CreateSupplierPaymentDto,
    actor: AuthenticatedUser,
  ) {
    this.assertActor(actor);
    this.assertBranchAccess(dto.branchId, actor);
    const normalizedKey = dto.idempotencyKey.trim();
    const requestHash = this.hashRequest(supplierId, dto);

    const existing = await this.prisma.supplierPayment.findUnique({
      where: {
        companyId_branchId_idempotencyKey: {
          companyId: actor.companyId,
          branchId: dto.branchId,
          idempotencyKey: normalizedKey,
        },
      },
      include: this.paymentInclude(),
    });
    if (existing) return this.handleExisting(existing, requestHash);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const duplicate = await tx.supplierPayment.findUnique({
              where: {
                companyId_branchId_idempotencyKey: {
                  companyId: actor.companyId,
                  branchId: dto.branchId,
                  idempotencyKey: normalizedKey,
                },
              },
              include: this.paymentInclude(),
            });
            if (duplicate) return this.handleExisting(duplicate, requestHash);

            const supplier = await tx.supplier.findFirst({
              where: {
                id: supplierId,
                companyId: actor.companyId,
                branchId: dto.branchId,
                isActive: true,
              },
            });
            if (!supplier) {
              throw new NotFoundException('المورد غير موجود أو غير نشط أو خارج نطاق الفرع');
            }

            const amount = this.money(dto.amount, 'مبلغ السداد');
            const allocations = this.normalizeAllocations(dto.allocations);
            const allocationsTotal = allocations.reduce(
              (sum, row) => sum.plus(row.amount),
              new Prisma.Decimal(0),
            );
            if (!allocationsTotal.equals(amount)) {
              throw new BadRequestException('مجموع توزيعات الفواتير يجب أن يساوي مبلغ السداد');
            }

            const orderIds = allocations.map((row) => row.purchaseOrderId).sort();
            const orders = await tx.purchaseOrder.findMany({
              where: {
                id: { in: orderIds },
                companyId: actor.companyId,
                branchId: dto.branchId,
                supplierId,
                status: 'RECEIVED',
              },
              include: {
                paymentAllocations: { select: { amount: true } },
                purchaseReturns: { select: { id: true, totalRefund: true } },
              },
              orderBy: { id: 'asc' },
            });
            if (orders.length !== orderIds.length) {
              throw new BadRequestException('إحدى الفواتير غير مستلمة أو لا تخص المورد والفرع المحددين');
            }

            const orderMap = new Map(orders.map((order) => [order.id, order]));
            for (const allocation of allocations) {
              const order = orderMap.get(allocation.purchaseOrderId)!;
              if (order.purchaseReturns.length) {
                throw new ConflictException(
                  `الفاتورة ${order.orderNumber} لها مرتجع يحتاج تسوية محاسبية قبل السداد`,
                );
              }
              const priorAllocated = order.paymentAllocations.reduce(
                (sum, row) => sum.plus(row.amount),
                new Prisma.Decimal(0),
              );
              const remaining = new Prisma.Decimal(order.totalAmount)
                .minus(order.paidAmount)
                .minus(priorAllocated);
              if (remaining.lessThan(allocation.amount)) {
                throw new ConflictException(
                  `المبلغ الموزع على الفاتورة ${order.orderNumber} أكبر من المتبقي ${remaining.toFixed(2)}`,
                );
              }
            }

            const mapping = await tx.branchAccountMapping.findUnique({
              where: { branchId: dto.branchId },
            });
            if (!mapping) {
              throw new BadRequestException('إعدادات الحسابات المحاسبية للفرع غير مكتملة');
            }

            const sourceAccountId =
              dto.method === SupplierPaymentMethod.CASH
                ? mapping.cashAccountId
                : mapping.bankAccountId;
            if (mapping.apAccountId === sourceAccountId) {
              throw new BadRequestException('حساب الدائنين وحساب مصدر السداد لا يمكن أن يكونا الحساب نفسه');
            }
            const accounts = await tx.account.findMany({
              where: {
                id: { in: [mapping.apAccountId, sourceAccountId] },
                companyId: actor.companyId,
              },
            });
            const accountMap = new Map(accounts.map((account) => [account.id, account]));
            const apAccount = accountMap.get(mapping.apAccountId);
            const sourceAccount = accountMap.get(sourceAccountId);
            this.assertPostingAccount(apAccount, 'حساب الدائنين');
            this.assertPostingAccount(sourceAccount, 'حساب مصدر السداد');

            const paymentDate = new Date();
            const fiscalYear = await tx.fiscalYear.findFirst({
              where: {
                companyId: actor.companyId,
                status: 'OPEN',
                startDate: { lte: paymentDate },
                endDate: { gte: paymentDate },
              },
              orderBy: { startDate: 'desc' },
            });
            if (!fiscalYear) {
              throw new BadRequestException('لا توجد سنة مالية مفتوحة تغطي تاريخ السداد');
            }

            if (
              dto.method === SupplierPaymentMethod.BANK_TRANSFER &&
              !dto.referenceNo?.trim()
            ) {
              throw new BadRequestException('رقم مرجع التحويل البنكي مطلوب');
            }

            let cashMovementId: string | null = null;
            if (dto.method === SupplierPaymentMethod.CASH) {
              const shift = await tx.shift.findFirst({
                where: {
                  companyId: actor.companyId,
                  branchId: dto.branchId,
                  userId: actor.id,
                  status: 'OPEN',
                },
                orderBy: { openedAt: 'desc' },
              });
              if (!shift) {
                throw new BadRequestException('يلزم وجود وردية مفتوحة للمستخدم في الفرع للسداد النقدي');
              }
              const updated = await tx.shift.updateMany({
                where: {
                  id: shift.id,
                  status: 'OPEN',
                  expectedCash: { gte: amount },
                },
                data: { expectedCash: { decrement: amount } },
              });
              if (updated.count !== 1) {
                throw new ConflictException('الوردية أغلقت أو رصيد الخزنة لم يعد كافياً');
              }
              const cashMovement = await tx.cashMovement.create({
                data: {
                  shiftId: shift.id,
                  type: 'CASH_OUT',
                  amount,
                  reason: `سداد للمورد ${supplier.name}`,
                  authorizedBy: actor.id,
                },
              });
              cashMovementId = cashMovement.id;
            }

            const year = paymentDate.getFullYear();
            const paymentSequence = await tx.documentSequence.upsert({
              where: {
                type_year_branchId: {
                  type: 'SUPPLIER_PAYMENT',
                  year,
                  branchId: dto.branchId,
                },
              },
              update: { lastValue: { increment: 1 } },
              create: {
                type: 'SUPPLIER_PAYMENT',
                year,
                branchId: dto.branchId,
                lastValue: 1,
              },
            });
            const paymentNumber = `SPV-${year}-${String(paymentSequence.lastValue).padStart(5, '0')}`;

            const journalSequence = await tx.documentSequence.upsert({
              where: {
                type_year_branchId: {
                  type: 'JOURNAL',
                  year,
                  branchId: dto.branchId,
                },
              },
              update: { lastValue: { increment: 1 } },
              create: {
                type: 'JOURNAL',
                year,
                branchId: dto.branchId,
                lastValue: 1,
              },
            });
            const entryNumber = `JV-${year}-${String(journalSequence.lastValue).padStart(4, '0')}`;
            const journalEntry = await tx.journalEntry.create({
              data: {
                companyId: actor.companyId,
                branchId: dto.branchId,
                entryNumber,
                date: paymentDate,
                description: `سداد للمورد ${supplier.name} - ${paymentNumber}`,
                source: 'SUPPLIER_PAYMENT',
                createdBy: actor.id,
                fiscalYearId: fiscalYear.id,
              },
            });

            await tx.journalLine.createMany({
              data: [
                {
                  journalEntryId: journalEntry.id,
                  accountId: apAccount!.id,
                  debit: amount,
                  credit: new Prisma.Decimal(0),
                  supplierId,
                  description: `سداد للمورد - ${paymentNumber}`,
                  notes: dto.referenceNo?.trim() || null,
                },
                {
                  journalEntryId: journalEntry.id,
                  accountId: sourceAccount!.id,
                  debit: new Prisma.Decimal(0),
                  credit: amount,
                  description:
                    dto.method === SupplierPaymentMethod.CASH
                      ? `سداد نقدي للمورد - ${paymentNumber}`
                      : `تحويل بنكي للمورد - ${paymentNumber}`,
                  notes: dto.referenceNo?.trim() || null,
                },
              ],
            });
            await tx.account.update({
              where: { id: apAccount!.id },
              data: { balance: { increment: amount } },
            });
            await tx.account.update({
              where: { id: sourceAccount!.id },
              data: { balance: { decrement: amount } },
            });

            const debtUpdate = await tx.supplier.updateMany({
              where: {
                id: supplierId,
                companyId: actor.companyId,
                branchId: dto.branchId,
                currentDebt: { gte: amount },
              },
              data: { currentDebt: { decrement: amount } },
            });
            if (debtUpdate.count !== 1) {
              throw new ConflictException('رصيد المورد المسجل أقل من مبلغ السداد؛ راجع المطابقة أولاً');
            }

            const payment = await tx.supplierPayment.create({
              data: {
                companyId: actor.companyId,
                branchId: dto.branchId,
                supplierId,
                paymentNumber,
                paymentDate,
                amount,
                method: dto.method,
                referenceNo: dto.referenceNo?.trim() || null,
                notes: dto.notes?.trim() || null,
                idempotencyKey: normalizedKey,
                requestHash,
                createdBy: actor.id,
                journalEntryId: journalEntry.id,
                cashMovementId,
                allocations: {
                  create: allocations.map((allocation) => ({
                    purchaseOrderId: allocation.purchaseOrderId,
                    amount: allocation.amount,
                  })),
                },
              },
              include: this.paymentInclude(),
            });

            await tx.journalEntry.update({
              where: { id: journalEntry.id },
              data: { referenceId: payment.id },
            });

            return this.presentPayment(payment);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 15000,
          },
        );
      } catch (error: any) {
        if (this.isRetryableTransactionError(error) && attempt < 2) continue;
        if (error?.code === 'P2002') {
          const duplicate = await this.prisma.supplierPayment.findUnique({
            where: {
              companyId_branchId_idempotencyKey: {
                companyId: actor.companyId,
                branchId: dto.branchId,
                idempotencyKey: normalizedKey,
              },
            },
            include: this.paymentInclude(),
          });
          if (duplicate) return this.handleExisting(duplicate, requestHash);
        }
        throw error;
      }
    }

    throw new ConflictException('تعذر تثبيت السداد بسبب تعارض متزامن؛ أعد المحاولة بنفس المفتاح');
  }

  async getPayment(paymentId: string, actor: AuthenticatedUser) {
    this.assertActor(actor);
    const payment = await this.prisma.supplierPayment.findFirst({
      where: {
        id: paymentId,
        companyId: actor.companyId,
        ...(actor.branchId ? { branchId: actor.branchId } : {}),
      },
      include: this.paymentInclude(),
    });
    if (!payment) {
      throw new NotFoundException('سند السداد غير موجود أو خارج نطاق صلاحياتك');
    }
    return this.presentPayment(payment);
  }

  async getPaymentPdf(paymentId: string, actor: AuthenticatedUser) {
    const payment = await this.getPayment(paymentId, actor);
    const buffer = await this.pdfService.generateSupplierPaymentPdf(payment);
    return {
      buffer,
      filename: `supplier-payment-${payment.paymentNumber}.pdf`,
      unicodeFilename: `سند-سداد-${payment.paymentNumber}.pdf`,
    };
  }

  private paymentInclude() {
    return {
      supplier: true,
      branch: { include: { company: true } },
      journalEntry: true,
    allocations: {
      include: {
        purchaseOrder: {
          include: {
            paymentAllocations: {
              include: { payment: { select: { id: true, paymentDate: true } } },
            },
            purchaseReturns: { select: { totalRefund: true } },
          },
        },
      },
    },
    } as const;
  }

  private presentPayment(payment: PaymentWithDetails) {
    return {
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
      method: payment.method,
      referenceNo: payment.referenceNo,
      notes: payment.notes,
      journalEntryNumber: payment.journalEntry.entryNumber,
      supplier: {
        id: payment.supplier.id,
        name: payment.supplier.name,
        companyName: payment.supplier.companyName,
        currentDebt: Number(payment.supplier.currentDebt),
      },
      branch: {
        id: payment.branch.id,
        name: payment.branch.name,
        code: payment.branch.code,
      },
      company: {
        id: payment.branch.company.id,
        name: payment.branch.company.name,
        currency: payment.branch.company.currency,
      },
      allocations: payment.allocations.map((row) => {
        const invoiceTotal = new Prisma.Decimal(row.purchaseOrder.totalAmount || 0);
        const paidAtPurchase = new Prisma.Decimal(row.purchaseOrder.paidAmount || 0);
        const paidThroughThisVoucher = row.purchaseOrder.paymentAllocations
          .filter((allocation) => allocation.payment.paymentDate <= payment.paymentDate)
          .reduce((sum, allocation) => sum.plus(allocation.amount), paidAtPurchase);
        const returnedAmount = row.purchaseOrder.purchaseReturns.reduce(
          (sum, purchaseReturn) => sum.plus(purchaseReturn.totalRefund),
          new Prisma.Decimal(0),
        );
        const remainingAfterPayment = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          invoiceTotal.minus(paidThroughThisVoucher).minus(returnedAmount),
        );
        return {
          purchaseOrderId: row.purchaseOrderId,
          orderNumber: row.purchaseOrder.orderNumber,
          invoiceNumber: row.purchaseOrder.invoiceNumber,
          invoiceTotal: Number(invoiceTotal.toFixed(2)),
          paidWithThisVoucher: Number(row.amount),
          remainingAfterPayment: Number(remainingAfterPayment.toFixed(2)),
        };
      }),
      createdAt: payment.createdAt,
    };
  }

  private handleExisting(payment: PaymentWithDetails, requestHash: string) {
    if (payment.requestHash !== requestHash) {
      throw new ConflictException('مفتاح الطلب مستخدم سابقاً بمحتوى مختلف');
    }
    return this.presentPayment(payment);
  }

  private normalizeAllocations(allocations: CreateSupplierPaymentDto['allocations']) {
    const seen = new Set<string>();
    return allocations
      .map((row) => {
        if (seen.has(row.purchaseOrderId)) {
          throw new BadRequestException('لا يجوز تكرار الفاتورة في توزيعات السداد');
        }
        seen.add(row.purchaseOrderId);
        return {
          purchaseOrderId: row.purchaseOrderId,
          amount: this.money(row.amount, 'قيمة التوزيع'),
        };
      })
      .sort((a, b) => a.purchaseOrderId.localeCompare(b.purchaseOrderId));
  }

  private money(value: number, label: string) {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0) || decimal.decimalPlaces() > 2) {
      throw new BadRequestException(`${label} غير صالح أو يتجاوز دقة خانتين عشريتين`);
    }
    return decimal.toDecimalPlaces(2);
  }

  private hashRequest(supplierId: string, dto: CreateSupplierPaymentDto) {
    const normalized = {
      supplierId,
      branchId: dto.branchId,
      method: dto.method,
      amount: this.money(dto.amount, 'مبلغ السداد').toFixed(2),
      referenceNo: dto.referenceNo?.trim() || '',
      notes: dto.notes?.trim() || '',
      allocations: dto.allocations
        .map((row) => ({
          purchaseOrderId: row.purchaseOrderId,
          amount: this.money(row.amount, 'قيمة التوزيع').toFixed(2),
        }))
        .sort((a, b) => a.purchaseOrderId.localeCompare(b.purchaseOrderId)),
    };
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  private assertActor(actor: AuthenticatedUser) {
    if (!actor?.id || !actor.companyId) {
      throw new ForbiddenException('جلسة المستخدم لا تحتوي على نطاق شركة صالح');
    }
  }

  private assertBranchAccess(branchId: string, actor: AuthenticatedUser) {
    if (actor.branchId && actor.branchId !== branchId) {
      throw new ForbiddenException('الفرع المحدد خارج نطاق صلاحيات المستخدم');
    }
  }

  private assertPostingAccount(account: Account | undefined, label: string) {
    if (!account || !account.isActive || !account.isLeaf) {
      throw new BadRequestException(`${label} غير موجود أو غير نشط أو ليس حساباً طرفياً`);
    }
  }

  private isRetryableTransactionError(error: any) {
    return error?.code === 'P2034' || error?.code === '40001' || error?.code === '40P01';
  }
}
