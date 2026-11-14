import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccountType } from '@prisma/client';

import { TrialBalanceService } from './trial-balance.service';
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

const ACC_CASH = 'acc-1-cash';
const ACC_BANK = 'acc-2-bank';
const ACC_SUPPLIER = 'acc-3-supplier';
const ACC_REVENUE = 'acc-4-revenue';
const ACC_EXPENSE = 'acc-5-expense';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockAccount(overrides: Partial<any> = {}) {
  return {
    id: ACC_CASH,
    code: '1101',
    name: 'النقدية',
    type: AccountType.ASSET,
    level: 3,
    ...overrides,
  };
}

/**
 * يحاكي استجابة `journalLine.groupBy` → `_sum.debit` و `_sum.credit`.
 */
function mockGroupByRow(
  accountId: string,
  debit: number,
  credit: number,
) {
  return {
    accountId,
    _sum: { debit, credit },
  };
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
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, name: 'مدير النظام' }),
    },
    account: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    journalLine: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };

  // hile: groupBy يُستدعى مرتين (opening + movement)
  // نُفرّق بوجود date.lt (opening) أو date.gte/lte (movement)
  prisma._openingRows = [];
  prisma._movementRows = [];

  prisma.journalLine.groupBy.mockImplementation((args: any) => {
    const dateClause = args?.where?.journalEntry?.date;
    if (dateClause?.lt) return Promise.resolve(prisma._openingRows);
    return Promise.resolve(prisma._movementRows);
  });

  return prisma;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('TrialBalanceService', () => {
  let service: TrialBalanceService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrialBalanceService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(TrialBalanceService);
  });

  afterEach(async () => {
    await cache.clear();
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Empty
  // ═══════════════════════════════════════════════════════════

  describe('empty case', () => {
    it('should return zero summary when no accounts', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary).toEqual({
        totalAccounts: 0,
        accountsWithActivity: 0,
        totalOpeningDebit: 0,
        totalOpeningCredit: 0,
        openingDifference: 0,
        totalMovementDebit: 0,
        totalMovementCredit: 0,
        movementDifference: 0,
        totalClosingDebit: 0,
        totalClosingCredit: 0,
        closingDifference: 0,
        isBalanced: true,
      });
      expect(result.rows).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Opening balance logic
  // ═══════════════════════════════════════════════════════════

  describe('opening balance', () => {
    it('should classify net positive as debit (asset-style)', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 5000, 1000)];
      prisma._movementRows = [];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const row = result.rows[0];

      expect(row.openingDebit).toBe(4000); // 5000 - 1000
      expect(row.openingCredit).toBe(0);
      expect(row.openingBalance).toBe(4000);
    });

    it('should classify net negative as credit (liability-style)', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({
          id: ACC_SUPPLIER,
          code: '2101',
          name: 'الموردون',
          type: AccountType.LIABILITY,
        }),
      ]);
      prisma._openingRows = [mockGroupByRow(ACC_SUPPLIER, 1000, 5000)];
      prisma._movementRows = [];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const row = result.rows[0];

      expect(row.openingDebit).toBe(0);
      expect(row.openingCredit).toBe(4000); // 5000 - 1000
      expect(row.openingBalance).toBe(-4000);
    });

    it('should handle perfectly balanced opening (debit = credit)', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 3000, 3000)];
      prisma._movementRows = [mockGroupByRow(ACC_CASH, 500, 0)];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const row = result.rows[0];

      expect(row.openingDebit).toBe(0);
      expect(row.openingCredit).toBe(0);
      expect(row.openingBalance).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Movement + Closing + Flip logic
  // ═══════════════════════════════════════════════════════════

  describe('closing balance & flips', () => {
    it('should compute closing = opening + movement (same sign)', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 1000, 0)];
      prisma._movementRows = [mockGroupByRow(ACC_CASH, 500, 0)];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const row = result.rows[0];

      // Opening debit 1000 + Movement debit 500 = Closing debit 1500
      expect(row.closingDebit).toBe(1500);
      expect(row.closingCredit).toBe(0);
      expect(row.closingBalance).toBe(1500);
    });

    it('should FLIP from debit opening to credit closing', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 1000, 0)];
      prisma._movementRows = [mockGroupByRow(ACC_CASH, 0, 1500)];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const row = result.rows[0];

      // Opening debit 1000 - movement credit 1500 = netClosing -500 → credit 500
      expect(row.closingDebit).toBe(0);
      expect(row.closingCredit).toBe(500);
      expect(row.closingBalance).toBe(-500);
    });

    it('should FLIP from credit opening to debit closing', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({
          id: ACC_SUPPLIER,
          type: AccountType.LIABILITY,
        }),
      ]);
      prisma._openingRows = [mockGroupByRow(ACC_SUPPLIER, 0, 500)];
      prisma._movementRows = [mockGroupByRow(ACC_SUPPLIER, 800, 0)];

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const row = result.rows[0];

      // Opening credit 500 → netOpening = -500
      // Movement debit 800 → netClosing = -500 + 800 = 300 → debit
      expect(row.closingDebit).toBe(300);
      expect(row.closingCredit).toBe(0);
      expect(row.closingBalance).toBe(300);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. isBalanced
  // ═══════════════════════════════════════════════════════════

  describe('balance check', () => {
    it('should mark isBalanced=true when closing diff < 0.01', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: ACC_CASH }),
        mockAccount({
          id: ACC_SUPPLIER,
          type: AccountType.LIABILITY,
        }),
      ]);
      prisma._openingRows = [];
      prisma._movementRows = [
        mockGroupByRow(ACC_CASH, 1000, 0),
        mockGroupByRow(ACC_SUPPLIER, 0, 1000),
      ];

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary.totalClosingDebit).toBe(1000);
      expect(result.summary.totalClosingCredit).toBe(1000);
      expect(result.summary.closingDifference).toBe(0);
      expect(result.summary.isBalanced).toBe(true);
    });

    it('should mark isBalanced=false when closing diff >= 0.01', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._movementRows = [mockGroupByRow(ACC_CASH, 1000, 0)];
      // لا يوجد دائن مقابل → غير متوازن

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary.totalClosingDebit).toBe(1000);
      expect(result.summary.totalClosingCredit).toBe(0);
      expect(result.summary.closingDifference).toBe(1000);
      expect(result.summary.isBalanced).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Filters
  // ═══════════════════════════════════════════════════════════

  describe('filters', () => {
    it('should hide accounts with no activity by default', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: ACC_CASH }),
        mockAccount({ id: ACC_BANK, code: '1102' }),
      ]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 100, 0)];
      prisma._movementRows = [];

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      // ACC_BANK بدون حركة → يُستبعد
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].accountId).toBe(ACC_CASH);
    });

    it('should show empty accounts when showEmptyAccounts=true', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: ACC_CASH }),
        mockAccount({ id: ACC_BANK, code: '1102' }),
      ]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 100, 0)];
      prisma._movementRows = [];

      const result = await service.generate(
        { showEmptyAccounts: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.rows).toHaveLength(2);
    });

    it('should hide zero-closing accounts by default (with activity)', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      // Opening = 0، Movement debit = 500، Movement credit = 500 → Closing = 0
      prisma._openingRows = [];
      prisma._movementRows = [mockGroupByRow(ACC_CASH, 500, 500)];

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      // closing = 0 → يُستبعد افتراضياً
      expect(result.rows).toHaveLength(0);
    });

    it('should show zero-closing accounts when showZeroBalances=true', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._movementRows = [mockGroupByRow(ACC_CASH, 500, 500)];

      const result = await service.generate(
        { showZeroBalances: true },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.rows).toHaveLength(1);
    });

    it('should pass onlyLeaf=true to prisma query by default', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({}, COMPANY_ID, USER_ID);

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.isLeaf).toBe(true);
    });

    it('should omit isLeaf filter when onlyLeaf=false', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({ onlyLeaf: false }, COMPANY_ID, USER_ID);

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.isLeaf).toBeUndefined();
    });

    it('should pass accountType filter', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate(
        { accountType: 'ASSET' },
        COMPANY_ID,
        USER_ID,
      );

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.type).toBe('ASSET');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Sorting
  // ═══════════════════════════════════════════════════════════

  describe('sorting', () => {
    it('should sort by accountCode ASC with numeric ordering', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: 'a1', code: '1-100-10' }),
        mockAccount({ id: 'a2', code: '1-100-02' }),
        mockAccount({ id: 'a3', code: '1-100-01' }),
      ]);
      // كل الحسابات لها نفس الحركة (حتى لا تُستبعد)
      prisma._openingRows = [
        mockGroupByRow('a1', 10, 0),
        mockGroupByRow('a2', 10, 0),
        mockGroupByRow('a3', 10, 0),
      ];

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      const codes = result.rows.map((r) => r.accountCode);
      expect(codes).toEqual(['1-100-01', '1-100-02', '1-100-10']);
    });

    it('should sort by closingBalance desc', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: 'a1', code: 'M1' }),
        mockAccount({ id: 'a2', code: 'M2' }),
        mockAccount({ id: 'a3', code: 'M3' }),
      ]);
      prisma._openingRows = [
        mockGroupByRow('a1', 100, 0), // closing = 100
        mockGroupByRow('a2', 500, 0), // closing = 500
        mockGroupByRow('a3', 300, 0), // closing = 300
      ];

      const result = await service.generate(
        { sortBy: 'closingBalance', sortOrder: 'desc' },
        COMPANY_ID,
        USER_ID,
      );

      const ids = result.rows.map((r) => r.accountId);
      expect(ids).toEqual(['a2', 'a3', 'a1']); // 500, 300, 100
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. Security (inherited)
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
        service.generate({ branchId: OTHER_BRANCH_ID }, COMPANY_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject missing companyId', async () => {
      await expect(service.generate({}, '', USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Cache (inherited)
  // ═══════════════════════════════════════════════════════════

  describe('cache', () => {
    it('should cache on second call', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 100, 0)];

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, COMPANY_ID, USER_ID);

      // account.findMany مرة واحدة فقط (cache hit في الثاني)
      expect(prisma.account.findMany).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache with skipCache=true', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 100, 0)];

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({ skipCache: 'true' }, COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache on demand', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupByRow(ACC_CASH, 100, 0)];

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.invalidate(COMPANY_ID);
      await service.generate({}, COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });

    it('should isolate cache between companies', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, OTHER_COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. Meta
  // ═══════════════════════════════════════════════════════════

  describe('meta', () => {
    it('should include correct meta', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.generate(
        { fromDate: '2026-01-01', toDate: '2026-12-31' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.meta.title).toBe('ميزان المراجعة');
      expect(result.meta.companyName).toBe('صيدلية داوا');
      expect(result.meta.fromDate).toBe('2026-01-01');
      expect(result.meta.toDate).toBe('2026-12-31');
      expect(result.meta.timezone).toBe('Africa/Cairo');
    });
  });
});
