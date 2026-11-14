import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';

import { IncomeStatementService } from './income-statement.service';
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

// Account tree:
//   41 (الإيرادات) [ROOT-REVENUE]
//     ├─ 411 (المبيعات) [LEAF]
//     └─ 412 (إيرادات أخرى) [LEAF]
//   51 (المصروفات) [ROOT-EXPENSE]
//     └─ 511 (تكلفة المبيعات) [LEAF]

const ACC_RV_ROOT = 'acc-rv-41';
const ACC_RV_SALES = 'acc-rv-411';
const ACC_RV_OTHER = 'acc-rv-412';
const ACC_EX_ROOT = 'acc-ex-51';
const ACC_EX_COGS = 'acc-ex-511';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function standardAccounts() {
  return [
    { id: ACC_RV_ROOT, code: '41', name: 'الإيرادات', type: AccountType.REVENUE, level: 1, parentId: null, isLeaf: false },
    { id: ACC_RV_SALES, code: '411', name: 'المبيعات', type: AccountType.REVENUE, level: 2, parentId: ACC_RV_ROOT, isLeaf: true },
    { id: ACC_RV_OTHER, code: '412', name: 'إيرادات أخرى', type: AccountType.REVENUE, level: 2, parentId: ACC_RV_ROOT, isLeaf: true },
    { id: ACC_EX_ROOT, code: '51', name: 'المصروفات', type: AccountType.EXPENSE, level: 1, parentId: null, isLeaf: false },
    { id: ACC_EX_COGS, code: '511', name: 'تكلفة المبيعات', type: AccountType.EXPENSE, level: 2, parentId: ACC_EX_ROOT, isLeaf: true },
  ];
}

