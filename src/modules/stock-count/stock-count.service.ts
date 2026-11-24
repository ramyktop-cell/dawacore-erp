import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StartStockCountDto } from './dto/start-stock-count.dto';
import { RecordStockCountItemsDto } from './dto/record-stock-count.dto';
import { QuickAddStockCountItemDto } from './dto/quick-add-stock-count-item.dto';
import { Prisma, StockCountStatus, UnitType } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/security.policy';

@Injectable()
export class StockCountService {
  private readonly logger = new Logger(StockCountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private assertScope(stockCount: { companyId: string; branchId: string }, actor?: AuthenticatedUser) {
    if (!actor?.id || stockCount.companyId !== actor.companyId) {
      throw new ForbiddenException('محضر الجرد خارج نطاق شركة المستخدم');
    }
    if (actor.branchId && stockCount.branchId !== actor.branchId) {
      throw new ForbiddenException('محضر الجرد خارج نطاق فرع المستخدم');
    }
  }

  // ============================================================
  // 1. بدء جرد جديد
  // ============================================================
  async start(dto: StartStockCountDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (tx) => {
        // 1.1 منع التداخل: لا يمكن بدء جرد أثناء وجود جرد نشط
        const activeCount = await tx.stockCount.findFirst({
          where: {
            branchId: dto.branchId,
            status: { in: ['IN_PROGRESS', 'RECONCILED'] },
          },
        });

        if (activeCount) {
          throw new BadRequestException(
            `يوجد جرد نشط بالفعل للفرع (${activeCount.countNumber}). يجب اعتماده أو إلغاؤه أولاً.`,
          );
        }

        // جلب الفرع والتأكد من وجوده واستخراج companyId إذا لم يُمرر
        const branch = await tx.branch.findUnique({
          where: { id: dto.branchId },
          select: { id: true, companyId: true },
        });

        if (!branch) {
          throw new NotFoundException('الفرع غير موجود');
        }

        if (!actor?.id || branch.companyId !== actor.companyId) throw new ForbiddenException('الفرع خارج نطاق شركة المستخدم');
        if (actor.branchId && branch.id !== actor.branchId) throw new ForbiddenException('الفرع خارج نطاق المستخدم');
        const effectiveCompanyId = actor.companyId;
        const effectiveUserId = actor.id;

        // 1.2 بناء شروط استهداف الدفعات
        const whereClause: Prisma.BatchWhereInput = {
          branchId: dto.branchId,
          quantityInBase: { gt: 0 },
          isFrozen: false,
        };

        if (dto.countType === 'PARTIAL') {
          if (dto.batchIds?.length) {
            whereClause.id = { in: dto.batchIds };
          } else if (dto.categoryFilter) {
            whereClause.medicine = { category: dto.categoryFilter };
          } else {
            throw new BadRequestException(
              'الجرد الجزئي يتطلب تحديد أرقام الدفعات أو اسم التصنيف',
            );
          }
        }

        let targetBatches = await tx.batch.findMany({
          where: whereClause,
          include: { medicine: { select: { tradeName: true } } },
        });

        // إذا لم توجد دفعات برصيد أكبر من صفر، نتحقق من كل دفعات الفرع غير المجمدة
        if (targetBatches.length === 0 && dto.countType === 'FULL') {
          targetBatches = await tx.batch.findMany({
            where: { branchId: dto.branchId, isFrozen: false },
            include: { medicine: { select: { tradeName: true } } },
          });
        }

        if (targetBatches.length === 0) {
          throw new BadRequestException('لا توجد دفعات مطابقة لشروط الجرد في هذا الفرع');
        }

        // 1.3 توليد الرقم التسلسلي الذري
        const currentYear = new Date().getFullYear();
        const seq = await tx.documentSequence.upsert({
          where: {
            type_year_branchId: {
              type: 'STOCK_COUNT',
              year: currentYear,
              branchId: dto.branchId,
            },
          },
          update: { lastValue: { increment: 1 } },
          create: {
            type: 'STOCK_COUNT',
            year: currentYear,
            branchId: dto.branchId,
            lastValue: 1,
          },
        });
        const countNumber = `SC-${currentYear}-${String(seq.lastValue).padStart(5, '0')}`;

        // 1.4 إنشاء رأس الجرد
        const stockCount = await tx.stockCount.create({
          data: {
            countNumber,
            companyId: effectiveCompanyId,
            branchId: dto.branchId,
            status: 'IN_PROGRESS',
            countType: dto.countType,
            createdById: effectiveUserId!,
            notes: dto.notes,
          },
        });

        // 1.5 تجميد الدفعات وربطها بالمحضر
        await tx.batch.updateMany({
          where: { id: { in: targetBatches.map((b) => b.id) } },
          data: {
            isFrozen: true,
            frozenAt: new Date(),
            frozenReason: `STOCK_COUNT:${countNumber}`,
            stockCountId: stockCount.id,
          },
        });

        // 1.6 إنشاء بنود الجرد (Snapshot)
        await tx.stockCountItem.createMany({
          data: targetBatches.map((batch) => ({
            stockCountId: stockCount.id,
            batchId: batch.id,
            systemQty: batch.quantityInBase,
            unitCost: batch.costPrice,
          })),
        });

        // 1.7 تسجيل في AuditLog
        await tx.auditLog.create({
          data: {
            companyId: effectiveCompanyId,
            branchId: dto.branchId,
            userId: effectiveUserId!,
            action: 'STOCK_COUNT_STARTED',
            entityType: 'StockCount',
            entityId: stockCount.id,
            changes: {
              countNumber,
              countType: dto.countType,
              totalBatchesFrozen: targetBatches.length,
            },
          },
        });

        this.logger.log(`✅ بدأ الجرد ${countNumber} - ${targetBatches.length} دفعة`);

        return { ...stockCount, totalBatchesFrozen: targetBatches.length };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
      },
    );
  }

