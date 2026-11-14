import { Injectable, Inject } from '@nestjs/common';
import {
  BaseReportService,
  CacheOptions,
  CACHE_SERVICE,
  ICacheService,
  ReportContext,
  ReportMetaBuilder,
  ReportMeta,
  DateTzUtil,
} from 'src/shared/report-kit';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { StockMovementFilterDto } from '../dto/stock-movement-filter.dto';
import {
  StockMovementResponse,
  StockMovementSummary,
  StockMovementItem,
  StockClassification,
  StockClassificationBreakdown,
  STOCK_CLASSIFICATION_LABELS,
} from '../interfaces/stock-movement.interface';

/**
 * ترجمات تصنيفات الأصناف إلى العربية.
 */
export const CLASSIFICATION_LABELS: Record<StockClassification, string> =
  STOCK_CLASSIFICATION_LABELS;

/** قيمة تمثيلية لـ أيام التغطية عند عدم وجود مبيعات أو استهلاك. */
export const COVERAGE_DAYS_INFINITY = 9999;

/**
 * StockMovementService
 * ────────────────────
 * تقرير حركة الأصناف والرواكد.
 *
 * يورث BaseReportService ويحصل تلقائياً على:
 *   🔒 حماية multi-tenant
 *   🔒 التحقق من ملكية الفرع
 *   ⚡ Cache lookup + invalidation
 *   📋 بناء الـ meta
 *   🕐 Error handling + logging
 */
@Injectable()
export class StockMovementService extends BaseReportService<
  StockMovementFilterDto,
  StockMovementResponse
