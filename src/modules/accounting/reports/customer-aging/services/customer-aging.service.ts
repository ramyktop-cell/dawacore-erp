import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';
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
import {
  DEFAULT_AGING_THRESHOLDS,
  AgingThresholds,
  computeBucket,
  computeDaysOverdue,
  computeRiskLevel,
  emptyBucketsTotals,
  addToBuckets,
  sumBuckets,
  bucketsToPercentages,
} from 'src/shared/report-kit/aging';
import type { AgingInvoice } from 'src/shared/report-kit';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CustomerAgingFilterDto } from '../dto/customer-aging-filter.dto';
import { CustomerAgingDrillFilterDto } from '../dto/customer-aging-drill-filter.dto';
import {
  CustomerAgingResponse,
  CustomerAgingSummary,
  CustomerAgingRow,
  CustomerAgingDrillResponse,
} from '../interfaces/customer-aging.interface';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** حالات Sale التي نعتبرها "دين قائم" */
const ACTIVE_SALE_STATUSES: SaleStatus[] = [
  SaleStatus.COMPLETED,
  SaleStatus.PARTIAL_RETURN,
];

/** الحد الأدنى للمبلغ الذي يُعتبر ديناً */
const MIN_OUTSTANDING = 0.01;

// ─────────────────────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────────────────────

interface SaleWithRelations {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  grandTotal: any;
  paidAmount: any;
  status: SaleStatus;
  createdAt: Date;
  payments: Array<{ amount: any; createdAt: Date }>;
  returns: Array<{ totalRefund: any; createdAt: Date }>;
}

interface CustomerWithInfo {
  id: string;
  name: string;
  phone: string;
  creditLimit: any;
  currentDebt: any;
  isActive: boolean;
}

interface OutstandingInvoice {
  invoice: AgingInvoice;
  remaining: number;
  ageInDays: number;
}

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

/**
 * CustomerAgingService
 * ────────────────────
 * تقرير أعمار ديون العملاء.
 *
 * الميزات:
 *   ⚡ Cache تلقائي
 *   📅 Historical accuracy: يستخدم SalePayment.createdAt
 *   🔄 Fallback دفتري: currentDebt عند غياب الفواتير
 *   🎯 Buckets مخصّصة (bucket1/2/3)
 *   🌳 Drill-Down للفواتير
 */
