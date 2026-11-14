import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { CashierPerformanceService } from './cashier-performance.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  ReportMetaBuilder,
  CACHE_SERVICE,
  ICacheService,
} from 'src/shared/report-kit';
import { LruCacheAdapter } from 'src/shared/report-kit/cache/lru-cache.adapter';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const OTHER_COMPANY_ID = '22222222-0000-4000-8000-000000000002';
const BRANCH_ID = '037e9314-251a-47cf-af17-0dbc75eb1bdb';
const OTHER_BRANCH_ID = 'aaaaaaaa-0000-4000-8000-000000000099';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

const CASHIER_A = 'cashier-a-0000-4000-8000-000000000001';
const CASHIER_B = 'cashier-b-0000-4000-8000-000000000002';
const CASHIER_C = 'cashier-c-0000-4000-8000-000000000003';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockSale(overrides: Record<string, any> = {}) {
  return {
    id: `sale-${Math.random().toString(36).slice(2, 8)}`,
    invoiceNumber: 'INV-TEST-001',
    companyId: COMPANY_ID,
    branchId: BRANCH_ID,
    cashierId: CASHIER_A,
    subTotal: 100,
    discountTotal: 0,
    grandTotal: 100,
    paidAmount: 100,
    status: 'COMPLETED',
    paymentMethod: 'CASH',
    createdAt: new Date('2026-09-25T10:00:00Z'),
    cashier: { id: CASHIER_A, name: 'أحمد' },
    customer: { name: 'عميل تجريبي' },
    _count: { items: 1 },
    ...overrides,
  };
}