function sumRow(accountId: string, debit: number, credit: number) {
  return { accountId, _sum: { debit, credit } };
}

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
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: USER_ID, name: 'مدير النظام' }),
    },
    account: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    journalLine: {
      groupBy: jest.fn(),
    },
  };

  // Track calls — odd = current, even = previous
  prisma._callCount = 0;
  prisma._currentSums = [];
  prisma._previousSums = [];

  prisma.journalLine.groupBy.mockImplementation(() => {
    prisma._callCount++;
    return Promise.resolve(
      prisma._callCount % 2 === 1 ? prisma._currentSums : prisma._previousSums,
    );
  });

  return prisma;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('IncomeStatementService', () => {
  let service: IncomeStatementService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomeStatementService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(IncomeStatementService);
  });

  afterEach(async () => {
    await cache.clear();
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Empty case
  // ═══════════════════════════════════════════════════════════

  describe('empty case', () => {
    it('should return zero summary when no accounts', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.summary.totalRevenue).toBe(0);
      expect(result.summary.totalExpenses).toBe(0);
      expect(result.summary.netIncome).toBe(0);
      expect(result.summary.netIncomeMargin).toBe(0);
      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].lines).toEqual([]);
      expect(result.groups[1].lines).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Sign convention (CRITICAL)
  // ═══════════════════════════════════════════════════════════

  describe('sign convention', () => {
    it('REVENUE: credit > debit → positive amount', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [
        sumRow(ACC_RV_SALES, 100, 1100),  // credit-heavy
        sumRow(ACC_EX_COGS, 500, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      // sign=-1: amount = -1 * (100 - 1100) = 1000
      expect(result.summary.totalRevenue).toBe(1000);
    });

    it('EXPENSE: debit > credit → positive amount', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [
        sumRow(ACC_RV_SALES, 0, 500),
        sumRow(ACC_EX_COGS, 300, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      // sign=+1: amount = (300 - 0) = 300
      expect(result.summary.totalExpenses).toBe(300);
    });

    it('netIncome = revenue - expenses', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [
        sumRow(ACC_RV_SALES, 0, 1000),
        sumRow(ACC_EX_COGS, 400, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      expect(result.summary.netIncome).toBe(600);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Tree aggregation
  // ═══════════════════════════════════════════════════════════

  describe('tree aggregation', () => {
    it('should aggregate parent from children (REVENUE)', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [
        sumRow(ACC_RV_SALES, 0, 700),
        sumRow(ACC_RV_OTHER, 0, 300),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      // Root 41 = 700 + 300 = 1000
      expect(result.summary.totalRevenue).toBe(1000);
      // Lines contain 41, 411, 412
      const revLines = result.groups[0].lines;
      const root41 = revLines.find((l) => l.accountCode === '41');
      const child411 = revLines.find((l) => l.accountCode === '411');
      expect(root41?.amount).toBe(1000);
      expect(child411?.amount).toBe(700);
    });

    it('should build hierarchical lines with correct parents', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [
        sumRow(ACC_RV_SALES, 0, 100),
        sumRow(ACC_EX_COGS, 50, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      const revLines = result.groups[0].lines;
      const child411 = revLines.find((l) => l.accountCode === '411');

      expect(child411?.parentId).toBe(ACC_RV_ROOT);
      expect(child411?.level).toBe(2);
      expect(child411?.isLeaf).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Comparison modes
  // ═══════════════════════════════════════════════════════════

  describe('comparison modes', () => {
    it('NONE → previousAmount = null', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 1000)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.comparison.mode).toBe('NONE');
      expect(result.comparison.previousFromDate).toBeNull();
      expect(result.summary.previousTotalRevenue).toBeNull();
      const line = result.groups[0].lines.find((l) => l.accountCode === '41');
      expect(line?.previousAmount).toBeNull();
    });

    it('PREVIOUS_YEAR → previousFromDate = fromDate - 1 year', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 1000)];
      prisma._previousSums = [sumRow(ACC_RV_SALES, 0, 800)];

      const result = await service.generate(
        { fromDate: '2026-03-01', toDate: '2026-03-31', compareMode: 'PREVIOUS_YEAR' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.comparison.mode).toBe('PREVIOUS_YEAR');
      expect(result.comparison.previousFromDate).toBe('2025-03-01');
      expect(result.comparison.previousToDate).toBe('2025-03-31');
      expect(result.summary.previousTotalRevenue).toBe(800);
    });

    it('PREVIOUS_YEAR handles leap year (Feb 29 → Feb 28)', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [];

      const result = await service.generate(
        { fromDate: '2024-02-29', toDate: '2024-02-29', compareMode: 'PREVIOUS_YEAR' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.comparison.previousFromDate).toBe('2023-02-28');
      expect(result.comparison.previousToDate).toBe('2023-02-28');
    });

    it('PREVIOUS_PERIOD → same duration, immediately before', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [];

      const result = await service.generate(
        { fromDate: '2026-03-01', toDate: '2026-03-31', compareMode: 'PREVIOUS_PERIOD' },
        COMPANY_ID,
        USER_ID,
      );

      // 31 يوم: Feb has 28 days in 2026 (non-leap) → prevFrom=Jan 29, prevTo=Feb 28
      expect(result.comparison.previousFromDate).toBe('2026-01-29');
      expect(result.comparison.previousToDate).toBe('2026-02-28');
    });

    it('should compute variance & growth % correctly', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [
        sumRow(ACC_RV_SALES, 0, 1000),
        sumRow(ACC_EX_COGS, 500, 0),
      ];
      prisma._previousSums = [
        sumRow(ACC_RV_SALES, 0, 800),
        sumRow(ACC_EX_COGS, 400, 0),
      ];

      const result = await service.generate(
        { compareMode: 'PREVIOUS_YEAR' },
        COMPANY_ID,
        USER_ID,
      );

      // Revenue: 1000 vs 800 → variance=200, growth=25%
      expect(result.summary.revenueVariance).toBe(200);
      expect(result.summary.revenueGrowth).toBe(25);
      // Net income: 500 vs 400 → variance=100, growth=25%
      expect(result.summary.netIncomeVariance).toBe(100);
      expect(result.summary.netIncomeGrowth).toBe(25);
    });

    it('growth = null when previous = 0', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 1000)];
      prisma._previousSums = []; // zero previous

      const result = await service.generate(
        { compareMode: 'PREVIOUS_YEAR' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.summary.revenueGrowth).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Margins
  // ═══════════════════════════════════════════════════════════

  describe('margins', () => {
    it('netIncomeMargin = (netIncome / revenue) * 100', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [
        sumRow(ACC_RV_SALES, 0, 1000),
        sumRow(ACC_EX_COGS, 250, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      // 750 / 1000 = 75%
      expect(result.summary.netIncomeMargin).toBe(75);
    });

    it('netIncomeMargin = 0 when revenue = 0', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_EX_COGS, 500, 0)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.summary.netIncomeMargin).toBe(0);
    });

    it('previousNetIncomeMargin computed when comparing', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 1000)];
      prisma._previousSums = [
        sumRow(ACC_RV_SALES, 0, 800),
        sumRow(ACC_EX_COGS, 200, 0),
      ];

      const result = await service.generate(
        { compareMode: 'PREVIOUS_YEAR' },
        COMPANY_ID,
        USER_ID,
      );

      // prev: netIncome = 800 - 200 = 600, margin = 600/800 = 75%
      expect(result.summary.previousNetIncomeMargin).toBe(75);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Drill-Down URLs
  // ═══════════════════════════════════════════════════════════

  describe('drill-down URLs', () => {
    it('parent node → drillUrl set, entriesUrl null', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      const parent = result.groups[0].lines.find((l) => l.accountCode === '41');

      expect(parent?.hasChildren).toBe(true);
      expect(parent?.isLeaf).toBe(false);
      expect(parent?.drillUrl).toContain('/reports/income-statement/drill');
      expect(parent?.drillUrl).toContain(`parentAccountId=${ACC_RV_ROOT}`);
      expect(parent?.entriesUrl).toBeNull();
    });

    it('leaf node → entriesUrl set, drillUrl null', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      const leaf = result.groups[0].lines.find((l) => l.accountCode === '411');

      expect(leaf?.hasChildren).toBe(false);
      expect(leaf?.isLeaf).toBe(true);
      expect(leaf?.drillUrl).toBeNull();
      expect(leaf?.entriesUrl).toContain('/reports/general-ledger');
      expect(leaf?.entriesUrl).toContain(`accountId=${ACC_RV_SALES}`);
    });

    it('drillUrl preserves fromDate/toDate/branchId', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      const result = await service.generate(
        {
          fromDate: '2026-01-01',
          toDate: '2026-12-31',
          compareMode: 'NONE',
          branchId: BRANCH_ID,
        },
        COMPANY_ID,
        USER_ID,
      );

      const parent = result.groups[0].lines.find((l) => l.accountCode === '41');
      expect(parent?.drillUrl).toContain('fromDate=2026-01-01');
      expect(parent?.drillUrl).toContain('toDate=2026-12-31');
      expect(parent?.drillUrl).toContain(`branchId=${BRANCH_ID}`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. drillDown() method
  // ═══════════════════════════════════════════════════════════

  describe('drillDown()', () => {
    it('should return children of parent account', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: ACC_RV_ROOT,
        code: '41',
        name: 'الإيرادات',
        type: AccountType.REVENUE,
      });
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [
        sumRow(ACC_RV_SALES, 0, 700),
        sumRow(ACC_RV_OTHER, 0, 300),
      ];

      const result = await service.drillDown(
        { parentAccountId: ACC_RV_ROOT, compareMode: 'NONE' },
        COMPANY_ID,
      );

      expect(result.parent.id).toBe(ACC_RV_ROOT);
      expect(result.lines).toHaveLength(2);
      expect(result.lines.map((l) => l.accountCode).sort()).toEqual(['411', '412']);
    });

    it('should throw NotFoundException when parent not found', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.drillDown(
          { parentAccountId: 'not-exist', compareMode: 'NONE' },
          COMPANY_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty lines when parent has no children', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: ACC_RV_SALES,
        code: '411',
        name: 'المبيعات',
        type: AccountType.REVENUE,
      });
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      const result = await service.drillDown(
        { parentAccountId: ACC_RV_SALES, compareMode: 'NONE' },
        COMPANY_ID,
      );

      expect(result.lines).toEqual([]);
    });

    it('should filter zero-movement children when hideZeroMovement=true', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: ACC_RV_ROOT,
        code: '41',
        name: 'الإيرادات',
        type: AccountType.REVENUE,
      });
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      // 411 has value, 412 is zero
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 500)];

      const result = await service.drillDown(
        { parentAccountId: ACC_RV_ROOT, compareMode: 'NONE', hideZeroMovement: true },
        COMPANY_ID,
      );

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].accountCode).toBe('411');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Filters
  // ═══════════════════════════════════════════════════════════

  describe('filters', () => {
    it('hideZeroMovement=true (default) filters empty nodes', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      // EXPENSE group should be empty
      expect(result.groups[1].lines).toEqual([]);
      expect(result.summary.totalExpenses).toBe(0);
    });

    it('hideZeroMovement=false keeps empty nodes', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      const result = await service.generate(
        { compareMode: 'NONE', hideZeroMovement: false },
        COMPANY_ID,
        USER_ID,
      );

      // EXPENSE group should have root and child
      expect(result.groups[1].lines.length).toBeGreaterThan(0);
    });

    it('level filter restricts displayed lines', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      const result = await service.generate(
        { compareMode: 'NONE', level: 1 },
        COMPANY_ID,
        USER_ID,
      );

      // Only level-1 lines (41, 51) displayed
      const revLines = result.groups[0].lines;
      expect(revLines.every((l) => l.level === 1)).toBe(true);
    });

    it('includeInactive=true includes inactive accounts', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [];

      await service.generate(
        { compareMode: 'NONE', includeInactive: true },
        COMPANY_ID,
        USER_ID,
      );

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.isActive).toBeUndefined();
    });

    it('includeInactive=false (default) filters to active only', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [];

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.isActive).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. Security (inherited)
  // ═══════════════════════════════════════════════════════════

  describe('security', () => {
    it('should reject companyId in filters', async () => {
      await expect(
        service.generate(
          { companyId: OTHER_COMPANY_ID } as any,
          COMPANY_ID,
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject branchId from another company', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.generate(
          { branchId: OTHER_BRANCH_ID, compareMode: 'NONE' },
          COMPANY_ID,
          USER_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject missing companyId', async () => {
      await expect(
        service.generate({ compareMode: 'NONE' }, '', USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 10. Cache (inherited)
  // ═══════════════════════════════════════════════════════════

  describe('cache', () => {
    it('should cache on second call', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache with skipCache=true', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());
      prisma._currentSums = [sumRow(ACC_RV_SALES, 0, 100)];

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      await service.generate(
        { compareMode: 'NONE', skipCache: 'true' },
        COMPANY_ID,
        USER_ID,
      );

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });

    it('should isolate cache between companies', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      await service.generate({ compareMode: 'NONE' }, OTHER_COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });

    it('should use different cache keys for different compareMode', async () => {
      prisma.account.findMany.mockResolvedValue(standardAccounts());

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      await service.generate({ compareMode: 'PREVIOUS_YEAR' }, COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 11. Meta
  // ═══════════════════════════════════════════════════════════

  describe('meta', () => {
    it('should include correct meta', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        { fromDate: '2026-01-01', toDate: '2026-12-31', compareMode: 'NONE' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.meta.title).toBe('قائمة الدخل');
      expect(result.meta.companyName).toBe('صيدلية داوا');
      expect(result.meta.fromDate).toBe('2026-01-01');
      expect(result.meta.toDate).toBe('2026-12-31');
      expect(result.meta.timezone).toBe('Africa/Cairo');
    });
  });
});