  // ============================================================
  // 2. تسجيل العد الفعلي
  // ============================================================
  async recordItems(id: string, dto: RecordStockCountItemsDto, actor: AuthenticatedUser) {
    // ✅ منع التكرار
    const batchIds = dto.items.map((i) => i.batchId);
    if (new Set(batchIds).size !== batchIds.length) {
      throw new BadRequestException('لا يمكن تكرار نفس الدفعة في طلب واحد');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const stockCount = await tx.stockCount.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!stockCount || stockCount.status !== 'IN_PROGRESS') {
          throw new BadRequestException('محضر الجرد غير موجود أو ليس بحالة قيد العد');
        }
        this.assertScope(stockCount, actor);

        if (stockCount.items.length === 0) {
          throw new BadRequestException('محضر الجرد لا يحتوي على بنود');
        }

        // تحديد المستخدم الفعلي
        const effectiveUserId = actor.id;

        // ✅ Map للبحث السريع O(1)
        const itemsByBatchId = new Map(stockCount.items.map((ci) => [ci.batchId, ci]));

        for (const item of dto.items) {
          const countItem = itemsByBatchId.get(item.batchId);

          if (!countItem) {
            throw new BadRequestException(
              `الدفعة ${item.batchId} غير مدرجة في محضر الجرد ${stockCount.countNumber}`,
            );
          }

          const variance = item.actualQty - countItem.systemQty;
          const totalCostVariance = new Prisma.Decimal(variance).times(countItem.unitCost);

          await tx.stockCountItem.update({
            where: { id: countItem.id },
            data: {
              actualQty: item.actualQty,
              variance,
              totalCostVariance,
              notes: item.notes,
              countedAt: new Date(),
            },
          });
        }

        await tx.stockCount.update({
          where: { id },
          data: { countedById: effectiveUserId, countedAt: new Date() },
        });

        await tx.auditLog.create({
          data: {
            companyId: stockCount.companyId,
            branchId: stockCount.branchId,
            userId: effectiveUserId || 'system-user',
            action: 'STOCK_COUNT_ITEMS_RECORDED',
            entityType: 'StockCount',
            entityId: stockCount.id,
            changes: { countNumber: stockCount.countNumber, itemsCounted: dto.items.length },
          },
        });

        return { message: 'تم حفظ كميات العد الفعلي بنجاح' };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  }

  // ============================================================
  // 3. مطابقة الفروقات
  // ============================================================
  async reconcile(id: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const stockCount = await tx.stockCount.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!stockCount || stockCount.status !== 'IN_PROGRESS') {
          throw new BadRequestException('لا يمكن مطابقة محضر غير نشط');
        }
        this.assertScope(stockCount, actor);

