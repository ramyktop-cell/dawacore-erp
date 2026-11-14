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
  round2,
} from 'src/shared/report-kit';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  computeDaysOverdue,
  computeBucket,
  computeRiskLevel,
  buildBucketDefinitions,
  emptyBucketsTotals,
  addToBuckets,
  bucketsToPercentages,
  computeAverageAge,
  AgingThresholds,
  DEFAULT_AGING_THRESHOLDS,
  AgingBucketKey,
  AgingRiskLevel,
} from 'src/shared/report-kit/aging';
import {
  SupplierAgingFilterDto,
  SupplierAgingSortBy,
} from '../dto/supplier-aging-filter.dto';
import {
  SupplierAgingResponse,
  SupplierAgingRow,
  AgingDocumentItem,
  AgingSummaryBucket,
} from '../interfaces/supplier-aging.interface';

/**
 * SupplierAgingService
 * ────────────────────
 * خدمة تقرير أعمار ديون الموردين (Accounts Payable Aging).
 *
 * المنطق المحاسبي والمالي:
 *   1. يعتمد على PurchaseOrder (أوامر الشراء المستلمة RECEIVED وغير المسددة كلياً).
 *   2. المديونية المتبقية لكل أمر شراء = max(0, totalAmount - paidAmount).
 *   3. العمر = عدد الأيام منذ تاريخ الاستلام (receivedAt) أو الإنشاء (createdAt) حتى asOfDate.
 *   4. إذا لم توجد أوامر شراء متبقية وكان للمورد رصيد دفتري (currentDebt > 0)،
 *      يُحتسب في شريحة الديون الجارية (CURRENT) كـ Fallback لمنع إغفال أي مستحقات.
 *   5. مستويات المخاطر للشرائح الأربع (0-30، 31-60، 61-90، +90).
 */
