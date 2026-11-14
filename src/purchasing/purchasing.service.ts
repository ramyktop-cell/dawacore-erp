import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreatePurchaseOrderDto, QueryPurchaseOrdersDto } from './dto/create-purchase.dto';
import { Prisma, PurchaseStatus, TransactionType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/security.policy';

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 1. إنشاء أمر الشراء كمسودة (Draft / PENDING)
   */
  async create(dto: CreatePurchaseOrderDto, userId: string, actor?: AuthenticatedUser) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('يجب إضافة صنف واحد على الأقل في أمر الشراء');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of dto.items) {
      if (new Date(item.expiryDate) <= today) {
        throw new BadRequestException(`التشغيلة ${item.batchNumber} منتهية الصلاحية مسبقاً`);
      }
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
      include: { company: true },
    });
    if (!branch) {
      throw new NotFoundException('الفرع المحدد غير موجود');
    }
    if (actor && (branch.companyId !== actor.companyId || (actor.branchId && branch.id !== actor.branchId))) {
      throw new BadRequestException('لا تملك صلاحية إنشاء أمر شراء لهذا الفرع');
    }

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException('المورد المحدد غير موجود');
    }
    if (supplier.companyId !== branch.companyId) throw new BadRequestException('المورد لا يتبع شركة الفرع المحدد');
    if (supplier.branchId && supplier.branchId !== branch.id) throw new BadRequestException('المورد لا يتبع الفرع المحدد');

    if (dto.companyId && dto.companyId !== branch.companyId) {
      throw new BadRequestException('الفرع لا يتبع الشركة المحددة');
    }
    const companyId = branch.companyId;

    // توليد رقم أمر الشراء
    let orderNumber = dto.orderNumber;
    if (!orderNumber) {
      const year = new Date().getFullYear();
      const seq = await this.prisma.documentSequence.upsert({
        where: { type_year_branchId: { type: 'PURCHASE', year, branchId: dto.branchId } },
        update: { lastValue: { increment: 1 } },
        create: { type: 'PURCHASE', year, branchId: dto.branchId, lastValue: 1 },
      });
      orderNumber = `PO-${year}-${String(seq.lastValue).padStart(5, '0')}`;
    }

    let totalAmount = 0;
    const additionalExpenses = Number(dto.additionalExpenses || 0);
    if (!Number.isFinite(additionalExpenses) || additionalExpenses < 0) {
      throw new BadRequestException('المصاريف الإضافية يجب أن تكون رقماً غير سالب');
    }
    const expenseAllocationMethod = dto.expenseAllocationMethod || 'LANDED_COST';
    if (!['LANDED_COST', 'PERIOD_EXPENSE'].includes(expenseAllocationMethod)) {
      throw new BadRequestException('طريقة تحميل المصاريف الإضافية غير صالحة');
    }
    const products = await this.prisma.medicine.findMany({where:{id:{in:dto.items.map(item=>item.medicineId)}},include:{units:true}});
    const itemsData = dto.items.map((item) => {
      const product = products.find(product=>product.id===item.medicineId);
      if (!product) throw new BadRequestException('صنف الشراء غير موجود');
      const multiplier = product.isWeighed ? 1000 : 1;
      const base = new Prisma.Decimal(item.quantity).times(multiplier);
      if (!base.isInteger() || base.lessThan(1) || base.greaterThan(2147483647)) throw new BadRequestException('كمية الشراء يجب أن تطابق دقة المخزون؛ الوزن بالكيلو بدقة الجرام');
      const lineSubtotal = item.quantity * item.costPrice;
      totalAmount += lineSubtotal;
      if (item.sellingPrice !== undefined && item.sellingPrice < item.costPrice) {
        throw new BadRequestException(`سعر بيع الصنف ${item.medicineId} أقل من التكلفة`);
      }
      return {
        medicineId: item.medicineId,
        multiplier,
        unitType: product.isWeighed ? 'UNIT' as const : item.unitType,
        batchNumber: item.batchNumber,
        expiryDate: new Date(item.expiryDate),
        quantity: item.quantity,
        costPrice: new Prisma.Decimal(item.costPrice),
        sellingPrice: item.sellingPrice ? new Prisma.Decimal(item.sellingPrice) : null,
        subtotal: new Prisma.Decimal(lineSubtotal),
      };
    });

    const paidAmount = Number(dto.paidAmount || 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > totalAmount) {
      throw new BadRequestException('المبلغ المدفوع غير صالح أو أكبر من إجمالي أمر الشراء');
    }

    return await this.prisma.purchaseOrder.create({
      data: {
        companyId,
        branchId: dto.branchId,
        supplierId: dto.supplierId,
        orderNumber,
        invoiceNumber: dto.invoiceNumber,
        status: PurchaseStatus.PENDING,
        totalAmount: new Prisma.Decimal(totalAmount),
        paidAmount: new Prisma.Decimal(paidAmount),
        additionalExpenses: new Prisma.Decimal(additionalExpenses),
        expenseAllocationMethod,
        expenseNotes: dto.expenseNotes,
        createdBy: userId,
        notes: dto.notes,
        items: {
          create: itemsData,
        },
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            medicine: { select: { id: true, tradeName: true, code: true } },
          },
        },
      },
    });
  }

  /**
   * 2. استلام الشحنة، توليد الباتشات، تسجيل التدقيق المخزني، وإطلاق الحدث المحاسبي
   */
  async receiveOrder(id: string, userId: string, actor?: AuthenticatedUser) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('أمر الشراء غير موجود');
    }
    if (actor && (order.companyId !== actor.companyId || (actor.branchId && order.branchId !== actor.branchId))) {
      throw new BadRequestException('لا تملك صلاحية استلام أمر الشراء لهذا الفرع');
    }

    if (order.status !== PurchaseStatus.PENDING) {
      throw new BadRequestException('أمر الشراء ليس بحالة معلقة قابلة للاستلام');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const baseTotal = Number(order.totalAmount);
    const additionalExpenses = Number(order.additionalExpenses || 0);
    const isLandedCost = (order.expenseAllocationMethod || 'LANDED_COST') === 'LANDED_COST';

    return await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{status:string}>>`SELECT status FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length || locked[0].status !== 'PENDING') throw new BadRequestException('أمر الشراء استُلم أو أُلغي مسبقاً');
      for (const item of order.items) {
        if (new Date(item.expiryDate) <= today) {
          throw new BadRequestException(`لا يمكن استلام الباتش ${item.batchNumber} لأنه منتهي الصلاحية`);
        }

        // توليد أو تحديث الباتش
        let batch = await tx.batch.findUnique({
          where: {
            batchNumber_medicineId_branchId: {
              branchId: order.branchId,
              medicineId: item.medicineId,
              batchNumber: item.batchNumber,
            },
          },
        });

        const allocatedExpense = isLandedCost && baseTotal > 0
          ? additionalExpenses * (Number(item.subtotal) / baseTotal)
          : 0;
        const landedUnitCost = Number(item.costPrice) + (Number(item.quantity) > 0 ? allocatedExpense / Number(item.quantity) : 0);
        if (item.sellingPrice && Number(item.sellingPrice) < landedUnitCost) {
          throw new BadRequestException(`سعر بيع الصنف ${item.medicineId} أقل من التكلفة المنزلة`);
        }
        const multiplier = item.multiplier || 1;
        const baseQtyDecimal = new Prisma.Decimal(item.quantity).times(multiplier);
        if (!baseQtyDecimal.isInteger() || baseQtyDecimal.lessThan(1) || baseQtyDecimal.greaterThan(2147483647)) throw new BadRequestException('كمية التوريد غير متوافقة مع وحدة المخزون');
        const receivedBaseQty = baseQtyDecimal.toNumber();
        const landedCost = new Prisma.Decimal(landedUnitCost).div(multiplier).toDecimalPlaces(6);
        const sellingPrice = item.sellingPrice || new Prisma.Decimal(landedUnitCost).times(1.25);

        if (batch) {
          const newQty = batch.quantityInBase + receivedBaseQty;
          batch = await tx.batch.update({
            where: { id: batch.id },
            data: {
              quantityInBase: newQty,
              quantity: newQty,
              costPrice: batch && multiplier === 1000 ? new Prisma.Decimal(batch.costPrice).times(batch.quantityInBase).plus(landedCost.times(receivedBaseQty)).div(newQty).toDecimalPlaces(6) : landedCost,
              salePrice: sellingPrice,
              expiryDate: item.expiryDate,
            },
          });
        } else {
          batch = await tx.batch.create({
            data: {
              branchId: order.branchId,
              medicineId: item.medicineId,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              costPrice: landedCost,
              salePrice: sellingPrice,
              quantityInBase: receivedBaseQty,
              quantity: receivedBaseQty,
            },
          });
        }

        // ربط معرف الدفعة في سطر أمر الشراء
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: {
            batchId: batch.id,
            allocatedExpense: new Prisma.Decimal(allocatedExpense),
            landedCost,
          },
        });

        // إضافة سجل حركة التدقيق المخزني (Audit Log)
        await tx.inventoryTransaction.create({
          data: {
            batchId: batch.id,
            branchId: order.branchId,
            transactionType: TransactionType.PURCHASE,
            quantity: receivedBaseQty,
            runningBalance: batch.quantityInBase,
            unitCost: landedCost,
            referenceId: order.orderNumber,
            userId: userId,
          },
        });
      }

      // تحديث مديونية المورد
      const remainingDebt = Number(order.totalAmount) - Number(order.paidAmount);
      if (remainingDebt > 0) {
        await tx.supplier.update({
          where: { id: order.supplierId },
          data: { currentDebt: { increment: remainingDebt } },
        });
      }

      // تحديث حالة أمر الشراء والمستلم
      const updatedOrder = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseStatus.RECEIVED,
          receivedBy: userId,
          receivedAt: new Date(),
        },
        include: {
          supplier: true,
          branch: true,
          items: {
            include: {
              medicine: true,
              batch: true,
            },
          },
        },
      });

      // صندوق صادر محاسبي دائم داخل معاملة الاستلام نفسها.
      await tx.accountingOutbox.create({
        data: {
          eventType: 'PURCHASE_RECEIVED',
          status: 'PENDING',
          payload: {
          purchaseOrderId: order.id,
          orderNumber: order.orderNumber,
          companyId: order.companyId,
          branchId: order.branchId,
          supplierId: order.supplierId,
          totalCost: Number(order.totalAmount),
          paidAmount: Number(order.paidAmount),
          remainingDebt,
          additionalExpenses,
          expenseAllocationMethod: order.expenseAllocationMethod || 'LANDED_COST',
          expenseNotes: order.expenseNotes || undefined,
          createdBy: userId,
          },
        },
      });

      return updatedOrder;
    });
  }

  /**
   * 3. التوريد والاستلام المباشر في خطوة واحدة (Direct Receive)
   */
  async directReceive(dto: CreatePurchaseOrderDto, userId: string, actor?: AuthenticatedUser) {
    const created = await this.create(dto, userId, actor);
    return await this.receiveOrder(created.id, userId, actor);
  }

  /**
   * 4. جلب أوامر الشراء مع التصفية والبحث
   */
  async findAll(query: QueryPurchaseOrdersDto, actor?: AuthenticatedUser) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = { companyId: actor?.companyId || undefined };
    if (actor?.branchId) where.branchId = actor.branchId;
    else if (query.branchId) where.branchId = query.branchId;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.status) where.status = query.status;

    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
        { supplier: { companyName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, companyName: true, phone: true } },
          branch: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true } },
          paymentAllocations: { select: { amount: true } },
          purchaseReturns: { select: { totalRefund: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
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
   * 5. جلب تفاصيل أمر شراء محدد
   */
  async findOne(id: string, actor?: AuthenticatedUser) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        branch: true,
        paymentAllocations: { select: { amount: true } },
        purchaseReturns: { select: { totalRefund: true } },
        items: {
          include: {
            medicine: { select: { id: true, tradeName: true, scientificName: true, code: true } },
            batch: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('أمر الشراء غير موجود');
    }
    if (actor?.companyId && order.companyId !== actor.companyId) throw new NotFoundException('أمر الشراء غير موجود');
    if (actor?.branchId && order.branchId !== actor.branchId) throw new NotFoundException('أمر الشراء غير موجود');

    return order;
  }

  /**
   * 6. إلغاء أمر شراء معلق
   */
  async cancelOrder(id: string, actor?: AuthenticatedUser) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('أمر الشراء غير موجود');
    if (!actor || order.companyId !== actor.companyId || (actor.branchId && order.branchId !== actor.branchId)) throw new NotFoundException('أمر الشراء غير موجود');
    if (order.status !== PurchaseStatus.PENDING) {
      throw new BadRequestException('لا يمكن إلغاء أمر شراء تم استلامه');
    }

    const cancelled = await this.prisma.purchaseOrder.updateMany({
      where: { id, status: PurchaseStatus.PENDING },
      data: { status: PurchaseStatus.CANCELLED },
    });
    if (cancelled.count !== 1) throw new BadRequestException('تم تغيير حالة أمر الشراء بواسطة مستخدم آخر');
    return this.prisma.purchaseOrder.findUnique({ where: { id } });
  }
}
