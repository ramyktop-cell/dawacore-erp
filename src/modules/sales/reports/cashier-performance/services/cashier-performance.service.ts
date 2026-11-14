import { Injectable, Inject } from '@nestjs/common';
import {
  BaseReportService,
  CacheOptions,
  CACHE_SERVICE,
  ICacheService,
  ReportContext,
  ReportMetaBuilder,
  DateTzUtil,
} from 'src/shared/report-kit';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CashierPerformanceFilterDto } from '../dto/cashier-performance-filter.dto';
import {
  CashierPerformanceResponse,
  CashierPerformanceSummary,
  CashierStat,
  CashierPerformanceInvoice,
  DailyTrendPoint,
} from '../interfaces/cashier-performance.interface';

/**
 * CashierPerformanceService
 * ─────────────────────────
 * تقرير أداء الكاشيرين — تحليل مقارن على فترة.
 *
 * يورث BaseReportService ويحصل تلقائياً على:
 *   🔒 حماية multi-tenant
 *   🔒 التحقق من ملكية الفرع
 *   ⚡ Cache lookup + invalidation
 *   📋 بناء الـ meta
 *   🕐 Error handling + logging
 */
@Injectable()
export class CashierPerformanceService extends BaseReportService<
  CashierPerformanceFilterDto,
  CashierPerformanceResponse
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
    return 'تقرير أداء الكاشيرين';
  }

  /**
   * أداء الكاشيرين يُستخدم للمراجعة الأسبوعية/الشهرية — TTL أطول (5 دقائق).
   */
  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 300, enabled: true };
  }

  // ─────────────────────────────────────────────
  // Report logic
  // ─────────────────────────────────────────────

  protected async buildReport(
    filters: CashierPerformanceFilterDto,
    ctx: ReportContext,
  ): Promise<CashierPerformanceResponse> {
    const tz = ctx.timezone;

    // ─── 1. النطاق الزمني
    const fromDateStr = filters.fromDate || DateTzUtil.todayInTz(tz);
    const toDateStr = filters.toDate || DateTzUtil.todayInTz(tz);
    const { from, to } = DateTzUtil.range(fromDateStr, toDateStr, tz);

    // ─── 2. جلب الفواتير (حماية multi-tenant عبر علاقة الفرع بالشركة)
    const sales = await this.prisma.sale.findMany({
      where: {
        ...this.companyFilter(ctx.companyId),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.paymentMethod
          ? { paymentMethod: filters.paymentMethod as any }
          : {}),
        createdAt: { gte: from, lte: to },
      },
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // جلب أسماء الكاشيرين دفعة واحدة لحماية الاستعلام والأداء
    const cashierIds = Array.from(
      new Set(sales.map((s) => s.cashierId).filter(Boolean)),
    );
    const cashiersUsers =
      typeof this.prisma.user?.findMany === 'function' && cashierIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: cashierIds } },
            select: { id: true, name: true },
          })
        : [];
    const cashierNameMap = new Map(cashiersUsers.map((u) => [u.id, u.name]));

    // ─── 3. التجميع حسب الكاشير
    interface CashierAccumulator {
      cashierName: string;
      invoicesCount: number;
      completedInvoicesCount: number;
      returnedInvoicesCount: number;
      grossSales: number;
      totalDiscounts: number;
      returns: number;
      totalCollected: number;
      firstSaleAt: Date | null;
      lastSaleAt: Date | null;
    }

    const cashierMap = new Map<string, CashierAccumulator>();
    const dailyMap = new Map<
      string,
      {
        totalSales: number;
        totalInvoices: number;
        byCashier: Map<
          string,
          { cashierName: string; sales: number; invoicesCount: number }
        >;
      }
    >();

    const invoices: CashierPerformanceInvoice[] = [];

    for (const sale of sales) {
      const cashierId = sale.cashierId;
      const cashierName =
        cashierNameMap.get(cashierId) ||
        (sale as any).cashier?.name ||
        'غير معروف';
      const isReturned = sale.status === 'RETURNED';

      const subTotal = Number(sale.subTotal);
      const discount = Number(sale.discountTotal);
      const grandTotal = Number(sale.grandTotal);
      const paid = Number(sale.paidAmount);

      const effectiveTotal = isReturned ? -grandTotal : grandTotal;
      const effectivePaid = isReturned ? -paid : paid;

      // ─── تجميع الكاشير
      const acc = cashierMap.get(cashierId) || {
        cashierName,
        invoicesCount: 0,
        completedInvoicesCount: 0,
        returnedInvoicesCount: 0,
        grossSales: 0,
        totalDiscounts: 0,
        returns: 0,
        totalCollected: 0,
        firstSaleAt: null,
        lastSaleAt: null,
      };

      acc.invoicesCount += 1;
      if (isReturned) {
        acc.returnedInvoicesCount += 1;
        acc.returns += grandTotal;
      } else {
        acc.completedInvoicesCount += 1;
        acc.grossSales += subTotal;
        acc.totalDiscounts += discount;
      }
      acc.totalCollected += effectivePaid;

      // تتبع التوقيت
      if (!acc.firstSaleAt || sale.createdAt < acc.firstSaleAt) {
        acc.firstSaleAt = sale.createdAt;
      }
      if (!acc.lastSaleAt || sale.createdAt > acc.lastSaleAt) {
        acc.lastSaleAt = sale.createdAt;
      }

      cashierMap.set(cashierId, acc);

      // ─── تجميع الاتجاه اليومي (timezone-aware)
      const dateStr = DateTzUtil.formatInTz(sale.createdAt, tz, 'yyyy-MM-dd');
      const day = dailyMap.get(dateStr) || {
        totalSales: 0,
        totalInvoices: 0,
        byCashier: new Map(),
      };
      day.totalSales += effectiveTotal;
      day.totalInvoices += 1;

      const cashierDay = day.byCashier.get(cashierId) || {
        cashierName,
        sales: 0,
        invoicesCount: 0,
      };
      cashierDay.sales += effectiveTotal;
      cashierDay.invoicesCount += 1;
      day.byCashier.set(cashierId, cashierDay);

      dailyMap.set(dateStr, day);

      // ─── صف الفاتورة
      invoices.push({
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt.toISOString(),
        cashierId,
        cashierName,
        customerName: sale.customer?.name || 'نقدي / عميل عام',
        paymentMethod: sale.paymentMethod,
        subTotal: this.round2(subTotal),
        discountTotal: this.round2(discount),
        grandTotal: this.round2(grandTotal),
        paidAmount: this.round2(paid),
        status: sale.status,
        itemsCount: sale._count?.items ?? 0,
      });
    }

    // ─── 4. بناء CashierStat (بدون rank بعد)
    const cashiersWithoutRank: Omit<CashierStat, 'rank'>[] = Array.from(
      cashierMap.entries(),
    ).map(([cashierId, acc]) => {
      const netSales = acc.grossSales - acc.totalDiscounts - acc.returns;
      const avgTicket =
        acc.completedInvoicesCount > 0
          ? netSales / acc.completedInvoicesCount
          : 0;
      const returnRate =
        acc.grossSales > 0 ? (acc.returns / acc.grossSales) * 100 : 0;

      return {
        cashierId,
        cashierName: acc.cashierName,
        invoicesCount: acc.invoicesCount,
        completedInvoicesCount: acc.completedInvoicesCount,
        returnedInvoicesCount: acc.returnedInvoicesCount,
        grossSales: this.round2(acc.grossSales),
        totalDiscounts: this.round2(acc.totalDiscounts),
        returns: this.round2(acc.returns),
        netSales: this.round2(netSales),
        totalCollected: this.round2(acc.totalCollected),
        avgTicket: this.round2(avgTicket),
        returnRate: this.round2(returnRate),
        firstSaleAt: acc.firstSaleAt?.toISOString() ?? null,
        lastSaleAt: acc.lastSaleAt?.toISOString() ?? null,
      };
    });

    // ─── 5. الترتيب
    const sortBy = filters.sortBy || 'netSales';
    const sortOrder = filters.sortOrder || 'desc';
    const direction = sortOrder === 'desc' ? -1 : 1;

    const sortedCashiers = cashiersWithoutRank.sort((a, b) => {
      const valA = (a[sortBy] as number) ?? 0;
      const valB = (b[sortBy] as number) ?? 0;
      const diff = valA - valB;
      if (diff !== 0) return diff * direction;
      return a.cashierName.localeCompare(b.cashierName);
    });

    // ─── 6. إضافة rank
    const cashiers: CashierStat[] = sortedCashiers.map((c, idx) => ({
      ...c,
      rank: idx + 1,
    }));

    // ─── 7. الملخص التنفيذي
    const totalGrossSales = cashiers.reduce((sum, c) => sum + c.grossSales, 0);
    const totalReturns = cashiers.reduce((sum, c) => sum + c.returns, 0);
    const totalNetSales = cashiers.reduce((sum, c) => sum + c.netSales, 0);
    const totalCompletedInvoices = cashiers.reduce(
      (sum, c) => sum + c.completedInvoicesCount,
      0,
    );
    const totalInvoicesCount = cashiers.reduce(
      (sum, c) => sum + c.invoicesCount,
      0,
    );

    const overallAvgTicket =
      totalCompletedInvoices > 0 ? totalNetSales / totalCompletedInvoices : 0;

    // أفضل كاشير (الأعلى netSales بغض النظر عن sortBy)
    const bestCashier =
      cashiers.length > 0
        ? cashiers.reduce((best, c) =>
            c.netSales > best.netSales ? c : best,
          )
        : null;

    const summary: CashierPerformanceSummary = {
      totalCashiers: cashiers.length,
      totalInvoicesCount,
      totalGrossSales: this.round2(totalGrossSales),
      totalReturns: this.round2(totalReturns),
      totalNetSales: this.round2(totalNetSales),
      overallAvgTicket: this.round2(overallAvgTicket),
      bestCashier: bestCashier
        ? {
            cashierId: bestCashier.cashierId,
            cashierName: bestCashier.cashierName,
            netSales: bestCashier.netSales,
          }
        : null,
    };

    // ─── 8. الاتجاه اليومي (مرتب تصاعدياً بالتاريخ)
    const dailyTrend: DailyTrendPoint[] = Array.from(dailyMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, day]) => ({
        date,
        totalSales: this.round2(day.totalSales),
        totalInvoices: day.totalInvoices,
        byCashier: Array.from(day.byCashier.entries()).map(
          ([cashierId, data]) => ({
            cashierId,
            cashierName: data.cashierName,
            sales: this.round2(data.sales),
            invoicesCount: data.invoicesCount,
          }),
        ),
      }));

    // ─── 9. الاستجابة النهائية
    return {
      meta: ctx.meta,
      summary,
      cashiers,
      dailyTrend,
      invoices,
    };
  }
}