@Injectable()
export class SupplierAgingService extends BaseReportService<
  SupplierAgingFilterDto,
  SupplierAgingResponse
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
    return 'تقرير أعمار ديون الموردين';
  }

  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 120, enabled: true };
  }

  // ═══════════════════════════════════════════════════════════
  // buildReport
  // ═══════════════════════════════════════════════════════════

  protected async buildReport(
    filters: SupplierAgingFilterDto,
    ctx: ReportContext,
  ): Promise<SupplierAgingResponse> {
    const asOfDateStr =
      filters.asOfDate || filters.toDate || DateTzUtil.todayInTz(ctx.timezone);
    const datePart = asOfDateStr.includes('T')
      ? asOfDateStr.split('T')[0]
      : asOfDateStr;
    const asOfDateEnd = DateTzUtil.dayEnd(datePart, ctx.timezone);

    const thresholds: AgingThresholds = {
      bucket1: Number(filters.bucket1) || DEFAULT_AGING_THRESHOLDS.bucket1,
      bucket2: Number(filters.bucket2) || DEFAULT_AGING_THRESHOLDS.bucket2,
      bucket3: Number(filters.bucket3) || DEFAULT_AGING_THRESHOLDS.bucket3,
    };

    const includeZero =
      filters.includeZeroBalance === true || filters.onlyWithBalance === false;
    const targetSupplierId = filters.supplierId || filters.partnerId;

    // ─── 1. جلب الموردين مع أوامر الشراء المستلمة
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(targetSupplierId ? { id: targetSupplierId } : {}),
      },
      include: {
        purchases: {
          where: {
            status: 'RECEIVED',
            createdAt: { lte: asOfDateEnd },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            orderNumber: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            receivedAt: true,
            createdAt: true,
          },
        },
      },
    });

    const partners: SupplierAgingRow[] = [];
    const summaryBucketsDefs = buildBucketDefinitions(thresholds);
    const summaryBucketTotals: Record<AgingBucketKey, number> = {
      CURRENT: 0,
      DAYS_31_60: 0,
      DAYS_61_90: 0,
      OVER_90: 0,
    };
    let grandTotalBalance = 0;

    // ─── 2. معالجة وتصنيف أوامر الشراء المستحقة لكل مورد
    for (const supplier of suppliers) {
      const unpaidDocuments: AgingDocumentItem[] = [];
      let totalBalance = 0;
      const buckets = emptyBucketsTotals();
      let oldestDocDate: Date | null = null;
      let oldestDocDays = 0;

      for (const purchase of supplier.purchases) {
        const totalAmount = Number(purchase.totalAmount);
        const paidAmount = Number(purchase.paidAmount);
        const remaining = Math.max(0, round2(totalAmount - paidAmount));

        if (remaining <= 0.01) continue;

        const invoiceDate = new Date(purchase.receivedAt || purchase.createdAt);
        const ageInDays = computeDaysOverdue(asOfDateEnd, invoiceDate);
        const bucket = computeBucket(ageInDays, thresholds);

        addToBuckets(buckets, bucket, remaining);
        totalBalance += remaining;

        if (!oldestDocDate || invoiceDate < oldestDocDate) {
          oldestDocDate = invoiceDate;
          oldestDocDays = ageInDays;
        }

        unpaidDocuments.push({
          id: purchase.id,
          documentNumber: purchase.invoiceNumber || purchase.orderNumber,
          documentDate: invoiceDate.toISOString().split('T')[0],
          amount: round2(totalAmount),
          paidAmount: round2(paidAmount),
          remainingAmount: remaining,
          ageInDays,
          bucket,
          // التوافق مع legacy
          invoiceId: purchase.id,
          daysOverdue: ageInDays,
        });
      }

      // معالجة الرصيد الدفتري (Fallback)
      const supplierDebt = Number(supplier.currentDebt);
      if (totalBalance <= 0.01 && supplierDebt > 0.01) {
        totalBalance = round2(supplierDebt);
        buckets.current = totalBalance;
      }

      // تخطي الموردين بلا مديونية إذا لم يُطلب تضمينهم
      if (totalBalance <= 0.01 && !includeZero) {
        continue;
      }

      totalBalance = round2(totalBalance);
      buckets.current = round2(buckets.current);
      buckets.days31_60 = round2(buckets.days31_60);
      buckets.days61_90 = round2(buckets.days61_90);
      buckets.over90 = round2(buckets.over90);

      const percentages = bucketsToPercentages(buckets);
      const averageAgeDays = computeAverageAge(unpaidDocuments);
      const riskLevel = computeRiskLevel(oldestDocDays, thresholds);
      const oldestDateStr = oldestDocDate
        ? oldestDocDate.toISOString().split('T')[0]
        : undefined;

      const includeDocs = filters.includeInvoices !== false;

      const row: SupplierAgingRow = {
        partnerId: supplier.id,
        supplierId: supplier.id,
        partnerCode: supplier.id.slice(-8).toUpperCase(),
        partnerName: supplier.name,
        supplierCompanyName: supplier.companyName || undefined,
        phone: supplier.phone,
        taxNumber: supplier.taxNumber || undefined,
        currentBalance: totalBalance,
        buckets,
        percentages,
        oldestDocumentDate: oldestDateStr,
        oldestDocumentDays: oldestDocDays,
        averageAgeDays,
        riskLevel,
        documentsCount: unpaidDocuments.length,
        documents: includeDocs ? unpaidDocuments : undefined,
        // Compatibility aliases
        invoices: includeDocs ? unpaidDocuments : undefined,
        oldestInvoiceDate: oldestDateStr,
        oldestInvoiceDays: oldestDocDays,
      };

      partners.push(row);

      grandTotalBalance += totalBalance;
      summaryBucketTotals.CURRENT += buckets.current;
      summaryBucketTotals.DAYS_31_60 += buckets.days31_60;
      summaryBucketTotals.DAYS_61_90 += buckets.days61_90;
      summaryBucketTotals.OVER_90 += buckets.over90;
    }

    grandTotalBalance = round2(grandTotalBalance);

    // ─── 3. حساب ملخص الشرائح والمؤشرات
    const summaryBuckets: AgingSummaryBucket[] = summaryBucketsDefs.map(
      (def) => {
        const amount = round2(summaryBucketTotals[def.key]);
        const percentage =
          grandTotalBalance > 0
            ? round2((amount / grandTotalBalance) * 100)
            : 0;
        return {
          key: def.key,
          label: def.label,
          fromDays: def.fromDays,
          toDays: def.toDays,
          amount,
          percentage,
          riskLevel: def.riskLevel,
        };
      },
    );

    const overdueAmount =
      summaryBucketTotals.DAYS_31_60 +
      summaryBucketTotals.DAYS_61_90 +
      summaryBucketTotals.OVER_90;
    const overdueRatio =
      grandTotalBalance > 0
        ? round2((overdueAmount / grandTotalBalance) * 100)
        : 0;
    const criticalRatio =
      grandTotalBalance > 0
        ? round2((summaryBucketTotals.OVER_90 / grandTotalBalance) * 100)
        : 0;
    const partnersWithBalance = partners.filter(
      (p) => p.currentBalance > 0.01,
    ).length;
    const averageDebtPerPartner =
      partnersWithBalance > 0
        ? round2(grandTotalBalance / partnersWithBalance)
        : 0;

    // ─── 4. الفرز
    this.sortPartners(partners, filters.sortBy, filters.sortOrder);

    // ─── 5. ضبط بيانات الـ Meta
    const meta: ReportMeta = {
      ...ctx.meta,
      toDate: datePart,
    };

    return {
      meta,
      partnerType: 'SUPPLIER',
      thresholds,
      summary: {
        totalPartners: suppliers.length,
        partnersWithBalance,
        totalBalance: grandTotalBalance,
        buckets: summaryBuckets,
        ratios: {
          overdueRatio,
          criticalRatio,
          averageDebtPerPartner,
        },
      },
      partners,
      suppliers: partners,
    };
  }

  // ─────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────

  private sortPartners(
    partners: SupplierAgingRow[],
    sortBy: SupplierAgingSortBy = 'totalBalance',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): void {
    const mult = sortOrder === 'asc' ? 1 : -1;
    partners.sort((a, b) => {
      switch (sortBy) {
        case 'partnerName':
          return a.partnerName.localeCompare(b.partnerName, 'ar') * mult;
        case 'oldestInvoiceDays':
          return (a.oldestDocumentDays - b.oldestDocumentDays) * mult;
        case 'riskLevel': {
          const riskWeight: Record<AgingRiskLevel, number> = {
            LOW: 1,
            MEDIUM: 2,
            HIGH: 3,
            CRITICAL: 4,
          };
          return (riskWeight[a.riskLevel] - riskWeight[b.riskLevel]) * mult;
        }
        case 'totalBalance':
        default:
          return (a.currentBalance - b.currentBalance) * mult;
      }
    });
  }
}
