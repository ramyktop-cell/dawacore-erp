import { AuthenticatedUser } from '../auth/security.policy';
import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateSaleReturnDto, CreateReturnDto } from './dto/create-return.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * توليد رقم تسلسلي ذري وآمن ضد تضارب التزامن (Race Conditions)
   */
  private async getNextSequenceNumber(
    tx: Prisma.TransactionClient,
    type: string,
    year: number,
    branchId: string,
  ): Promise<string> {
    const seq = await tx.documentSequence.upsert({
      where: {
        type_year_branchId: { type, year, branchId },
      },
      update: {
        lastValue: { increment: 1 },
      },
      create: {
        type,
        year,
        branchId,
        lastValue: 1,
      },
    });

    return `RET-${year}-${String(seq.lastValue).padStart(5, '0')}`;
  }

  /**
   * إنشاء مرتجع مبيعات كامل مع:
   * - Pessimistic Locking على الفاتورة الأصلية
   * - احتساب التكلفة التاريخية (Historical Cost)
   * - توزيع الخصم النسبي
   * - معالجة التالف والسليم بشكل منفصل
   * - Transactional Outbox Pattern لمنع الترحيل المزدوج
   */
  async create(dto: CreateReturnDto, userId?: string, actor?: AuthenticatedUser) {
    const saleId = dto.saleId || dto.originalSaleId;
    if (!saleId) {
      throw new BadRequestException('يجب تحديد معرف الفاتورة الأصلية');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('لا يمكن إنشاء مرتجع مبيعات بدون أصناف');
    }

    if (new Set(dto.items.map(item=>item.saleItemId)).size !== dto.items.length) throw new BadRequestException('لا يجوز تكرار بند المرتجع في نفس الطلب');
    if (!actor) throw new ForbiddenException('تسجيل الدخول مطلوب');
    const effectiveUserId = actor.id;

    // ==========================================
    // تنفيذ العملية بالكامل داخل معاملة ذرية واحدة
    // ==========================================
    const result = await this.prisma.$transaction(
      async (tx) => {
        // ------------------------------------------
        // 1. قفل الفاتورة الأصلية تشاؤمياً (Pessimistic Locking)
        // ------------------------------------------
        const lockedSales = await tx.$queryRaw<any[]>`
          SELECT * FROM "Sale" WHERE "id" = ${saleId} FOR UPDATE
        `;

        if (!lockedSales || lockedSales.length === 0) {
          throw new NotFoundException('الفاتورة الأصلية غير موجودة');
        }

        const sale = lockedSales[0];

        if (sale.status === 'RETURNED') {
          throw new BadRequestException('تم إرجاع هذه الفاتورة بالكامل مسبقاً');
        }

        const branchId = sale.branchId;
        if (dto.branchId && dto.branchId !== branchId) throw new ForbiddenException('المرتجع يجب أن يتم في فرع الفاتورة');
        const branch = await tx.branch.findUnique({where:{id:branchId}});
        if (!branch || (actor.branchId && actor.branchId !== branchId) || (actor.role !== 'SUPER_ADMIN' && actor.companyId !== branch.companyId)) throw new ForbiddenException('لا يمكنك إرجاع فاتورة من فرع أو شركة أخرى');

        // ------------------------------------------
        // 2. جلب بنود الفاتورة
        // ------------------------------------------
        const saleItems = await tx.saleItem.findMany({
          where: { saleId },
          include: { batch: { include: { medicine: true } } },
        });

        // ------------------------------------------
        // 3. احتساب نسبة الخصم الموزع
        // ------------------------------------------
        const grossTotal = Number(sale.subTotal || sale.grandTotal || 0);
        const discountRatio =
          grossTotal > 0 ? Number(sale.discountTotal || 0) / grossTotal : 0;

        let totalRefundAmount = new Prisma.Decimal(0);
        let totalRestockedCost = new Prisma.Decimal(0);
        let totalDamagedCost = new Prisma.Decimal(0);
        const returnItemsToCreate: any[] = [];

        // ------------------------------------------
        // 4. التحقق الحرج من الكميات واحتساب التكلفة التاريخية
        // ------------------------------------------
        for (const item of dto.items) {
          const saleItem = saleItems.find((si) => si.id === item.saleItemId);
          if (!saleItem) {
            throw new BadRequestException(
              `بند الفاتورة ${item.saleItemId} غير موجود في هذه الفاتورة`,
            );
          }

          const multiplier = saleItem.multiplier || 1;
          const returnQty = item.returnQuantity !== undefined ? item.returnQuantity : (item.quantity || 0);
          if (returnQty <= 0) {
            throw new BadRequestException('الكمية المرتجعة يجب أن تكون أكبر من الصفر');
          }

          const baseDecimal = new Prisma.Decimal(returnQty).times(multiplier);
          if (!baseDecimal.isInteger()) throw new BadRequestException('المرتجع يجب أن يطابق دقة الوحدة الأساسية');
          const returnBaseQty = baseDecimal.toNumber();
          const remainingBaseToReturn = saleItem.totalBaseQty - saleItem.returnedQty;

          if (returnBaseQty > remainingBaseToReturn) {
            const medName = (saleItem.batch as any)?.medicine?.tradeName || 'الصنف المحدد';
            throw new BadRequestException(
              `الكمية المرتجعة (${returnQty}) أكبر من المتاحة للإرجاع (${remainingBaseToReturn / multiplier}) للصنف ${medName}`,
            );
          }

          // السعر الفعلي المسترد للبند بعد توزيع الخصم
          const originalUnitPrice = new Prisma.Decimal(saleItem.unitPrice);
          const effectiveUnitPrice = originalUnitPrice.minus(
            originalUnitPrice.times(discountRatio),
          );
          const itemRefund = effectiveUnitPrice.times(returnQty).toDecimalPlaces(2);

          totalRefundAmount = totalRefundAmount.plus(itemRefund);

          // ✅ استخدام التكلفة التاريخية المخزنة لحظة البيع (وليس batch.costPrice الحالي)
          const historicalUnitCost = new Prisma.Decimal(
            saleItem.costPrice || 0,
          );
          const itemTotalCost = historicalUnitCost.times(returnBaseQty);

          const isDamaged = item.isDamaged || item.condition === 'DAMAGED';

          if (isDamaged) {
            totalDamagedCost = totalDamagedCost.plus(itemTotalCost);
          } else {
            totalRestockedCost = totalRestockedCost.plus(itemTotalCost);
          }

          returnItemsToCreate.push({
            saleItemId: item.saleItemId,
            batchId: saleItem.batchId,
            quantity: returnQty,
            multiplier,
            baseQuantity: returnBaseQty,
            unitPrice: effectiveUnitPrice,
            originalUnitPrice: saleItem.unitPrice,
            refundAmount: itemRefund,
            costPrice: historicalUnitCost,
            condition: isDamaged ? 'DAMAGED' : 'RESTOCKABLE',
            isDamaged,
          });
        }

        // ------------------------------------------
        // 5. توليد رقم المرتجع ذرياً
        // ------------------------------------------
        const currentYear = new Date().getFullYear();
        const returnNumber = await this.getNextSequenceNumber(
          tx,
          'RETURN',
          currentYear,
          branchId,
        );

        // ------------------------------------------
        // 6. إنشاء رأس المرتجع
        // ------------------------------------------
        const salesReturn = await tx.saleReturn.create({
          data: {
            returnNumber,
            originalSaleId: saleId,
            branchId,
            cashierId: effectiveUserId,
            shiftId: dto.shiftId || sale.shiftId,
            reason: dto.reason || 'طلب العميل',
            refundMethod: dto.refundMethod,
            totalRefund: totalRefundAmount,
            createdBy: effectiveUserId,
          },
        });

        // ------------------------------------------
        // 7. معالجة بنود المرتجع وحركات المخزون
        // ------------------------------------------
        for (const item of returnItemsToCreate) {
          // 7.1 إنشاء بند المرتجع
          await tx.saleReturnItem.create({
            data: {
              saleReturnId: salesReturn.id,
              saleItemId: item.saleItemId,
              batchId: item.batchId,
              quantity: item.quantity,
              multiplier: item.multiplier,
              baseQuantity: item.baseQuantity,
              unitPrice: item.unitPrice,
              costPrice: item.costPrice,
              refundAmount: item.refundAmount,
              condition: item.condition,
              isDamaged: item.isDamaged,
            },
          });

          // 7.2 تحديث الكمية المرتجعة تحت القفل
          await tx.saleItem.update({
            where: { id: item.saleItemId },
            data: { returnedQty: { increment: item.baseQuantity } },
          });

          if (!item.isDamaged) {
            // ============================================
            // 7.3 البضاعة السليمة: تعود للمخزون بالتكلفة التاريخية
            // ============================================
            const updatedBatch = await tx.batch.update({
              where: { id: item.batchId },
              data: {
                quantityInBase: { increment: item.baseQuantity },
                quantity: { increment: item.baseQuantity },
              },
            });

            await tx.inventoryTransaction.create({
              data: {
                batchId: item.batchId,
                branchId,
                transactionType: 'SALE_RETURN',
                quantity: item.baseQuantity,
                runningBalance: updatedBatch.quantityInBase, // ✅ الرصيد الفعلي بعد الإضافة
                unitCost: item.costPrice,
                referenceId: returnNumber,
                userId: effectiveUserId,
                notes: 'مرتجع مبيعات سليم - أضيف للمخزون',
              },
            });
          } else {
            // ============================================
            // 7.4 البضاعة التالفة: تُسجَّل كخسارة دون إضافتها للمخزون
            // ============================================
            const currentBatch = await tx.batch.findUnique({
              where: { id: item.batchId },
              select: { quantityInBase: true },
            });

            await tx.inventoryTransaction.create({
              data: {
                batchId: item.batchId,
                branchId,
                transactionType: 'DAMAGED_RETURN',
                quantity: 0, // لا يعود للرصيد الفعلي المتاح للبيع
                runningBalance: currentBatch?.quantityInBase || 0,
                unitCost: item.costPrice,
                referenceId: returnNumber,
                userId: effectiveUserId,
                notes: 'مرتجع تالف - لم يُضف للمخزون (خسارة تلف)',
              },
            });
          }
        }

        // ------------------------------------------
        // 8. تحديث حالة الفاتورة الأصلية
        // ------------------------------------------
        const updatedSaleItems = await tx.saleItem.findMany({
          where: { saleId },
        });
        const allReturned = updatedSaleItems.every(
          (si) => si.returnedQty >= si.totalBaseQty,
        );

        await tx.sale.update({
          where: { id: saleId },
          data: {
            status: allReturned ? 'RETURNED' : 'PARTIAL_RETURN',
          },
        });

        // ------------------------------------------
        // 9. تسجيل الحدث في الـ Outbox (Transactional Outbox Pattern)
        // ------------------------------------------
        const outboxPayload = {
          returnId: salesReturn.id,
          returnNumber,
          saleId,
          companyId: branch.companyId,
          branchId,
          totalRefund: totalRefundAmount.toNumber(),
          totalRestockedCost: totalRestockedCost.toNumber(),
          totalDamagedCost: totalDamagedCost.toNumber(),
          refundMethod: dto.refundMethod,
          userId: effectiveUserId,
        };

        const outboxEntry = await tx.accountingOutbox.create({
          data: {
            eventType: 'SALE_RETURNED',
            payload: outboxPayload,
            status: 'PENDING',
          },
        });

        return {
          salesReturn,
          outboxPayload,
          outboxId: outboxEntry.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );

    // ==========================================
    // 10. إطلاق الحدث بعد نجاح الـ Commit بالكامل
    // ==========================================
    try {
      await this.prisma.accountingOutbox.update({
        where: { id: result.outboxId },
        data: {
          status: 'PROCESSING',
          processedBy: 'instant-emit',
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `فشل تحديث حالة الـ Outbox ${result.outboxId}: ${error.message}. سيتولى الـ Worker المعالجة.`,
      );
    }

    // إطلاق الحدث للمعالجة الفورية
    this.eventEmitter.emit('sale.returned', {
      ...result.outboxPayload,
      outboxId: result.outboxId,
    });

    return {
      success: true,
      message: 'تم تسجيل المرتجع وتحديث الأرصدة بدقة',
      returnNumber: result.salesReturn.returnNumber,
      totalRefund: result.salesReturn.totalRefund.toString(),
      refundMethod: result.salesReturn.refundMethod,
      returnId: result.salesReturn.id,
      salesReturn: result.salesReturn,
    };
  }

  /**
   * التوافق العكسي مع الكنترولر القديم
   */
  async createReturn(dto: CreateSaleReturnDto, userId?: string, actor?: AuthenticatedUser) {
    return await this.create(dto, userId, actor);
  }

  /**
   * جلب جميع المرتجعات
   */
  async findAll(params: {
    branchId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }, actor?: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException('تسجيل الدخول مطلوب');
    const { branchId, from, to, page = 1, limit = 20 } = params;
    const where: Prisma.SaleReturnWhereInput = {};

    if (branchId && actor.branchId && branchId !== actor.branchId) throw new ForbiddenException('الفرع غير مسموح');
    where.branchId = actor.branchId || branchId;
    if (actor.role !== 'SUPER_ADMIN') where.branch = { companyId: actor.companyId };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.saleReturn.findMany({
        where,
        include: {
          originalSale: {
            select: {
              invoiceNumber: true,
              grandTotal: true,
            },
          },
          items: {
            include: {
              batch: {
                include: { medicine: { select: { tradeName: true, barcode: true } } },
              },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.saleReturn.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * جلب مرتجع واحد مع تفاصيله
   */
  private async assertBranch(branchId: string, actor?: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException('تسجيل الدخول مطلوب');
    const branch=await this.prisma.branch.findUnique({where:{id:branchId}});
    if (!branch || (actor.branchId && actor.branchId !== branchId) || (actor.role !== 'SUPER_ADMIN' && branch.companyId !== actor.companyId)) throw new ForbiddenException('الفرع غير مسموح');
  }
  async findOne(id: string, actor?: AuthenticatedUser) {
    const salesReturn = await this.prisma.saleReturn.findUnique({
      where: { id },
      include: {
        originalSale: { include: { customer: true, branch: true } },
        items: {
          include: {
            batch: { include: { medicine: true } },
            saleItem: true,
          },
        },
      },
    });
    if (!salesReturn) throw new NotFoundException('المرتجع غير موجود');
    await this.assertBranch(salesReturn.branchId, actor);
    return salesReturn;
  }

  /**
   * البحث عن فاتورة أصلية بواسطة رقمها لبدء عملية إرجاع
   */
  async findSaleForReturn(invoiceNumber: string, actor?: AuthenticatedUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { invoiceNumber },
      include: {
        items: {
          include: {
            batch: {
              include: {
                medicine: { select: { tradeName: true, barcode: true, code: true } },
              },
            },
          },
        },
        customer: { select: { name: true, phone: true } },
      },
    });

    if (!sale) throw new NotFoundException('الفاتورة غير موجودة');
    if (sale.status === 'RETURNED') {
      throw new BadRequestException('تم إرجاع هذه الفاتورة بالكامل');
    }
    await this.assertBranch(sale.branchId, actor);
    return sale;
  }
}

