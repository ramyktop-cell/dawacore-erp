import { PrismaClient, PaymentMethod } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from 'src/core/prisma/prisma.service';
import { ReportMetaBuilder } from 'src/shared/report-kit';
import { LruCacheAdapter } from 'src/shared/report-kit/cache/lru-cache.adapter';

import { DailySalesService } from 'src/modules/sales/reports/daily-sales/services/daily-sales.service';
import { CashierPerformanceService } from 'src/modules/sales/reports/cashier-performance/services/cashier-performance.service';
import { PaymentMethodsService } from 'src/modules/sales/reports/payment-methods/services/payment-methods.service';
import { StockMovementService } from 'src/modules/inventory/reports/stock-movement/services/stock-movement.service';

import {
  createTenantFixture,
  cleanupTenant,
  TenantFixture,
} from './fixtures/tenant-fixture';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const FROM_DATE = '2026-01-01';
const TO_DATE = '2026-12-31';

const FILTERS = { fromDate: FROM_DATE, toDate: TO_DATE };

// ─────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────

describe('Multi-Tenant Isolation (Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let cache: LruCacheAdapter;

  let dailySalesService: DailySalesService;
  let cashierPerformanceService: CashierPerformanceService;
  let paymentMethodsService: PaymentMethodsService;
  let stockMovementService: StockMovementService;

  let tenantA: TenantFixture;
  let tenantB: TenantFixture;

  // ═══════════════════════════════════════════════════════════
  // Setup / Teardown
  // ═══════════════════════════════════════════════════════════

  beforeAll(async () => {
    prisma = new PrismaClient();
    prismaService = new PrismaService();
    await prismaService.$connect();

    cache = new LruCacheAdapter();
    const metaBuilder = new ReportMetaBuilder(prismaService);

    dailySalesService = new DailySalesService(prismaService, metaBuilder, cache);
    cashierPerformanceService = new CashierPerformanceService(
      prismaService,
      metaBuilder,
      cache,
    );
    paymentMethodsService = new PaymentMethodsService(
      prismaService,
      metaBuilder,
      cache,
    );
    stockMovementService = new StockMovementService(
      prismaService,
      metaBuilder,
      cache,
    );

    // ─── Seed: Company A — 5 sales CASH @ 1000 = 5000
    tenantA = await createTenantFixture(prisma, {
      companyName: 'TenantA',
      salesCount: 5,
      pricePerSale: 1000,
      paymentMethod: PaymentMethod.CASH,
      medicineTradeNames: ['Panadol-A', 'Augmentin-A', 'Aspirin-A'],
    });

    // ─── Seed: Company B — 3 sales CARD @ 4000 = 12000
    tenantB = await createTenantFixture(prisma, {
      companyName: 'TenantB',
      salesCount: 3,
      pricePerSale: 4000,
      paymentMethod: PaymentMethod.CARD,
      medicineTradeNames: ['Voltaren-B', 'Nexium-B'],
    });
  }, 60_000);

  afterAll(async () => {
    if (tenantA) await cleanupTenant(prisma, tenantA);
    if (tenantB) await cleanupTenant(prisma, tenantB);
    await prismaService.$disconnect();
    await prisma.$disconnect();
  }, 30_000);

  beforeEach(async () => {
    await cache.clear();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Daily Sales
  // ═══════════════════════════════════════════════════════════

  describe('DailySalesService', () => {
    it('Company A sees ONLY its own sales', async () => {
      const result = await dailySalesService.generate(
        FILTERS,
        tenantA.companyId,
        tenantA.userId,
      );

      expect(result.summary.totalInvoicesCount).toBe(
        tenantA.expected.salesCount,
      );
      expect(result.summary.grossSales).toBe(tenantA.expected.grossSales);
      // تأكيد إضافي: لا تداخل مع B
      expect(result.summary.grossSales).not.toBe(
        tenantB.expected.grossSales,
      );
    });

    it('Company B sees ONLY its own sales', async () => {
      const result = await dailySalesService.generate(
        FILTERS,
        tenantB.companyId,
        tenantB.userId,
      );

      expect(result.summary.totalInvoicesCount).toBe(
        tenantB.expected.salesCount,
      );
      expect(result.summary.grossSales).toBe(tenantB.expected.grossSales);
    });

    it('Company A CANNOT use Company B branchId', async () => {
      await expect(
        dailySalesService.generate(
          { ...FILTERS, branchId: tenantB.branchId },
          tenantA.companyId,
          tenantA.userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Cashier Performance
  // ═══════════════════════════════════════════════════════════

  describe('CashierPerformanceService', () => {
    it('Company A sees ONLY its own cashier data', async () => {
      const result = await cashierPerformanceService.generate(
        FILTERS,
        tenantA.companyId,
        tenantA.userId,
      );

      expect(result.summary.totalInvoicesCount).toBe(
        tenantA.expected.salesCount,
      );
      expect(result.summary.totalGrossSales).toBe(
        tenantA.expected.grossSales,
      );
      // لا يجب أن نرى كاشير B
      expect(result.summary.totalCashiers).toBe(1);
    });

    it('Company B sees ONLY its own cashier data', async () => {
      const result = await cashierPerformanceService.generate(
        FILTERS,
        tenantB.companyId,
        tenantB.userId,
      );

      expect(result.summary.totalInvoicesCount).toBe(
        tenantB.expected.salesCount,
      );
      expect(result.summary.totalCashiers).toBe(1);
    });

    it('Company A CANNOT use Company B branchId', async () => {
      await expect(
        cashierPerformanceService.generate(
          { ...FILTERS, branchId: tenantB.branchId },
          tenantA.companyId,
          tenantA.userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Payment Methods
  // ═══════════════════════════════════════════════════════════

  describe('PaymentMethodsService', () => {
    it('Company A sees ONLY its own payment methods', async () => {
      const result = await paymentMethodsService.generate(
        FILTERS,
        tenantA.companyId,
        tenantA.userId,
      );

      // A يستخدم CASH فقط
      const cash = result.methods.find((m) => m.method === 'CASH');
      expect(cash).toBeDefined();
      expect(cash?.totalCount).toBe(tenantA.expected.salesCount);

      // CARD لا يجب أن يظهر (يخص B)
      const card = result.methods.find((m) => m.method === 'CARD');
      expect(card).toBeUndefined();
    });

    it('Company B sees ONLY its own payment methods', async () => {
      const result = await paymentMethodsService.generate(
        FILTERS,
        tenantB.companyId,
        tenantB.userId,
      );

      const card = result.methods.find((m) => m.method === 'CARD');
      expect(card).toBeDefined();
      expect(card?.totalCount).toBe(tenantB.expected.salesCount);

      const cash = result.methods.find((m) => m.method === 'CASH');
      expect(cash).toBeUndefined();
    });

    it('Company A CANNOT use Company B branchId', async () => {
      await expect(
        paymentMethodsService.generate(
          { ...FILTERS, branchId: tenantB.branchId },
          tenantA.companyId,
          tenantA.userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Stock Movement
  // ═══════════════════════════════════════════════════════════

  describe('StockMovementService', () => {
    it('Company A sees ONLY its own medicines', async () => {
      const result = await stockMovementService.generate(
        FILTERS,
        tenantA.companyId,
        tenantA.userId,
      );

      expect(result.summary.totalItems).toBe(
        tenantA.expected.medicineTradeNames.length,
      );

      const tradeNames = result.items.map((i) => i.tradeName);
      for (const name of tenantA.expected.medicineTradeNames) {
        expect(tradeNames).toContain(name);
      }
      for (const name of tenantB.expected.medicineTradeNames) {
        expect(tradeNames).not.toContain(name);
      }
    });

    it('Company B sees ONLY its own medicines', async () => {
      const result = await stockMovementService.generate(
        FILTERS,
        tenantB.companyId,
        tenantB.userId,
      );

      expect(result.summary.totalItems).toBe(
        tenantB.expected.medicineTradeNames.length,
      );

      const tradeNames = result.items.map((i) => i.tradeName);
      for (const name of tenantB.expected.medicineTradeNames) {
        expect(tradeNames).toContain(name);
      }
      for (const name of tenantA.expected.medicineTradeNames) {
        expect(tradeNames).not.toContain(name);
      }
    });

    it('Company A CANNOT use Company B branchId', async () => {
      await expect(
        stockMovementService.generate(
          { ...FILTERS, branchId: tenantB.branchId },
          tenantA.companyId,
          tenantA.userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Cross-report consistency
  // ═══════════════════════════════════════════════════════════

  describe('Cross-report consistency', () => {
    it('All reports agree on the same per-tenant totals', async () => {
      const [dailyA, cashierA, paymentA] = await Promise.all([
        dailySalesService.generate(FILTERS, tenantA.companyId, tenantA.userId),
        cashierPerformanceService.generate(
          FILTERS,
          tenantA.companyId,
          tenantA.userId,
        ),
        paymentMethodsService.generate(
          FILTERS,
          tenantA.companyId,
          tenantA.userId,
        ),
      ]);

      // كلها يجب أن تُظهر نفس عدد الفواتير
      expect(dailyA.summary.totalInvoicesCount).toBe(
        tenantA.expected.salesCount,
      );
      expect(cashierA.summary.totalInvoicesCount).toBe(
        tenantA.expected.salesCount,
      );
      expect(paymentA.summary.totalInvoicesCount).toBe(
        tenantA.expected.salesCount,
      );

      // كلها يجب أن تُظهر نفس إجمالي المبيعات
      const dailyGross = dailyA.summary.grossSales;
      const cashierGross = cashierA.summary.totalGrossSales;
      const paymentGross = paymentA.summary.totalGrossAmount;

      expect(cashierGross).toBe(dailyGross);
      expect(paymentGross).toBe(dailyGross);
    });
  });
});
