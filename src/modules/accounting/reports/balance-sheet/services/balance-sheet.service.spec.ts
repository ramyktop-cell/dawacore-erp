import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccountType } from '@prisma/client';

import { BalanceSheetService } from './balance-sheet.service';
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

// Chart of Accounts (مختصر لاختبار Sign + Tree)
const ACC_CA_CASH = 'acc-ca-cash'; // 1-1-01 النقدية
const ACC_CA_INVENTORY = 'acc-ca-inv'; // 1-1-04 المخزون
const ACC_NCA_FIXED = 'acc-nca-fixed'; // 1-2-01 أصول ثابتة
const ACC_CL_SUPPLIERS = 'acc-cl-supp'; // 2-1-01 الموردون
const ACC_NCL_LOAN = 'acc-ncl-loan'; // 2-2-01 قرض طويل الأجل
const ACC_EQ_CAPITAL = 'acc-eq-cap'; // 3-1 رأس المال
const ACC_EQ_RE = 'acc-eq-re'; // 3-2 الأرباح المبقاة (DB account)
const ACC_REV_SALES = 'acc-rev-sales'; // 4-1 المبيعات
const ACC_EXP_COGS = 'acc-exp-cogs'; // 5-1 تكلفة المبيعات

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function standardAccounts() {
  return [
    { id: ACC_CA_CASH, code: '1-1-01', name: 'النقدية', type: AccountType.ASSET, level: 2, parentId: null, isLeaf: true },
    { id: ACC_CA_INVENTORY, code: '1-1-04', name: 'المخزون', type: AccountType.ASSET, level: 2, parentId: null, isLeaf: true },
    { id: ACC_NCA_FIXED, code: '1-2-01', name: 'أصول ثابتة', type: AccountType.ASSET, level: 2, parentId: null, isLeaf: true },
    { id: ACC_CL_SUPPLIERS, code: '2-1-01', name: 'الموردون', type: AccountType.LIABILITY, level: 2, parentId: null, isLeaf: true },
    { id: ACC_NCL_LOAN, code: '2-2-01', name: 'قرض طويل الأجل', type: AccountType.LIABILITY, level: 2, parentId: null, isLeaf: true },
    { id: ACC_EQ_CAPITAL, code: '3-1-99', name: 'رأس المال', type: AccountType.EQUITY, level: 2, parentId: null, isLeaf: true },
    { id: ACC_EQ_RE, code: '3-2-01', name: 'الأرباح المبقاة', type: AccountType.EQUITY, level: 2, parentId: null, isLeaf: true },
    { id: ACC_REV_SALES, code: '4-1-01', name: 'المبيعات', type: AccountType.REVENUE, level: 2, parentId: null, isLeaf: true },
    { id: ACC_EXP_COGS, code: '5-1-01', name: 'تكلفة المبيعات', type: AccountType.EXPENSE, level: 2, parentId: null, isLeaf: true },
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

  // Counter state
  prisma._lteCallCount = 0;
  prisma._currentSums = [];
  prisma._previousSums = [];
  prisma._beforeFySums = [];

  prisma.journalLine.groupBy.mockImplementation((args: any) => {
    const dateClause = args?.where?.journalEntry?.date;
    if (dateClause?.lt) return Promise.resolve(prisma._beforeFySums);
    // lte: first call → current, second → previous
    prisma._lteCallCount++;
    return Promise.resolve(
      prisma._lteCallCount === 1 ? prisma._currentSums : prisma._previousSums,
    );
  });

  return prisma;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('BalanceSheetService', () => {
  let service: BalanceSheetService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceSheetService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(BalanceSheetService);
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

      expect(result.summary.totalAssets).toBe(0);
      expect(result.summary.totalLiabilities).toBe(0);
      expect(result.summary.totalEquity).toBe(0);
      expect(result.summary.isBalanced).toBe(true);
      expect(result.summary.balanceDifference).toBe(0);
      expect(result.groups).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Sign convention
  // ═══════════════════════════════════════════════════════════

  describe('sign convention', () => {
    it('ASSET: debit > credit → positive balance', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CA_CASH, 5000, 0)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.summary.totalAssets).toBe(5000);
    });

    it('LIABILITY: credit > debit → positive in absolute (stored negative)', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CL_SUPPLIERS)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CL_SUPPLIERS, 0, 3000)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.summary.totalLiabilities).toBe(3000);
      // Internal balance is negative
      const line = result.groups[1].lines.find((l) => l.accountCode === '2-1-01');
      expect(line?.balance).toBe(-3000);
      expect(line?.absoluteBalance).toBe(3000);
      expect(line?.credit).toBe(3000);
      expect(line?.debit).toBe(0);
    });

    it('EQUITY: credit > debit → positive in absolute', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_EQ_CAPITAL)!,
      ]);
      prisma._currentSums = [sumRow(ACC_EQ_CAPITAL, 0, 50000)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      // totalEquity includes retained + current NI; with no RE account, should equal 50000
      expect(result.summary.totalEquity).toBeGreaterThanOrEqual(50000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Retained Earnings (Hybrid)
  // ═══════════════════════════════════════════════════════════

  describe('retained earnings', () => {
    it('should compute retained earnings from prior REVENUE - EXPENSE', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_REV_SALES)!,
        standardAccounts().find((a) => a.id === ACC_EXP_COGS)!,
      ]);
      // Before FY: revenue 100000, expenses 60000 → prior earnings 40000
      prisma._beforeFySums = [
        sumRow(ACC_REV_SALES, 0, 100000),
        sumRow(ACC_EXP_COGS, 60000, 0),
      ];
      // Current (as of today)
      prisma._currentSums = [
        sumRow(ACC_REV_SALES, 0, 150000),
        sumRow(ACC_EXP_COGS, 90000, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      // retained = 0 (no 3-2 account) + (100000 - 60000) = 40000
      expect(result.summary.retainedEarnings).toBe(40000);
      // current NI = (150000 - 100000) - (90000 - 60000) = 50000 - 30000 = 20000
      expect(result.summary.currentPeriodNetIncome).toBe(20000);
    });

    it('should add 3-2 account balance to retained earnings', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_EQ_RE)!,
      ]);
      // Current: 3-2 has credit 50000
      prisma._currentSums = [sumRow(ACC_EQ_RE, 0, 50000)];
      prisma._beforeFySums = [];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      // retained = 50000 (from 3-2) + 0 (no revenue before FY) = 50000
      expect(result.summary.retainedEarnings).toBe(50000);
    });

    it('should compute current period net income correctly', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_REV_SALES)!,
        standardAccounts().find((a) => a.id === ACC_EXP_COGS)!,
      ]);
      prisma._beforeFySums = [];
      prisma._currentSums = [
        sumRow(ACC_REV_SALES, 0, 80000),
        sumRow(ACC_EXP_COGS, 30000, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      expect(result.summary.currentPeriodNetIncome).toBe(50000);
    });

    it('should handle net loss (negative current period)', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_REV_SALES)!,
        standardAccounts().find((a) => a.id === ACC_EXP_COGS)!,
      ]);
      prisma._beforeFySums = [];
      prisma._currentSums = [
        sumRow(ACC_REV_SALES, 0, 30000),
        sumRow(ACC_EXP_COGS, 50000, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      expect(result.summary.currentPeriodNetIncome).toBe(-20000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Balance check
  // ═══════════════════════════════════════════════════════════

  describe('balance check', () => {
    it('should mark isBalanced=true when Assets = Liab + Equity', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
        standardAccounts().find((a) => a.id === ACC_CL_SUPPLIERS)!,
        standardAccounts().find((a) => a.id === ACC_EQ_CAPITAL)!,
      ]);
      prisma._currentSums = [
        sumRow(ACC_CA_CASH, 10000, 0), // Assets 10000
        sumRow(ACC_CL_SUPPLIERS, 0, 4000), // Liab 4000
        sumRow(ACC_EQ_CAPITAL, 0, 6000), // Equity 6000
      ];
      prisma._beforeFySums = [];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.summary.totalAssets).toBe(10000);
      expect(result.summary.totalLiabilities).toBe(4000);
      expect(result.summary.isBalanced).toBe(true);
      expect(result.summary.balanceDifference).toBe(0);
    });

    it('should mark isBalanced=false when unbalanced', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
        standardAccounts().find((a) => a.id === ACC_CL_SUPPLIERS)!,
      ]);
      prisma._currentSums = [
        sumRow(ACC_CA_CASH, 10000, 0),
        sumRow(ACC_CL_SUPPLIERS, 0, 3000), // 10000 ≠ 3000
      ];
      prisma._beforeFySums = [];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.summary.isBalanced).toBe(false);
      expect(result.summary.balanceDifference).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Classification (Current vs Non-Current)
  // ═══════════════════════════════════════════════════════════

  describe('classification', () => {
    it('should classify 1-1-xx as current assets', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
        standardAccounts().find((a) => a.id === ACC_CA_INVENTORY)!,
        standardAccounts().find((a) => a.id === ACC_NCA_FIXED)!,
      ]);
      prisma._currentSums = [
        sumRow(ACC_CA_CASH, 3000, 0),
        sumRow(ACC_CA_INVENTORY, 2000, 0),
        sumRow(ACC_NCA_FIXED, 15000, 0),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.summary.currentAssets).toBe(5000); // 1-1-01 + 1-1-04
      expect(result.summary.nonCurrentAssets).toBe(15000); // 1-2-01
      expect(result.summary.totalAssets).toBe(20000);
    });

    it('should classify 2-1-xx as current liabilities and 2-2-xx as non-current', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CL_SUPPLIERS)!,
        standardAccounts().find((a) => a.id === ACC_NCL_LOAN)!,
      ]);
      prisma._currentSums = [
        sumRow(ACC_CL_SUPPLIERS, 0, 4000),
        sumRow(ACC_NCL_LOAN, 0, 20000),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.summary.currentLiabilities).toBe(4000);
      expect(result.summary.nonCurrentLiabilities).toBe(20000);
      expect(result.summary.totalLiabilities).toBe(24000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Financial Ratios
  // ═══════════════════════════════════════════════════════════

  describe('ratios', () => {
    it('should compute currentRatio when currentLiabilities > 0', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
        standardAccounts().find((a) => a.id === ACC_CL_SUPPLIERS)!,
      ]);
      prisma._currentSums = [
        sumRow(ACC_CA_CASH, 30000, 0), // CA = 30000
        sumRow(ACC_CL_SUPPLIERS, 0, 20000), // CL = 20000
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      const cr = result.summary.ratios.find((r) => r.key === 'currentRatio');

      expect(cr).toBeDefined();
      expect(cr?.value).toBe(1.5);
      expect(cr?.isHealthy).toBe(true);
    });

    it('should compute workingCapital', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
        standardAccounts().find((a) => a.id === ACC_CL_SUPPLIERS)!,
      ]);
      prisma._currentSums = [
        sumRow(ACC_CA_CASH, 30000, 0),
        sumRow(ACC_CL_SUPPLIERS, 0, 20000),
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      const wc = result.summary.ratios.find((r) => r.key === 'workingCapital');

      expect(wc?.value).toBe(10000);
      expect(wc?.isHealthy).toBe(true);
    });

    it('should compute debtToEquity and debtRatio', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
        standardAccounts().find((a) => a.id === ACC_CL_SUPPLIERS)!,
        standardAccounts().find((a) => a.id === ACC_EQ_CAPITAL)!,
      ]);
      prisma._currentSums = [
        sumRow(ACC_CA_CASH, 20000, 0),
        sumRow(ACC_CL_SUPPLIERS, 0, 8000), // Liab 8000
        sumRow(ACC_EQ_CAPITAL, 0, 12000), // Equity 12000
      ];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      const dte = result.summary.ratios.find((r) => r.key === 'debtToEquity');
      const dr = result.summary.ratios.find((r) => r.key === 'debtRatio');

      expect(dte?.value).toBeCloseTo(0.67, 1); // 8000 / 12000
      expect(dr?.value).toBe(40); // 8000 / 20000 * 100
      expect(dr?.isHealthy).toBe(true); // < 60%
    });

    it('should return empty ratios when no assets/liabilities', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      expect(result.summary.ratios).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. Comparison modes
  // ═══════════════════════════════════════════════════════════

  describe('comparison modes', () => {
    it('NONE → no previous data', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CA_CASH, 5000, 0)];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(result.comparison.mode).toBe('NONE');
      expect(result.comparison.previousAsOfDate).toBeNull();
      expect(result.summary.previousTotalAssets).toBeNull();
    });

    it('PREVIOUS_YEAR_SAME_DATE → same date last year', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        {
          asOfDate: '2026-09-26',
          compareMode: 'PREVIOUS_YEAR_SAME_DATE',
        },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.comparison.previousAsOfDate).toBe('2025-09-26');
      expect(result.comparison.label).toContain('2025');
    });

    it('PREVIOUS_YEAR_END → December 31 of previous year', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        {
          asOfDate: '2026-09-26',
          compareMode: 'PREVIOUS_YEAR_END',
        },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.comparison.previousAsOfDate).toBe('2025-12-31');
      expect(result.comparison.label).toContain('2025');
    });

    it('PREVIOUS_YEAR_SAME_DATE handles leap year', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        {
          asOfDate: '2024-02-29',
          compareMode: 'PREVIOUS_YEAR_SAME_DATE',
        },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.comparison.previousAsOfDate).toBe('2023-02-28');
    });

    it('should compute variances when comparing', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CA_CASH, 10000, 0)];
      prisma._previousSums = [sumRow(ACC_CA_CASH, 8000, 0)];

      const result = await service.generate(
        {
          asOfDate: '2026-12-31',
          compareMode: 'PREVIOUS_YEAR_SAME_DATE',
        },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.summary.totalAssets).toBe(10000);
      expect(result.summary.previousTotalAssets).toBe(8000);
      expect(result.summary.assetsVariance).toBe(2000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Fiscal Year
  // ═══════════════════════════════════════════════════════════

  describe('fiscal year', () => {
    it('default start month = January', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        { asOfDate: '2026-09-26', compareMode: 'NONE' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.fiscalYear.startMonth).toBe(1);
      expect(result.fiscalYear.startDate).toBe('2026-01-01');
    });

    it('custom start month = 7 (July)', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        {
          asOfDate: '2026-09-26',
          compareMode: 'NONE',
          fiscalYearStartMonth: 7,
        },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.fiscalYear.startMonth).toBe(7);
      expect(result.fiscalYear.startDate).toBe('2026-07-01');
    });

    it('when asOfDate is before fiscal year start, rollback to previous year', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        {
          asOfDate: '2026-03-15',
          compareMode: 'NONE',
          fiscalYearStartMonth: 7, // July
        },
        COMPANY_ID,
        USER_ID,
      );

      // March 2026 < July 2026 → FY starts July 2025
      expect(result.fiscalYear.startDate).toBe('2025-07-01');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. Drill-Down URLs
  // ═══════════════════════════════════════════════════════════

  describe('drill-down URLs', () => {
    it('leaf account → entriesUrl set, drillUrl null', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CA_CASH, 5000, 0)];

      const result = await service.generate(
        { asOfDate: '2026-12-31', compareMode: 'NONE' },
        COMPANY_ID,
        USER_ID,
      );

      const line = result.groups[0].lines[0];
      expect(line.entriesUrl).toContain('/reports/general-ledger');
      expect(line.entriesUrl).toContain(`accountId=${ACC_CA_CASH}`);
      expect(line.drillUrl).toBeNull();
    });

    it('entriesUrl preserves asOfDate as toDate', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CA_CASH, 5000, 0)];

      const result = await service.generate(
        { asOfDate: '2026-12-31', compareMode: 'NONE' },
        COMPANY_ID,
        USER_ID,
      );

      const line = result.groups[0].lines[0];
      expect(line.entriesUrl).toContain('toDate=2026-12-31');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 10. drillDown() method
  // ═══════════════════════════════════════════════════════════

  describe('drillDown()', () => {
    it('should throw NotFoundException for unknown parent', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.drillDown('not-exist', COMPANY_ID, '2026-12-31'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty lines when parent has no children', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: ACC_CA_CASH,
        code: '1-1-01',
        name: 'النقدية',
      });
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CA_CASH, 5000, 0)];

      const result = await service.drillDown(ACC_CA_CASH, COMPANY_ID, '2026-12-31');
      expect(result.lines).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 11. Filters
  // ═══════════════════════════════════════════════════════════

  describe('filters', () => {
    it('hideZeroBalances=true (default) hides empty accounts', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
        standardAccounts().find((a) => a.id === ACC_CA_INVENTORY)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CA_CASH, 5000, 0)]; // Inventory = 0

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      const cashLine = result.groups[0].lines.find((l) => l.accountCode === '1-1-01');
      const invLine = result.groups[0].lines.find((l) => l.accountCode === '1-1-04');
      expect(cashLine).toBeDefined();
      expect(invLine).toBeUndefined();
    });

    it('hideZeroBalances=false keeps empty accounts', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_CA_CASH)!,
        standardAccounts().find((a) => a.id === ACC_CA_INVENTORY)!,
      ]);
      prisma._currentSums = [sumRow(ACC_CA_CASH, 5000, 0)];

      const result = await service.generate(
        { compareMode: 'NONE', hideZeroBalances: false },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.groups[0].lines.length).toBeGreaterThanOrEqual(2);
    });

    it('level filter restricts displayed lines', async () => {
      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-l1', code: '1', name: 'أصول', type: AccountType.ASSET, level: 1, parentId: null, isLeaf: false },
        { id: 'acc-l2', code: '1-1', name: 'متداول', type: AccountType.ASSET, level: 2, parentId: 'acc-l1', isLeaf: true },
      ]);
      prisma._currentSums = [sumRow('acc-l2', 5000, 0)];

      const result = await service.generate(
        { compareMode: 'NONE', level: 1 },
        COMPANY_ID,
        USER_ID,
      );

      // Only level 1 displayed
      const assetLines = result.groups[0].lines;
      expect(assetLines.every((l) => l.level <= 1)).toBe(true);
    });

    it('includeInactive=true includes inactive accounts', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate(
        { compareMode: 'NONE', includeInactive: true },
        COMPANY_ID,
        USER_ID,
      );

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.isActive).toBeUndefined();
    });

    it('showRetainedEarnings=false omits virtual lines', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_EQ_CAPITAL)!,
      ]);
      prisma._currentSums = [sumRow(ACC_EQ_CAPITAL, 0, 50000)];
      prisma._beforeFySums = [];

      const result = await service.generate(
        { compareMode: 'NONE', showRetainedEarnings: false },
        COMPANY_ID,
        USER_ID,
      );

      const equityGroup = result.groups.find((g) => g.groupKey === 'EQUITY')!;
      const virtualLines = equityGroup.lines.filter((l) => l.isVirtual);
      expect(virtualLines).toHaveLength(0);
    });

    it('showRetainedEarnings=true adds virtual lines (default)', async () => {
      prisma.account.findMany.mockResolvedValue([
        standardAccounts().find((a) => a.id === ACC_EQ_CAPITAL)!,
      ]);
      prisma._currentSums = [sumRow(ACC_EQ_CAPITAL, 0, 50000)];
      prisma._beforeFySums = [];

      const result = await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      const equityGroup = result.groups.find((g) => g.groupKey === 'EQUITY')!;
      const virtualLines = equityGroup.lines.filter((l) => l.isVirtual);
      expect(virtualLines).toHaveLength(2); // Retained + Current NI
      expect(virtualLines.map((l) => l.accountCode).sort()).toEqual(['32-CALC', '33-CALC']);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 12. Security (inherited)
  // ═══════════════════════════════════════════════════════════

  describe('security', () => {
    it('should reject companyId in filters', async () => {
      await expect(
        service.generate(
          { companyId: OTHER_COMPANY_ID, compareMode: 'NONE' } as any,
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
  // 13. Cache (inherited)
  // ═══════════════════════════════════════════════════════════

  describe('cache', () => {
    it('should cache on second call', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache with skipCache=true', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      await service.generate(
        { compareMode: 'NONE', skipCache: 'true' },
        COMPANY_ID,
        USER_ID,
      );

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });

    it('should isolate cache between companies', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      await service.generate({ compareMode: 'NONE' }, OTHER_COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });

    it('should use different cache keys for different compareMode', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({ compareMode: 'NONE' }, COMPANY_ID, USER_ID);
      await service.generate(
        { compareMode: 'PREVIOUS_YEAR_SAME_DATE' },
        COMPANY_ID,
        USER_ID,
      );

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 14. Meta
  // ═══════════════════════════════════════════════════════════

  describe('meta', () => {
    it('should include correct meta', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        { asOfDate: '2026-12-31', compareMode: 'NONE' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.meta.title).toBe('الميزانية العمومية');
      expect(result.meta.companyName).toBe('صيدلية داوا');
      expect(result.meta.timezone).toBe('Africa/Cairo');
    });
  });
});