> {
  constructor(
    prisma: PrismaService,
    metaBuilder: ReportMetaBuilder,
    @Inject(CACHE_SERVICE) cache: ICacheService,
  ) {
    super(prisma, metaBuilder, cache);
  }

  // ─────────────────────────────────────────────
  // Report config
  // ─────────────────────────────────────────────

  protected getReportTitle(): string {
    return 'تقرير حركة الأصناف والرواكد';
  }

  /**
   * تقرير تحليلي مركب (حركات + مبيعات + رصيد لحظي) — TTL مدته 10 دقائق (600 ثانية).
   */
  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 600, enabled: true };
  }

  // ─────────────────────────────────────────────
  // Report logic
  // ─────────────────────────────────────────────

  protected async buildReport(
    filters: StockMovementFilterDto,
    ctx: ReportContext,
  ): Promise<StockMovementResponse> {
    const tz = ctx.timezone;
    const thresholdDays = filters.stagnantThresholdDays ?? 90;

    // ─── 1. النطاق الزمني
    const fromDateStr = filters.fromDate || DateTzUtil.todayInTz(tz);
    const toDateStr = filters.toDate || DateTzUtil.todayInTz(tz);
    const { from, to } = DateTzUtil.range(fromDateStr, toDateStr, tz);

    // ─── 2. جلب فروع الشركة (ضروري لعزل InventoryTransaction و Batch)
    const branches = await this.prisma.branch.findMany({
      where: {
        companyId: ctx.companyId,
        ...(filters.branchId ? { id: filters.branchId } : {}),
      },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);

    if (branchIds.length === 0) {
      return this.emptyResponse(ctx.meta);
    }

    // ─── 3. جلب الأصناف مع الفلاتر (البحث والتصنيف والمورد) — معزولة حسب فروع الشركة
    const medicines = await this.prisma.medicine.findMany({
      where: {
        batches: {
          some: {
            branchId: { in: branchIds },
          },
        },
        ...(filters.medicineId ? { id: filters.medicineId } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.search
          ? {
              OR: [
                { tradeName: { contains: filters.search, mode: 'insensitive' } },
                { scientificName: { contains: filters.search, mode: 'insensitive' } },
                { barcode: { contains: filters.search } },
                { code: { contains: filters.search } },
              ],
            }
          : {}),
        ...(filters.supplierId
          ? {
              purchaseItems: {
                some: {
                  purchaseOrder: {
                    supplierId: filters.supplierId,
                    branchId: { in: branchIds },
                  },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        tradeName: true,
        scientificName: true,
        barcode: true,
        category: true,
        minStockLevel: true,
      },
    });

    if (medicines.length === 0) {
      return this.emptyResponse(ctx.meta);
    }

    const medicineIds = medicines.map((m) => m.id);

    // ─── 4. جلب الدفعات (لكل أصناف + فروع الشركة المستهدفة)
    const batches = await this.prisma.batch.findMany({
      where: {
        medicineId: { in: medicineIds },
        branchId: { in: branchIds },
      },
      select: {
        id: true,
        medicineId: true,
        quantityInBase: true,
        costPrice: true,
        expiryDate: true,
      },
    });

    const batchIds = batches.map((b) => b.id);
    const batchMedicineMap = new Map<string, string>();
    for (const b of batches) {
      batchMedicineMap.set(b.id, b.medicineId);
    }

    // ─── 5. حركات المخزون خلال الفترة
    const transactions =
      batchIds.length > 0
        ? await this.prisma.inventoryTransaction.findMany({
            where: {
              batchId: { in: batchIds },
              branchId: { in: branchIds },
              createdAt: { gte: from, lte: to },
            },
            select: {
              batchId: true,
              quantity: true,
              createdAt: true,
            },
          })
        : [];

    // ─── 6. بنود المبيعات خلال الفترة
    const saleItems =
      batchIds.length > 0
        ? await this.prisma.saleItem.findMany({
            where: {
              batchId: { in: batchIds },
              sale: {
                branchId: { in: branchIds },
                status: { in: ['COMPLETED', 'PARTIAL_RETURN'] },
                createdAt: { gte: from, lte: to },
              },
            },
            select: {
              batchId: true,
              totalBaseQty: true,
              returnedQty: true,
              unitPrice: true,
              sale: {
                select: {
                  createdAt: true,
                },
              },
            },
          })
        : [];

    // ─── 7. تجميع المؤشرات لكل صنف
    interface Acc {
      currentStock: number;
      batchesCount: number;
      stockValue: number;
      nearestExpiry: Date | null;
      totalIn: number;
      totalOut: number;
      quantitySold: number;
      quantityReturned: number;
      salesRevenue: number;
      lastSaleAt: Date | null;
      lastMovementAt: Date | null;
    }

    const accMap = new Map<string, Acc>();
    for (const m of medicines) {
      accMap.set(m.id, {
        currentStock: 0,
        batchesCount: 0,
        stockValue: 0,
        nearestExpiry: null,
        totalIn: 0,
        totalOut: 0,
        quantitySold: 0,
        quantityReturned: 0,
        salesRevenue: 0,
        lastSaleAt: null,
        lastMovementAt: null,
      });
    }

    // تجميع الدفعات
    for (const b of batches) {
      const acc = accMap.get(b.medicineId);
      if (!acc) continue;
      const qty = b.quantityInBase;
      acc.currentStock += qty;
      if (qty > 0) {
        acc.batchesCount += 1;
        if (b.expiryDate && (!acc.nearestExpiry || b.expiryDate < acc.nearestExpiry)) {
          acc.nearestExpiry = b.expiryDate;
        }
      }
      acc.stockValue += qty * Number(b.costPrice);
    }

    // تجميع حركات المخزون (quantity موقّع: موجب = توريد/إيداع، سالب = صرف)
    for (const t of transactions) {
      const medId = batchMedicineMap.get(t.batchId);
      if (!medId) continue;
      const acc = accMap.get(medId);
      if (!acc) continue;

      const qty = t.quantity;
      if (qty > 0) {
        acc.totalIn += qty;
      } else {
        acc.totalOut += Math.abs(qty);
      }

      if (!acc.lastMovementAt || t.createdAt > acc.lastMovementAt) {
        acc.lastMovementAt = t.createdAt;
      }
    }

    // تجميع بنود المبيعات
    for (const si of saleItems) {
      const medId = batchMedicineMap.get(si.batchId);
      if (!medId) continue;
      const acc = accMap.get(medId);
      if (!acc) continue;

      acc.quantitySold += si.totalBaseQty;
      acc.quantityReturned += si.returnedQty;
      acc.salesRevenue += Number(si.unitPrice) * si.totalBaseQty;

      if (!acc.lastSaleAt || si.sale.createdAt > acc.lastSaleAt) {
        acc.lastSaleAt = si.sale.createdAt;
      }
    }

    // ─── 7.1 جلب آخر بيع تاريخي للأصناف التي لم تُبَع في الفترة (لمنع الركود الخاطئ)
    const medsWithoutSalesInPeriod = medicineIds.filter(
      (id) => accMap.get(id)?.lastSaleAt === null,
    );

    if (medsWithoutSalesInPeriod.length > 0 && batchIds.length > 0) {
      const historicalSales = await this.prisma.saleItem.findMany({
        where: {
          batch: {
            medicineId: { in: medsWithoutSalesInPeriod },
            branchId: { in: branchIds },
          },
          sale: {
            branchId: { in: branchIds },
            status: { in: ['COMPLETED', 'PARTIAL_RETURN'] },
          },
        },
        select: {
          batch: { select: { medicineId: true } },
          sale: { select: { createdAt: true } },
        },
        orderBy: {
          sale: { createdAt: 'desc' },
        },
      });

      for (const hs of historicalSales) {
        const medId = hs.batch.medicineId;
        const acc = accMap.get(medId);
        if (acc && !acc.lastSaleAt) {
          acc.lastSaleAt = hs.sale.createdAt;
        }
      }
    }

    // ─── 8. بناء العناصر النهائية مع التصنيف
    const periodDays = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const today = new Date();

    const allItems: StockMovementItem[] = medicines.map((m) => {
      const acc = accMap.get(m.id)!;
      const currentStock = acc.currentStock;
      const netSold = acc.quantitySold - acc.quantityReturned;
      const stockValue = acc.stockValue;
      const avgCost = currentStock > 0 ? stockValue / currentStock : 0;
      const turnoverRatio = currentStock > 0 ? netSold / currentStock : 0;

      let coverageDays: number;
      if (currentStock <= 0) {
        coverageDays = 0;
      } else if (netSold <= 0) {
        coverageDays = COVERAGE_DAYS_INFINITY;
      } else {
        coverageDays = currentStock / (netSold / periodDays);
      }

      const daysSinceLastSale = acc.lastSaleAt
        ? Math.floor(
            (today.getTime() - acc.lastSaleAt.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

      // تحديد التصنيف وفق القواعد المعمارية
      let classification: StockClassification;
      if (currentStock <= 0) {
        classification = 'NO_STOCK';
      } else if (daysSinceLastSale === null || daysSinceLastSale > thresholdDays) {
        classification = 'STAGNANT';
      } else if (daysSinceLastSale <= 30) {
        classification = 'FAST_MOVING';
      } else if (daysSinceLastSale <= 60) {
        classification = 'NORMAL';
      } else {
        classification = 'SLOW_MOVING';
      }

      return {
        medicineId: m.id,
        code: m.code,
        tradeName: m.tradeName,
        scientificName: m.scientificName,
        barcode: m.barcode,
        category: m.category,
        currentStock,
        batchesCount: acc.batchesCount,
        minStockLevel: m.minStockLevel,
        isBelowMinStock: currentStock < m.minStockLevel,
        avgCost: this.round2(avgCost),
        stockValue: this.round2(stockValue),
        nearestExpiry: acc.nearestExpiry?.toISOString() ?? null,
        totalIn: acc.totalIn,
        totalOut: acc.totalOut,
        netMovement: acc.totalIn - acc.totalOut,
        quantitySold: acc.quantitySold,
        quantityReturned: acc.quantityReturned,
        netSold,
        salesRevenue: this.round2(acc.salesRevenue),
        turnoverRatio: this.round2(turnoverRatio),
        coverageDays: this.round2(coverageDays),
        daysSinceLastSale,
        lastSaleAt: acc.lastSaleAt?.toISOString() ?? null,
        lastMovementAt: acc.lastMovementAt?.toISOString() ?? null,
        classification,
        classificationLabel: CLASSIFICATION_LABELS[classification],
      };
    });

    // ─── 9. الفلترة
    let filteredItems = allItems;

    if (filters.onlyStagnant) {
      filteredItems = filteredItems.filter(
        (i) => i.classification === 'STAGNANT',
      );
    }

    if (filters.classification) {
      filteredItems = filteredItems.filter(
        (i) => i.classification === filters.classification,
      );
    }

    if (filters.onlyBelowMinStock) {
      filteredItems = filteredItems.filter((i) => i.isBelowMinStock);
    }

    if (filters.hideZeroStock) {
      filteredItems = filteredItems.filter((i) => i.currentStock > 0);
    }

    // ─── 10. الترتيب
    const sortBy = filters.sortBy || 'stockValue';
    const sortOrder = filters.sortOrder || 'desc';
    const direction = sortOrder === 'desc' ? -1 : 1;

    const sortKeyMap = {
      turnoverRatio: 'turnoverRatio',
      coverageDays: 'coverageDays',
      quantitySold: 'netSold',
      currentStock: 'currentStock',
      stockValue: 'stockValue',
      lastSaleDate: 'lastSaleAt',
    } as const;

    const sortKey = sortKeyMap[sortBy];

    filteredItems.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // null دائماً في النهاية (بغض النظر عن اتجاه الترتيب)
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * direction;
      }

      return ((aVal as number) - (bVal as number)) * direction;
    });

    // ─── 11. تطبيق الـ Pagination
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const startIndex = (page - 1) * limit;
    const limitedItems = filteredItems.slice(startIndex, startIndex + limit);

    // ─── 12. الملخص التنفيذي (يُحسب على إجمالي الأصناف المطابقة)
    const totalStockValue = this.round2(
      filteredItems.reduce((s, i) => s + i.stockValue, 0),
    );
    const totalQuantityOnHand = filteredItems.reduce(
      (s, i) => s + i.currentStock,
      0,
    );
    const totalStockValueStagnant = this.round2(
      filteredItems
        .filter((i) => i.classification === 'STAGNANT')
        .reduce((s, i) => s + i.stockValue, 0),
    );
    const stagnantValuePercentage =
      totalStockValue > 0
        ? this.round2((totalStockValueStagnant / totalStockValue) * 100)
        : 0;

    const totalQuantitySold = filteredItems.reduce(
      (s, i) => s + i.netSold,
      0,
    );
    const totalSalesRevenue = this.round2(
      filteredItems.reduce((s, i) => s + i.salesRevenue, 0),
    );

    const itemsWithTurnover = filteredItems.filter(
      (i) => i.turnoverRatio > 0,
    );
    const avgTurnoverRatio =
      itemsWithTurnover.length > 0
        ? this.round2(
            itemsWithTurnover.reduce((s, i) => s + i.turnoverRatio, 0) /
              itemsWithTurnover.length,
          )
        : 0;

    const itemsWithCoverage = filteredItems.filter(
      (i) =>
        i.coverageDays > 0 && i.coverageDays < COVERAGE_DAYS_INFINITY,
    );
    const avgCoverageDays =
      itemsWithCoverage.length > 0
        ? this.round2(
            itemsWithCoverage.reduce((s, i) => s + i.coverageDays, 0) /
              itemsWithCoverage.length,
          )
        : 0;

    const classificationBreakdown: StockClassificationBreakdown[] = (
      [
        'FAST_MOVING',
        'NORMAL',
        'SLOW_MOVING',
        'STAGNANT',
        'NO_STOCK',
      ] as StockClassification[]
    ).map((c) => {
      const items = filteredItems.filter((i) => i.classification === c);
      const value = items.reduce((s, i) => s + i.stockValue, 0);
      return {
        classification: c,
        label: CLASSIFICATION_LABELS[c],
        itemsCount: items.length,
        stockValue: this.round2(value),
        percentage:
          totalStockValue > 0
            ? this.round2((value / totalStockValue) * 100)
            : 0,
      };
    });

    const summary: StockMovementSummary = {
      totalItems: filteredItems.length,
      itemsWithStock: filteredItems.filter((i) => i.currentStock > 0).length,
      itemsBelowMinStock: filteredItems.filter((i) => i.isBelowMinStock)
        .length,
      totalStockValue,
      totalQuantityOnHand,
      totalStockValueStagnant,
      stagnantValuePercentage,
      totalQuantitySold,
      totalSalesRevenue,
      avgTurnoverRatio,
      avgCoverageDays,
      classificationBreakdown,
    };

    return {
      meta: ctx.meta,
      summary,
      items: limitedItems,
    };
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * استجابة فارغة موحّدة عند غياب الفروع أو الأصناف.
   */
  private emptyResponse(meta: ReportMeta): StockMovementResponse {
    const classificationBreakdown: StockClassificationBreakdown[] = (
      [
        'FAST_MOVING',
        'NORMAL',
        'SLOW_MOVING',
        'STAGNANT',
        'NO_STOCK',
      ] as StockClassification[]
    ).map((c) => ({
      classification: c,
      label: CLASSIFICATION_LABELS[c],
      itemsCount: 0,
      stockValue: 0,
      percentage: 0,
    }));

    return {
      meta,
      summary: {
        totalItems: 0,
        itemsWithStock: 0,
        itemsBelowMinStock: 0,
        totalStockValue: 0,
        totalQuantityOnHand: 0,
        totalStockValueStagnant: 0,
        stagnantValuePercentage: 0,
        totalQuantitySold: 0,
        totalSalesRevenue: 0,
        avgTurnoverRatio: 0,
        avgCoverageDays: 0,
        classificationBreakdown,
      },
      items: [],
    };
  }
}
