import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../inventory/stock-reservation.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PaymentMethod, Prisma } from '@prisma/client';
import { AuthenticatedUser, POLICY } from '../auth/security.policy';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockReservationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createSale(dto: CreateSaleDto, actor?: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException('هوية المستخدم مطلوبة');
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('لا يمكن إنشاء فاتورة فارغة');
    }

    if (!dto.payments || dto.payments.length === 0) {
      throw new BadRequestException('يجب إضافة دفعة مالية واحدة على الأقل');
    }

    // تنفيذ المعاملة الذرية بكامل خطواتها
    const sale = await this.prisma.$transaction(async (tx) => {
      // 1. استخراج المعرف الفعلي للفرع والشركة
      let effectiveBranchId = dto.branchId;
      const effectiveCompanyId = actor.companyId;

      const branchRecord = await tx.branch.findFirst({ where: { id: dto.branchId, companyId: actor.companyId } });
      if (!branchRecord || (actor.branchId && actor.branchId !== branchRecord.id)) throw new ForbiddenException('الفرع خارج نطاق المستخدم');
      effectiveBranchId = branchRecord.id;

      // 2. استخراج المعرف الفعلي للكاشير
      const effectiveCashierId = actor.id;
      if (dto.cashierId && dto.cashierId !== actor.id) throw new ForbiddenException('لا يمكن البيع باسم كاشير آخر');

      // 3. التحقق من الوردية (Shift) المفتوحة
      let shift: any = null;
      if (dto.shiftId) {
        shift = await tx.shift.findFirst({
          where: {
            id: dto.shiftId,
            status: 'OPEN',
            branchId: effectiveBranchId,
            companyId: actor.companyId,
            userId: actor.id,
          },
        });
        if (!shift) {
          throw new BadRequestException('الوردية المحددة مغلقة أو غير موجودة');
        }
      } else {
        shift = await tx.shift.findFirst({ where: { status: 'OPEN', branchId: effectiveBranchId, companyId: actor.companyId, userId: actor.id } });
        if (!shift) throw new BadRequestException('لا توجد وردية مفتوحة للكاشير الحالي');
      }

      if (shift.companyId !== actor.companyId || shift.branchId !== effectiveBranchId || shift.userId !== actor.id) throw new ForbiddenException('الوردية خارج نطاق المستخدم');

      // 4. توليد رقم الفاتورة التسلسلي الآمن
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const currentYear = new Date().getFullYear();
      let seqNumber = 1;

      if (typeof tx.documentSequence?.upsert === 'function') {
        const seq = await tx.documentSequence.upsert({
          where: {
            type_year_branchId: {
              type: 'SALE',
              year: currentYear,
              branchId: effectiveBranchId,
            },
          },
          update: {
            lastValue: { increment: 1 },
          },
          create: {
            type: 'SALE',
            year: currentYear,
            branchId: effectiveBranchId,
            lastValue: 1,
          },
        });
        seqNumber = seq.lastValue;
      } else if (typeof tx.sale?.count === 'function') {
        const dailyCount = await tx.sale.count({
          where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        seqNumber = dailyCount + 1;
      } else if (typeof this.prisma.sale?.count === 'function') {
        const dailyCount = await this.prisma.sale.count({
          where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        seqNumber = dailyCount + 1;
      }

      const invoiceNumber = `INV-${today}-${String(seqNumber).padStart(5, '0')}`;

      // 5. التحقق من العميل
      let effectiveCustomerId: string | null = null;
      if (dto.customerId) {
        if (typeof tx.$queryRaw === 'function') await tx.$queryRaw(Prisma.sql`SELECT id FROM "Customer" WHERE id = ${dto.customerId} FOR UPDATE`);
        const cust = await tx.customer.findFirst({ where: { id: dto.customerId, companyId: effectiveCompanyId, branchId: effectiveBranchId, isActive: true } });
        if (!cust) throw new BadRequestException('العميل غير موجود أو غير نشط في هذا الفرع');
        effectiveCustomerId = cust.id;
      }

      // 6. الجلب المسبق للأدوية والوحدات دفعة واحدة (Bulk Pre-fetching لمنع N+1 Queries)
      const medicineIds = Array.from(new Set(dto.items.map((i) => i.medicineId)));
      const unitMap = new Map<string, any>();

      if (typeof tx.medicineUnit?.findMany === 'function') {
        const medicineUnits = await tx.medicineUnit.findMany({
          where: { medicineId: { in: medicineIds } },
          include: { medicine: { select: { isWeighed: true } } },
        });
        for (const u of medicineUnits) {
          unitMap.set(`${u.medicineId}_${u.unitType}`, u);
        }
      }

      let subTotal = new Prisma.Decimal(0);
      const saleItemsToCreate: Prisma.SaleItemCreateManySaleInput[] = [];

      const allowedOverrideRoles = (POLICY['sales:price-override'] as readonly string[]) || [];
      const userRoles = actor.roles && actor.roles.length > 0 ? actor.roles : (actor.role ? [actor.role] : []);
      const hasOverridePermission = userRoles.some((r) => allowedOverrideRoles.includes(r));
      const priceOverrides: Array<{
        medicineId: string;
        unitType: any;
        originalUnitPrice: string;
        newUnitPrice: string;
        minSalePrice: string;
        reason: string;
        quantity: number;
      }> = [];

      // 7. التحقق وحجز المخزون بنظام FEFO لكل بند
      for (const item of dto.items) {
        let medUnit = unitMap.get(`${item.medicineId}_${item.unitType}`);
        if (!medUnit && typeof tx.medicineUnit?.findUnique === 'function') {
          medUnit = await tx.medicineUnit.findUnique({
            where: { medicineId_unitType: { medicineId: item.medicineId, unitType: item.unitType } },
            include: { medicine: { select: { isWeighed: true } } },
          });
        }

        if (!medUnit) {
          throw new BadRequestException(`الوحدة ${item.unitType} غير معرفة لهذا الدواء`);
        }

        let itemUnitPrice: Prisma.Decimal;
        try {
          if (item.unitPrice === undefined || item.unitPrice === null || item.unitPrice === '') {
            throw new Error();
          }
          itemUnitPrice = new Prisma.Decimal(item.unitPrice);
          if (itemUnitPrice.isNaN() || !itemUnitPrice.isFinite() || itemUnitPrice.isNegative()) {
            throw new Error();
          }
        } catch {
          throw new BadRequestException('سعر الوحدة يجب أن يكون رقماً مالياً صالحاً وغير سالب');
        }

        const isPriceOverridden = !itemUnitPrice.equals(medUnit.price);

        if (isPriceOverridden) {
          if (medUnit.medicine?.isWeighed) {
            throw new BadRequestException('لا يمكن تعديل سعر الصنف الموزون');
          }

          if (!hasOverridePermission) {
            throw new ForbiddenException('ليس لديك صلاحية تعديل سعر البيع');
          }

          const trimmedReason = typeof item.priceOverrideReason === 'string' ? item.priceOverrideReason.trim() : '';
          if (!trimmedReason || trimmedReason.length < 3 || trimmedReason.length > 500) {
            throw new BadRequestException('تعديل سعر البيع يتطلب سبباً لا يقل عن 3 أحرف ولا يزيد عن 500 حرف');
          }

          const minSalePrice = medUnit.minSalePrice !== undefined && medUnit.minSalePrice !== null
            ? new Prisma.Decimal(medUnit.minSalePrice)
            : new Prisma.Decimal(0);

          if (itemUnitPrice.lessThan(minSalePrice)) {
            throw new BadRequestException(`سعر البيع المعدل (${itemUnitPrice}) أقل من الحد الأدنى المسموح به (${minSalePrice})`);
          }

          priceOverrides.push({
            medicineId: item.medicineId,
            unitType: item.unitType,
            originalUnitPrice: medUnit.price.toString(),
            newUnitPrice: itemUnitPrice.toString(),
            minSalePrice: minSalePrice.toString(),
            reason: trimmedReason,
            quantity: Number(item.quantity),
          });
        }

        if (medUnit.medicine?.isWeighed && item.unitType === 'UNIT' && medUnit.multiplier !== 1000) {
          throw new BadRequestException('وحدة الكيلو للصنف الموزون يجب أن تساوي 1000 جرام؛ أعد تحميل بيانات الصنف');
        }

        // حجز وخصم المخزون بنظام FEFO داخل المعاملة
        const reservation = await this.stockService.executeReservationWithLock(
          item.medicineId,
          effectiveBranchId,
          item.unitType,
          item.quantity,
          effectiveCashierId,
          invoiceNumber,
          tx,
        );

        const itemQtyDec = new Prisma.Decimal(item.quantity);
        const lineTotal = itemUnitPrice.times(itemQtyDec).toDecimalPlaces(2);
        subTotal = subTotal.plus(lineTotal);

        // تفكيك السحب وفق الدفعات المنصرفة لضمان دقة التكلفة (COGS) لكل دفعة
        if (reservation.allocations.length === 1) {
          const alloc = reservation.allocations[0];
          saleItemsToCreate.push({
            batchId: alloc.batchId,
            unitType: item.unitType,
            multiplier: medUnit.multiplier,
            quantity: itemQtyDec,
            totalBaseQty: alloc.deductedBaseQty,
            unitPrice: itemUnitPrice,
            costPrice: new Prisma.Decimal(alloc.unitCost),
            totalPrice: lineTotal,
          });
        } else {
          let allocatedLineTotal = new Prisma.Decimal(0);
          for (const [index, alloc] of reservation.allocations.entries()) {
            const allocQtyInSelectedUnit = alloc.deductedBaseQty / medUnit.multiplier;
            const allocatedTotal = index === reservation.allocations.length - 1 ? lineTotal.minus(allocatedLineTotal) : itemUnitPrice.times(allocQtyInSelectedUnit).toDecimalPlaces(2);
            allocatedLineTotal = allocatedLineTotal.plus(allocatedTotal);
            saleItemsToCreate.push({
              batchId: alloc.batchId,
              unitType: item.unitType,
              multiplier: medUnit.multiplier,
              quantity: new Prisma.Decimal(allocQtyInSelectedUnit),
              totalBaseQty: alloc.deductedBaseQty,
              unitPrice: itemUnitPrice,
              costPrice: new Prisma.Decimal(alloc.unitCost),
              totalPrice: allocatedTotal,
            });
          }
        }
      }

      // 8. حساب الخصم والإجمالي الصافي
      const discountDec = new Prisma.Decimal(dto.discountTotal || 0);
      const grandTotal = subTotal.minus(discountDec);

      if (grandTotal.isNegative()) {
        throw new BadRequestException('قيمة الخصم تتجاوز إجمالي الفاتورة');
      }

      // 9. حساب المدفوعات والباقي
      let totalPaid = new Prisma.Decimal(0);
      let creditAmount = new Prisma.Decimal(0);
      for (const p of dto.payments) {
        totalPaid = totalPaid.plus(new Prisma.Decimal(p.amount));
        if (p.method === PaymentMethod.CREDIT) creditAmount = creditAmount.plus(new Prisma.Decimal(p.amount));
      }

      if (totalPaid.lessThan(grandTotal)) {
        throw new BadRequestException(`المبلغ المدفوع (${totalPaid}) أقل من المطلوب (${grandTotal})`);
      }
      if (creditAmount.greaterThan(grandTotal)) throw new BadRequestException('قيمة البيع الآجل تتجاوز قيمة الفاتورة');
      if (creditAmount.greaterThan(0) && !effectiveCustomerId) throw new BadRequestException('اختر عميلاً من نفس الفرع للبيع الآجل');

      const cashPaid = totalPaid.minus(creditAmount);
      const changeAmount = totalPaid.minus(grandTotal);
      const determinedMethod = dto.payments.length > 1 ? PaymentMethod.MIXED : dto.payments[0].method;

      // 10. إدخال الفاتورة وبنودها ومدفوعاتها ذرياً
      const newSale = await tx.sale.create({
        data: {
          invoiceNumber,
          branchId: effectiveBranchId,
          cashierId: effectiveCashierId,
          shiftId: shift.id,
          customerId: effectiveCustomerId,
          subTotal,
          discountTotal: discountDec,
          taxTotal: new Prisma.Decimal(0),
          grandTotal,
          paidAmount: cashPaid,
          changeAmount,
          paymentMethod: determinedMethod,
          items: {
            createMany: {
              data: saleItemsToCreate,
            },
          },
          payments: {
            createMany: {
              data: dto.payments.map((p) => ({
                method: p.method,
                amount: new Prisma.Decimal(p.amount),
                referenceNo: p.referenceNo || null,
              })),
            },
          },
        },
        include: { items: true, payments: true, customer: { select: { id: true, name: true } } },
      });

      let customerBalance: { previousDebt: string; creditAmount: string; debtAfter: string } | null = null;
      if (creditAmount.greaterThan(0) && effectiveCustomerId) {
        const customer = await tx.customer.findUnique({ where: { id: effectiveCustomerId } });
        const currentDebt = new Prisma.Decimal(customer!.currentDebt);
        const creditLimit = new Prisma.Decimal(customer!.creditLimit);
        const newDebt = currentDebt.plus(creditAmount);
        customerBalance = { previousDebt: currentDebt.toFixed(2), creditAmount: creditAmount.toFixed(2), debtAfter: newDebt.toFixed(2) };
        if (creditLimit.greaterThan(0) && newDebt.greaterThan(creditLimit)) throw new BadRequestException('تجاوز البيع الآجل حد ائتمان العميل');
        await tx.customer.update({ where: { id: effectiveCustomerId }, data: { currentDebt: newDebt } });
        await tx.customerTransaction.create({ data: {
          customerId: effectiveCustomerId,
          type: 'SALE',
          amount: creditAmount,
          balanceAfter: newDebt,
          referenceId: invoiceNumber,
          description: `بيع آجل من نقطة البيع، فاتورة ${invoiceNumber}`,
          createdBy: effectiveCashierId,
        } });
      }

      // التكلفة المحاسبية تُحسب من الدفعات التي صُرفت فعلياً بنظام FEFO،
      // وليس من سعر البيع أو من تكلفة الدفعة الحالية بعد إتمام العملية.
      const totalCost = newSale.items.reduce(
        (sum, item) => sum.plus(new Prisma.Decimal(item.totalBaseQty || 0).times(item.costPrice)),
        new Prisma.Decimal(0),
      );

      // 11. تحديث مبيعات الوردية (Shift Tracking مع خصم الباقي من النقد الصافي DRY)
      let cashInc = new Prisma.Decimal(0);
      let bankInc = new Prisma.Decimal(0);
      let creditInc = new Prisma.Decimal(0);

      for (const p of dto.payments) {
        const amt = new Prisma.Decimal(p.amount);
        if (p.method === PaymentMethod.CASH) {
          cashInc = cashInc.plus(amt);
        } else if (p.method === PaymentMethod.CREDIT) {
          creditInc = creditInc.plus(amt);
        } else {
          bankInc = bankInc.plus(amt);
        }
      }

      const netCashInc = cashInc.greaterThanOrEqualTo(changeAmount)
        ? cashInc.minus(changeAmount)
        : new Prisma.Decimal(0);

      if (typeof tx.shift?.update === 'function') {
        await tx.shift.update({
          where: { id: shift.id },
          data: {
            totalSales: { increment: grandTotal },
            totalSalesCash: { increment: netCashInc },
            totalSalesBank: { increment: bankInc },
            totalSalesCredit: { increment: creditInc },
            expectedCash: { increment: netCashInc },
          },
        });
      }

      // 12. تسجيل الحدث في صندوق الصادر المحاسبي (Transactional Outbox)
      if (typeof tx.accountingOutbox?.create === 'function') {
        await tx.accountingOutbox.create({
          data: {
            eventType: 'SALE_COMPLETED',
            payload: {
              saleId: newSale.id,
              invoiceNumber: newSale.invoiceNumber,
              companyId: effectiveCompanyId,
              branchId: effectiveBranchId,
              cashierId: effectiveCashierId,
              grandTotal: newSale.grandTotal.toString(),
              totalCost: totalCost.toString(),
              payments: dto.payments.map((p) => ({
                method: p.method,
                amount: p.amount,
              })),
            },
            status: 'PENDING',
          },
        });
      }

      // 13. تسجيل العملية في سجل التدقيق (AuditLog)
      if (typeof tx.auditLog?.create === 'function') {
        await tx.auditLog.create({
          data: {
            companyId: effectiveCompanyId,
            branchId: effectiveBranchId,
            userId: effectiveCashierId,
            action: 'SALE_CREATED',
            entityType: 'Sale',
            entityId: newSale.id,
            changes: {
              invoiceNumber: newSale.invoiceNumber,
              grandTotal: newSale.grandTotal.toString(),
              paidAmount: newSale.paidAmount.toString(),
              changeAmount: newSale.changeAmount.toString(),
              itemsCount: newSale.items?.length || saleItemsToCreate.length,
            },
          },
        });

        if (priceOverrides.length > 0) {
          await tx.auditLog.create({
            data: {
              companyId: effectiveCompanyId,
              branchId: effectiveBranchId,
              userId: actor.id || effectiveCashierId,
              action: 'SALE_PRICE_OVERRIDDEN',
              entityType: 'Sale',
              entityId: newSale.id,
              changes: {
                overrides: priceOverrides,
              },
            },
          });
        }
      }

      return { ...newSale, customerBalance };
    });

    // 14. إطلاق الحدث بعد نجاح المعاملة (Post-Commit Event)
    try {
      this.eventEmitter.emit('sale.completed', {
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        companyId: actor.companyId,
        branchId: sale.branchId,
        cashierId: sale.cashierId,
        grandTotal: sale.grandTotal.toString(),
        totalCost: sale.items.reduce(
          (sum, item) => sum.plus(new Prisma.Decimal(item.totalBaseQty || 0).times(item.costPrice)),
          new Prisma.Decimal(0),
        ).toString(),
        payments: dto.payments,
        timestamp: sale.createdAt,
      });
    } catch (error: any) {
      this.logger.error(`فشل إطلاق حدث المحاسبة (سيتم معالجته عبر Outbox): ${error.message}`);
    }

    return {
      success: true,
      message: 'تم إنشاء الفاتورة بنجاح وتحديث الأرصدة وسجل الحركات',
      data: {
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        grandTotal: sale.grandTotal.toString(),
        paidAmount: sale.paidAmount.toString(),
        changeAmount: sale.changeAmount.toString(),
        itemsCount: sale.items?.length || 0,
        customerBalance: sale.customerBalance,
        customer: sale.customer,
        invoiceRemainingAmount: sale.customerBalance?.creditAmount || '0.00',
      },
    };
  }

  async getHeldCarts(cashierId?: string) {
    const cleanCashierId =
      cashierId && cashierId !== 'null' && cashierId !== 'undefined' && cashierId.trim() !== ''
        ? cashierId.trim()
        : undefined;

    return await this.prisma.heldCart.findMany({
      where: {
        ...(cleanCashierId ? { cashierId: cleanCashierId } : {}),
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async holdCart(cashierId: string, branchId: string, cartData: any) {
    const cleanCashierId = cashierId && cashierId !== 'null' && cashierId !== 'undefined' ? cashierId : 'cashier-1';
    const cleanBranchId = branchId && branchId !== 'null' && branchId !== 'undefined' ? branchId : 'MAIN_BRANCH';

    const heldCart = await this.prisma.heldCart.create({
      data: {
        cashierId: cleanCashierId,
        branchId: cleanBranchId,
        cartData,
        status: 'PENDING',
      },
    });

    return {
      success: true,
      message: 'تم تعليق السلة بنجاح',
      holdId: heldCart.id,
    };
  }

  async resumeCart(holdId: string, cashierId?: string) {
    const heldCart = await this.prisma.heldCart.findUnique({ where: { id: holdId } });
    if (!heldCart || heldCart.status !== 'PENDING') {
      throw new NotFoundException('لا توجد سلة معلقة صالحة بهذا المعرف');
    }

    if (cashierId && heldCart.cashierId && heldCart.cashierId !== cashierId) {
      throw new ConflictException('لا يمكن استرجاع سلة معلقة لكاشير آخر');
    }

    await this.prisma.heldCart.update({
      where: { id: holdId },
      data: { status: 'RESUMED' },
    });

    return {
      success: true,
      cartData: heldCart.cartData,
    };
  }
}