function createPrismaMock() {
  return {
    company: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'صيدلية داوا',
        timezone: 'Africa/Cairo',
        currency: 'SDG',
        logoUrl: null,
      }),
    },
    branch: {
      findFirst: jest.fn().mockResolvedValue({ id: BRANCH_ID }),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, name: 'مدير النظام' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    sale: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('CashierPerformanceService', () => {
  let service: CashierPerformanceService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashierPerformanceService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(CashierPerformanceService);
  });

  afterEach(async () => {
    await cache.clear();
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Empty
  // ═══════════════════════════════════════════════════════════

  describe('empty period', () => {
    it('should return zero summary when no sales', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary).toEqual({
        totalCashiers: 0,
        totalInvoicesCount: 0,
        totalGrossSales: 0,
        totalReturns: 0,
        totalNetSales: 0,
        overallAvgTicket: 0,
        bestCashier: null,
      });
      expect(result.cashiers).toEqual([]);
      expect(result.dailyTrend).toEqual([]);
      expect(result.invoices).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Single cashier — stats
  // ═══════════════════════════════════════════════════════════

  describe('single cashier stats', () => {
    it('should compute all metrics for one cashier', async () => {
      prisma.sale.findMany.mockResolvedValue([
        // completed
        mockSale({
          cashierId: CASHIER_A,
          cashier: { id: CASHIER_A, name: 'أحمد' },
          subTotal: 1000,
          discountTotal: 100,
          grandTotal: 900,
          paidAmount: 900,
          status: 'COMPLETED',
        }),
        // returned
        mockSale({
          cashierId: CASHIER_A,
          cashier: { id: CASHIER_A, name: 'أحمد' },
          subTotal: 200,
          discountTotal: 0,
          grandTotal: 200,
          paidAmount: 200,
          status: 'RETURNED',
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const c = result.cashiers[0];

      expect(c.cashierId).toBe(CASHIER_A);
      expect(c.invoicesCount).toBe(2);
      expect(c.completedInvoicesCount).toBe(1);
      expect(c.returnedInvoicesCount).toBe(1);
      expect(c.grossSales).toBe(1000);
      expect(c.totalDiscounts).toBe(100);
      expect(c.returns).toBe(200);
      // netSales = 1000 - 100 - 200 = 700
      expect(c.netSales).toBe(700);
      // totalCollected = 900 - 200 = 700
      expect(c.totalCollected).toBe(700);
      // avgTicket = 700 / 1 = 700
      expect(c.avgTicket).toBe(700);
      // returnRate = 200 / 1000 = 20%
      expect(c.returnRate).toBe(20);
      expect(c.rank).toBe(1);
    });

    it('should track firstSaleAt and lastSaleAt', async () => {
      const earlier = new Date('2026-09-25T08:00:00Z');
      const later = new Date('2026-09-25T15:00:00Z');

      prisma.sale.findMany.mockResolvedValue([
        mockSale({ createdAt: later }),
        mockSale({ createdAt: earlier }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const c = result.cashiers[0];

      expect(c.firstSaleAt).toBe(earlier.toISOString());
      expect(c.lastSaleAt).toBe(later.toISOString());
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Multiple cashiers — sorting
  // ═══════════════════════════════════════════════════════════

  describe('multiple cashiers — sorting', () => {
    /**
     * Fixtures:
     *   A: netSales=1000, invoices=5, avgTicket=200, returns=0
     *   B: netSales=1500, invoices=3, avgTicket=500, returns=100
     *   C: netSales=800,  invoices=8, avgTicket=100, returns=50
     */
    function setupThreeCashiers() {
      const sales: any[] = [];

      // CASHIER A: 5 completed, netSales=1000
      for (let i = 0; i < 5; i++) {
        sales.push(
          mockSale({
            cashierId: CASHIER_A,
            cashier: { id: CASHIER_A, name: 'أحمد' },
            subTotal: 200,
            discountTotal: 0,
            grandTotal: 200,
            paidAmount: 200,
          }),
        );
      }

      // CASHIER B: 2 completed (netSales=1600) + 1 returned (100)
      // grossSales=1600, returns=100, netSales=1500
      for (let i = 0; i < 2; i++) {
        sales.push(
          mockSale({
            cashierId: CASHIER_B,
            cashier: { id: CASHIER_B, name: 'محمد' },
            subTotal: 800,
            discountTotal: 0,
            grandTotal: 800,
            paidAmount: 800,
          }),
        );
      }
      sales.push(
        mockSale({
          cashierId: CASHIER_B,
          cashier: { id: CASHIER_B, name: 'محمد' },
          subTotal: 100,
          discountTotal: 0,
          grandTotal: 100,
          paidAmount: 100,
          status: 'RETURNED',
        }),
      );

      // CASHIER C: 8 completed, netSales=800
      for (let i = 0; i < 8; i++) {
        sales.push(
          mockSale({
            cashierId: CASHIER_C,
            cashier: { id: CASHIER_C, name: 'خالد' },
            subTotal: 100,
            discountTotal: 0,
            grandTotal: 100,
            paidAmount: 100,
          }),
        );
      }
      // C: returns=50
      sales.push(
        mockSale({
          cashierId: CASHIER_C,
          cashier: { id: CASHIER_C, name: 'خالد' },
          subTotal: 50,
          discountTotal: 0,
          grandTotal: 50,
          paidAmount: 50,
          status: 'RETURNED',
        }),
      );

      return sales;
    }

    it('should sort by netSales desc by default', async () => {
      prisma.sale.findMany.mockResolvedValue(setupThreeCashiers());

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const ids = result.cashiers.map((c) => c.cashierId);

      expect(ids[0]).toBe(CASHIER_B); // 1500
      expect(ids[1]).toBe(CASHIER_A); // 1000
      expect(ids[2]).toBe(CASHIER_C); // 800

      expect(result.cashiers[0].rank).toBe(1);
      expect(result.cashiers[1].rank).toBe(2);
      expect(result.cashiers[2].rank).toBe(3);
    });

    it('should sort by invoicesCount desc', async () => {
      prisma.sale.findMany.mockResolvedValue(setupThreeCashiers());

      const result = await service.generate(
        { sortBy: 'invoicesCount', sortOrder: 'desc' },
        COMPANY_ID,
        USER_ID,
      );
      const ids = result.cashiers.map((c) => c.cashierId);

      expect(ids[0]).toBe(CASHIER_C); // 9 invoices
      expect(ids[1]).toBe(CASHIER_A); // 5
      expect(ids[2]).toBe(CASHIER_B); // 3
    });

    it('should sort by returns desc', async () => {
      prisma.sale.findMany.mockResolvedValue(setupThreeCashiers());

      const result = await service.generate(
        { sortBy: 'returns', sortOrder: 'desc' },
        COMPANY_ID,
        USER_ID,
      );
      const ids = result.cashiers.map((c) => c.cashierId);

      expect(ids[0]).toBe(CASHIER_B); // 100
      expect(ids[1]).toBe(CASHIER_C); // 50
      expect(ids[2]).toBe(CASHIER_A); // 0
    });

    it('should sort asc when requested', async () => {
      prisma.sale.findMany.mockResolvedValue(setupThreeCashiers());

      const result = await service.generate(
        { sortBy: 'netSales', sortOrder: 'asc' },
        COMPANY_ID,
        USER_ID,
      );
      const ids = result.cashiers.map((c) => c.cashierId);

      expect(ids[0]).toBe(CASHIER_C); // 800
      expect(ids[2]).toBe(CASHIER_B); // 1500
    });

    it('should always set bestCashier to highest netSales (independent of sortBy)', async () => {
      prisma.sale.findMany.mockResolvedValue(setupThreeCashiers());

      const result = await service.generate(
        { sortBy: 'returns', sortOrder: 'desc' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.summary.bestCashier?.cashierId).toBe(CASHIER_B);
      expect(result.summary.bestCashier?.netSales).toBe(1500);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Summary
  // ═══════════════════════════════════════════════════════════

  describe('summary aggregation', () => {
    it('should aggregate totals across all cashiers', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({
          cashierId: CASHIER_A,
          subTotal: 500,
          grandTotal: 500,
          paidAmount: 500,
        }),
        mockSale({
          cashierId: CASHIER_B,
          cashier: { id: CASHIER_B, name: 'محمد' },
          subTotal: 300,
          grandTotal: 300,
          paidAmount: 300,
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary.totalCashiers).toBe(2);
      expect(result.summary.totalInvoicesCount).toBe(2);
      expect(result.summary.totalGrossSales).toBe(800);
      expect(result.summary.totalNetSales).toBe(800);
      // avgTicket = 800 / 2 = 400
      expect(result.summary.overallAvgTicket).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Daily trend
  // ═══════════════════════════════════════════════════════════

  describe('daily trend', () => {
    it('should group sales by day in Cairo timezone (sorted asc)', async () => {
      prisma.sale.findMany.mockResolvedValue([
        // يوم 2026-09-25
        mockSale({ createdAt: new Date('2026-09-25T10:00:00Z') }), // Cairo 13:00
        mockSale({ createdAt: new Date('2026-09-25T11:00:00Z') }), // Cairo 14:00
        // يوم 2026-09-24
        mockSale({ createdAt: new Date('2026-09-24T10:00:00Z') }),
        // يوم 2026-09-26
        mockSale({ createdAt: new Date('2026-09-26T10:00:00Z') }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.dailyTrend).toHaveLength(3);
      expect(result.dailyTrend.map((d) => d.date)).toEqual([
        '2026-09-24',
        '2026-09-25',
        '2026-09-26',
      ]);
      expect(result.dailyTrend[1].totalInvoices).toBe(2);
    });

    it('should include per-cashier breakdown for each day', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({
          cashierId: CASHIER_A,
          cashier: { id: CASHIER_A, name: 'أحمد' },
          grandTotal: 100,
          createdAt: new Date('2026-09-25T10:00:00Z'),
        }),
        mockSale({
          cashierId: CASHIER_B,
          cashier: { id: CASHIER_B, name: 'محمد' },
          grandTotal: 200,
          createdAt: new Date('2026-09-25T11:00:00Z'),
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const day = result.dailyTrend[0];

      expect(day.byCashier).toHaveLength(2);
      const a = day.byCashier.find((c) => c.cashierId === CASHIER_A);
      const b = day.byCashier.find((c) => c.cashierId === CASHIER_B);
      expect(a?.sales).toBe(100);
      expect(b?.sales).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Security
  // ═══════════════════════════════════════════════════════════

  describe('security', () => {
    it('should reject companyId passed in filters', async () => {
      const maliciousFilters: any = { companyId: OTHER_COMPANY_ID };

      await expect(
        service.generate(maliciousFilters, COMPANY_ID, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject branchId from another company', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.generate({ branchId: OTHER_BRANCH_ID }, COMPANY_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject when companyId is missing', async () => {
      await expect(service.generate({}, '', USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. Cache
  // ═══════════════════════════════════════════════════════════

  describe('cache', () => {
    it('should cache on second call', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, COMPANY_ID, USER_ID);

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(1);
    });

    it('should use different cache keys for different sortBy', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      await service.generate({ sortBy: 'netSales' }, COMPANY_ID, USER_ID);
      await service.generate({ sortBy: 'returns' }, COMPANY_ID, USER_ID);

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(2);
    });

    it('should bypass cache with skipCache=true', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({ skipCache: 'true' }, COMPANY_ID, USER_ID);

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(2);
    });

    it('should return fresh data after invalidate()', async () => {
      prisma.sale.findMany
        .mockResolvedValueOnce([
          mockSale({ grandTotal: 100, subTotal: 100 }),
        ])
        .mockResolvedValueOnce([
          mockSale({ grandTotal: 200, subTotal: 200 }),
        ]);

      const first = await service.generate({}, COMPANY_ID, USER_ID);
      expect(first.summary.totalGrossSales).toBe(100);

      await service.invalidate(COMPANY_ID);

      const second = await service.generate({}, COMPANY_ID, USER_ID);
      expect(second.summary.totalGrossSales).toBe(200);
      expect(prisma.sale.findMany).toHaveBeenCalledTimes(2);
    });

    it('should isolate cache between companies', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, OTHER_COMPANY_ID, USER_ID);

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Meta
  // ═══════════════════════════════════════════════════════════

  describe('meta', () => {
    it('should include correct meta', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      const result = await service.generate(
        { fromDate: '2026-09-01', toDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.meta.title).toBe('تقرير أداء الكاشيرين');
      expect(result.meta.companyName).toBe('صيدلية داوا');
      expect(result.meta.fromDate).toBe('2026-09-01');
      expect(result.meta.toDate).toBe('2026-09-30');
      expect(result.meta.timezone).toBe('Africa/Cairo');
    });
  });
});
