import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Batch, UnitType, Prisma } from '@prisma/client';

export interface BatchAllocationRecord {
  batchId: string;
  batchNumber: string;
  deductedBaseQty: number;
  remainingBatchQty: number;
  unitCost: string;
  transactionId: string;
}

export interface ReservationExecutionResult {
  success: boolean;
  medicineId: string;
  totalRequestedBaseQty: number;
  allocations: BatchAllocationRecord[];
}

@Injectable()
export class StockReservationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * استخراج المعامل وحساب الكمية بالوحدة الأساسية (الحبة)
   */
  async calculateBaseQuantity(
    medicineId: string,
    unitType: UnitType,
    quantity: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = externalTx && (externalTx as any).medicineUnit ? externalTx : this.prisma;
    const unit = await client.medicineUnit.findUnique({
      where: {
        medicineId_unitType: { medicineId, unitType },
      },
    });

    if (!unit) {
      throw new BadRequestException(`الوحدة (${unitType}) غير مسجلة لهذا الدواء.`);
    }

    const raw = new Prisma.Decimal(quantity).times(unit.multiplier);
    if (!raw.isInteger() || raw.lessThan(1) || raw.greaterThan(2147483647)) throw new BadRequestException('الكمية لا تطابق دقة الوحدة الأساسية: للصنف الموزون أدخل جرامات كاملة');
    return raw.toNumber();
  }

  /**
   * تنفيذ الخصم الذري الآمن وفق FEFO مع القفل الحصري وتغطية تعدد الدفعات
   */
  async executeReservationWithLock(
    medicineId: string,
    branchId: string,
    unitType: UnitType,
    quantity: number,
    userId: string,
    invoiceNumber: string,
    externalTx?: Prisma.TransactionClient,
  ): Promise<ReservationExecutionResult> {
    const totalRequiredBaseQty = await this.calculateBaseQuantity(medicineId, unitType, quantity, externalTx);

    const runInTx = async (tx: Prisma.TransactionClient) => {
      // 1. ضبط مهلة القفل الحصري داخل المعاملة لتجنب تجميد الخادم مع استيعاب ذروة 4-10 نقاط بيع متزامنة
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s';`);

      // 2. قفل واختيار الدفعات الصالحة بالفرز الصارم حسب تاريخ الصلاحية
      const availableBatches = await tx.$queryRaw<Batch[]>`
        SELECT * FROM "Batch"
        WHERE "medicineId" = ${medicineId}
          AND "branchId" = ${branchId}
          AND "expiryDate" > NOW()
          AND "quantityInBase" > 0
          AND "isFrozen" = FALSE
        ORDER BY "expiryDate" ASC
        FOR UPDATE
      `;

      // 3. التحقق من كفاية الإجمالي التراكمي
      const totalAvailable = availableBatches.reduce((sum, b) => sum + b.quantityInBase, 0);
      if (totalAvailable < totalRequiredBaseQty) {
        throw new ConflictException(
          `الرصيد المتاح حالياً (${totalAvailable} حبة) لا يكفي لتغطية المطلوب (${totalRequiredBaseQty} حبة).`
        );
      }

      let pendingDeduction = totalRequiredBaseQty;
      const allocations: BatchAllocationRecord[] = [];

      // 4. السحب التدريجي من الدفعات حسب الترتيب
      for (const batch of availableBatches) {
        if (pendingDeduction <= 0) break;

        const takeFromBatch = Math.min(batch.quantityInBase, pendingDeduction);
        const newRunningBalance = batch.quantityInBase - takeFromBatch;

        // تحديث رصيد الدفعة الحالية
        const updatedBatch = await tx.batch.update({
          where: { id: batch.id },
          data: {
            quantity: newRunningBalance,
            quantityInBase: {
              decrement: takeFromBatch,
            },
          },
        });

        // تسجيل أثر الحركة داخل سجل التدقيق غير القابل للتعديل
        const transactionRecord = await tx.inventoryTransaction.create({
          data: {
            batchId: batch.id,
            branchId: branchId,
            transactionType: 'SALE',
            quantity: -takeFromBatch,
            runningBalance: newRunningBalance,
            unitCost: batch.costPrice,
            referenceId: invoiceNumber,
            userId: userId,
          },
        });

        allocations.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          deductedBaseQty: takeFromBatch,
          remainingBatchQty: updatedBatch.quantityInBase,
          unitCost: batch.costPrice.toString(),
          transactionId: transactionRecord.id,
        });

        pendingDeduction -= takeFromBatch;
      }

      return {
        success: true,
        medicineId,
        totalRequestedBaseQty: totalRequiredBaseQty,
        allocations,
      };
    };

    if (externalTx) {
      return await runInTx(externalTx);
    }

    return await this.prisma.$transaction(runInTx);
  }
}