        if (stockCount.items.length === 0) {
          throw new BadRequestException('لا يمكن مطابقة محضر جرد بدون بنود');
        }

        const uncountedItems = stockCount.items.filter((i) => i.actualQty === null);
        if (uncountedItems.length > 0) {
          throw new BadRequestException(
            `يجب إتمام عد ${uncountedItems.length} صنف قبل المطابقة`,
          );
        }

        const effectiveUserId = actor.id;

        let totalShortage = new Prisma.Decimal(0);
        let totalSurplus = new Prisma.Decimal(0);

        for (const item of stockCount.items) {
          if (item.variance < 0) {
            totalShortage = totalShortage.plus(
              new Prisma.Decimal(Math.abs(item.variance)).times(item.unitCost),
            );
          } else if (item.variance > 0) {
            totalSurplus = totalSurplus.plus(
              new Prisma.Decimal(item.variance).times(item.unitCost),
            );
          }
        }

        const netVarianceValue = totalSurplus.minus(totalShortage);

        const updateResult = await tx.stockCount.updateMany({
          where: { id, status: 'IN_PROGRESS' },
          data: {
            status: 'RECONCILED',
            reconciledById: effectiveUserId,
            reconciledAt: new Date(),
            totalShortage,
            totalSurplus,
            netVarianceValue,
          },
        });

        if (updateResult.count === 0) {
          throw new BadRequestException('تمت مطابقة المحضر مسبقاً أو تغيرت حالته');
        }

        await tx.auditLog.create({
          data: {
            companyId: stockCount.companyId,
            branchId: stockCount.branchId,
            userId: effectiveUserId || 'system-user',
            action: 'STOCK_COUNT_RECONCILED',
            entityType: 'StockCount',
            entityId: stockCount.id,
            changes: {
              countNumber: stockCount.countNumber,
              totalShortage: totalShortage.toString(),
              totalSurplus: totalSurplus.toString(),
              netVarianceValue: netVarianceValue.toString(),
            },
          },
        });

