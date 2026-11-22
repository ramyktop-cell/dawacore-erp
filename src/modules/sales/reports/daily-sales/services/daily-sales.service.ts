import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BaseReportService,
  CacheOptions,
  CACHE_SERVICE,
  ICacheService,
  ReportContext,
  ReportMetaBuilder,
  DateTzUtil,
  arabicHourLabel,
} from 'src/shared/report-kit';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { DailySalesFilterDto } from '../dto/daily-sales-filter.dto';
import {
  DailySalesResponse,
  DailySalesSummary,
  PaymentBreakdown,
  CashierSalesSummary,
  DailySalesInvoice,
  HourlySales,
  TopProductItem,
} from '../interfaces/daily-sales.interface';

/**
 * DailySalesService
 * ─────────────────
 * تقرير المبيعات اليومية والشاملة.
 *
 * يورث BaseReportService ويحصل تلقائياً على:
 *   🔒 حماية multi-tenant
 *   🔒 التحقق من ملكية الفرع
 *   ⚡ Cache lookup + invalidation
 *   📋 بناء الـ meta
 *   🕐 Error handling + logging
 *
 * ينفّذ فقط:
 *   - getReportTitle()
 *   - getCacheOptions()  (اختياري — للتخصيص)
 *   - buildReport()
 */
