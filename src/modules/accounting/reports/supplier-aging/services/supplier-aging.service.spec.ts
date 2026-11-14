import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { SupplierAgingService } from './supplier-aging.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  ReportMetaBuilder,
  CACHE_SERVICE,
  ICacheService,
} from 'src/shared/report-kit';
import { LruCacheAdapter } from 'src/shared/report-kit/cache/lru-cache.adapter';

// ─────────────────────────────────────────────────────────────
// Constants & Fixtures
// ─────────────────────────────────────────────────────────────

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const OTHER_COMPANY_ID = '22222222-0000-4000-8000-000000000002';
const BRANCH_ID = '037e9314-251a-47cf-af17-0dbc75eb1bdb';
const OTHER_BRANCH_ID = 'aaaaaaaa-0000-4000-8000-000000000099';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

function createPrismaMock() {
  const prisma: any = {
    company: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === COMPANY_ID) {
          return Promise.resolve({
            id: COMPANY_ID,
            name: 'شركة الأمل الطبية',
            timezone: 'Africa/Cairo',
            fiscalYearStartMonth: 1,
          });
        }
        return Promise.resolve(null);
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: USER_ID,
        name: 'أحمد المحاسب',
      }),
    },
    branch: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === BRANCH_ID && where.companyId === COMPANY_ID) {
          return Promise.resolve({
            id: BRANCH_ID,
            name: 'الفرع الرئيسي',
            companyId: COMPANY_ID,
          });
        }
        return Promise.resolve(null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === BRANCH_ID) {
          return Promise.resolve({
            id: BRANCH_ID,
            name: 'الفرع الرئيسي',
            companyId: COMPANY_ID,
          });
        }
        if (where.id === OTHER_BRANCH_ID) {
          return Promise.resolve({
            id: OTHER_BRANCH_ID,
            name: 'فرع شركة أخرى',
            companyId: OTHER_COMPANY_ID,
          });
        }
        return Promise.resolve(null);
      }),
    },
    supplier: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return prisma;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('SupplierAgingService', () => {
  let service: SupplierAgingService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierAgingService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(SupplierAgingService);
  });

  afterEach(async () => {
    await cache.clear();
  });

  // ===========================================================
  // 1. الأمان وحماية الـ Multi-Tenant
  // ===========================================================

  describe('Multi-Tenant & Security', () => {
    it('يرفض التقرير إذا كانت الشركة غير موجودة', async () => {
      await expect(
        service.generate({}, 'non-existent-company', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('يرفض التقرير إذا كان الفرع لا يتبع نفس الشركة (Cross-Tenant Branch)', async () => {
      await expect(
        service.generate({ branchId: OTHER_BRANCH_ID }, COMPANY_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('يتحقق من تمرير companyId في استعلام الموردين', async () => {
      await service.generate({}, COMPANY_ID, USER_ID);

      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
        }),
      );
    });
  });

  // ===========================================================
  // 2. تصنيف أوامر الشراء في الشرائح الأربع (Aging Buckets)
  // ===========================================================

  describe('Aging Buckets Calculation', () => {
    it('يصنف أوامر الشراء المستلمة بدقة في الشرائح الأربع (0-30، 31-60، 61-90، +90)', async () => {
      // مرجع: 2026-09-30
      // أمر شراء مستلم قبل 10 أيام (2026-09-20) -> CURRENT
      // أمر شراء مستلم قبل 40 يوماً (2026-08-21) -> DAYS_31_60
      // أمر شراء مستلم قبل 70 يوماً (2026-07-22) -> DAYS_61_90
      // أمر شراء مستلم قبل 100 يوم (2026-06-22) -> OVER_90

      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'supp-1',
          name: 'شركة فارما للأدوية',
          companyName: 'فارما جروب',
          phone: '01122334455',
          currentDebt: 0,
          purchases: [
            {
              id: 'p1',
              orderNumber: 'PO-001',
              invoiceNumber: 'INV-S1',
              totalAmount: 5000,
              paidAmount: 2000, // متبقي 3000
              receivedAt: new Date('2026-09-20T10:00:00Z'),
              createdAt: new Date('2026-09-18T10:00:00Z'),
            },
            {
              id: 'p2',
              orderNumber: 'PO-002',
              invoiceNumber: 'INV-S2',
              totalAmount: 4000,
              paidAmount: 0,
              receivedAt: new Date('2026-08-21T10:00:00Z'),
              createdAt: new Date('2026-08-20T10:00:00Z'),
            },
            {
              id: 'p3',
              orderNumber: 'PO-003',
              invoiceNumber: 'INV-S3',
              totalAmount: 2000,
              paidAmount: 0,
              receivedAt: new Date('2026-07-22T10:00:00Z'),
              createdAt: new Date('2026-07-20T10:00:00Z'),
            },
            {
              id: 'p4',
              orderNumber: 'PO-004',
              invoiceNumber: 'INV-S4',
              totalAmount: 1000,
              paidAmount: 0,
              receivedAt: new Date('2026-06-22T10:00:00Z'),
              createdAt: new Date('2026-06-20T10:00:00Z'),
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.suppliers.length).toBe(1);
      const supp = res.suppliers[0];

      // إجمالي: 3000 + 4000 + 2000 + 1000 = 10000
      expect(supp.currentBalance).toBe(10000);
      expect(supp.buckets.current).toBe(3000);
      expect(supp.buckets.days31_60).toBe(4000);
      expect(supp.buckets.days61_90).toBe(2000);
      expect(supp.buckets.over90).toBe(1000);

      // مستوى المخاطر: CRITICAL
      expect(supp.riskLevel).toBe('CRITICAL');
      expect(supp.oldestDocumentDays).toBeGreaterThan(90);

      // ملخص التقرير
      expect(res.summary.totalBalance).toBe(10000);
      expect(res.summary.buckets[0].amount).toBe(3000);
      expect(res.summary.buckets[1].amount).toBe(4000);
      expect(res.summary.buckets[2].amount).toBe(2000);
      expect(res.summary.buckets[3].amount).toBe(1000);
    });

    it('يتجاهل أوامر الشراء المسددة بالكامل (remaining <= 0.01)', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'supp-paid',
          name: 'مورد مسدد',
          currentDebt: 0,
          purchases: [
            {
              id: 'p-paid',
              orderNumber: 'PO-PAID',
              totalAmount: 5000,
              paidAmount: 5000,
              receivedAt: new Date('2026-09-10T10:00:00Z'),
              createdAt: new Date('2026-09-10T10:00:00Z'),
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30', includeZeroBalance: false },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.suppliers.length).toBe(0);
      expect(res.summary.totalBalance).toBe(0);
    });

    it('يعتمد عتبات مخصصة (Custom Thresholds: 15/45/75)', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'supp-custom',
          name: 'مورد العتبات المخصصة',
          currentDebt: 0,
          purchases: [
            {
              id: 'p-custom',
              orderNumber: 'PO-C1',
              totalAmount: 1000,
              paidAmount: 0,
              // عمرها 20 يوماً -> في العتبة 15-45 تكون في DAYS_31_60
              receivedAt: new Date('2026-09-10T10:00:00Z'),
              createdAt: new Date('2026-09-10T10:00:00Z'),
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30', bucket1: 15, bucket2: 45, bucket3: 75 },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.thresholds.bucket1).toBe(15);
      expect(res.thresholds.bucket2).toBe(45);
      expect(res.thresholds.bucket3).toBe(75);
      expect(res.suppliers[0].buckets.current).toBe(0);
      expect(res.suppliers[0].buckets.days31_60).toBe(1000);
    });
  });

  // ===========================================================
  // 3. الرصيد الدفتري والـ Fallback
  // ===========================================================

  describe('CurrentDebt Fallback', () => {
    it('يضع رصيد المورد في CURRENT إذا كان عليه currentDebt > 0 بدون أوامر شراء مسجلة', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'supp-fallback',
          name: 'مورد رصيد افتتاحي',
          currentDebt: 7500,
          purchases: [],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.suppliers.length).toBe(1);
      expect(res.suppliers[0].currentBalance).toBe(7500);
      expect(res.suppliers[0].buckets.current).toBe(7500);
      expect(res.suppliers[0].riskLevel).toBe('LOW');
    });
  });

  // ===========================================================
  // 4. خيارات التصفية والفرز (Filters & Sorting)
  // ===========================================================

  describe('Filters & Sorting', () => {
    it('يتضمن الموردين بلا رصيد عند طلب includeZeroBalance: true', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'supp-zero',
          name: 'مورد صفري',
          currentDebt: 0,
          purchases: [],
        },
      ]);

      const res = await service.generate(
        { includeZeroBalance: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.suppliers.length).toBe(1);
      expect(res.suppliers[0].currentBalance).toBe(0);
    });

    it('يفرز الموردين تصاعدياً وتنازلياً حسب الرصيد أو الاسم أو المخاطر', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 's1',
          name: 'ب شركة التوريدات',
          currentDebt: 2000,
          purchases: [],
        },
        {
          id: 's2',
          name: 'أ شركة الأدوية',
          currentDebt: 8000,
          purchases: [],
        },
      ]);

      // فرز حسب الاسم asc
      const resNameAsc = await service.generate(
        { sortBy: 'partnerName', sortOrder: 'asc' },
        COMPANY_ID,
        USER_ID,
      );
      expect(resNameAsc.suppliers[0].partnerName).toContain('أ');

      // فرز حسب الرصيد desc (افتراضي)
      const resBalanceDesc = await service.generate(
        { sortBy: 'totalBalance', sortOrder: 'desc' },
        COMPANY_ID,
        USER_ID,
      );
      expect(resBalanceDesc.suppliers[0].currentBalance).toBe(8000);
    });

    it('يخفي تفاصيل أوامر الشراء عند إرسال includeInvoices: false', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'supp-no-inv',
          name: 'مورد',
          currentDebt: 0,
          purchases: [
            {
              id: 'p1',
              orderNumber: 'PO-1',
              totalAmount: 1000,
              paidAmount: 0,
              receivedAt: new Date('2026-09-20'),
              createdAt: new Date('2026-09-20'),
            },
          ],
        },
      ]);

      const res = await service.generate(
        { includeInvoices: false },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.suppliers[0].documents).toBeUndefined();
      expect(res.suppliers[0].invoices).toBeUndefined();
    });
  });

  // ===========================================================
  // 5. المؤشرات المالية في الملخص (Financial Ratios)
  // ===========================================================

  describe('Summary Ratios', () => {
    it('يحسب نسب المستحقات المتأخرة والحرجة ومتوسط الدين بدقة', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 's1',
          name: 'مورد 1',
          currentDebt: 0,
          purchases: [
            {
              id: 'p1',
              orderNumber: 'PO-1',
              totalAmount: 2000, // 0-30 يوم
              paidAmount: 0,
              receivedAt: new Date('2026-09-25T10:00:00Z'),
              createdAt: new Date('2026-09-20T10:00:00Z'),
            },
            {
              id: 'p2',
              orderNumber: 'PO-2',
              totalAmount: 2000, // +90 يوم
              paidAmount: 0,
              receivedAt: new Date('2026-05-01T10:00:00Z'),
              createdAt: new Date('2026-04-20T10:00:00Z'),
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      // إجمالي: 4000
      // المتأخر (>30): 2000 (50%)
      // الحرج (>90): 2000 (50%)
      // متوسط دين المورد: 4000
      expect(res.summary.totalBalance).toBe(4000);
      expect(res.summary.ratios.overdueRatio).toBe(50);
      expect(res.summary.ratios.criticalRatio).toBe(50);
      expect(res.summary.ratios.averageDebtPerPartner).toBe(4000);
    });
  });

  // ===========================================================
  // 6. التخزين المؤقت (Caching)
  // ===========================================================

  describe('Caching', () => {
    it('يقرأ من الـ Cache في الاستدعاء الثاني لنفس المعايير', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);

      await service.generate({ asOfDate: '2026-09-30' }, COMPANY_ID, USER_ID);
      expect(prisma.supplier.findMany).toHaveBeenCalledTimes(1);

      await service.generate({ asOfDate: '2026-09-30' }, COMPANY_ID, USER_ID);
      expect(prisma.supplier.findMany).toHaveBeenCalledTimes(1);
    });

    it('يتجاوز الـ Cache عند تمرير skipCache: "true"', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);

      await service.generate({ asOfDate: '2026-09-30' }, COMPANY_ID, USER_ID);
      expect(prisma.supplier.findMany).toHaveBeenCalledTimes(1);

      await service.generate(
        { asOfDate: '2026-09-30', skipCache: 'true' },
        COMPANY_ID,
        USER_ID,
      );
      expect(prisma.supplier.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
