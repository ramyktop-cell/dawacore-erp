import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { CustomerAgingService } from './customer-aging.service';
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
    customer: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        const lastResult = prisma.customer.findMany.mock.results.slice(-1)[0];
        if (lastResult && lastResult.value) {
          const customers = await lastResult.value;
          if (Array.isArray(customers)) {
            return customers.find((c: any) => c.id === where?.id) || null;
          }
        }
        return null;
      }),
    },
    sale: {
      findMany: jest.fn().mockImplementation(async () => {
        const lastResult = prisma.customer.findMany.mock.results.slice(-1)[0];
        if (lastResult && lastResult.value) {
          const customers = await lastResult.value;
          if (Array.isArray(customers)) {
            const sales: any[] = [];
            for (const c of customers) {
              if (Array.isArray(c.sales)) {
                for (const s of c.sales) {
                  sales.push({
                    ...s,
                    customerId: s.customerId || c.id,
                  });
                }
              }
            }
            return sales;
          }
        }
        return [];
      }),
    },
  };

  return prisma;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('CustomerAgingService', () => {
  let service: CustomerAgingService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAgingService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(CustomerAgingService);
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

    it('يتحقق من تمرير companyId في استعلام العملاء', async () => {
      await service.generate({}, COMPANY_ID, USER_ID);

      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
        }),
      );
    });
  });

  // ===========================================================
  // 2. تصنيف الفواتير في الشرائح الأربع (Aging Buckets)
  // ===========================================================

  describe('Aging Buckets Calculation', () => {
    it('يصنف الفواتير حسب أعمارها بدقة (0-30، 31-60، 61-90، +90)', async () => {
      // مرجع التاريخ: 2026-09-30
      // فاتورة عمرها 10 أيام (2026-09-20) -> CURRENT
      // فاتورة عمرها 40 يوماً (2026-08-21) -> DAYS_31_60
      // فاتورة عمرها 70 يوماً (2026-07-22) -> DAYS_61_90
      // فاتورة عمرها 100 يوم (2026-06-22) -> OVER_90

      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-1',
          name: 'صيدلية النور',
          phone: '01012345678',
          creditLimit: 50000,
          currentDebt: 0,
          sales: [
            {
              id: 's1',
              invoiceNumber: 'INV-101',
              grandTotal: 1000,
              paidAmount: 0,
              createdAt: new Date('2026-09-20T10:00:00Z'),
              returns: [],
            },
            {
              id: 's2',
              invoiceNumber: 'INV-102',
              grandTotal: 2000,
              paidAmount: 500, // متبقي 1500
              createdAt: new Date('2026-08-21T10:00:00Z'),
              returns: [],
            },
            {
              id: 's3',
              invoiceNumber: 'INV-103',
              grandTotal: 3000,
              paidAmount: 0,
              createdAt: new Date('2026-07-22T10:00:00Z'),
              returns: [],
            },
            {
              id: 's4',
              invoiceNumber: 'INV-104',
              grandTotal: 4000,
              paidAmount: 0,
              createdAt: new Date('2026-06-22T10:00:00Z'),
              returns: [],
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers.length).toBe(1);
      const cust = res.customers[0];

      // إجمالي الرصيد: 1000 + 1500 + 3000 + 4000 = 9500
      expect(cust.currentBalance).toBe(9500);
      expect(cust.buckets.current).toBe(1000);
      expect(cust.buckets.days31_60).toBe(1500);
      expect(cust.buckets.days61_90).toBe(3000);
      expect(cust.buckets.over90).toBe(4000);

      // مستوى المخاطر: أقدم فاتورة عمرها 100 يوم -> CRITICAL
      expect(cust.riskLevel).toBe('CRITICAL');
      expect(cust.oldestDocumentDays).toBeGreaterThan(90);

      // ملخص التقرير
      expect(res.summary.totalBalance).toBe(9500);
      expect(res.summary.buckets[0].amount).toBe(1000);
      expect(res.summary.buckets[1].amount).toBe(1500);
      expect(res.summary.buckets[2].amount).toBe(3000);
      expect(res.summary.buckets[3].amount).toBe(4000);
    });

    it('يطرح المرتجعات (SaleReturn) من رصيد الفاتورة', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-ret',
          name: 'صيدلية الشفاء',
          creditLimit: 10000,
          currentDebt: 0,
          sales: [
            {
              id: 's-ret',
              invoiceNumber: 'INV-RET-1',
              grandTotal: 1000,
              paidAmount: 200,
              createdAt: new Date('2026-09-25T10:00:00Z'),
              returns: [
                { totalRefund: 300 }, // مرتجع 300
              ],
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      // المتبقي: 1000 - 200 - 300 = 500
      expect(res.customers[0].currentBalance).toBe(500);
      expect(res.customers[0].buckets.current).toBe(500);
    });

    it('يتجاهل الفواتير المسددة بالكامل (remaining <= 0.01)', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-paid',
          name: 'صيدلية المسدد',
          creditLimit: 10000,
          currentDebt: 0,
          sales: [
            {
              id: 's-paid',
              invoiceNumber: 'INV-PAID',
              grandTotal: 1000,
              paidAmount: 1000,
              createdAt: new Date('2026-09-10T10:00:00Z'),
              returns: [],
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30', includeZeroBalance: false },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers.length).toBe(0);
      expect(res.summary.totalBalance).toBe(0);
    });

    it('يعتمد عتبات مخصصة (Custom Thresholds: 15/45/75)', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-custom',
          name: 'عميل العتبات المخصصة',
          creditLimit: 10000,
          currentDebt: 0,
          sales: [
            {
              id: 's-custom',
              invoiceNumber: 'INV-C1',
              grandTotal: 1000,
              paidAmount: 0,
              // عمرها 20 يوماً -> في العتبة الافتراضية CURRENT، لكن مع bucket1=15 تكون في DAYS_31_60!
              createdAt: new Date('2026-09-10T10:00:00Z'),
              returns: [],
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
      expect(res.customers[0].buckets.current).toBe(0);
      expect(res.customers[0].buckets.days31_60).toBe(1000);
    });
  });

  // ===========================================================
  // 3. الرصيد الدفتري والـ Fallback
  // ===========================================================

  describe('CurrentDebt Fallback', () => {
    it('يضع رصيد العميل في CURRENT إذا كان عليه currentDebt > 0 بدون فواتير مسجلة', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-fallback',
          name: 'عميل رصيد افتتاحي',
          creditLimit: 5000,
          currentDebt: 3500, // رصيد سابق بدون فواتير مبيعات
          sales: [],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers.length).toBe(1);
      expect(res.customers[0].currentBalance).toBe(3500);
      expect(res.customers[0].buckets.current).toBe(3500);
      expect(res.customers[0].riskLevel).toBe('LOW');
    });
  });

  // ===========================================================
  // 4. خيارات التصفية والفرز (Filters & Sorting)
  // ===========================================================

  describe('Filters & Sorting', () => {
    it('يتضمن العملاء بلا رصيد عند طلب includeZeroBalance: true', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-zero',
          name: 'عميل صفري',
          creditLimit: 5000,
          currentDebt: 0,
          sales: [],
        },
      ]);

      const res = await service.generate(
        { includeZeroBalance: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers.length).toBe(1);
      expect(res.customers[0].currentBalance).toBe(0);
    });

    it('يفرز العملاء تصاعدياً وتنازلياً حسب الرصيد أو الاسم أو المخاطر', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'ب صيدلية الأمل',
          creditLimit: 0,
          currentDebt: 1000,
          sales: [],
        },
        {
          id: 'c2',
          name: 'أ صيدلية السلام',
          creditLimit: 0,
          currentDebt: 5000,
          sales: [],
        },
      ]);

      // فرز حسب الاسم asc
      const resNameAsc = await service.generate(
        { sortBy: 'partnerName', sortOrder: 'asc' },
        COMPANY_ID,
        USER_ID,
      );
      expect(resNameAsc.customers[0].partnerName).toContain('أ');

      // فرز حسب الرصيد desc (افتراضي)
      const resBalanceDesc = await service.generate(
        { sortBy: 'totalBalance', sortOrder: 'desc' },
        COMPANY_ID,
        USER_ID,
      );
      expect(resBalanceDesc.customers[0].currentBalance).toBe(5000);
    });

    it('يخفي تفاصيل الفواتير عند إرسال includeInvoices: false', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-no-inv',
          name: 'عميل',
          creditLimit: 0,
          currentDebt: 0,
          sales: [
            {
              id: 's1',
              invoiceNumber: 'INV-1',
              grandTotal: 1000,
              paidAmount: 0,
              createdAt: new Date('2026-09-20'),
              returns: [],
            },
          ],
        },
      ]);

      const res = await service.generate(
        { includeInvoices: false },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers[0].documents).toBeUndefined();
      expect(res.customers[0].invoices).toBeUndefined();
    });

    it('يُظهر تفاصيل الفواتير عند إرسال includeInvoices: true', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-with-inv',
          name: 'عميل مع فواتير',
          creditLimit: 0,
          currentDebt: 0,
          sales: [
            {
              id: 's1',
              invoiceNumber: 'INV-1',
              grandTotal: 1000,
              paidAmount: 0,
              createdAt: new Date('2026-09-20'),
              returns: [],
            },
          ],
        },
      ]);

      const res = await service.generate(
        { includeInvoices: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers[0].documents?.length).toBe(1);
      expect(res.customers[0].documents?.[0].documentNumber).toBe('INV-1');
    });

    it('يفلتر العملاء المتأخرين فقط (onlyOverdue: true)', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-current-only',
          name: 'عميل جاري فقط (عمره 10 أيام)',
          sales: [
            {
              id: 's1',
              invoiceNumber: 'INV-10',
              grandTotal: 500,
              paidAmount: 0,
              createdAt: new Date('2026-09-20T10:00:00Z'),
              returns: [],
            },
          ],
        },
        {
          id: 'cust-overdue',
          name: 'عميل متأخر (عمره 50 يوماً)',
          sales: [
            {
              id: 's2',
              invoiceNumber: 'INV-50',
              grandTotal: 800,
              paidAmount: 0,
              createdAt: new Date('2026-08-11T10:00:00Z'),
              returns: [],
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30', onlyOverdue: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers.length).toBe(1);
      expect(res.customers[0].customerId).toBe('cust-overdue');
    });

    it('يفلتر حسب الشريحة المحددة (bucket: DAYS_31_60)', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'c-curr',
          name: 'عميل جاري',
          sales: [
            {
              id: 's1',
              invoiceNumber: 'INV-1',
              grandTotal: 1000,
              paidAmount: 0,
              createdAt: new Date('2026-09-20T10:00:00Z'),
              returns: [],
            },
          ],
        },
        {
          id: 'c-b2',
          name: 'عميل شريحة ثانية',
          sales: [
            {
              id: 's2',
              invoiceNumber: 'INV-2',
              grandTotal: 2000,
              paidAmount: 0,
              createdAt: new Date('2026-08-15T10:00:00Z'),
              returns: [],
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30', bucket: 'DAYS_31_60' },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers.length).toBe(1);
      expect(res.customers[0].customerId).toBe('c-b2');
    });
  });

  // ===========================================================
  // 5. المؤشرات المالية في الملخص (Financial Ratios)
  // ===========================================================

  describe('Summary Ratios', () => {
    it('يحسب نسب الديون المتأخرة والحرجة ومتوسط الدين بدقة', async () => {
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'عميل 1',
          currentDebt: 0,
          sales: [
            {
              id: 's1',
              invoiceNumber: 'INV-1',
              grandTotal: 1000, // 0-30 يوم
              paidAmount: 0,
              createdAt: new Date('2026-09-25T10:00:00Z'),
              returns: [],
            },
            {
              id: 's2',
              invoiceNumber: 'INV-2',
              grandTotal: 1000, // +90 يوم
              paidAmount: 0,
              createdAt: new Date('2026-05-01T10:00:00Z'),
              returns: [],
            },
          ],
        },
      ]);

      const res = await service.generate(
        { asOfDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      // إجمالي: 2000
      // المتأخر (>30): 1000 (50%)
      // الحرج (>90): 1000 (50%)
      // متوسط دين العميل: 2000
      expect(res.summary.totalBalance).toBe(2000);
      expect(res.summary.ratios.overdueRatio).toBe(50);
      expect(res.summary.ratios.criticalRatio).toBe(50);
      expect(res.summary.ratios.averageDebtPerPartner).toBe(2000);
    });
  });

  // ===========================================================
  // 6. التخزين المؤقت (Caching)
  // ===========================================================

  describe('Caching', () => {
    it('يقرأ من الـ Cache في الاستدعاء الثاني لنفس المعايير', async () => {
      prisma.customer.findMany.mockResolvedValue([]);

      await service.generate({ asOfDate: '2026-09-30' }, COMPANY_ID, USER_ID);
      expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);

      await service.generate({ asOfDate: '2026-09-30' }, COMPANY_ID, USER_ID);
      expect(prisma.customer.findMany).toHaveBeenCalledTimes(1); // لم يزداد
    });

    it('يتجاوز الـ Cache عند تمرير skipCache: "true"', async () => {
      prisma.customer.findMany.mockResolvedValue([]);

      await service.generate({ asOfDate: '2026-09-30' }, COMPANY_ID, USER_ID);
      expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);

      await service.generate(
        { asOfDate: '2026-09-30', skipCache: 'true' },
        COMPANY_ID,
        USER_ID,
      );
      expect(prisma.customer.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================
  // 7. التدقيق التفصيلي (Drill-Down) والدقة التاريخية
  // ===========================================================

  describe('Drill-Down & Historical Accuracy', () => {
    it('يجلب فواتير عميل محدد مفصلة ومرتبة تنازلياً حسب عمر الدين', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-drill',
        name: 'عميل الفحص',
        phone: '0100000000',
        creditLimit: 10000,
        currentDebt: 0,
      });

      prisma.sale.findMany.mockResolvedValue([
        {
          id: 's-old',
          invoiceNumber: 'INV-OLD',
          customerId: 'cust-drill',
          grandTotal: 1000,
          paidAmount: 0,
          createdAt: new Date('2026-06-01T10:00:00Z'),
          payments: [],
          returns: [],
        },
        {
          id: 's-recent',
          invoiceNumber: 'INV-NEW',
          customerId: 'cust-drill',
          grandTotal: 500,
          paidAmount: 0,
          createdAt: new Date('2026-09-20T10:00:00Z'),
          payments: [],
          returns: [],
        },
      ]);

      const res = await service.drillDown(
        { customerId: 'cust-drill', asOfDate: '2026-09-30' },
        COMPANY_ID,
      );

      expect(res.customer.id).toBe('cust-drill');
      expect(res.invoices.length).toBe(2);
      expect(res.invoices[0].invoiceNumber).toBe('INV-OLD'); // أقدم فاتورة أولاً
      expect(res.invoices[0].bucket).toBe('OVER_90');
      expect(res.invoices[1].bucket).toBe('CURRENT');
      expect(res.totalOutstanding).toBe(1500);
    });

    it('يحسب المدفوعات التاريخية بدقة ويتجاهل السداد اللاحق لتاريخ asOfDate', async () => {
      // فاتورة قيمتها 1000 أُنشئت في 1 سبتمبر
      // تم سداد 300 في 15 سبتمبر (قبل asOfDate 20 سبتمبر)
      // تم سداد 700 في 25 سبتمبر (بعد asOfDate 20 سبتمبر)
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cust-history',
          name: 'عميل الفحص التاريخي',
          creditLimit: 10000,
          currentDebt: 0,
          sales: [
            {
              id: 's-hist',
              invoiceNumber: 'INV-HIST',
              grandTotal: 1000,
              paidAmount: 1000, // مسددة كلياً في الحاضر!
              createdAt: new Date('2026-09-01T10:00:00Z'),
              payments: [
                { amount: 300, createdAt: new Date('2026-09-15T10:00:00Z') },
                { amount: 700, createdAt: new Date('2026-09-25T10:00:00Z') },
              ],
              returns: [],
            },
          ],
        },
      ]);

      // عند طلب التقرير كما في 2026-09-20:
      // يجب أن يظهر الرصيد القائم = 1000 - 300 = 700، وليس صفر!
      const res = await service.generate(
        { asOfDate: '2026-09-20' },
        COMPANY_ID,
        USER_ID,
      );

      expect(res.customers.length).toBe(1);
      expect(res.customers[0].currentBalance).toBe(700);
      expect(res.customers[0].buckets.current).toBe(700);
    });
  });
});
