import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { DailySalesService } from './daily-sales.service';
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

const CASHIER_1_ID = 'cashier-1111-0000-4000-8000-000000000001';
const CASHIER_2_ID = 'cashier-2222-0000-4000-8000-000000000002';

const MED_1_ID = 'med-1111-0000-4000-8000-000000000001';
const MED_2_ID = 'med-2222-0000-4000-8000-000000000002';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

/** ينشئ sale mock بالحقول الأساسية + overrides */
function mockSale(overrides: Record<string, any> = {}) {
  return {
    id: `sale-${Math.random().toString(36).slice(2, 8)}`,
    invoiceNumber: 'INV-TEST-001',
    companyId: COMPANY_ID,
    branchId: BRANCH_ID,
    cashierId: CASHIER_1_ID,
    subTotal: 100,
    discountTotal: 0,
    grandTotal: 100,
    paidAmount: 100,
    status: 'COMPLETED',
    paymentMethod: 'CASH',
    createdAt: new Date('2026-09-25T10:00:00Z'),
    cashier: { id: CASHIER_1_ID, name: 'أحمد علي' },
    customer: { name: 'عميل تجريبي' },
    _count: { items: 1 },
    ...overrides,
  };
}

/** Prisma mock — defaults آمنة */
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
    saleItem: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    medicine: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('DailySalesService', () => {
  let service: DailySalesService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailySalesService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(DailySalesService);
  });

  afterEach(async () => {
    await cache.clear();
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Empty period
  // ═══════════════════════════════════════════════════════════

  describe('empty period', () => {
    it('should return zero summary when no sales', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary).toEqual({
        totalInvoicesCount: 0,
        completedInvoicesCount: 0,
        returnedInvoicesCount: 0,
        grossSales: 0,
        totalDiscounts: 0,
        netSales: 0,
        totalReturns: 0,
        totalCollected: 0,
      });
      expect(result.paymentBreakdown).toEqual([]);
      expect(result.cashierBreakdown).toEqual([]);
      expect(result.topProducts).toEqual([]);
      expect(prisma.saleItem.groupBy).not.toHaveBeenCalled();
      expect(result.invoices).toEqual([]);
      expect(result.hourlyBreakdown).toHaveLength(24);
      expect(result.hourlyBreakdown.every((h) => h.invoicesCount === 0)).toBe(
        true,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Single completed sale
  // ═══════════════════════════════════════════════════════════

  describe('single completed sale', () => {
    it('should calculate summary correctly', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({
          subTotal: 1000,
          discountTotal: 100,
          grandTotal: 900,
          paidAmount: 900,
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary).toMatchObject({
        totalInvoicesCount: 1,
        completedInvoicesCount: 1,
        returnedInvoicesCount: 0,
        grossSales: 1000,
        totalDiscounts: 100,
        netSales: 900,
        totalReturns: 0,
        totalCollected: 900,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Mixed completed + returned
  // ═══════════════════════════════════════════════════════════

  describe('mixed completed + returned', () => {
    it('should subtract returns from netSales', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({
          id: 'sale-completed',
          status: 'COMPLETED',
          subTotal: 1000,
          discountTotal: 100,
          grandTotal: 900,
          paidAmount: 900,
        }),
        mockSale({
          id: 'sale-returned',
          status: 'RETURNED',
          subTotal: 200,
          discountTotal: 0,
          grandTotal: 200,
          paidAmount: 200,
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary.netSales).toBe(700);
      expect(result.summary.grossSales).toBe(1000);
      expect(result.summary.totalDiscounts).toBe(100);
      expect(result.summary.totalReturns).toBe(200);
      expect(result.summary.totalCollected).toBe(700);
      expect(result.summary.completedInvoicesCount).toBe(1);
      expect(result.summary.returnedInvoicesCount).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Payment breakdown
  // ═══════════════════════════════════════════════════════════

  describe('payment breakdown', () => {
    it('should aggregate by payment method and compute percentages', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({ paymentMethod: 'CASH', grandTotal: 600 }),
        mockSale({ paymentMethod: 'CASH', grandTotal: 400 }),
        mockSale({ paymentMethod: 'BANK', grandTotal: 500 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      const cash = result.paymentBreakdown.find((p) => p.method === 'CASH');
      const bank = result.paymentBreakdown.find((p) => p.method === 'BANK');

      expect(cash?.amount).toBe(1000);
      expect(bank?.amount).toBe(500);
      expect(cash?.percentage).toBeCloseTo(66.67, 1);
      expect(bank?.percentage).toBeCloseTo(33.33, 1);
    });

    it('should handle returned sales without negative percentages', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({ paymentMethod: 'CASH', grandTotal: 100 }),
        mockSale({
          paymentMethod: 'CASH',
          grandTotal: 100,
          status: 'RETURNED',
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const cash = result.paymentBreakdown.find((p) => p.method === 'CASH');

      expect(cash?.amount).toBe(0);
      expect(cash?.percentage).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Cashier breakdown
  // ═══════════════════════════════════════════════════════════

  describe('cashier breakdown', () => {
    it('should separate returns from totalSales and compute netTotal', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({
          cashierId: CASHIER_1_ID,
          cashier: { id: CASHIER_1_ID, name: 'أحمد' },
          grandTotal: 1000,
        }),
        mockSale({
          cashierId: CASHIER_1_ID,
          cashier: { id: CASHIER_1_ID, name: 'أحمد' },
          grandTotal: 200,
          status: 'RETURNED',
        }),
        mockSale({
          cashierId: CASHIER_2_ID,
          cashier: { id: CASHIER_2_ID, name: 'محمد' },
          grandTotal: 500,
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      const cashier1 = result.cashierBreakdown.find(
        (c) => c.cashierId === CASHIER_1_ID,
      );
      const cashier2 = result.cashierBreakdown.find(
        (c) => c.cashierId === CASHIER_2_ID,
      );

      expect(cashier1?.totalSales).toBe(1200);
      expect(cashier1?.returns).toBe(200);
      expect(cashier1?.netTotal).toBe(1000);

      expect(cashier2?.totalSales).toBe(500);
      expect(cashier2?.returns).toBe(0);
      expect(cashier2?.netTotal).toBe(500);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Hourly breakdown
  // ═══════════════════════════════════════════════════════════

  describe('hourly breakdown', () => {
    it('should always return 24 items', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.hourlyBreakdown).toHaveLength(24);
      expect(result.hourlyBreakdown[0].hour).toBe(0);
      expect(result.hourlyBreakdown[23].hour).toBe(23);
      expect(result.hourlyBreakdown[0].hourLabel).toBe('12 ص');
      expect(result.hourlyBreakdown[12].hourLabel).toBe('12 م');
    });

    it('should aggregate sales at the correct hour (Cairo timezone)', async () => {
      // 2026-09-25T10:00:00Z = 13:00 Cairo (UTC+3 during DST)
      prisma.sale.findMany.mockResolvedValue([
        mockSale({ createdAt: new Date('2026-09-25T10:00:00Z') }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const hour13 = result.hourlyBreakdown.find((h) => h.hour === 13);

      expect(hour13?.invoicesCount).toBe(1);
      expect(hour13?.totalSales).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. Top products
  // ═══════════════════════════════════════════════════════════

  describe('top products', () => {
    it('should map medicine names correctly', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);
      prisma.saleItem.findMany.mockResolvedValue([
        {
          totalBaseQty: 10,
          returnedQty: 0,
          totalPrice: 500,
          batch: { medicineId: MED_1_ID, medicine: { id: MED_1_ID, tradeName: 'بنادول' } },
        },
        {
          totalBaseQty: 5,
          returnedQty: 0,
          totalPrice: 250,
          batch: { medicineId: MED_2_ID, medicine: { id: MED_2_ID, tradeName: 'أوجمنتين' } },
        },
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.topProducts).toHaveLength(2);
      expect(result.topProducts[0]).toEqual({
        medicineId: MED_1_ID,
        tradeName: 'بنادول',
        totalQuantity: 10,
        totalSales: 500,
      });
    });

    it('should handle missing medicine name gracefully', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);
      prisma.saleItem.findMany.mockResolvedValue([
        {
          totalBaseQty: 1,
          returnedQty: 0,
          totalPrice: 100,
          batch: { medicineId: 'unknown-med', medicine: null },
        },
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.topProducts[0].tradeName).toBe('صنف غير معروف');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Security
  // ═══════════════════════════════════════════════════════════

  describe('security', () => {
    it('should reject companyId passed in filters', async () => {
      const maliciousFilters: any = { companyId: OTHER_COMPANY_ID };

      await expect(
        service.generate(maliciousFilters, COMPANY_ID, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject branchId that belongs to another company', async () => {
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
  // 9. Cache behavior
  // ═══════════════════════════════════════════════════════════

  describe('cache', () => {
    it('should cache the report on second call (0 DB hits)', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, COMPANY_ID, USER_ID);

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache when skipCache=true', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({ skipCache: 'true' }, COMPANY_ID, USER_ID);

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(2);
    });

    it('should return fresh data when cache is invalidated', async () => {
      prisma.sale.findMany
        .mockResolvedValueOnce([mockSale({ grandTotal: 100, subTotal: 100 })])
        .mockResolvedValueOnce([mockSale({ grandTotal: 200, subTotal: 200 })]);

      const first = await service.generate({}, COMPANY_ID, USER_ID);
      expect(first.summary.grossSales).toBe(100);

      await service.invalidate(COMPANY_ID);

      const second = await service.generate({}, COMPANY_ID, USER_ID);
      expect(second.summary.grossSales).toBe(200);
      expect(prisma.sale.findMany).toHaveBeenCalledTimes(2);
    });

    it('should isolate cache between different companies', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, OTHER_COMPANY_ID, USER_ID);

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 10. Meta
  // ═══════════════════════════════════════════════════════════

  describe('meta', () => {
    it('should include correct meta from context', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      const result = await service.generate(
        { fromDate: '2026-09-01', toDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.meta.title).toBe('تقرير المبيعات اليومية والشاملة');
      expect(result.meta.companyName).toBe('صيدلية داوا');
      expect(result.meta.fromDate).toBe('2026-09-01');
      expect(result.meta.toDate).toBe('2026-09-30');
      expect(result.meta.timezone).toBe('Africa/Cairo');
      expect(result.meta.generatedBy.name).toBe('مدير النظام');
    });
  });
});
