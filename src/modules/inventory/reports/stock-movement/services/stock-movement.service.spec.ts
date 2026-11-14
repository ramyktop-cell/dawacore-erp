import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { StockMovementService } from './stock-movement.service';
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

const MED_1 = 'med-1111-0000-4000-8000-000000000001';
const MED_2 = 'med-2222-0000-4000-8000-000000000002';
const MED_3 = 'med-3333-0000-4000-8000-000000000003';

const BATCH_1 = 'batch-1111-0000-4000-8000-000000000001';
const BATCH_2 = 'batch-2222-0000-4000-8000-000000000002';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockMedicine(overrides: Partial<any> = {}) {
  return {
    id: MED_1,
    code: 'MED-001',
    tradeName: 'بنادول',
    scientificName: 'Paracetamol',
    barcode: '6280001111',
    category: 'مسكنات',
    minStockLevel: 10,
    ...overrides,
  };
}

function mockBatch(overrides: Partial<any> = {}) {
  return {
    id: BATCH_1,
    medicineId: MED_1,
    quantityInBase: 100,
    costPrice: 5,
    expiryDate: new Date('2027-01-01'),
    ...overrides,
  };
}

/**
 * يحسب تاريخاً بنفس عدد الأيام المضت (يعتمد على Date.now الفعلي)
 */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────
// Prisma Mock
// ─────────────────────────────────────────────────────────────

