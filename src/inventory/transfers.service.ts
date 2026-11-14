import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { AuthenticatedUser } from '../auth/security.policy';
import { Prisma } from '@prisma/client';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * تنفيذ عملية تحويل مخزني بين فرعين داخل معاملة ذرية واحدة
   */
  async executeTransfer(dto: CreateTransferDto, actor: AuthenticatedUser) {
    if (!actor?.companyId) throw new ForbiddenException('هوية المستخدم مطلوبة');
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('لا يمكن التحويل لنفس الفرع، يرجى اختيار فرعين مختلفين');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('يجب اختيار تشغيلة دوائية واحدة على الأقل للتحويل');
    }

    const effectiveUserId = actor.id;

    return await this.prisma.$transaction(async (tx) => {
      // 1. التحقق من وجود الفرعين
      const [fromBranch, toBranch] = await Promise.all([
        tx.branch.findUnique({ where: { id: dto.fromBranchId } }),
        tx.branch.findUnique({ where: { id: dto.toBranchId } }),
      ]);

      if (!fromBranch) throw new NotFoundException('الفرع المصدر غير موجود');
      if (!toBranch) throw new NotFoundException('الفرع المستلم غير موجود');
      if (fromBranch.companyId !== actor.companyId || toBranch.companyId !== actor.companyId) throw new ForbiddenException('التحويل مسموح بين فروع شركة المستخدم فقط');
      if (actor.branchId && fromBranch.id !== actor.branchId) throw new ForbiddenException('الفرع المصدر خارج نطاق المستخدم');

      // 2. توليد رقم تسلسلي ذري للتحويل
      const year = new Date().getFullYear();
      const seq = await tx.documentSequence.upsert({
        where: {
          type_year_branchId: {
            type: 'TRANSFER',
            year,
            branchId: dto.fromBranchId,
          },
        },
        update: { lastValue: { increment: 1 } },
        create: {
          type: 'TRANSFER',
          year,
          branchId: dto.fromBranchId,
          lastValue: 1,
        },
      });

      const transferNumber = `TRF-${year}-${String(seq.lastValue).padStart(5, '0')}`;

      // 3. معالجة كل تشغيلة
      const transferredItems: any[] = [];

      for (const item of dto.items) {
        // قفل صف المصدر، ثم قفل مفتاح الدفعة المستلمة حتى لو لم تكن موجودة بعد.
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Batch" WHERE id = ${item.batchId} FOR UPDATE`);
        // فحص التشغيلة في الفرع المصدر مع القفل الحصري
        const sourceBatch = await tx.batch.findUnique({
          where: { id: item.batchId },
          include: { medicine: true },
        });

        if (!sourceBatch) {
          throw new NotFoundException(`التشغيلة بالمعرف ${item.batchId} غير موجودة`);
        }

        if (sourceBatch.branchId !== dto.fromBranchId) {
          throw new BadRequestException(
            `التشغيلة (${sourceBatch.batchNumber}) لا تتبع الفرع المصدر (${fromBranch.name})`
          );
        }

        if (sourceBatch.isFrozen) {
          throw new BadRequestException(
            `التشغيلة (${sourceBatch.batchNumber}) مجمدة ومعزولة رقابياً، لا يمكن تحويلها`
          );
        }

        if (sourceBatch.quantityInBase < item.quantity) {
          throw new BadRequestException(
            `الرصيد المتاح للتشغيلة (${sourceBatch.batchNumber}) للصنف (${sourceBatch.medicine?.tradeName}) هو ${sourceBatch.quantityInBase} حبة فقط، والمطلوب تحويله ${item.quantity}`
          );
        }

        const targetLockKey = `${dto.toBranchId}:${sourceBatch.medicineId}:${sourceBatch.batchNumber}`;
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${targetLockKey}))::text AS lock_result`);

        // أ. خصم من الفرع المصدر
        const newSourceQty = sourceBatch.quantityInBase - item.quantity;
        const sourceUpdate = await tx.batch.updateMany({
          where: { id: sourceBatch.id, branchId: dto.fromBranchId, quantityInBase: { gte: item.quantity }, isFrozen: false },
          data: {
            quantityInBase: { decrement: item.quantity },
            quantity: { decrement: item.quantity },
          },
        });
        if (sourceUpdate.count !== 1) throw new BadRequestException('تغير رصيد الدفعة المصدر أو جرى تجميدها؛ أعد المحاولة');

        await tx.inventoryTransaction.create({
          data: {
            batchId: sourceBatch.id,
            branchId: dto.fromBranchId,
            transactionType: 'TRANSFER_OUT',
            quantity: -item.quantity,
            runningBalance: newSourceQty,
            unitCost: sourceBatch.costPrice,
            referenceId: transferNumber,
            userId: effectiveUserId,
            notes: `تحويل مخزني صادر إلى: ${toBranch.name}. ${dto.notes || ''}`.trim(),
          },
        });

        // ب. إضافة في الفرع المستلم
        let targetBatch = await tx.batch.findUnique({
          where: {
            batchNumber_medicineId_branchId: {
              batchNumber: sourceBatch.batchNumber,
              medicineId: sourceBatch.medicineId,
              branchId: dto.toBranchId,
            },
          },
        });

        let newTargetQty = item.quantity;
        if (targetBatch) {
          newTargetQty = targetBatch.quantityInBase + item.quantity;
          targetBatch = await tx.batch.update({
            where: { id: targetBatch.id },
            data: {
              quantityInBase: { increment: item.quantity },
              quantity: { increment: item.quantity },
            },
          });
        } else {
          targetBatch = await tx.batch.create({
            data: {
              batchNumber: sourceBatch.batchNumber,
              medicineId: sourceBatch.medicineId,
              branchId: dto.toBranchId,
              costPrice: sourceBatch.costPrice,
              salePrice: sourceBatch.salePrice,
              expiryDate: sourceBatch.expiryDate,
              quantityInBase: item.quantity,
              quantity: item.quantity,
              isFrozen: false,
            },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            batchId: targetBatch.id,
            branchId: dto.toBranchId,
            transactionType: 'TRANSFER_IN',
            quantity: item.quantity,
            runningBalance: newTargetQty,
            unitCost: targetBatch.costPrice,
            referenceId: transferNumber,
            userId: effectiveUserId,
            notes: `تحويل مخزني وارد من: ${fromBranch.name}. ${dto.notes || ''}`.trim(),
          },
        });

        transferredItems.push({
          batchNumber: sourceBatch.batchNumber,
          medicineName: sourceBatch.medicine?.tradeName,
          quantity: item.quantity,
          expiryDate: sourceBatch.expiryDate,
        });
      }

      return {
        success: true,
        message: 'تم تنفيذ التحويل المخزني بنجاح وتحديث أرصدة الفرعين ذرّياً',
        transferNumber,
        fromBranch: fromBranch.name,
        toBranch: toBranch.name,
        date: new Date().toISOString(),
        itemsCount: transferredItems.length,
        items: transferredItems,
      };
    });
  }

  /**
   * جلب سجل عمليات التحويل السابقة
   */
  async getTransfersHistory(params: {
    branchId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }, actor: AuthenticatedUser) {
    const { branchId, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const allowedBranches = await this.prisma.branch.findMany({ where: { companyId: actor.companyId }, select: { id: true, name: true } });
    const allowedBranchIds = allowedBranches.map((branch) => branch.id);
    // جلب الحركات ذات النوع TRANSFER_OUT
    const where: any = {
      transactionType: 'TRANSFER_OUT',
      branchId: { in: allowedBranchIds },
    };

    const effectiveBranchId = actor.branchId || branchId;
    if (effectiveBranchId) where.branchId = effectiveBranchId;

    if (search && search.trim().length > 0) {
      where.OR = [
        { referenceId: { contains: search.trim(), mode: 'insensitive' } },
        { batch: { batchNumber: { contains: search.trim(), mode: 'insensitive' } } },
        { batch: { medicine: { tradeName: { contains: search.trim(), mode: 'insensitive' } } } },
      ];
    }

    const [txs, total, branches] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          batch: {
            include: {
              medicine: { select: { tradeName: true, barcode: true, code: true } },
            },
          },
        },
      }),
      this.prisma.inventoryTransaction.count({ where }),
      Promise.resolve(allowedBranches),
    ]);

    const branchMap = new Map<string, string>();
    branches.forEach((b) => branchMap.set(b.id, b.name));

    const formatted = txs.map((t) => ({
      id: t.id,
      referenceId: t.referenceId,
      branchId: t.branchId,
      branchName: branchMap.get(t.branchId) || 'الفرع المصدر',
      batchNumber: t.batch?.batchNumber,
      medicineName: t.batch?.medicine?.tradeName,
      barcode: t.batch?.medicine?.barcode,
      quantity: Math.abs(t.quantity),
      notes: t.notes,
      createdAt: t.createdAt,
    }));

    return {
      items: formatted,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * جلب تفاصيل سند تحويل محدد برقم السند
   */
  async getTransferDetails(referenceId: string, actor: AuthenticatedUser) {
    const allowedBranches = await this.prisma.branch.findMany({ where: { companyId: actor.companyId }, select: { id: true, name: true } });
    const allowedBranchIds = allowedBranches.map((branch) => branch.id);
    const txs = await this.prisma.inventoryTransaction.findMany({
      where: { referenceId, branchId: { in: allowedBranchIds } },
      include: {
        batch: {
          include: {
            medicine: true,
          },
        },
      },
    });

    if (!txs || txs.length === 0) {
      throw new NotFoundException('سند التحويل غير موجود');
    }
    if (actor.branchId && !txs.some((tx) => tx.branchId === actor.branchId)) {
      throw new ForbiddenException('سند التحويل خارج نطاق فرع المستخدم');
    }

    const branches = allowedBranches;
    const branchMap = new Map<string, string>();
    branches.forEach((b) => branchMap.set(b.id, b.name));

    const outTxs = txs.filter((t) => t.transactionType === 'TRANSFER_OUT');
    const inTxs = txs.filter((t) => t.transactionType === 'TRANSFER_IN');

    const fromBranchId = outTxs[0]?.branchId;
    const toBranchId = inTxs[0]?.branchId;

    return {
      referenceId,
      fromBranch: branchMap.get(fromBranchId) || fromBranchId,
      toBranch: branchMap.get(toBranchId) || toBranchId,
      date: txs[0]?.createdAt,
      items: outTxs.map((t) => ({
        batchNumber: t.batch?.batchNumber,
        medicineName: t.batch?.medicine?.tradeName,
        barcode: t.batch?.medicine?.barcode,
        quantity: Math.abs(t.quantity),
        expiryDate: t.batch?.expiryDate,
        unitCost: Number(t.unitCost),
      })),
    };
  }
}