@Injectable()
export class DailySalesService extends BaseReportService<
  DailySalesFilterDto,
  DailySalesResponse
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
    return 'تقرير المبيعات اليومية والشاملة';
  }

  /**
   * تقارير المبيعات سريعة التغير — TTL قصير (دقيقتان).
   * عند أي فاتورة جديدة → Event يُبطل الـ cache فوراً.
   */
  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 120, enabled: true };
  }

  // ─────────────────────────────────────────────
  // Report logic
  // ─────────────────────────────────────────────

  protected async buildReport(
    filters: DailySalesFilterDto,
    ctx: ReportContext,
  ): Promise<DailySalesResponse> {
    const tz = ctx.timezone;

    // ─── 1. حساب النطاق الزمني (timezone-aware)
    const fromDateStr = filters.fromDate || DateTzUtil.todayInTz(tz);
    const toDateStr = filters.toDate || DateTzUtil.todayInTz(tz);
    const { from, to } = DateTzUtil.range(fromDateStr, toDateStr, tz);

    // ─── 2. جلب الفواتير (multi-tenant محمي عبر علاقة الفرع بالشركة)
    const sales = await this.prisma.sale.findMany({
      where: {
        ...this.companyFilter(ctx.companyId),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
        ...(filters.paymentMethod
          ? { paymentMethod: filters.paymentMethod as any }
          : {}),
        ...(filters.status ? { status: filters.status as any } : {}),
        createdAt: { gte: from, lte: to },
      },
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // جلب أسماء الكاشيرين دفعة واحدة
    const cashierIds = Array.from(
      new Set(sales.map((s) => s.cashierId).filter(Boolean)),
    );
    const cashiers =
      typeof this.prisma.user?.findMany === 'function' && cashierIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: cashierIds } },
            select: { id: true, name: true },
          })
        : [];
    const cashierNameMap = new Map(cashiers.map((c) => [c.id, c.name]));

    // ─── 3. التجميع
    let grossSales = 0;
    let totalDiscounts = 0;
    let totalReturns = 0;
    let totalCollected = 0;
    let completedCount = 0;
    let returnedCount = 0;

    const paymentMap = new Map<string, number>();
    const cashierMap = new Map<
      string,
      { name: string; count: number; total: number; returns: number }
    >();
    const hourlyMap = new Map<number, { count: number; total: number }>();
    const invoices: DailySalesInvoice[] = [];

    for (const sale of sales) {
      const subTotal = Number(sale.subTotal);
      const discount = Number(sale.discountTotal);
      const grandTotal = Number(sale.grandTotal);
      const paid = Number(sale.paidAmount);
      const isReturned = sale.status === 'RETURNED';

      const effectiveTotal = isReturned ? -grandTotal : grandTotal;
      const effectivePaid = isReturned ? -paid : paid;

      // ─── تجميع الملخص
      if (isReturned) {
        returnedCount++;
        totalReturns += grandTotal;
      } else {
        completedCount++;
        grossSales += subTotal;
        totalDiscounts += discount;
      }

      totalCollected += effectivePaid;

      // ─── طرق الدفع
      const method = sale.paymentMethod;
      paymentMap.set(method, (paymentMap.get(method) || 0) + effectiveTotal);

      // ─── أداء الكاشير
      const cashierId = sale.cashierId;
      const cashierName =
        cashierNameMap.get(cashierId) ||
        (sale as any).cashier?.name ||
        'غير معروف';
      const cashierExisting = cashierMap.get(cashierId) || {
        name: cashierName,
        count: 0,
        total: 0,
        returns: 0,
      };
      cashierExisting.count += 1;
      cashierExisting.total += grandTotal;
      if (isReturned) cashierExisting.returns += grandTotal;
      cashierMap.set(cashierId, cashierExisting);

      // ─── التحليل الساعي (timezone-aware)
      const hour = DateTzUtil.hourInTz(sale.createdAt, tz);
      const h = hourlyMap.get(hour) || { count: 0, total: 0 };
      h.count += 1;
      h.total += effectiveTotal;
      hourlyMap.set(hour, h);

      // ─── صف الفاتورة
      invoices.push({
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt.toISOString(),
        cashierName,
        customerName: sale.customer?.name || 'نقدي / عميل عام',
        paymentMethod: sale.paymentMethod,
        subTotal: this.round2(subTotal),
        discountTotal: this.round2(discount),
        grandTotal: this.round2(grandTotal),
        paidAmount: this.round2(paid),
        status: sale.status,
        itemsCount: sale._count.items,
      });
    }

    // ─── 4. حساب صافي المبيعات
    const netSales = grossSales - totalDiscounts - totalReturns;

    // ─── 5. تفصيل طرق الدفع
    const totalAbsPayments = Array.from(paymentMap.values()).reduce(
      (a, b) => a + Math.abs(b),
      0,
    );
    const paymentBreakdown: PaymentBreakdown[] = Array.from(
      paymentMap.entries(),
    ).map(([method, amount]) => ({
      method,
      amount: this.round2(amount),
      percentage:
        totalAbsPayments !== 0
          ? this.round2((Math.abs(amount) / totalAbsPayments) * 100)
          : 0,
    }));

    // ─── 6. أداء الكاشيرين
    const cashierBreakdown: CashierSalesSummary[] = Array.from(
      cashierMap.entries(),
    ).map(([cashierId, data]) => ({
      cashierId,
      cashierName: data.name,
      invoicesCount: data.count,
      totalSales: this.round2(data.total),
      returns: this.round2(data.returns),
      netTotal: this.round2(data.total - data.returns),
    }));

    // ─── 7. التحليل الساعي (24 ساعة كاملة للرسم البياني)
    const hourlyBreakdown: HourlySales[] = Array.from(
      { length: 24 },
      (_, i) => {
        const data = hourlyMap.get(i) || { count: 0, total: 0 };
        return {
          hour: i,
          hourLabel: arabicHourLabel(i),
          invoicesCount: data.count,
          totalSales: this.round2(data.total),
        };
      },
    );

    const productAggMap = new Map<
      string,
      { medicineId: string; tradeName: string; totalQuantity: number; totalSales: number }
    >();

    const rawSalesItems =
      typeof this.prisma.saleItem?.findMany === 'function'
        ? await this.prisma.saleItem.findMany({
            where: {
              sale: {
                branch: { companyId: ctx.companyId },
                createdAt: { gte: from, lte: to },
                status: filters.status
                  ? (filters.status as any)
                  : { in: ['COMPLETED', 'PARTIAL_RETURN'] },
                ...(filters.branchId ? { branchId: filters.branchId } : {}),
                ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
                ...(filters.paymentMethod
                  ? { paymentMethod: filters.paymentMethod as any }
                  : {}),
              },
            },
            select: {
              totalBaseQty: true,
              returnedQty: true,
              totalPrice: true,
              batch: {
                select: {
                  medicineId: true,
                  medicine: {
                    select: {
                      id: true,
                      tradeName: true,
                    },
                  },
                },
              },
            },
          })
        : [];

    for (const item of rawSalesItems) {
      const medId = item.batch?.medicineId;
      if (!medId) continue;
      const tradeName = item.batch?.medicine?.tradeName || 'صنف غير معروف';
      const netQty = Math.max(0, (item.totalBaseQty || 0) - (item.returnedQty || 0));
      const totalSales = Number(item.totalPrice) || 0;

      let agg = productAggMap.get(medId);
      if (!agg) {
        agg = { medicineId: medId, tradeName, totalQuantity: 0, totalSales: 0 };
        productAggMap.set(medId, agg);
      }
      agg.totalQuantity += netQty;
      agg.totalSales += totalSales;
    }

    const topProducts: TopProductItem[] = Array.from(productAggMap.values())
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 10)
      .map((p) => ({
        medicineId: p.medicineId,
        tradeName: p.tradeName,
        totalQuantity: p.totalQuantity,
        totalSales: this.round2(p.totalSales),
      }));

    // ─── 9. الملخص
    const summary: DailySalesSummary = {
      totalInvoicesCount: sales.length,
      completedInvoicesCount: completedCount,
      returnedInvoicesCount: returnedCount,
      grossSales: this.round2(grossSales),
      totalDiscounts: this.round2(totalDiscounts),
      netSales: this.round2(netSales),
      totalReturns: this.round2(totalReturns),
      totalCollected: this.round2(totalCollected),
    };

    // ─── 10. الاستجابة النهائية
    return {
      meta: ctx.meta,
      summary,
      paymentBreakdown,
      cashierBreakdown,
      hourlyBreakdown,
      topProducts,
      invoices,
    };
  }
}
