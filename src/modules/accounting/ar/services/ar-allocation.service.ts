import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, PaymentMethod } from '@prisma/client';

/**
 * Payment method mapping: CustomerPaymentDto → Prisma enum.
 */
function mapPaymentMethod(raw: string): PaymentMethod {
  const upper = (raw || 'CASH').toUpperCase();
  switch (upper) {
    case 'CASH':
      return 'CASH';
    case 'CARD':
      return 'CARD';
    case 'TRANSFER':
      return 'TRANSFER';
    case 'BANK_TRANSFER':
    case 'CHECK':
    case 'CHEQUE':
    case 'BANK':
      return 'BANK_TRANSFER';
    case 'MIXED':
      return 'MIXED';
    case 'CREDIT':
      return 'CREDIT';
    default:
      return 'CASH';
  }
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PaymentAllocation {
  saleId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  originalAmount: number;
  alreadyPaid: number;
  allocatedAmount: number;
  newPaidAmount: number;
  remainingAfter: number;
  fullyPaid: boolean;
}

export interface AllocationResult {
  /** إجمالي ما تم توزيعه على فواتير */
  totalAllocated: number;
  /** مبلغ متبقٍ لم يُخصَّص (الدفعة أكبر من المديونية) */
  unallocated: number;
  /** تفصيل التوزيع */
  allocations: PaymentAllocation[];
}

/**
 * ArAllocationService
 * ───────────────────
 * يوزّع دفعات العملاء على الفواتير غير المسددة بنظام FIFO.
 *
 * الميزات:
 *   ✅ FIFO: الأقدم أولاً (ASC by createdAt)
 *   ✅ دقة تاريخية: يدعم `createdAt` تاريخي
 *   ✅ Transaction-safe: يُستدعى داخل Prisma.$transaction
 *   ✅ Unallocated: يدعم دفع أكثر من المديونية (رصيد دائن)
 *   ✅ يعالج مرتجعات المبيعات بدقة لتجنب التوزيع الزائد
 *
 * ⚠️ يستخدم نفس الـ transaction client من المتصل
 */
@Injectable()
export class ArAllocationService {
  private readonly logger = new Logger(ArAllocationService.name);

  constructor() {}

  /**
   * يوزّع مبلغاً على فواتير العميل غير المسددة بنظام FIFO.
   *
   * @param tx - Prisma transaction client (من المتصل)
   * @param customerId - معرف العميل
   * @param amount - المبلغ المدفوع
   * @param paymentMethod - طريقة الدفع
   * @param referenceNo - رقم مرجعي (سند قبض)
   * @param createdAt - تاريخ الدفع (افتراضي: الآن)
   */
  async allocatePayment(
    tx: Prisma.TransactionClient,
    customerId: string,
    amount: number,
    paymentMethod: string,
    referenceNo?: string,
    createdAt?: Date,
  ): Promise<AllocationResult> {
    if (amount <= 0) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من الصفر');
    }

    const method = mapPaymentMethod(paymentMethod);
    const paymentDate = createdAt ?? new Date();

    // ─── 1. جلب الفواتير غير المسددة (ASC by createdAt) مع المرتجعات إن وجدت
    const sales = await tx.sale.findMany({
      where: {
        customerId,
        status: { in: ['COMPLETED', 'PARTIAL_RETURN'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        grandTotal: true,
        paidAmount: true,
        returns: {
          select: { totalRefund: true },
        },
      },
    });

    // ─── 2. حساب المتبقي لكل فاتورة مع خصم المسدد والمرتجعات
    const salesWithRemaining = sales
      .map((s) => {
        const grandTotal = Number(s.grandTotal);
        const paidAmount = Number(s.paidAmount);
        const totalRefund = (s.returns || []).reduce(
          (acc, r) => acc + Number(r.totalRefund || 0),
          0,
        );
        const remaining = Math.round(Math.max(0, grandTotal - paidAmount - totalRefund) * 100) / 100;
        return { ...s, grandTotal, paidAmount, remaining };
      })
      .filter((s) => s.remaining > 0.01);

    if (salesWithRemaining.length === 0) {
      this.logger.warn(
        `No unpaid sales found for customer ${customerId}. Amount ${amount} unallocated.`,
      );
      return {
        totalAllocated: 0,
        unallocated: amount,
        allocations: [],
      };
    }

    // ─── 3. توزيع المبلغ بنظام FIFO
    let remainingToAllocate = amount;
    const allocations: PaymentAllocation[] = [];

    for (const sale of salesWithRemaining) {
      if (remainingToAllocate <= 0.01) break;

      const allocatedToThisSale = Math.min(remainingToAllocate, sale.remaining);
      const newPaidAmount = Math.round((sale.paidAmount + allocatedToThisSale) * 100) / 100;
      const remainingAfter = Math.max(0, Math.round((sale.remaining - allocatedToThisSale) * 100) / 100);
      const fullyPaid = remainingAfter <= 0.01;

      // ─── 3.1 تحديث Sale.paidAmount
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: new Prisma.Decimal(newPaidAmount),
        },
      });

      // ─── 3.2 إنشاء سجل SalePayment
      await tx.salePayment.create({
        data: {
          saleId: sale.id,
          method,
          amount: new Prisma.Decimal(allocatedToThisSale),
          referenceNo: referenceNo ?? null,
          createdAt: paymentDate,
        },
      });

      allocations.push({
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        invoiceDate: sale.createdAt,
        originalAmount: sale.grandTotal,
        alreadyPaid: sale.paidAmount,
        allocatedAmount: allocatedToThisSale,
        newPaidAmount,
        remainingAfter,
        fullyPaid,
      });

      remainingToAllocate = Math.round((remainingToAllocate - allocatedToThisSale) * 100) / 100;
    }

    const totalAllocated = Math.round((amount - remainingToAllocate) * 100) / 100;

    this.logger.log(
      `Allocated ${totalAllocated.toFixed(2)} to ${allocations.length} invoice(s) for customer ${customerId} (unallocated: ${remainingToAllocate.toFixed(2)})`,
    );

    return {
      totalAllocated,
      unallocated: remainingToAllocate,
      allocations,
    };
  }
}