@Injectable()
export class CustomerAgingService extends BaseReportService<
  CustomerAgingFilterDto,
  CustomerAgingResponse
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
    return 'أعمار ديون العملاء';
  }

  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 180, enabled: true };
  }

  // ═══════════════════════════════════════════════════════════
  // buildReport — Main Report
  // ═══════════════════════════════════════════════════════════

  protected async buildReport(
    filters: CustomerAgingFilterDto,
    ctx: ReportContext,
  ): Promise<CustomerAgingResponse> {
    const tz = ctx.timezone;

    // ─── 1. العتبات والتحقق
    const thresholds = this.resolveThresholds(filters);
    this.validateThresholds(thresholds);

    // ─── 2. تاريخ asOfDate
    const asOfDate = filters.asOfDate || DateTzUtil.todayInTz(tz);
    const asOfDateEnd = DateTzUtil.dayEnd(asOfDate, tz);

    // ─── 3. جلب العملاء
    const customers = await this.fetchCustomers(filters, ctx.companyId);

    if (customers.length === 0) {
      return this.emptyResponse(ctx.meta, thresholds, asOfDate);
    }

    const customerIds = customers.map((c) => c.id);

    // ─── 4. جلب المبيعات مع العلاقات
    const sales = await this.fetchSalesWithRelations(
      customerIds,
      ctx.companyId,
      filters.branchId,
      asOfDateEnd,
    );

    // ─── 5. تجميع المبيعات حسب العميل
    const salesByCustomer = new Map<string, SaleWithRelations[]>();
    for (const sale of sales) {
      if (!sale.customerId) continue;
      const list = salesByCustomer.get(sale.customerId) ?? [];
      list.push(sale);
      salesByCustomer.set(sale.customerId, list);
    }

    // ─── 6. بناء الصفوف
    const rows: CustomerAgingRow[] = [];

    for (const customer of customers) {
      const customerSales = salesByCustomer.get(customer.id) ?? [];

      const row = this.buildCustomerRow(
        customer,
        customerSales,
        asOfDateEnd,
        asOfDate,
        thresholds,
        filters.includeInvoices === true,
      );

      // Fallback دفتري: إذا لا توجد فواتير قائمة لكن currentDebt > 0
      const fallback = this.applyAccountingFallback(
        row,
        customer,
        thresholds,
      );

      rows.push(fallback ?? row);
    }

    // ─── 7. الفلترة
    let filtered = rows;

    if (filters.hideZeroOutstanding !== false && filters.includeZeroBalance !== true && filters.onlyWithBalance !== false) {
      filtered = filtered.filter((r) => r.totalOutstanding > MIN_OUTSTANDING);
    }

    if (filters.onlyOverdue) {
      filtered = filtered.filter(
        (r) => r.oldestInvoiceDays > thresholds.bucket1,
      );
    }

    if (filters.minOverdueDays !== undefined) {
      filtered = filtered.filter(
        (r) => r.oldestInvoiceDays >= filters.minOverdueDays!,
      );
    }

    if (filters.bucket) {
      const bucketKeyMap: Record<string, keyof typeof filtered[0]['buckets']> = {
        CURRENT: 'current',
        DAYS_31_60: 'days31_60',
        DAYS_61_90: 'days61_90',
        OVER_90: 'over90',
      };
      const field = bucketKeyMap[filters.bucket];
      filtered = filtered.filter((r) => r.buckets[field] > MIN_OUTSTANDING);
    }

    const targetCustId = filters.customerId || filters.partnerId;
    if (targetCustId) {
      filtered = filtered.filter((r) => r.partyId === targetCustId);
    }

    // ─── 8. الترتيب
    this.sortRows(filtered, filters.sortBy ?? 'total', filters.sortOrder ?? 'desc');

    // ─── 9. Pagination (على العملاء)
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const startIndex = (page - 1) * limit;
    const paginatedRows = filtered.slice(startIndex, startIndex + limit);

    // ─── 10. الملخص (على كل العملاء المفلترين، لا المصفحين)
    const summary = this.buildSummary(filtered, customers, thresholds);

    // ─── 11. الاستجابة
    return {
      meta: ctx.meta,
      summary,
      rows: paginatedRows,
      // Compatibility aliases:
      customers: paginatedRows,
      partners: paginatedRows,
      partnerType: 'CUSTOMER',
      comparison: { mode: 'NONE', label: null },
      thresholds: {
        bucket1: thresholds.bucket1,
        bucket2: thresholds.bucket2,
        bucket3: thresholds.bucket3,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // drillDown — Per-Customer Invoices
  // ═══════════════════════════════════════════════════════════

  async drillDown(
    filters: CustomerAgingDrillFilterDto,
    companyId: string,
    tz?: string,
  ): Promise<CustomerAgingDrillResponse> {
    const thresholds = this.resolveThresholds(filters);
    this.validateThresholds(thresholds);

    let effectiveTz = tz;
    if (!effectiveTz) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { timezone: true },
      });
      effectiveTz = company?.timezone || 'Africa/Cairo';
    }

    const asOfDate = filters.asOfDate || DateTzUtil.todayInTz(effectiveTz);
    const asOfDateEnd = DateTzUtil.dayEnd(asOfDate, effectiveTz);

    // 1. جلب العميل
    const customer = await this.prisma.customer.findFirst({
      where: { id: filters.customerId, companyId },
      select: {
        id: true,
        name: true,
        phone: true,
        creditLimit: true,
        currentDebt: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('العميل غير موجود');
    }

    // 2. جلب مبيعاته
    const sales = await this.fetchSalesWithRelations(
      [customer.id],
      companyId,
      filters.branchId,
      asOfDateEnd,
    );

    // 3. بناء الفواتير
    const invoices: AgingInvoice[] = [];
    for (const sale of sales) {
      const inv = this.buildAgingInvoice(sale, asOfDateEnd, asOfDate, thresholds);
      if (inv && inv.outstandingAmount > MIN_OUTSTANDING) {
        invoices.push(inv);
      }
    }

    // ترتيب: الأقدم أولاً
    invoices.sort((a, b) => b.ageInDays - a.ageInDays);

    const totalOutstanding = invoices.reduce(
      (s, inv) => s + inv.outstandingAmount,
      0,
    );

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        creditLimit: Number(customer.creditLimit),
        currentDebt: Number(customer.currentDebt),
      },
      asOfDate,
      thresholds: {
        bucket1: thresholds.bucket1,
        bucket2: thresholds.bucket2,
        bucket3: thresholds.bucket3,
      },
      totalOutstanding: this.round2(totalOutstanding),
      invoices,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Data Fetching
  // ═══════════════════════════════════════════════════════════

  private async fetchCustomers(
    filters: CustomerAgingFilterDto,
    companyId: string,
  ): Promise<CustomerWithInfo[]> {
    const includeInactive = filters.includeInactive === true;
    const targetCustId = filters.customerId || filters.partnerId;

    return this.prisma.customer.findMany({
      where: {
        companyId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(targetCustId ? { id: targetCustId } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        creditLimit: true,
        currentDebt: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  private async fetchSalesWithRelations(
    customerIds: string[],
    companyId: string,
    branchId: string | undefined,
    asOfDateEnd: Date,
  ): Promise<SaleWithRelations[]> {
    if (customerIds.length === 0) return [];

    return this.prisma.sale.findMany({
      where: {
        customerId: { in: customerIds },
        status: { in: ACTIVE_SALE_STATUSES },
        createdAt: { lte: asOfDateEnd },
        branch: { companyId },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        grandTotal: true,
        paidAmount: true,
        status: true,
        createdAt: true,
        payments: {
          select: { amount: true, createdAt: true },
        },
        returns: {
          select: { totalRefund: true, createdAt: true },
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Per-Customer Row Building
  // ═══════════════════════════════════════════════════════════

  private buildCustomerRow(
    customer: CustomerWithInfo,
    sales: SaleWithRelations[],
    asOfDateEnd: Date,
    asOfDate: string,
    thresholds: AgingThresholds,
    includeInvoices: boolean,
  ): CustomerAgingRow {
    const buckets = emptyBucketsTotals();
    const outstandingInvoices: OutstandingInvoice[] = [];
    let totalOutstanding = 0;
    let oldestInvoiceDays = 0;
    let oldestDateStr: string | undefined = undefined;

    for (const sale of sales) {
      const inv = this.buildAgingInvoice(sale, asOfDateEnd, asOfDate, thresholds);
      if (!inv || inv.outstandingAmount <= MIN_OUTSTANDING) continue;

      addToBuckets(buckets, inv.bucket, inv.outstandingAmount);
      totalOutstanding += inv.outstandingAmount;
      if (inv.ageInDays >= oldestInvoiceDays) {
        oldestInvoiceDays = inv.ageInDays;
        oldestDateStr = inv.invoiceDate.split('T')[0];
      }

      outstandingInvoices.push({
        invoice: inv,
        remaining: inv.outstandingAmount,
        ageInDays: inv.ageInDays,
      });
    }

    const creditLimit = Number(customer.creditLimit);
    const currentDebt = Number(customer.currentDebt);

    const riskLevel = computeRiskLevel(oldestInvoiceDays, thresholds);

    const docItems = outstandingInvoices.map((o) => ({
      ...o.invoice,
      id: o.invoice.invoiceId,
      documentNumber: o.invoice.invoiceNumber,
      documentDate: o.invoice.invoiceDate.split('T')[0],
      amount: o.invoice.grandTotal,
      remainingAmount: o.invoice.outstandingAmount,
      daysOverdue: o.invoice.ageInDays,
    }));

    const row: CustomerAgingRow = {
      partyId: customer.id,
      partyName: customer.name,
      phone: customer.phone,

      totalOutstanding: this.round2(totalOutstanding),
      invoicesCount: outstandingInvoices.length,
      oldestInvoiceDays,
      riskLevel,
      buckets: {
        current: this.round2(buckets.current),
        days31_60: this.round2(buckets.days31_60),
        days61_90: this.round2(buckets.days61_90),
        over90: this.round2(buckets.over90),
      },

      creditLimit: this.round2(creditLimit),
      currentDebt: this.round2(currentDebt),
      isOverCreditLimit: creditLimit > 0 && currentDebt > creditLimit,
      creditUtilization:
        creditLimit > 0 ? this.round2((currentDebt / creditLimit) * 100) : 0,

      entriesUrl: this.buildEntriesUrl(customer.id, asOfDate),
      invoicesUrl: this.buildInvoicesUrl(customer.id, asOfDate, thresholds),

      ...(includeInvoices
        ? { invoices: outstandingInvoices.map((o) => o.invoice) }
        : {}),

      // ─── Compatibility aliases:
      customerId: customer.id,
      partnerId: customer.id,
      partnerCode: customer.id.slice(-8).toUpperCase(),
      partnerName: customer.name,
      currentBalance: this.round2(totalOutstanding),
      oldestDocumentDays: oldestInvoiceDays,
      oldestDocumentDate: oldestDateStr,
      oldestInvoiceDate: oldestDateStr,
      averageAgeDays: this.computeAverageAgeFromInvoices(outstandingInvoices),
      documentsCount: outstandingInvoices.length,
      documents: includeInvoices ? docItems : undefined,
      percentages: bucketsToPercentages(buckets),
    };

    return row;
  }

  private buildAgingInvoice(
    sale: SaleWithRelations,
    asOfDateEnd: Date,
    asOfDate: string,
    thresholds: AgingThresholds,
  ): AgingInvoice | null {
    const grandTotal = Number(sale.grandTotal);
    if (grandTotal <= 0) return null;

    // ─── المدفوع حتى asOfDate
    let paidAsOf: number;
    if (sale.payments && sale.payments.length > 0) {
      paidAsOf = sale.payments
        .filter((p) => !p.createdAt || p.createdAt <= asOfDateEnd)
        .reduce((s, p) => s + Number(p.amount), 0);
    } else {
      // Fallback: paidAmount كاملاً (legacy data)
      paidAsOf = Number(sale.paidAmount);
    }

    // ─── المرتجعات حتى asOfDate
    const returnsAsOf = sale.returns
      ? sale.returns
          .filter((r) => !r.createdAt || r.createdAt <= asOfDateEnd)
          .reduce((s, r) => s + Number(r.totalRefund), 0)
      : 0;

    const outstanding = Math.max(0, grandTotal - paidAsOf - returnsAsOf);
    if (outstanding <= MIN_OUTSTANDING) return null;

    const ageInDays = computeDaysOverdue(asOfDateEnd, sale.createdAt);
    const bucket = computeBucket(ageInDays, thresholds);

    return {
      invoiceId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.createdAt.toISOString(),
      ageInDays,
      bucket,
      grandTotal: this.round2(grandTotal),
      paidAmount: this.round2(paidAsOf),
      returnsAmount: this.round2(returnsAsOf),
      outstandingAmount: this.round2(outstanding),
      invoiceUrl: `/sales/${sale.id}`,
    };
  }

  /**
   * Fallback دفتري: إذا لم توجد فواتير قائمة لكن currentDebt > 0،
   * نضع كامل currentDebt في الشريحة الأولى (CURRENT).
   */
  private applyAccountingFallback(
    row: CustomerAgingRow,
    customer: CustomerWithInfo,
    thresholds: AgingThresholds,
  ): CustomerAgingRow | null {
    const currentDebt = Number(customer.currentDebt);

    // لا fallback إذا كانت هناك فواتير قائمة
    if (row.totalOutstanding > MIN_OUTSTANDING) return null;

    // لا fallback إذا كان الرصيد الدفتري صفر
    if (currentDebt <= MIN_OUTSTANDING) return null;

    // إنشاء row بديل
    const fallbackRow: CustomerAgingRow = {
      ...row,
      totalOutstanding: this.round2(currentDebt),
      currentBalance: this.round2(currentDebt),
      invoicesCount: 0,
      oldestInvoiceDays: 0,
      riskLevel: 'LOW',
      buckets: {
        current: this.round2(currentDebt),
        days31_60: 0,
        days61_90: 0,
        over90: 0,
      },
      invoices: [],
      documents: [],
    };

    return fallbackRow;
  }

  // ═══════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════

  private buildSummary(
    rows: CustomerAgingRow[],
    allCustomers: CustomerWithInfo[],
    thresholds: AgingThresholds,
  ): CustomerAgingSummary {
    const bucketsTotals = emptyBucketsTotals();
    let totalOutstanding = 0;
    let totalInvoicesCount = 0;

    for (const row of rows) {
      bucketsTotals.current += row.buckets.current;
      bucketsTotals.days31_60 += row.buckets.days31_60;
      bucketsTotals.days61_90 += row.buckets.days61_90;
      bucketsTotals.over90 += row.buckets.over90;
      totalOutstanding += row.totalOutstanding;
      totalInvoicesCount += row.invoicesCount;
    }

    // النسب
    const percentages = bucketsToPercentages(bucketsTotals);

    // المتوسط المرجّح (weighted by amount)
    let weightedAge = 0;
    let weightSum = 0;
    for (const row of rows) {
      if (row.totalOutstanding <= 0) continue;
      weightedAge += row.oldestInvoiceDays * row.totalOutstanding;
      weightSum += row.totalOutstanding;
    }
    const averageAgeDays =
      weightSum > 0 ? this.round2(weightedAge / weightSum) : 0;

    // أعلى مدين
    const topDebtor =
      rows.length > 0
        ? rows.reduce((best, r) =>
            r.totalOutstanding > best.totalOutstanding ? r : best,
          )
        : null;

    // العملاء الحرجة
    const criticalPartiesCount = rows.filter(
      (r) => r.riskLevel === 'CRITICAL',
    ).length;

    // الائتمان
    const overCreditLimitCount = rows.filter((r) => r.isOverCreditLimit).length;
    const totalCreditLimit = allCustomers.reduce(
      (s, c) => s + Number(c.creditLimit),
      0,
    );
    const overallCreditUtilization =
      totalCreditLimit > 0
        ? this.round2((totalOutstanding / totalCreditLimit) * 100)
        : 0;

    const overdueAmount =
      bucketsTotals.days31_60 + bucketsTotals.days61_90 + bucketsTotals.over90;
    const overdueRatio =
      totalOutstanding > 0 ? this.round2((overdueAmount / totalOutstanding) * 100) : 0;
    const criticalRatio =
      totalOutstanding > 0 ? this.round2((bucketsTotals.over90 / totalOutstanding) * 100) : 0;
    const partnersWithBalance = rows.filter((r) => r.totalOutstanding > MIN_OUTSTANDING).length;
    const averageDebtPerPartner =
      partnersWithBalance > 0 ? this.round2(totalOutstanding / partnersWithBalance) : 0;

    const summaryBuckets = [
      {
        key: 'CURRENT' as const,
        label: `جاري (0-${thresholds.bucket1} يوم)`,
        fromDays: 0,
        toDays: thresholds.bucket1,
        amount: this.round2(bucketsTotals.current),
        percentage: percentages.current,
        riskLevel: 'LOW' as const,
      },
      {
        key: 'DAYS_31_60' as const,
        label: `متأخر (${thresholds.bucket1 + 1}-${thresholds.bucket2})`,
        fromDays: thresholds.bucket1 + 1,
        toDays: thresholds.bucket2,
        amount: this.round2(bucketsTotals.days31_60),
        percentage: percentages.days31_60,
        riskLevel: 'MEDIUM' as const,
      },
      {
        key: 'DAYS_61_90' as const,
        label: `متأخر (${thresholds.bucket2 + 1}-${thresholds.bucket3})`,
        fromDays: thresholds.bucket2 + 1,
        toDays: thresholds.bucket3,
        amount: this.round2(bucketsTotals.days61_90),
        percentage: percentages.days61_90,
        riskLevel: 'HIGH' as const,
      },
      {
        key: 'OVER_90' as const,
        label: `متأخر (+${thresholds.bucket3})`,
        fromDays: thresholds.bucket3 + 1,
        toDays: null,
        amount: this.round2(bucketsTotals.over90),
        percentage: percentages.over90,
        riskLevel: 'CRITICAL' as const,
      },
    ];

    return {
      partiesCount: rows.length,
      totalOutstanding: this.round2(totalOutstanding),
      totalInvoicesCount,

      bucketsTotals: {
        current: this.round2(bucketsTotals.current),
        days31_60: this.round2(bucketsTotals.days31_60),
        days61_90: this.round2(bucketsTotals.days61_90),
        over90: this.round2(bucketsTotals.over90),
      },

      bucketsPercentages: percentages,

      averageAgeDays,

      topDebtor: topDebtor
        ? {
            partyId: topDebtor.partyId,
            partyName: topDebtor.partyName,
            amount: topDebtor.totalOutstanding,
          }
        : null,

      criticalPartiesCount,

      overCreditLimitCount,
      totalCreditLimit: this.round2(totalCreditLimit),
      overallCreditUtilization,

      // ─── Compatibility aliases:
      totalPartners: allCustomers.length,
      partnersWithBalance,
      totalBalance: this.round2(totalOutstanding),
      buckets: summaryBuckets,
      ratios: {
        overdueRatio,
        criticalRatio,
        averageDebtPerPartner,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════

  private computeAverageAgeFromInvoices(invoices: OutstandingInvoice[]): number {
    if (invoices.length === 0) return 0;
    const sum = invoices.reduce((acc, inv) => acc + inv.ageInDays, 0);
    return this.round2(sum / invoices.length);
  }

  private resolveThresholds(filters: {
    bucket1?: number;
    bucket2?: number;
    bucket3?: number;
  }): AgingThresholds {
    return {
      bucket1: filters.bucket1 ?? DEFAULT_AGING_THRESHOLDS.bucket1,
      bucket2: filters.bucket2 ?? DEFAULT_AGING_THRESHOLDS.bucket2,
      bucket3: filters.bucket3 ?? DEFAULT_AGING_THRESHOLDS.bucket3,
    };
  }

  private validateThresholds(t: AgingThresholds): void {
    if (t.bucket1 >= t.bucket2) {
      throw new BadRequestException(
        'bucket1 يجب أن يكون أصغر من bucket2',
      );
    }
    if (t.bucket2 >= t.bucket3) {
      throw new BadRequestException(
        'bucket2 يجب أن يكون أصغر من bucket3',
      );
    }
  }

  private sortRows(
    rows: CustomerAgingRow[],
    sortBy: any,
    sortOrder: 'asc' | 'desc',
  ): void {
    const direction = sortOrder === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      if (sortBy === 'name' || sortBy === 'partnerName') {
        return a.partyName.localeCompare(b.partyName, 'ar') * direction;
      }
      if (sortBy === 'oldestInvoice' || sortBy === 'oldestInvoiceDays') {
        return (a.oldestInvoiceDays - b.oldestInvoiceDays) * direction;
      }
      if (sortBy === 'riskLevel') {
        const order = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
        return ((order[a.riskLevel] || 0) - (order[b.riskLevel] || 0)) * direction;
      }
      // total / totalBalance
      return (a.totalOutstanding - b.totalOutstanding) * direction;
    });
  }

  private buildEntriesUrl(customerId: string, asOfDate: string): string {
    const params = new URLSearchParams();
    params.set('customerId', customerId);
    params.set('toDate', asOfDate);
    return `/reports/general-ledger?${params.toString()}`;
  }

  private buildInvoicesUrl(
    customerId: string,
    asOfDate: string,
    thresholds: AgingThresholds,
  ): string {
    const params = new URLSearchParams();
    params.set('customerId', customerId);
    params.set('asOfDate', asOfDate);
    params.set('bucket1', String(thresholds.bucket1));
    params.set('bucket2', String(thresholds.bucket2));
    params.set('bucket3', String(thresholds.bucket3));
    return `/reports/customer-aging/drill?${params.toString()}`;
  }

  // ═══════════════════════════════════════════════════════════
  // Empty Response
  // ═══════════════════════════════════════════════════════════

  private emptyResponse(
    meta: ReportMeta,
    thresholds: AgingThresholds,
    asOfDate: string,
  ): CustomerAgingResponse {
    return {
      meta,
      summary: {
        partiesCount: 0,
        totalOutstanding: 0,
        totalInvoicesCount: 0,
        bucketsTotals: emptyBucketsTotals(),
        bucketsPercentages: emptyBucketsTotals(),
        averageAgeDays: 0,
        topDebtor: null,
        criticalPartiesCount: 0,
        overCreditLimitCount: 0,
        totalCreditLimit: 0,
        overallCreditUtilization: 0,
        totalPartners: 0,
        partnersWithBalance: 0,
        totalBalance: 0,
        buckets: [],
        ratios: {
          overdueRatio: 0,
          criticalRatio: 0,
          averageDebtPerPartner: 0,
        },
      },
      rows: [],
      customers: [],
      partners: [],
      partnerType: 'CUSTOMER',
      comparison: { mode: 'NONE', label: null },
      thresholds: {
        bucket1: thresholds.bucket1,
        bucket2: thresholds.bucket2,
        bucket3: thresholds.bucket3,
      },
    };
  }
}
