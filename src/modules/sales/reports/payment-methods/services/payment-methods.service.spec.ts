import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { PaymentMethodsService } from './payment-methods.service';
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

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockSale(overrides: Record<string, any> = {}) {
  return {
    id: `sale-${Math.random().toString(36).slice(2, 8)}`,
    invoiceNumber: 'INV-PAY-001',
    branchId: BRANCH_ID,
    cashierId: USER_ID,
    subTotal: 100,
    discountTotal: 0,
    grandTotal: 100,
    paidAmount: 100,
    status: 'COMPLETED',
    paymentMethod: 'CASH',
    createdAt: new Date('2026-09-25T10:00:00Z'),
    customer: { name: 'عميل نقدي' },
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

describe('PaymentMethodsService', () => {
  let service: PaymentMethodsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(PaymentMethodsService);
  });

  afterEach(async () => {
    await cache.clear();
    jest.clearAllMocks();
  });

  describe('empty period', () => {
    it('should return zero summary when no sales exist', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary).toEqual({
        activeMethodsCount: 0,
        totalInvoicesCount: 0,
        totalGrossAmount: 0,
        totalReturnsAmount: 0,
        totalNetAmount: 0,
        overallAvgTicket: 0,
        mostUsedMethod: null,
        topMethodByAmount: null,
      });
      expect(result.methods).toEqual([]);
      expect(result.dailyTrend).toEqual([]);
    });
  });

  describe('single payment method stats', () => {
    it('should aggregate completed and returned sales correctly', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({
          paymentMethod: 'CASH',
          subTotal: 1000,
          discountTotal: 100,
          grandTotal: 900,
          paidAmount: 900,
          status: 'COMPLETED',
        }),
        mockSale({
          paymentMethod: 'CASH',
          subTotal: 200,
          discountTotal: 0,
          grandTotal: 200,
          paidAmount: 200,
          status: 'RETURNED',
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const m = result.methods[0];

      expect(m.method).toBe('CASH');
      expect(m.methodLabel).toBe('نقدي');
      expect(m.totalCount).toBe(2);
      expect(m.completedCount).toBe(1);
      expect(m.returnedCount).toBe(1);
      expect(m.grossAmount).toBe(1000);
      expect(m.returnsAmount).toBe(200);
      expect(m.netAmount).toBe(800);
      expect(m.percentage).toBe(100);
      expect(m.avgTicket).toBe(800);
      expect(m.returnRate).toBe(20);
      expect(m.rank).toBe(1);
    });

    it('should exclude returns from netAmount when includeReturns=false', async () => {
      prisma.sale.findMany.mockResolvedValue([
        mockSale({
          paymentMethod: 'CASH',
          subTotal: 1000,
          discountTotal: 100,
          grandTotal: 900,
          paidAmount: 900,
          status: 'COMPLETED',
        }),
        mockSale({
          paymentMethod: 'CASH',
          subTotal: 200,
          discountTotal: 0,
          grandTotal: 200,
          paidAmount: 200,
          status: 'RETURNED',
        }),
      ]);

      const result = await service.generate(
        { includeReturns: false },
        COMPANY_ID,
        USER_ID,
      );
      const m = result.methods[0];

      expect(m.netAmount).toBe(1000);
    });
  });

  describe('multiple payment methods and sorting', () => {
    function setupMultipleMethods() {
      return [
        mockSale({ paymentMethod: 'CASH', subTotal: 500, grandTotal: 500, paidAmount: 500 }),
        mockSale({ paymentMethod: 'CASH', subTotal: 500, grandTotal: 500, paidAmount: 500 }),
        mockSale({ paymentMethod: 'CARD', subTotal: 2000, grandTotal: 2000, paidAmount: 2000 }),
        mockSale({ paymentMethod: 'BANK_TRANSFER', subTotal: 1500, grandTotal: 1500, paidAmount: 1500 }),
      ];
    }

    it('should sort by amount desc by default', async () => {
      prisma.sale.findMany.mockResolvedValue(setupMultipleMethods());

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const methods = result.methods.map((m) => m.method);

      expect(methods[0]).toBe('CARD');
      expect(methods[1]).toBe('BANK_TRANSFER');
      expect(methods[2]).toBe('CASH');

      expect(result.summary.topMethodByAmount?.method).toBe('CARD');
      expect(result.summary.topMethodByAmount?.amount).toBe(2000);
      expect(result.summary.mostUsedMethod?.method).toBe('CASH');
      expect(result.summary.mostUsedMethod?.count).toBe(2);
    });

    it('should sort by count desc when requested', async () => {
      prisma.sale.findMany.mockResolvedValue(setupMultipleMethods());

      const result = await service.generate(
        { sortBy: 'count', sortOrder: 'desc' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.methods[0].method).toBe('CASH');
      expect(result.methods[0].totalCount).toBe(2);
    });
  });

  describe('security', () => {
    it('should reject companyId in filters', async () => {
      await expect(
        service.generate({ companyId: OTHER_COMPANY_ID } as any, COMPANY_ID, USER_ID),
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

  describe('cache', () => {
    it('should cache report on second call', async () => {
      prisma.sale.findMany.mockResolvedValue([mockSale()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, COMPANY_ID, USER_ID);

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(1);
    });

    it('should return fresh data after invalidate()', async () => {
      prisma.sale.findMany
        .mockResolvedValueOnce([
          mockSale({ grandTotal: 100, subTotal: 100 }),
        ])
        .mockResolvedValueOnce([
          mockSale({ grandTotal: 300, subTotal: 300 }),
        ]);

      const first = await service.generate({}, COMPANY_ID, USER_ID);
      expect(first.summary.totalGrossAmount).toBe(100);

      await service.invalidate(COMPANY_ID);

      const second = await service.generate({}, COMPANY_ID, USER_ID);
      expect(second.summary.totalGrossAmount).toBe(300);
      expect(prisma.sale.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
