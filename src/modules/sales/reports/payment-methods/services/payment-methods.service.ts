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
import { PaymentMethodsFilterDto } from '../dto/payment-methods-filter.dto';
import {
  PaymentMethodsResponse,
  PaymentMethodsSummary,
  PaymentMethodStat,
  PaymentTrendPoint,
} from '../interfaces/payment-methods.interface';

/**
 * ترجمات طرق الدفع إلى العربية.
 * القيم غير المعروفة تُعرض كما هي.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  BANK: 'بنكي',
  BANK_TRANSFER: 'تحويل بنكي',
  TRANSFER: 'تحويل',
  CREDIT: 'آجل',
  MIXED: 'مختلط',
};

/**
 * PaymentMethodsService
 * ─────────────────────
 * تقرير طرق الدفع — تحليل سلوك الدفع خلال فترة.
 *
 * يورث BaseReportService ويحصل تلقائياً على:
 *   🔒 حماية multi-tenant
 *   🔒 التحقق من ملكية الفرع
 *   ⚡ Cache lookup + invalidation
 *   📋 بناء الـ meta
 *   🕐 Error handling + logging
 */
@Injectable()
export class PaymentMethodsService extends BaseReportService<
  PaymentMethodsFilterDto,
  PaymentMethodsResponse
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
    return 'تقرير طرق الدفع';
  }

  /**
   * تقرير تحليلي — TTL 5 دقائق.
   */
  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 300, enabled: true };
  }

  // ─────────────────────────────────────────────
  // Report logic
  // ─────────────────────────────────────────────

  protected async buildReport(
    filters: PaymentMethodsFilterDto,
    ctx: ReportContext,
  ): Promise<PaymentMethodsResponse> {
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
        ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
        ...(filters.paymentMethod
          ? { paymentMethod: filters.paymentMethod as any }
          : {}),
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        paymentMethod: true,
        status: true,
        subTotal: true,
        discountTotal: true,
        grandTotal: true,
        paidAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // ─── 3. التجميع
    const includeReturns = filters.includeReturns !== false;

    interface MethodAccumulator {
      completedCount: number;
      returnedCount: number;
      grossAmount: number;
      returnsAmount: number;
      totalCollected: number;
    }

    const methodMap = new Map<string, MethodAccumulator>();
    const dailyMap = new Map<
      string,
      {
        totalAmount: number;
        totalCount: number;
        byMethod: Map<string, { amount: number; count: number }>;
      }
    >();

    for (const sale of sales) {
      const method = sale.paymentMethod || 'OTHER';
      const isReturned = sale.status === 'RETURNED';

      const subTotal = Number(sale.subTotal);
      const grandTotal = Number(sale.grandTotal);
      const paid = Number(sale.paidAmount);

      const effectiveTotal = isReturned ? -grandTotal : grandTotal;

      // ─── تجميع حسب الطريقة
      const acc = methodMap.get(method) || {
        completedCount: 0,
        returnedCount: 0,
        grossAmount: 0,
        returnsAmount: 0,
        totalCollected: 0,
      };

      if (isReturned) {
        acc.returnedCount += 1;
        acc.returnsAmount += grandTotal;
      } else {
        acc.completedCount += 1;
        acc.grossAmount += subTotal;
      }
      acc.totalCollected += isReturned ? -paid : paid;

      methodMap.set(method, acc);

      // ─── تجميع الاتجاه اليومي
      const dateStr = DateTzUtil.formatInTz(sale.createdAt, tz, 'yyyy-MM-dd');
      const day = dailyMap.get(dateStr) || {
        totalAmount: 0,
        totalCount: 0,
        byMethod: new Map(),
      };
      day.totalAmount += effectiveTotal;
      day.totalCount += 1;

      const methodDay = day.byMethod.get(method) || {
        amount: 0,
        count: 0,
      };
      methodDay.amount += effectiveTotal;
      methodDay.count += 1;
      day.byMethod.set(method, methodDay);

      dailyMap.set(dateStr, day);
    }

    // ─── 4. حساب الإجماليات للنسب
    const totalNetAcrossMethods = Array.from(methodMap.values()).reduce(
      (sum, acc) => {
        const net = includeReturns
          ? acc.grossAmount - acc.returnsAmount
          : acc.grossAmount;
        return sum + net;
      },
      0,
    );

    // ─── 5. بناء PaymentMethodStat (بدون rank بعد)
    const statsWithoutRank: Omit<PaymentMethodStat, 'rank'>[] = Array.from(
      methodMap.entries(),
    ).map(([method, acc]) => {
      const netAmount = includeReturns
        ? acc.grossAmount - acc.returnsAmount
        : acc.grossAmount;

      const totalCount = acc.completedCount + acc.returnedCount;

      const avgTicket =
        acc.completedCount > 0 ? netAmount / acc.completedCount : 0;

      const returnRate =
        acc.grossAmount > 0 ? (acc.returnsAmount / acc.grossAmount) * 100 : 0;

      const percentage =
        totalNetAcrossMethods > 0
          ? (Math.abs(netAmount) / Math.abs(totalNetAcrossMethods)) * 100
          : 0;

      return {
        method,
        methodLabel: PAYMENT_METHOD_LABELS[method] || method,
        completedCount: acc.completedCount,
        returnedCount: acc.returnedCount,
        totalCount,
        grossAmount: this.round2(acc.grossAmount),
        returnsAmount: this.round2(acc.returnsAmount),
        netAmount: this.round2(netAmount),
        percentage: this.round2(percentage),
        avgTicket: this.round2(avgTicket),
        returnRate: this.round2(returnRate),
      };
    });

    // ─── 6. الترتيب
    const sortBy = filters.sortBy || 'amount';
    const sortOrder = filters.sortOrder || 'desc';
    const direction = sortOrder === 'desc' ? -1 : 1;

    const sortKeyMap: Record<
      NonNullable<PaymentMethodsFilterDto['sortBy']>,
      keyof Omit<PaymentMethodStat, 'rank' | 'method' | 'methodLabel'>
    > = {
      amount: 'netAmount',
      count: 'totalCount',
      avgTicket: 'avgTicket',
      returnRate: 'returnRate',
    };

    const sortKey = sortKeyMap[sortBy];

    const sorted = statsWithoutRank.sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      if (diff !== 0) return diff * direction;
      return a.method.localeCompare(b.method);
    });

    // ─── 7. إضافة rank
    const methods: PaymentMethodStat[] = sorted.map((s, idx) => ({
      ...s,
      rank: idx + 1,
    }));

    // ─── 8. الملخص التنفيذي
    const totalGrossAmount = methods.reduce(
      (sum, m) => sum + m.grossAmount,
      0,
    );
    const totalReturnsAmount = methods.reduce(
      (sum, m) => sum + m.returnsAmount,
      0,
    );
    const totalNetAmount = includeReturns
      ? totalGrossAmount - totalReturnsAmount
      : totalGrossAmount;
    const totalCompletedCount = methods.reduce(
      (sum, m) => sum + m.completedCount,
      0,
    );
    const totalInvoicesCount = methods.reduce(
      (sum, m) => sum + m.totalCount,
      0,
    );

    const overallAvgTicket =
      totalCompletedCount > 0 ? totalNetAmount / totalCompletedCount : 0;

    // الأكثر استخداماً (بعدد الفواتير)
    const mostUsed = methods.length
      ? methods.reduce((best, m) =>
          m.totalCount > best.totalCount ? m : best,
        )
      : null;

    // الأعلى قيمة (netAmount)
    const topByAmount = methods.length
      ? methods.reduce((best, m) =>
          m.netAmount > best.netAmount ? m : best,
        )
      : null;

    const summary: PaymentMethodsSummary = {
      activeMethodsCount: methods.length,
      totalInvoicesCount,
      totalGrossAmount: this.round2(totalGrossAmount),
      totalReturnsAmount: this.round2(totalReturnsAmount),
      totalNetAmount: this.round2(totalNetAmount),
      overallAvgTicket: this.round2(overallAvgTicket),
      mostUsedMethod: mostUsed
        ? {
            method: mostUsed.method,
            methodLabel: mostUsed.methodLabel,
            count: mostUsed.totalCount,
          }
        : null,
      topMethodByAmount: topByAmount
        ? {
            method: topByAmount.method,
            methodLabel: topByAmount.methodLabel,
            amount: topByAmount.netAmount,
          }
        : null,
    };

    // ─── 9. الاتجاه اليومي
    const dailyTrend: PaymentTrendPoint[] = Array.from(dailyMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, day]) => ({
        date,
        totalAmount: this.round2(day.totalAmount),
        totalCount: day.totalCount,
        byMethod: Array.from(day.byMethod.entries())
          .map(([method, data]) => ({
            method,
            methodLabel: PAYMENT_METHOD_LABELS[method] || method,
            amount: this.round2(data.amount),
            count: data.count,
          }))
          .sort((a, b) => b.amount - a.amount),
      }));

    // ─── 10. الاستجابة النهائية
    return {
      meta: ctx.meta,
      summary,
      methods,
      dailyTrend,
    };
  }
}
