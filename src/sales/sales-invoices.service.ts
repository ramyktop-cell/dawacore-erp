import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateInvoiceDto, QueryInvoicesDto } from './dto/create-invoice.dto';
import { Prisma, PaymentMethod, ShiftStatus, TransactionType } from '@prisma/client';

@Injectable()
export class SalesInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * إنشاء فاتورة مبيعات نظامية وربطها بالوردية وحركات المخزون وحساب العميل
   */
  async createInvoice(dto: CreateInvoiceDto, currentUser?: any) {
    if (!currentUser?.id || !currentUser.companyId) throw new ForbiddenException('هوية المستخدم مطلوبة');
    if (currentUser.branchId && dto.branchId && currentUser.branchId !== dto.branchId) throw new ForbiddenException('لا يمكن الخصم من مخزن فرع آخر');
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('يجب إضافة صنف واحد على الأقل في الفاتورة');
    }

    return await this.prisma.$transaction(async (tx) => {
      // 0. استخراج والتحقق الصارم من معرف الشركة والفرع (عزل المستأجرين H01)
      let effectiveCompanyId = currentUser && currentUser.role !== 'SUPER_ADMIN'
        ? currentUser.companyId
        : dto.companyId;

      let effectiveBranchId = currentUser?.branchId || dto.branchId;
      const effectiveUserId = currentUser?.id || dto.userId;

      const branch = await tx.branch.findFirst({
        where: {
          id: effectiveBranchId,
          ...(effectiveCompanyId ? { companyId: effectiveCompanyId } : {}),
        },
      });

      if (!branch) {
        throw new BadRequestException('الفرع المحدد غير موجود أو غير تابع لشركتك المصرح بها');
      }

      if (!effectiveCompanyId) {
        effectiveCompanyId = branch.companyId;
      }

      // 1. التحقق من الوردية في نفس الفرع والشركة
      let shift = await tx.shift.findFirst({
        where: {
          id: dto.shiftId,
          branchId: effectiveBranchId,
          companyId: effectiveCompanyId,
          status: ShiftStatus.OPEN,
          userId: effectiveUserId,
        },
      });

      if (!shift && !dto.shiftId) {
        // البحث عن وردية نفس المستخدم فقط عند عدم تحديد وردية
        shift = await tx.shift.findFirst({
          where: {
            branchId: effectiveBranchId,
            companyId: effectiveCompanyId,
            status: ShiftStatus.OPEN,
            userId: effectiveUserId,
          },
        });
      }

      if (!shift || shift.status !== ShiftStatus.OPEN) {
        throw new BadRequestException('الوردية المحددة غير موجودة أو مغلقة في هذا الفرع، لا يمكن إصدار فواتير');
      }

      // 2. التحقق من العميل في حالة البيع الآجل
      let customer: any = null;
      if (dto.customerId) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Customer" WHERE id = ${dto.customerId} FOR UPDATE`);
        customer = await tx.customer.findFirst({
          where: {
            id: dto.customerId,
            companyId: effectiveCompanyId,
            branchId: effectiveBranchId,
            isActive: true,
          },
        });
        if (!customer) {
          throw new NotFoundException('العميل المحدد غير موجود أو غير نشط أو لا يتبع فرع الفاتورة');
        }
      }

      // 3. حساب قيم الأصناف والتحقق من الكميات المتوفرة في الدفعات (مع قفل ذري H06)
      const movementIds: string[] = [];
      let totalAmountDec = new Prisma.Decimal(0);
      const itemsToCreate: Array<{
        medicineId: string;
        batchId: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        costPrice: Prisma.Decimal;
        subtotal: Prisma.Decimal;
      }> = [];

      for (const item of dto.items) {
        if (item.quantity <= 0) {
          throw new BadRequestException('كمية الصنف يجب أن تكون أكبر من صفر');
        }

        const batch = await tx.batch.findFirst({
          where: {
            id: item.batchId,
            branchId: effectiveBranchId,
            medicineId: item.medicineId,
          },
        });

        if (!batch) {
          throw new NotFoundException(`الدفعة برقم ${item.batchId} غير موجودة في هذا الفرع لهذا الصنف`);
        }

        if (batch.isFrozen) {
          throw new BadRequestException(`الدفعة (${batch.batchNumber}) مجمدة حالياً ولا يمكن الصرف منها`);
        }

        if (batch.expiryDate && new Date(batch.expiryDate) <= new Date()) {
          throw new BadRequestException(`الدفعة (${batch.batchNumber}) منتهية الصلاحية ولا يمكن صرفها للمريض`);
        }

        const medicine = await tx.medicine.findUnique({where:{id:item.medicineId}});
        const stockMultiplier = medicine?.isWeighed ? 1000 : 1;
        const baseDecimal = new Prisma.Decimal(item.quantity).times(stockMultiplier);
        if (!baseDecimal.isInteger() || baseDecimal.lessThan(1) || baseDecimal.greaterThan(2147483647)) throw new BadRequestException('كمية الفاتورة لا تطابق دقة المخزون');
        const requiredBaseQty = baseDecimal.toNumber();
        if (batch.quantityInBase < requiredBaseQty) {
          throw new BadRequestException(`الكمية المتاحة في الدفعة (${batch.batchNumber}) هي ${batch.quantityInBase} فقط، غير كافية لطلب ${item.quantity}`);
        }

        // 🛡️ تأمين السعر من الخادم ومنع التلاعب عبر الكونسول
        const clientSentPrice = new Prisma.Decimal(item.unitPrice);
        const officialBatchSalePrice = new Prisma.Decimal(batch.salePrice || 0);
        const officialBatchCostPrice = new Prisma.Decimal(batch.costPrice || 0).times(stockMultiplier);

        if (officialBatchSalePrice.greaterThan(0) && clientSentPrice.lessThan(officialBatchSalePrice)) {
          throw new BadRequestException(
            `رفض أمني: تم رصد تلاعب بسعر البيع عبر الكونسول! السعر المرسل (${clientSentPrice.toFixed(2)}) أقل من السعر الرسمي للدفعة (${officialBatchSalePrice.toFixed(2)})`,
          );
        }
        if (officialBatchCostPrice.greaterThan(0) && clientSentPrice.lessThan(officialBatchCostPrice)) {
          throw new BadRequestException(
            `رفض أمني: لا يمكن بيع الصنف بأقل من سعر التكلفة (${officialBatchCostPrice.toFixed(2)})`,
          );
        }

        const unitPriceDec = officialBatchSalePrice.greaterThan(0)
          ? officialBatchSalePrice
          : clientSentPrice;

        const subtotalDec = unitPriceDec.times(item.quantity);
        totalAmountDec = totalAmountDec.plus(subtotalDec);

        itemsToCreate.push({
          medicineId: item.medicineId,
          batchId: item.batchId,
          quantity: item.quantity,
          unitPrice: unitPriceDec,
          costPrice: officialBatchCostPrice,
          subtotal: subtotalDec,
        });

        // 🛡️ خصم ذري مشروط مع قفل التزامن لمنع التضارب والسحب المزدوج (H06)
        const deductResult = await tx.batch.updateMany({
          where: {
            id: item.batchId,
            branchId: effectiveBranchId,
            medicineId: item.medicineId,
            isFrozen: false,
            expiryDate: { gt: new Date() },
            quantityInBase: { gte: requiredBaseQty },
          },
          data: {
            quantityInBase: { decrement: requiredBaseQty },
          },
        });

        if (deductResult.count === 0) {
          throw new ConflictException(`تعذر خصم الكمية من الدفعة (${batch.batchNumber}) بسبب حركة بيع متزامنة أو نفاد الرصيد أو تجميد الدفعة`);
        }

        const newBatchQty = batch.quantityInBase - requiredBaseQty;

        // تسجيل حركة مخزنية
        const stockMovement = await tx.inventoryTransaction.create({
          data: {
            batchId: item.batchId,
            branchId: effectiveBranchId,
            transactionType: TransactionType.SALE,
            quantity: -requiredBaseQty,
            runningBalance: newBatchQty,
            unitCost: batch.costPrice,
            referenceId: `INV-DRAFT`,
            userId: effectiveUserId,
          },
        });
        movementIds.push(stockMovement.id);
      }

      // 4. الحسابات المالية
      const discountDec = new Prisma.Decimal(dto.discountAmount || 0);
      const netAmountDec = totalAmountDec.minus(discountDec);

      if (netAmountDec.isNegative()) {
        throw new BadRequestException('قيمة الخصم لا يمكن أن تتجاوز إجمالي الفاتورة');
      }

      let paidAmountDec = new Prisma.Decimal(dto.paidAmount !== undefined ? dto.paidAmount : netAmountDec);
      let remainingAmountDec = netAmountDec.minus(paidAmountDec);

      if (dto.paymentMethod === PaymentMethod.CREDIT) {
        paidAmountDec = new Prisma.Decimal(0);
        remainingAmountDec = netAmountDec;
      }

      let customerBalance: { previousDebt: string; creditAmount: string; debtAfter: string } | null = null;
      let customerSaleTransactionId: string | undefined;
      // التحقق من حد الائتمان للعميل في حالة وجود متبقي
      if (remainingAmountDec.greaterThan(0)) {
        if (!dto.customerId || !customer) {
          throw new BadRequestException('يجب تحديد عميل مسجل لتسجيل متبقي آجل');
        }

        const currentDebt = new Prisma.Decimal(customer.currentDebt);
        const creditLimit = new Prisma.Decimal(customer.creditLimit);
        const newDebt = currentDebt.plus(remainingAmountDec);
        customerBalance = { previousDebt: currentDebt.toFixed(2), creditAmount: remainingAmountDec.toFixed(2), debtAfter: newDebt.toFixed(2) };

        if (creditLimit.greaterThan(0) && newDebt.greaterThan(creditLimit)) {
          throw new BadRequestException(`تجاوز حد الائتمان للعميل! الحد المسموح: ${creditLimit}، الدين الحالي: ${currentDebt}، المطلوب إضافته: ${remainingAmountDec}`);
        }

        // تحديث رصيد مديونية العميل
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { currentDebt: newDebt },
        });

        // تسجيل حركة في كشف حساب العميل
        const customerSaleTransaction = await tx.customerTransaction.create({
          data: {
            customerId: dto.customerId,
            type: 'SALE',
            amount: remainingAmountDec,
            balanceAfter: newDebt,
            referenceId: `INV-${Date.now()}`,
            description: `فاتورة بيع رقمية (متبقي آجل)`,
            createdBy: effectiveUserId,
          },
        });
        customerSaleTransactionId = customerSaleTransaction.id;
      }

      // 5. توليد رقم تسلسلي للفاتورة
      const year = new Date().getFullYear();
      const count = await tx.salesInvoice.count({ where: { branchId: effectiveBranchId } });
      const invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, '0')}`;

      // 6. إنشاء الفاتورة وعناصرها
      const invoice = await tx.salesInvoice.create({
        data: {
          companyId: effectiveCompanyId,
          branchId: effectiveBranchId,
          shiftId: shift.id,
          userId: effectiveUserId,
          customerId: dto.customerId,
          invoiceNumber,
          totalAmount: totalAmountDec,
          discountAmount: discountDec,
          netAmount: netAmountDec,
          paidAmount: paidAmountDec,
          remainingAmount: remainingAmountDec,
          paymentMethod: dto.paymentMethod,
          bankReference: dto.bankReference,
          notes: dto.notes,
          items: {
            create: itemsToCreate,
          },
        },
        include: {
          items: {
            include: {
              medicine: { select: { id: true, tradeName: true, code: true } },
              batch: { select: { id: true, batchNumber: true, expiryDate: true } },
            },
          },
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      await tx.inventoryTransaction.updateMany({where: {id: {in: movementIds}}, data: {referenceId: invoice.invoiceNumber}});
      if (customerSaleTransactionId) await tx.customerTransaction.update({ where: { id: customerSaleTransactionId }, data: { referenceId: invoice.invoiceNumber } });

      // 7. تحديث مؤشرات الوردية المالية
      let addCash = new Prisma.Decimal(0);
      let addBank = new Prisma.Decimal(0);
      let addCredit = new Prisma.Decimal(0);

      if (dto.paymentMethod === PaymentMethod.CASH) {
        addCash = paidAmountDec;
      } else if (dto.paymentMethod === PaymentMethod.BANK_TRANSFER || dto.paymentMethod === PaymentMethod.CARD || dto.paymentMethod === PaymentMethod.TRANSFER) {
        addBank = paidAmountDec;
      } else if (dto.paymentMethod === PaymentMethod.CREDIT) {
        addCredit = remainingAmountDec;
      } else if (dto.paymentMethod === PaymentMethod.MIXED) {
        addCash = paidAmountDec;
        addCredit = remainingAmountDec;
      }

      await tx.shift.update({
        where: { id: dto.shiftId },
        data: {
          expectedCash: { increment: addCash },
          totalSalesCash: { increment: addCash },
          totalSalesBank: { increment: addBank },
          totalSalesCredit: { increment: addCredit },
          totalSales: { increment: netAmountDec },
        },
      });

      // إطلاق الحدث المحاسبي لإنشاء قيد المبيعات المزدوج وتكلفة البضاعة المباعة
      let totalCost = 0;
      if (invoice.items) {
        for (const it of invoice.items) {
          totalCost += Number(it.costPrice || 0) * Number(it.quantity);
        }
      }

      try {
        const paymentsList: Array<{ method: string; amount: number }> = [];
        if (Number(invoice.paidAmount) > 0) {
          paymentsList.push({
            method: invoice.paymentMethod,
            amount: Number(invoice.paidAmount),
          });
        }
        if (Number(invoice.remainingAmount) > 0) {
          paymentsList.push({
            method: 'CREDIT',
            amount: Number(invoice.remainingAmount),
          });
        }

        this.eventEmitter.emit('sale.completed', {
          saleId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          companyId: invoice.companyId,
          branchId: invoice.branchId,
          grandTotal: Number(invoice.netAmount),
          totalCost,
          payments: paymentsList,
          cashierId: invoice.userId,
        });
      } catch (err: any) {
        console.error('Failed to emit sale.completed event:', err.message);
      }

      return { ...invoice, customerBalance };
    });
  }

  /**
   * جلب فواتير المبيعات مع التصفية والبحث
   */
  async findAll(query: QueryInvoicesDto, currentUser?: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SalesInvoiceWhereInput = {};

    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      where.companyId = currentUser.companyId;
      if (currentUser.branchId) {
        where.branchId = currentUser.branchId;
      }
    }

    if (query.branchId) where.branchId = query.branchId;
    if (query.shiftId) where.shiftId = query.shiftId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;

    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: query.search } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          items: {
            include: {
              medicine: { select: { tradeName: true } },
            },
          },
        },
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * جلب تفاصيل فاتورة واحدة كاملة
   */
  async findOne(id: string, currentUser?: any) {
    const tenantFilter: any = {};
    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      tenantFilter.companyId = currentUser.companyId;
      if (currentUser.branchId) {
        tenantFilter.branchId = currentUser.branchId;
      }
    }

    let invoice: any = await this.prisma.salesInvoice.findFirst({
      where: {
        AND: [
          tenantFilter,
          {
            OR: [{ id }, { invoiceNumber: id }],
          },
        ],
      },
      include: {
        customer: true,
        user: { select: { id: true, name: true, username: true } },
        branch: {
          include: {
            company: true,
          },
        },
        shift: { select: { id: true, shiftNumber: true, status: true } },
        items: {
          include: {
            medicine: {
              include: {
                units: true,
              },
            },
            batch: true,
          },
        },
      },
    });

    if (invoice && invoice.items) {
      invoice.items = invoice.items.map((item: any) => {
        const med = item.medicine;
        const defaultUnit = med?.units?.find((u: any) => u.isDefault) || med?.units?.[0];
        const unitLabel = item.unitLabel || defaultUnit?.label || (med?.isWeighed ? 'كيلو' : 'حبة');
        return {
          ...item,
          unitLabel,
        };
      });
    }

    if (!invoice) {
      // البحث في جدول مبيعات الـ POS (Sale) أيضاً لضمان التوافق التام
      const sale = await this.prisma.sale.findFirst({
        where: {
          AND: [
            { branch: { companyId: currentUser?.companyId }, ...(currentUser?.branchId ? { branchId: currentUser.branchId } : {}) },
            {
              OR: [{ id }, { invoiceNumber: id }],
            },
          ],
        },
        include: {
          payments: true,
          customer: true,
          branch: {
          include: {
            company: true,
          },
        },
          shift: { select: { id: true, shiftNumber: true, status: true } },
          items: {
            include: {
              batch: {
                include: {
                  medicine: {
                    include: {
                      units: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (sale) {
        let cashierUser: any = null;
        if (sale.cashierId) {
          cashierUser = await this.prisma.user.findUnique({
            where: { id: sale.cashierId },
            select: { id: true, name: true, username: true },
          });
        }

        invoice = {
          id: sale.id,
          companyId: sale.branch?.companyId || '',
          branchId: sale.branchId,
          shiftId: sale.shiftId,
          userId: sale.cashierId,
          customerId: sale.customerId,
          invoiceNumber: sale.invoiceNumber,
          totalAmount: sale.subTotal,
          discountAmount: sale.discountTotal,
          netAmount: sale.grandTotal,
          paidAmount: sale.paidAmount,
          remainingAmount: (sale.payments || []).filter(payment => payment.method === PaymentMethod.CREDIT).reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0)),
          paymentMethod: sale.paymentMethod as any,
          notes: null,
          createdAt: sale.createdAt,
          updatedAt: sale.createdAt,
          customer: sale.customer,
          user: cashierUser,
          branch: sale.branch,
          shift: sale.shift,
          items: (sale.items || []).map((i: any) => {
            const med = i.batch?.medicine;
            const unitObj = med?.units?.find((u: any) => u.unitType === i.unitType);
            const unitLabel = unitObj?.label || (i.unitType === 'BOX' ? 'علبة' : i.unitType === 'STRIP' ? 'شريط' : (i.unitType === 'UNIT' ? (med?.isWeighed ? 'كيلو' : 'حبة') : ''));
            return {
              id: i.id,
              invoiceId: i.saleId,
              medicineId: i.batch?.medicineId,
              batchId: i.batchId,
              unitType: i.unitType,
              unitLabel,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
              subtotal: Number(i.totalPrice),
              createdAt: sale.createdAt,
              medicine: med,
              batch: i.batch,
            };
          }),
        };
      }
    }

    if (!invoice) {
      throw new NotFoundException('الفاتورة غير موجودة');
    }

    invoice.customerBalance = null;
    if (invoice.customerId && new Prisma.Decimal(invoice.remainingAmount || 0).greaterThan(0)) {
      const movements = await this.prisma.customerTransaction.findMany({ where: {
        customerId: invoice.customerId, type: 'SALE', referenceId: { in: [invoice.id, invoice.invoiceNumber] },
      }, take: 2 });
      if (movements.length === 1 && new Prisma.Decimal(movements[0].amount).equals(invoice.remainingAmount)) {
        const after = new Prisma.Decimal(movements[0].balanceAfter);
        const credit = new Prisma.Decimal(movements[0].amount);
        invoice.customerBalance = { previousDebt: after.minus(credit).toFixed(2), creditAmount: credit.toFixed(2), debtAfter: after.toFixed(2) };
      }
    }
    // ملخص رصيد العميل التاريخي: قبل الفاتورة / بعد الفاتورة / بعد السداد
    invoice.balanceSummary = null;
    if (invoice.customerId) {
      let before: Prisma.Decimal | null = null;
      if (invoice.customerBalance) {
        before = new Prisma.Decimal(invoice.customerBalance.previousDebt);
      } else {
        const last = await this.prisma.customerTransaction.findFirst({
          where: {
            customerId: invoice.customerId,
            createdAt: { lt: invoice.createdAt },
            OR: [{ referenceId: null }, { referenceId: { notIn: [invoice.id, invoice.invoiceNumber] } }],
          },
          orderBy: { createdAt: 'desc' },
        });
        if (last) {
          before = new Prisma.Decimal(last.balanceAfter);
        } else if (invoice.customer?.currentDebt !== undefined && invoice.customer?.currentDebt !== null) {
          const curDebt = new Prisma.Decimal(invoice.customer.currentDebt);
          const rem = new Prisma.Decimal(invoice.remainingAmount || 0);
          before = curDebt.greaterThanOrEqualTo(rem) ? curDebt.minus(rem) : new Prisma.Decimal(0);
        } else {
          before = new Prisma.Decimal(0);
        }
      }
      if (before) {
        const net = new Prisma.Decimal(invoice.netAmount || 0);
        const remaining = new Prisma.Decimal(invoice.remainingAmount || 0);
        invoice.balanceSummary = {
          before: before.toFixed(2),
          afterInvoice: before.plus(net).toFixed(2),
          afterPayment: before.plus(remaining).toFixed(2),
        };
      }
    }
    return invoice;
  }
}
