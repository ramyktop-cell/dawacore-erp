import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma, SaleStatus, PaymentMethod } from '@prisma/client';
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

@Injectable()
export class DailySalesService {
  // ✅ Cache للمنسقات لزيادة الأداء وعدم إنشاء الكائن في كل طلب
  private formatterCache = new Map<string, Intl.DateTimeFormat>();

  constructor(private readonly prisma: PrismaService) {}

  private getHourFormatter(tz: string): Intl.DateTimeFormat {
    if (!this.formatterCache.has(tz)) {
      this.formatterCache.set(
        tz,
        new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: tz,
        }),
      );
    }
    return this.formatterCache.get(tz)!;
  }

  /**
   * ✅ تحويل تاريخ التوقيت المحلي للشركة إلى UTC دقيق دون الاعتماد على توقيت السيرفر
   */
  private localDateToUtc(dateStr: string, tz: string, endOfDay = false): Date {
    const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
    const dt = new Date(`${dateStr}T${time}Z`);
    const tzDate = new Date(dt.toLocaleString('en-US', { timeZone: tz }));
    const utcDate = new Date(dt.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    return new Date(dt.getTime() - offsetMs);
  }

  async generateReport(
    filters: DailySalesFilterDto,
    companyId: string,
    userId: string,
  ): Promise<DailySalesResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    const tz = (company as any)?.timezone || 'Africa/Cairo';

    const todayStr = new Date().toISOString().split('T')[0];
    const fromDateStr = filters.fromDate || todayStr;
    const toDateStr = filters.toDate || todayStr;

    // ✅ نطاق زمني محمي ومربوط حصراً بالـ Timezone المحلي للشركة
    const fromDate = this.localDateToUtc(fromDateStr, tz, false);
    const toDate = this.localDateToUtc(toDateStr, tz, true);

    if (fromDate > toDate) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }

    const [branch, user] = await Promise.all([
      filters.branchId
        ? this.prisma.branch.findUnique({
            where: { id: filters.branchId },
            select: { name: true },
          })
        : Promise.resolve(null),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true },
      }),
    ]);

    const hourFormatter = this.getHourFormatter(tz);

    // جلب الفواتير
    const sales = await this.prisma.sale.findMany({
      where: {
        branch: { companyId },
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
        ...(filters.paymentMethod
          ? { paymentMethod: filters.paymentMethod as PaymentMethod }
          : {}),
        ...(filters.status ? { status: filters.status as SaleStatus } : {}),
        createdAt: { gte: fromDate, lte: toDate },
      },
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // جلب أسماء الكاشيرين
    const cashierIds = Array.from(new Set(sales.map((s) => s.cashierId).filter(Boolean)));
    const cashiers = await this.prisma.user.findMany({
      where: { id: { in: cashierIds } },
      select: { id: true, name: true },
    });
    const cashierNameMap = new Map(cashiers.map((c) => [c.id, c.name]));

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

      if (isReturned) {
        returnedCount++;
        totalReturns += grandTotal;
      } else {
        completedCount++;
        grossSales += subTotal;
        totalDiscounts += discount;
      }

      totalCollected += effectivePaid;

      // طرق الدفع
      const method = sale.paymentMethod;
      paymentMap.set(method, (paymentMap.get(method) || 0) + effectiveTotal);

      // أداء الكاشير
      const cashierId = sale.cashierId;
      const cashierName = cashierNameMap.get(cashierId) || 'كاشير عام';
      const cashierExisting = cashierMap.get(cashierId) || {
        name: cashierName,
        count: 0,
        total: 0,
        returns: 0,
      };
      cashierExisting.count += 1;
      cashierExisting.total += grandTotal;
      if (isReturned) {
        cashierExisting.returns += grandTotal;
      }
      cashierMap.set(cashierId, cashierExisting);

      // التحليل الساعي الدقيق حسب الـ Timezone
      const hour = Number(hourFormatter.format(sale.createdAt)) % 24;
      const h = hourlyMap.get(hour) || { count: 0, total: 0 };
      h.count += 1;
      h.total += effectiveTotal;
      hourlyMap.set(hour, h);

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

    // صافي المبيعات المحاسبي الحقيقي (الإجمالي - الخصومات - المرتجعات)
    const netSales = grossSales - totalDiscounts - totalReturns;

    const totalAbsPayments = Array.from(paymentMap.values()).reduce(
      (a, b) => a + Math.abs(b),
      0,
    );
    const paymentBreakdown: PaymentBreakdown[] = Array.from(paymentMap.entries()).map(
      ([method, amount]) => ({
        method,
        amount: this.round2(amount),
        percentage:
          totalAbsPayments !== 0
            ? this.round2((Math.abs(amount) / totalAbsPayments) * 100)
            : 0,
      }),
    );

    const cashierBreakdown: CashierSalesSummary[] = Array.from(cashierMap.entries()).map(
      ([cashierId, data]) => ({
        cashierId,
        cashierName: data.name,
        invoicesCount: data.count,
        totalSales: this.round2(data.total),
        returns: this.round2(data.returns),
        netTotal: this.round2(data.total - data.returns),
      }),
    );

    // ✅ إرجاع 24 ساعة كاملة بـ Padding صحيح ("01 ص")
    const hourlyBreakdown: HourlySales[] = Array.from({ length: 24 }, (_, i) => {
      const data = hourlyMap.get(i) || { count: 0, total: 0 };
      const period = i >= 12 ? 'م' : 'ص';
      const displayHour = String(i % 12 === 0 ? 12 : i % 12).padStart(2, '0');
      return {
        hour: i,
        hourLabel: `${displayHour} ${period}`,
        invoicesCount: data.count,
        totalSales: this.round2(data.total),
      };
    });

    // ✅ توب المنتجات الأكثر مبيعاً
    const rawSalesItems = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          branch: { companyId },
          createdAt: { gte: fromDate, lte: toDate },
          status: filters.status
            ? (filters.status as SaleStatus)
            : { in: ['COMPLETED', 'PARTIAL_RETURN'] },
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
          ...(filters.paymentMethod
            ? { paymentMethod: filters.paymentMethod as PaymentMethod }
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
    });

    const productAggMap = new Map<
      string,
      { medicineId: string; tradeName: string; totalQuantity: number; totalSales: number }
    >();

    for (const item of rawSalesItems) {
      const medId = item.batch?.medicineId;
      if (!medId) continue;
      const tradeName = item.batch?.medicine?.tradeName || 'صنف غير معروف';
      const netQty = Math.max(0, item.totalBaseQty - item.returnedQty);
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

    return {
      meta: {
        title: 'تقرير المبيعات اليومية والشاملة',
        companyName: company?.name || '',
        branchName: branch?.name,
        fromDate: fromDateStr,
        toDate: toDateStr,
        generatedAt: new Date(),
        generatedBy: { id: user?.id || userId, name: user?.name || 'النظام المحاسبي' },
      },
      summary,
      paymentBreakdown,
      cashierBreakdown,
      hourlyBreakdown,
      topProducts,
      invoices,
    };
  }

  private round2(val: number): number {
    return Math.round(val * 100) / 100;
  }
}