        return tx.stockCount.findUnique({ where: { id }, include: { items: true } });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  }

  // ============================================================
  // 4. الاعتماد والترحيل المحاسبي
  // ============================================================
  async approve(id: string, actor: AuthenticatedUser) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const stockCount = await tx.stockCount.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!stockCount || stockCount.status !== 'RECONCILED') {
          throw new BadRequestException('المحضر يجب أن يكون بحالة المطابقة (RECONCILED)');
        }
        this.assertScope(stockCount, actor);

        const effectiveUserId = actor.id;
        const claimed = await tx.stockCount.updateMany({
          where: { id, status: 'RECONCILED' },
          data: { status: 'APPROVED' },
        });
        if (claimed.count !== 1) throw new BadRequestException('تم اعتماد محضر الجرد بواسطة مستخدم آخر');

        // 4.1 فك تجميد الدفعات
        await tx.batch.updateMany({
          where: { stockCountId: stockCount.id },
          data: {
            isFrozen: false,
            frozenAt: null,
            frozenReason: null,
            stockCountId: null,
          },
        });

        // 4.2 تطبيق التسويات على المخزون
        for (const item of stockCount.items) {
          if (item.variance !== 0 && item.actualQty !== null) {
            await tx.batch.update({
              where: { id: item.batchId },
              data: {
                quantityInBase: item.actualQty,
                quantity: item.actualQty,
              },
            });

            await tx.inventoryTransaction.create({
              data: {
                batchId: item.batchId,
                branchId: stockCount.branchId,
                transactionType: 'INVENTORY_ADJUSTMENT',
                quantity: item.variance,
                runningBalance: item.actualQty,
                unitCost: item.unitCost,
                referenceId: stockCount.countNumber,
                userId: effectiveUserId || 'system-user',
                notes: `تسوية جردية - ${stockCount.countNumber}`,
              },
            });
          }
        }

        // 4.3 تسجيل في Outbox للترحيل المحاسبي
        const outboxPayload = {
          stockCountId: stockCount.id,
          countNumber: stockCount.countNumber,
          companyId: stockCount.companyId,
          branchId: stockCount.branchId,
          totalShortage: Number(stockCount.totalShortage),
          totalSurplus: Number(stockCount.totalSurplus),
          userId: effectiveUserId || 'system-user',
        };

        const outboxEntry = await tx.accountingOutbox.create({
          data: {
            eventType: 'STOCK_COUNT_APPROVED',
            payload: outboxPayload,
            status: 'PENDING',
          },
        });

        // 4.4 تحديث حالة المحضر
        const approvedCount = await tx.stockCount.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedById: effectiveUserId,
            approvedAt: new Date(),
            completedAt: new Date(),
          },
        });

        // 4.5 تسجيل في AuditLog
        await tx.auditLog.create({
          data: {
            companyId: stockCount.companyId,
            branchId: stockCount.branchId,
            userId: effectiveUserId || 'system-user',
            action: 'STOCK_COUNT_APPROVED',
            entityType: 'StockCount',
            entityId: stockCount.id,
            changes: {
              countNumber: stockCount.countNumber,
              totalShortage: stockCount.totalShortage.toString(),
              totalSurplus: stockCount.totalSurplus.toString(),
            },
          },
        });

        return { approvedCount, outboxPayload, outboxId: outboxEntry.id };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
      },
    );

    // 4.6 إطلاق الحدث بعد نجاح المعاملة
    this.eventEmitter.emit('stock.count.approved', {
      ...result.outboxPayload,
      outboxId: result.outboxId,
    });

    return result.approvedCount;
  }

  // ============================================================
  // 5. إلغاء الجرد (يدعم PostgreSQL و SQLite)
  // ============================================================
  async cancel(id: string, reason: string, actor?: AuthenticatedUser, system = false) {
    return this.prisma.$transaction(
      async (tx) => {
        // ✅ اكتشاف نوع قاعدة البيانات تلقائياً
        const isPostgres = process.env.DATABASE_URL?.startsWith('postgresql');

        let stockCount: any;

        if (isPostgres) {
          const lockedCounts = await tx.$queryRaw<any[]>`
            SELECT * FROM "StockCount" WHERE "id" = ${id} FOR UPDATE
          `;
          if (!lockedCounts || lockedCounts.length === 0) {
            throw new NotFoundException('محضر الجرد غير موجود');
          }
          stockCount = lockedCounts[0];
        } else {
          // SQLite: يقفل قاعدة البيانات كاملة تلقائياً
          stockCount = await tx.stockCount.findUnique({ where: { id } });
          if (!stockCount) {
            throw new NotFoundException('محضر الجرد غير موجود');
          }
        }

        if (['APPROVED', 'CANCELLED'].includes(stockCount.status)) {
          throw new BadRequestException('لا يمكن إلغاء محضر مكتمل أو ملغي مسبقاً');
        }

        if (!system) this.assertScope(stockCount, actor);
        const effectiveUserId = actor?.id || stockCount.createdById;

        await tx.batch.updateMany({
          where: { stockCountId: stockCount.id },
          data: {
            isFrozen: false,
            frozenAt: null,
            frozenReason: null,
            stockCountId: null,
          },
        });

        await tx.auditLog.create({
          data: {
            companyId: stockCount.companyId,
            branchId: stockCount.branchId,
            userId: effectiveUserId || 'system-user',
            action: 'STOCK_COUNT_CANCELLED',
            entityType: 'StockCount',
            entityId: stockCount.id,
            changes: {
              countNumber: stockCount.countNumber,
              reason,
              cancelledBy: system ? 'SYSTEM_AUTO_RELEASE' : 'USER',
            },
          },
        });

        return tx.stockCount.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelReason: reason,
            completedAt: new Date(),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      },
    );
  }

  // ============================================================
  // 6. قائمة محاضر الجرد
  // ============================================================
  async findAll(params: {
    branchId?: string;
    status?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }, actor: AuthenticatedUser) {
    const { branchId, status, from, to, page = 1, limit = 20 } = params;
    const where: Prisma.StockCountWhereInput = { companyId: actor.companyId };

    const effectiveBranchId = actor.branchId || branchId;
    if (effectiveBranchId) where.branchId = effectiveBranchId;
    if (status) where.status = status as StockCountStatus;
    if (from) where.startedAt = { gte: from };
    if (to) where.startedAt = { ...(where.startedAt as any), lte: to };

    const [items, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true } },
          countedBy: { select: { id: true, name: true } },
          reconciledBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.stockCount.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ============================================================
  // 7. تفاصيل محضر واحد
  // ============================================================
  async findOne(id: string, actor: AuthenticatedUser) {
    const stockCount = await this.prisma.stockCount.findUnique({
      where: { id },
      include: {
        branch: true,
        createdBy: { select: { id: true, name: true } },
        countedBy: { select: { id: true, name: true } },
        reconciledBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: {
          include: {
            batch: {
              include: {
                medicine: { select: { id: true, tradeName: true, barcode: true, code: true } },
              },
            },
          },
        },
      },
    });

    if (!stockCount) {
      throw new NotFoundException('محضر الجرد غير موجود');
    }
    this.assertScope(stockCount, actor);
    return stockCount;
  }

  // ============================================================
  // 9. إضافة صنف أو تشغيلة على الطائر أثناء الجرد النشط
  // ============================================================
  async addQuickItem(id: string, dto: QuickAddStockCountItemDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. التحقق من وجود وحالة محضر الجرد
        const stockCount = await tx.stockCount.findUnique({
          where: { id },
          include: { items: true },
        });

        if (!stockCount || stockCount.status !== 'IN_PROGRESS') {
          throw new BadRequestException('محضر الجرد غير موجود أو ليس قيد العد');
        }
        this.assertScope(stockCount, actor);

        // تحديد المستخدم الفعلي
        const effectiveUserId = actor.id;

        // 2. البحث عن الدواء إما بالمعرف أو بالباركود
        let medicine: any = null;
        if (dto.medicineId) {
          medicine = await tx.medicine.findUnique({
            where: { id: dto.medicineId },
            include: { units: true },
          });
        }

        const barcodeTrimmed = dto.barcode?.trim();
        if (!medicine && barcodeTrimmed) {
          medicine = await tx.medicine.findFirst({
            where: {
              OR: [
                { barcode: barcodeTrimmed },
                { units: { some: { barcode: barcodeTrimmed } } },
              ],
            },
            include: { units: true },
          });
        }

        // 3. إذا لم يوجد الدواء، نقوم بإنشائه مع وحدته الأساسية
        if (!medicine) {
          if (!dto.tradeName?.trim()) {
            throw new BadRequestException('يجب إدخال اسم الصنف عند إضافة دواء غير مسجل مسبقاً');
          }

          // توليد كود ذري لتجنب التصادم عند إضافة صنفين بالتزامن
          const medicineSeq = await tx.documentSequence.upsert({
            where: {
              type_year_branchId: {
                type: 'MEDICINE',
                year: new Date().getFullYear(),
                branchId: stockCount.branchId,
              },
            },
            update: { lastValue: { increment: 1 } },
            create: {
              type: 'MEDICINE',
              year: new Date().getFullYear(),
              branchId: stockCount.branchId,
              lastValue: 1,
            },
          });
          const code = `MED-${String(medicineSeq.lastValue).padStart(5, '0')}`;

          const medicineBarcode = barcodeTrimmed || `GEN-${Date.now().toString().slice(-8)}`;

          medicine = await tx.medicine.create({
            data: {
              companyId: stockCount.companyId,
              code,
              barcode: medicineBarcode,
              tradeName: dto.tradeName.trim(),
              scientificName: dto.tradeName.trim(),
              category: dto.category?.trim() || 'عام',
              minStockLevel: 5,
              units: {
                create: [
                  {
                    unitType: dto.unitType || UnitType.UNIT,
                    multiplier: 1,
                    price: new Prisma.Decimal(dto.salePrice),
                    barcode: medicineBarcode,
                    isDefault: true,
                  },
                ],
              },
            },
            include: { units: true },
          });
          this.logger.log(`✨ تم إنشاء دواء جديد على الطائر: ${medicine.tradeName} (${medicine.code})`);
        }

        // 4. التحقق من رقم التشغيلة وتوليد رقم إذا لم يُحدد
        const finalBatchNumber =
          dto.batchNumber?.trim() ||
          `B-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

        // هل توجد تشغيلة مسجلة مسبقاً بهذا الرقم لنفس الدواء في هذا الفرع؟
        let batch = await tx.batch.findFirst({
          where: {
            medicineId: medicine.id,
            branchId: stockCount.branchId,
            batchNumber: finalBatchNumber,
          },
        });

        if (!batch) {
          // إنشاء دفعة جديدة برصيد مبدئي 0 ومجمدة لصالح الجرد الحالي
          batch = await tx.batch.create({
            data: {
              batchNumber: finalBatchNumber,
              medicineId: medicine.id,
              branchId: stockCount.branchId,
              costPrice: new Prisma.Decimal(dto.costPrice),
              salePrice: new Prisma.Decimal(dto.salePrice),
              expiryDate: new Date(dto.expiryDate),
              quantityInBase: 0,
              quantity: 0,
              isFrozen: true,
              frozenAt: new Date(),
              frozenReason: `STOCK_COUNT:${stockCount.countNumber}`,
              stockCountId: stockCount.id,
            },
          });
          this.logger.log(
            `📦 تم إنشاء تشغيلة جديدة على الطائر: ${batch.batchNumber} لدواء: ${medicine.tradeName}`,
          );
        } else {
          // تجميد الدفعة الحالية لصالح الجرد إن لم تكن مجمدة
          await tx.batch.update({
            where: { id: batch.id },
            data: {
              isFrozen: true,
              frozenAt: new Date(),
              frozenReason: `STOCK_COUNT:${stockCount.countNumber}`,
              stockCountId: stockCount.id,
            },
          });
        }

        // 5. التحقق مما إذا كان بند الجرد موجوداً مسبقاً
        let countItem = await tx.stockCountItem.findFirst({
          where: {
            stockCountId: stockCount.id,
            batchId: batch.id,
          },
        });

        const systemQty = countItem ? countItem.systemQty : Number(batch.quantityInBase || 0);
        const actualQty = countItem ? (countItem.actualQty || 0) + dto.actualQty : dto.actualQty;
        const variance = actualQty - systemQty;
        const totalCostVariance = new Prisma.Decimal(variance).times(dto.costPrice);

        if (countItem) {
          countItem = await tx.stockCountItem.update({
            where: { id: countItem.id },
            data: {
              actualQty,
              variance,
              totalCostVariance,
              countedAt: new Date(),
              notes: dto.notes || countItem.notes,
            },
          });
        } else {
          countItem = await tx.stockCountItem.create({
            data: {
              stockCountId: stockCount.id,
              batchId: batch.id,
              systemQty,
              actualQty,
              variance,
              totalCostVariance,
              unitCost: new Prisma.Decimal(dto.costPrice),
              notes: dto.notes || 'إضافة سريعة على الطائر أثناء الجرد',
              countedAt: new Date(),
            },
          });
        }

        // 6. تسجيل في AuditLog
        await tx.auditLog.create({
          data: {
            companyId: stockCount.companyId,
            branchId: stockCount.branchId,
            userId: effectiveUserId || 'system-user',
            action: 'STOCK_COUNT_QUICK_ITEM_ADDED',
            entityType: 'StockCount',
            entityId: stockCount.id,
            changes: {
              countNumber: stockCount.countNumber,
              medicineId: medicine.id,
              tradeName: medicine.tradeName,
              batchNumber: batch.batchNumber,
              actualQty,
              variance,
              costPrice: dto.costPrice,
              salePrice: dto.salePrice,
            },
          },
        });

        // 7. إرجاع النتيجة متضمنة بيانات الدفعة والدواء لتحديث واجهة المستخدم فوراً
        return {
          success: true,
          message: `تمت إضافة (${medicine.tradeName} - تشغيلة ${batch.batchNumber}) بكمية ${actualQty} إلى الجرد بنجاح`,
          item: {
            ...countItem,
            batch: {
              ...batch,
              medicine: {
                id: medicine.id,
                tradeName: medicine.tradeName,
                barcode: medicine.barcode,
                code: medicine.code,
              },
            },
          },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  }

  // ============================================================
  // 8. Cron: فك التجميد التلقائي للجرد العالق (24 ساعة)
  // ============================================================
  @Cron(CronExpression.EVERY_HOUR)
  async releaseStaleFreezes() {
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleCounts = await this.prisma.stockCount.findMany({
      where: {
        status: { in: ['IN_PROGRESS', 'RECONCILED'] },
        startedAt: { lt: staleThreshold },
      },
    });

    for (const count of staleCounts) {
      this.logger.warn(`🧹 [Cron] إلغاء الجرد العالق ${count.countNumber}`);
      await this.cancel(count.id, 'SYSTEM_AUTO_CANCEL_STALE_24H', undefined, true);
    }
  }
}