function createPrismaMock() {
  const prisma: any = {
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
      findMany: jest.fn().mockResolvedValue([{ id: BRANCH_ID }]),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, name: 'مدير النظام' }),
    },
    medicine: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    batch: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    inventoryTransaction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    saleItem: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  // حيلة ذكية: saleItem.findMany يُستدعى مرتين (فترة + تاريخي)
  // نفرّق بينهما بوجود sale.createdAt في الـ where
  prisma._periodSales = [];
  prisma._historicalSales = [];

  prisma.saleItem.findMany.mockImplementation((args: any) => {
    const hasCreatedAt = args?.where?.sale?.createdAt !== undefined;
    return Promise.resolve(
      hasCreatedAt ? prisma._periodSales : prisma._historicalSales,
    );
  });

  return prisma;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('StockMovementService', () => {
  let service: StockMovementService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(StockMovementService);
  });

  afterEach(async () => {
    await cache.clear();
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Empty cases
  // ═══════════════════════════════════════════════════════════

  describe('empty cases', () => {
    it('should return empty response when no branches', async () => {
      prisma.branch.findMany.mockResolvedValue([]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary.totalItems).toBe(0);
      expect(result.summary.classificationBreakdown).toHaveLength(5);
      expect(result.items).toEqual([]);
    });

    it('should return empty response when no medicines match filters', async () => {
      prisma.medicine.findMany.mockResolvedValue([]);

      const result = await service.generate(
        { search: 'nonexistent' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.summary.totalItems).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Computations
  // ═══════════════════════════════════════════════════════════

  describe('computations', () => {
    it('should compute currentStock, stockValue, avgCost, nearestExpiry', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({
          id: BATCH_1,
          quantityInBase: 60,
          costPrice: 5,
          expiryDate: new Date('2027-06-01'),
        }),
        mockBatch({
          id: BATCH_2,
          quantityInBase: 40,
          costPrice: 5,
          expiryDate: new Date('2027-03-15'),
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const item = result.items[0];

      expect(item.currentStock).toBe(100);
      expect(item.batchesCount).toBe(2);
      expect(item.stockValue).toBe(500); // 100 × 5
      expect(item.avgCost).toBe(5);
      // أقرب انتهاء = 2027-03-15
      expect(item.nearestExpiry).toBe(
        new Date('2027-03-15').toISOString(),
      );
    });

    it('should compute turnoverRatio = netSold / currentStock', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ quantityInBase: 100, costPrice: 5 }),
      ]);
      prisma._periodSales = [
        {
          batchId: BATCH_1,
          totalBaseQty: 60,
          returnedQty: 0,
          unitPrice: 10,
          sale: { createdAt: daysAgo(5) },
        },
      ];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const item = result.items[0];

      // netSold = 60، currentStock = 100 → turnover = 0.6
      expect(item.netSold).toBe(60);
      expect(item.turnoverRatio).toBe(0.6);
      expect(item.salesRevenue).toBe(600); // 60 × 10
    });

    it('should set coverageDays = 0 when currentStock = 0', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.items[0].coverageDays).toBe(0);
      expect(result.items[0].classification).toBe('NO_STOCK');
    });

    it('should set coverageDays = 9999 when netSold = 0 (with stock)', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ quantityInBase: 100 }),
      ]);
      prisma._periodSales = [];
      prisma._historicalSales = [];

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.items[0].coverageDays).toBe(9999);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Classification logic
  // ═══════════════════════════════════════════════════════════

  describe('classification', () => {
    async function getItemWithLastSale(daysAgoNum: number) {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ quantityInBase: 100 }),
      ]);
      prisma._periodSales = [
        {
          batchId: BATCH_1,
          totalBaseQty: 10,
          returnedQty: 0,
          unitPrice: 10,
          sale: { createdAt: daysAgo(daysAgoNum) },
        },
      ];
      const result = await service.generate({}, COMPANY_ID, USER_ID);
      return result.items[0];
    }

    it('FAST_MOVING when last sale ≤ 30 days', async () => {
      const item = await getItemWithLastSale(15);
      expect(item.classification).toBe('FAST_MOVING');
      expect(item.classificationLabel).toBe('سريع الحركة');
    });

    it('NORMAL when 31-60 days', async () => {
      const item = await getItemWithLastSale(45);
      expect(item.classification).toBe('NORMAL');
      expect(item.classificationLabel).toBe('طبيعي');
    });

    it('SLOW_MOVING when 61-90 days', async () => {
      const item = await getItemWithLastSale(75);
      expect(item.classification).toBe('SLOW_MOVING');
      expect(item.classificationLabel).toBe('بطيء الحركة');
    });

    it('STAGNANT when > 90 days', async () => {
      const item = await getItemWithLastSale(120);
      expect(item.classification).toBe('STAGNANT');
      expect(item.classificationLabel).toBe('راكد');
    });

    it('NO_STOCK when currentStock = 0', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      expect(result.items[0].classification).toBe('NO_STOCK');
      expect(result.items[0].classificationLabel).toBe('نافد');
    });

    it('respects custom stagnantThresholdDays', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ quantityInBase: 100 }),
      ]);
      prisma._periodSales = [
        {
          batchId: BATCH_1,
          totalBaseQty: 10,
          returnedQty: 0,
          unitPrice: 10,
          sale: { createdAt: daysAgo(45) },
        },
      ];

      const result = await service.generate(
        { stagnantThresholdDays: 30 },
        COMPANY_ID,
        USER_ID,
      );
      // 45 > 30 → STAGNANT
      expect(result.items[0].classification).toBe('STAGNANT');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Historical sales lookup
  // ═══════════════════════════════════════════════════════════

  describe('historical sales lookup', () => {
    it('should not classify a recently-sold item as STAGNANT when period excludes the sale', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ quantityInBase: 100 }),
      ]);
      // لا مبيعات خلال الفترة
      prisma._periodSales = [];
      // لكن آخر بيع تاريخي قبل 5 أيام
      prisma._historicalSales = [
        {
          batch: { medicineId: MED_1 },
          sale: { createdAt: daysAgo(5) },
        },
      ];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const item = result.items[0];

      expect(item.lastSaleAt).toBeTruthy();
      expect(item.classification).toBe('FAST_MOVING');
      expect(item.daysSinceLastSale).toBeLessThanOrEqual(6);
    });

    it('should classify as STAGNANT when no sales ever', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ quantityInBase: 100 }),
      ]);
      prisma._periodSales = [];
      prisma._historicalSales = [];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      expect(result.items[0].classification).toBe('STAGNANT');
      expect(result.items[0].lastSaleAt).toBeNull();
      expect(result.items[0].daysSinceLastSale).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Summary integrity
  // ═══════════════════════════════════════════════════════════

  describe('summary integrity', () => {
    it('should compute summary on ALL filtered items (not just paginated)', async () => {
      // 5 أصناف بقيمة 500 لكل واحد = 2500 إجمالي
      const medicines = Array.from({ length: 5 }, (_, i) =>
        mockMedicine({
          id: `med-${i}`,
          code: `MED-${i}`,
          tradeName: `دواء ${i}`,
        }),
      );
      const batches = medicines.map((m) =>
        mockBatch({
          id: `batch-${m.id}`,
          medicineId: m.id,
          quantityInBase: 100,
          costPrice: 5,
        }),
      );

      prisma.medicine.findMany.mockResolvedValue(medicines);
      prisma.batch.findMany.mockResolvedValue(batches);

      const result = await service.generate(
        { page: 1, limit: 2 },
        COMPANY_ID,
        USER_ID,
      );

      // Summary على 5 أصناف
      expect(result.summary.totalItems).toBe(5);
      expect(result.summary.totalStockValue).toBe(2500);
      // Items محدود بـ 2
      expect(result.items).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Filters
  // ═══════════════════════════════════════════════════════════

  describe('filters', () => {
    it('should filter by classification=STAGNANT', async () => {
      prisma.medicine.findMany.mockResolvedValue([
        mockMedicine({ id: MED_1, code: 'M1' }),
        mockMedicine({ id: MED_2, code: 'M2' }),
      ]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ id: BATCH_1, medicineId: MED_1, quantityInBase: 100 }),
        mockBatch({ id: BATCH_2, medicineId: MED_2, quantityInBase: 100 }),
      ]);
      // MED_1: بيع 5 أيام → FAST_MOVING
      // MED_2: no sales → STAGNANT
      prisma._periodSales = [
        {
          batchId: BATCH_1,
          totalBaseQty: 10,
          returnedQty: 0,
          unitPrice: 10,
          sale: { createdAt: daysAgo(5) },
        },
      ];

      const result = await service.generate(
        { classification: 'STAGNANT' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].medicineId).toBe(MED_2);
    });

    it('should filter by onlyBelowMinStock', async () => {
      prisma.medicine.findMany.mockResolvedValue([
        mockMedicine({ id: MED_1, minStockLevel: 50 }),
        mockMedicine({ id: MED_2, minStockLevel: 10 }),
      ]);
      prisma.batch.findMany.mockResolvedValue([
        // MED_1: stock = 20 < 50 → below
        mockBatch({ id: BATCH_1, medicineId: MED_1, quantityInBase: 20 }),
        // MED_2: stock = 100 > 10 → ok
        mockBatch({ id: BATCH_2, medicineId: MED_2, quantityInBase: 100 }),
      ]);

      const result = await service.generate(
        { onlyBelowMinStock: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].medicineId).toBe(MED_1);
    });

    it('should filter by hideZeroStock', async () => {
      prisma.medicine.findMany.mockResolvedValue([
        mockMedicine({ id: MED_1 }),
        mockMedicine({ id: MED_2 }),
      ]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ id: BATCH_1, medicineId: MED_1, quantityInBase: 0 }),
        mockBatch({ id: BATCH_2, medicineId: MED_2, quantityInBase: 100 }),
      ]);

      const result = await service.generate(
        { hideZeroStock: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].medicineId).toBe(MED_2);
    });

    it('should filter by onlyStagnant (shortcut)', async () => {
      prisma.medicine.findMany.mockResolvedValue([
        mockMedicine({ id: MED_1 }),
      ]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ medicineId: MED_1, quantityInBase: 100 }),
      ]);
      // لا بيع → STAGNANT
      prisma._periodSales = [];
      prisma._historicalSales = [];

      const result = await service.generate(
        { onlyStagnant: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].classification).toBe('STAGNANT');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. Sorting
  // ═══════════════════════════════════════════════════════════

  describe('sorting', () => {
    function setup3Medicines() {
      prisma.medicine.findMany.mockResolvedValue([
        mockMedicine({ id: MED_1, code: 'M1', tradeName: 'A' }),
        mockMedicine({ id: MED_2, code: 'M2', tradeName: 'B' }),
        mockMedicine({ id: MED_3, code: 'M3', tradeName: 'C' }),
      ]);
      prisma.batch.findMany.mockResolvedValue([
        mockBatch({ id: BATCH_1, medicineId: MED_1, quantityInBase: 100, costPrice: 10 }),
        mockBatch({ id: BATCH_2, medicineId: MED_2, quantityInBase: 200, costPrice: 10 }),
        mockBatch({ id: 'b3', medicineId: MED_3, quantityInBase: 50, costPrice: 10 }),
      ]);
    }

    it('should sort by stockValue desc by default', async () => {
      setup3Medicines();

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      // MED_2: 2000, MED_1: 1000, MED_3: 500
      expect(result.items[0].medicineId).toBe(MED_2);
      expect(result.items[1].medicineId).toBe(MED_1);
      expect(result.items[2].medicineId).toBe(MED_3);
    });

    it('should put null lastSaleAt at the end when sorting by lastSaleDate asc', async () => {
      setup3Medicines();
      prisma._periodSales = [
        {
          batchId: BATCH_1,
          totalBaseQty: 5,
          returnedQty: 0,
          unitPrice: 10,
          sale: { createdAt: daysAgo(5) },
        },
      ];

      const result = await service.generate(
        { sortBy: 'lastSaleDate', sortOrder: 'asc' },
        COMPANY_ID,
        USER_ID,
      );

      // MED_1: lastSale=5d ago، MED_2/MED_3: null → في النهاية
      expect(result.items[0].medicineId).toBe(MED_1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Pagination
  // ═══════════════════════════════════════════════════════════

  describe('pagination', () => {
    it('should return page 2 with limit 2', async () => {
      const medicines = Array.from({ length: 5 }, (_, i) =>
        mockMedicine({ id: `med-${i}`, code: `M${i}` }),
      );
      const batches = medicines.map((m, i) =>
        mockBatch({
          id: `batch-${i}`,
          medicineId: m.id,
          quantityInBase: 100 - i * 10,
          costPrice: 10,
        }),
      );
      prisma.medicine.findMany.mockResolvedValue(medicines);
      prisma.batch.findMany.mockResolvedValue(batches);

      const result = await service.generate(
        { page: 2, limit: 2 },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.items).toHaveLength(2);
      expect(result.summary.totalItems).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. Security (inherited)
  // ═══════════════════════════════════════════════════════════

  describe('security', () => {
    it('should reject companyId passed in filters', async () => {
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

  // ═══════════════════════════════════════════════════════════
  // 10. Cache (inherited)
  // ═══════════════════════════════════════════════════════════

  describe('cache', () => {
    it('should cache on second call', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([mockBatch()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, COMPANY_ID, USER_ID);

      // branch.findMany مرة واحدة فقط (الـ cache كان يعمل)
      expect(prisma.branch.findMany).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache with skipCache=true', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([mockBatch()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({ skipCache: 'true' }, COMPANY_ID, USER_ID);

      expect(prisma.branch.findMany).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache on demand', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([mockBatch()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.invalidate(COMPANY_ID);
      await service.generate({}, COMPANY_ID, USER_ID);

      expect(prisma.branch.findMany).toHaveBeenCalledTimes(2);
    });

    it('should isolate cache between companies', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([mockBatch()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, OTHER_COMPANY_ID, USER_ID);

      expect(prisma.branch.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 11. Meta
  // ═══════════════════════════════════════════════════════════

  describe('meta', () => {
    it('should include correct meta', async () => {
      prisma.medicine.findMany.mockResolvedValue([mockMedicine()]);
      prisma.batch.findMany.mockResolvedValue([mockBatch()]);

      const result = await service.generate(
        { fromDate: '2026-09-01', toDate: '2026-09-30' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.meta.title).toBe('تقرير حركة الأصناف والرواكد');
      expect(result.meta.companyName).toBe('صيدلية داوا');
      expect(result.meta.fromDate).toBe('2026-09-01');
      expect(result.meta.toDate).toBe('2026-09-30');
      expect(result.meta.timezone).toBe('Africa/Cairo');
    });
  });
});
