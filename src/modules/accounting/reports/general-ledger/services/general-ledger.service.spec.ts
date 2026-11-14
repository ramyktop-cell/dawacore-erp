import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccountType } from '@prisma/client';

import { GeneralLedgerService } from './general-ledger.service';
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
const ACC_SUPPLIER = 'acc-2-supplier';

const CUST_ID = 'cust-1';
const SUPP_ID = 'supp-1';

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
 * يحاكي استجابة `journalLine.groupBy` (opening أو count).
 */
function mockGroupBySum(
  accountId: string,
  debit: number,
  credit: number,
) {
  return { accountId, _sum: { debit, credit } };
}

function mockGroupByCount(accountId: string, count: number) {
  return { accountId, _count: { _all: count } };
}

/**
 * يحاكي صف `journalLine.findMany`.
 */
function mockEntryRow(overrides: Partial<any> = {}) {
  return {
    id: `line-${Math.random().toString(36).slice(2, 8)}`,
    accountId: ACC_CASH,
    debit: 100,
    credit: 0,
    journalEntry: {
      id: 'entry-1',
      entryNumber: 'JV-001',
      date: new Date('2026-03-15T10:00:00Z'),
      description: 'بيع نقدي',
      referenceId: null,
      source: 'SALE',
    },
    customer: null,
    supplier: null,
    ...overrides,
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
      groupBy: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  // groupBy يُستدعى مرتين: opening (date.lt) + count (date.gte)
  prisma._openingRows = [];
  prisma._countRows = [];
  prisma.journalLine.groupBy.mockImplementation((args: any) => {
    const dateClause = args?.where?.journalEntry?.date;
    if (dateClause?.lt) return Promise.resolve(prisma._openingRows);
    return Promise.resolve(prisma._countRows);
  });

  return prisma;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('GeneralLedgerService', () => {
  let service: GeneralLedgerService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cache: ICacheService;

  beforeEach(async () => {
    prisma = createPrismaMock();
    cache = new LruCacheAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneralLedgerService,
        ReportMetaBuilder,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();

    service = module.get(GeneralLedgerService);
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

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary).toEqual({
        accountsCount: 0,
        accountsWithActivity: 0,
        totalEntriesDisplayed: 0,
        totalDebit: 0,
        totalCredit: 0,
        difference: 0,
        isBalanced: true,
      });
      expect(result.accounts).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Opening balance & closing
  // ═══════════════════════════════════════════════════════════

  describe('opening / closing balances', () => {
    it('should compute opening + closing for asset account (debit)', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupBySum(ACC_CASH, 5000, 1000)];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 2)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH, debit: 500, credit: 0 }),
        mockEntryRow({ accountId: ACC_CASH, debit: 0, credit: 200 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const acc = result.accounts[0];

      // Opening: 5000 - 1000 = 4000 (debit)
      expect(acc.openingBalance).toBe(4000);
      expect(acc.openingDebit).toBe(4000);
      expect(acc.openingCredit).toBe(0);

      // Movement: +500 - 200 = +300
      expect(acc.totalDebit).toBe(500);
      expect(acc.totalCredit).toBe(200);

      // Closing: 4000 + 300 = 4300 (debit)
      expect(acc.closingBalance).toBe(4300);
      expect(acc.closingDebit).toBe(4300);
      expect(acc.closingCredit).toBe(0);
    });

    it('should compute opening + closing for liability (credit)', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({
          id: ACC_SUPPLIER,
          code: '2101',
          name: 'الموردون',
          type: AccountType.LIABILITY,
        }),
      ]);
      prisma._openingRows = [mockGroupBySum(ACC_SUPPLIER, 0, 3000)];
      prisma._countRows = [mockGroupByCount(ACC_SUPPLIER, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_SUPPLIER, debit: 500, credit: 0 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const acc = result.accounts[0];

      // Opening: 0 - 3000 = -3000 (credit)
      expect(acc.openingBalance).toBe(-3000);
      expect(acc.openingDebit).toBe(0);
      expect(acc.openingCredit).toBe(3000);

      // Closing: -3000 + 500 = -2500
      expect(acc.closingBalance).toBe(-2500);
      expect(acc.closingCredit).toBe(2500);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Running balance (CRITICAL)
  // ═══════════════════════════════════════════════════════════

  describe('running balance', () => {
    it('should accumulate running balance sequentially', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupBySum(ACC_CASH, 1000, 0)];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 3)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH, debit: 500, credit: 0 }),
        mockEntryRow({ accountId: ACC_CASH, debit: 0, credit: 200 }),
        mockEntryRow({ accountId: ACC_CASH, debit: 300, credit: 0 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const entries = result.accounts[0].entries;

      // Opening = 1000
      expect(entries[0].runningBalance).toBe(1500); // 1000 + 500
      expect(entries[1].runningBalance).toBe(1300); // 1500 - 200
      expect(entries[2].runningBalance).toBe(1600); // 1300 + 300
    });

    it('should compute closing balance = last running balance', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupBySum(ACC_CASH, 500, 0)];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 2)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH, debit: 100, credit: 0 }),
        mockEntryRow({ accountId: ACC_CASH, debit: 0, credit: 50 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const acc = result.accounts[0];

      const lastEntry = acc.entries[acc.entries.length - 1];
      expect(lastEntry.runningBalance).toBe(acc.closingBalance);
      expect(acc.closingBalance).toBe(550); // 500 + 100 - 50
    });

    it('should support negative running balance (credit)', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ type: AccountType.LIABILITY }),
      ]);
      prisma._openingRows = [mockGroupBySum(ACC_CASH, 0, 1000)];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH, debit: 0, credit: 500 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const entries = result.accounts[0].entries;

      // Opening: -1000
      expect(entries[0].runningBalance).toBe(-1500);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Truncation
  // ═══════════════════════════════════════════════════════════

  describe('truncation', () => {
    it('should set isTruncated=true when entries exceed limit', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 250)];
      prisma.journalLine.findMany.mockResolvedValue(
        Array.from({ length: 250 }, () =>
          mockEntryRow({ accountId: ACC_CASH, debit: 10, credit: 0 }),
        ),
      );

      const result = await service.generate(
        { entriesPerAccount: 50 },
        COMPANY_ID,
        USER_ID,
      );
      const acc = result.accounts[0];

      expect(acc.totalEntries).toBe(250);
      expect(acc.displayedEntries).toBe(50);
      expect(acc.isTruncated).toBe(true);
      expect(acc.entries).toHaveLength(50);

      // رغم التقطيع، closing balance يجب أن يكون صحيحاً
      expect(acc.closingBalance).toBe(2500); // 250 * 10
    });

    it('should set isTruncated=false when entries <= limit', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 30)];
      prisma.journalLine.findMany.mockResolvedValue(
        Array.from({ length: 30 }, () =>
          mockEntryRow({ accountId: ACC_CASH, debit: 10, credit: 0 }),
        ),
      );

      const result = await service.generate(
        { entriesPerAccount: 100 },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.accounts[0].isTruncated).toBe(false);
      expect(result.accounts[0].displayedEntries).toBe(30);
    });

    it('should return all entries when entriesPerAccount=0', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 500)];
      prisma.journalLine.findMany.mockResolvedValue(
        Array.from({ length: 500 }, () =>
          mockEntryRow({ accountId: ACC_CASH, debit: 1, credit: 0 }),
        ),
      );

      const result = await service.generate(
        { entriesPerAccount: 0 },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.accounts[0].entries).toHaveLength(500);
      expect(result.accounts[0].isTruncated).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Counterparty mapping
  // ═══════════════════════════════════════════════════════════

  describe('counterparty', () => {
    it('should map CUSTOMER correctly', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({
          accountId: ACC_CASH,
          customer: { id: CUST_ID, name: 'شركة الأمل' },
          supplier: null,
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const cp = result.accounts[0].entries[0].counterparty;

      expect(cp.type).toBe('CUSTOMER');
      expect(cp.id).toBe(CUST_ID);
      expect(cp.name).toBe('شركة الأمل');
    });

    it('should map SUPPLIER correctly', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({
          accountId: ACC_CASH,
          customer: null,
          supplier: { id: SUPP_ID, name: 'شركة النيل' },
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const cp = result.accounts[0].entries[0].counterparty;

      expect(cp.type).toBe('SUPPLIER');
      expect(cp.name).toBe('شركة النيل');
    });

    it('should return NONE when both are null', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH, customer: null, supplier: null }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      expect(result.accounts[0].entries[0].counterparty.type).toBe('NONE');
    });

    it('should prioritize customer when both exist', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({
          accountId: ACC_CASH,
          customer: { id: CUST_ID, name: 'عميل' },
          supplier: { id: SUPP_ID, name: 'مورد' },
        }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      expect(result.accounts[0].entries[0].counterparty.type).toBe('CUSTOMER');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Filters
  // ═══════════════════════════════════════════════════════════

  describe('filters', () => {
    it('should filter by accountId (Single Mode)', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({ accountId: ACC_CASH }, COMPANY_ID, USER_ID);

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.id).toBe(ACC_CASH);
    });

    it('should filter by accountType', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate(
        { accountType: 'ASSET' },
        COMPANY_ID,
        USER_ID,
      );

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.type).toBe('ASSET');
    });

    it('should pass onlyLeaf=true by default', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({}, COMPANY_ID, USER_ID);

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.isLeaf).toBe(true);
    });

    it('should omit isLeaf when onlyLeaf=false', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.generate({ onlyLeaf: false }, COMPANY_ID, USER_ID);

      const call = prisma.account.findMany.mock.calls[0][0];
      expect(call.where.isLeaf).toBeUndefined();
    });

    it('should hide zero-movement accounts by default', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: 'a1' }),
        mockAccount({ id: 'a2' }),
      ]);
      prisma._openingRows = [mockGroupBySum('a1', 100, 0)];
      prisma._countRows = [mockGroupByCount('a1', 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: 'a1', debit: 100, credit: 0 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].accountId).toBe('a1');
    });

    it('should show zero-movement accounts when hideZeroMovement=false', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: 'a1' }),
        mockAccount({ id: 'a2' }),
      ]);
      prisma._openingRows = [mockGroupBySum('a1', 100, 0)];
      prisma._countRows = [mockGroupByCount('a1', 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: 'a1', debit: 100, credit: 0 }),
      ]);

      const result = await service.generate(
        { hideZeroMovement: false },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.accounts).toHaveLength(2);
    });

    it('should zero opening balance when includeOpeningBalance=false', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupBySum(ACC_CASH, 5000, 0)];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH, debit: 100, credit: 0 }),
      ]);

      const result = await service.generate(
        { includeOpeningBalance: false },
        COMPANY_ID,
        USER_ID,
      );
      const acc = result.accounts[0];

      expect(acc.openingBalance).toBe(0);
      // Closing = 0 + 100 = 100
      expect(acc.closingBalance).toBe(100);
      // Running balance يبدأ من صفر
      expect(acc.entries[0].runningBalance).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. Sorting
  // ═══════════════════════════════════════════════════════════

  describe('sorting', () => {
    it('should sort by code ASC (numeric) by default', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: 'a1', code: '1-100-10' }),
        mockAccount({ id: 'a2', code: '1-100-02' }),
        mockAccount({ id: 'a3', code: '1-100-01' }),
      ]);
      // كل حساب له حركة لتفادي الفلترة
      prisma._openingRows = [
        mockGroupBySum('a1', 10, 0),
        mockGroupBySum('a2', 10, 0),
        mockGroupBySum('a3', 10, 0),
      ];
      prisma._countRows = [
        mockGroupByCount('a1', 1),
        mockGroupByCount('a2', 1),
        mockGroupByCount('a3', 1),
      ];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: 'a1', debit: 10, credit: 0 }),
        mockEntryRow({ accountId: 'a2', debit: 10, credit: 0 }),
        mockEntryRow({ accountId: 'a3', debit: 10, credit: 0 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);
      const codes = result.accounts.map((a) => a.accountCode);

      expect(codes).toEqual(['1-100-01', '1-100-02', '1-100-10']);
    });

    it('should sort by activity DESC', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: 'a1', code: 'A' }),
        mockAccount({ id: 'a2', code: 'B' }),
        mockAccount({ id: 'a3', code: 'C' }),
      ]);
      prisma._openingRows = [
        mockGroupBySum('a1', 10, 0),
        mockGroupBySum('a2', 10, 0),
        mockGroupBySum('a3', 10, 0),
      ];
      prisma._countRows = [
        mockGroupByCount('a1', 5),
        mockGroupByCount('a2', 20),
        mockGroupByCount('a3', 10),
      ];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: 'a1', debit: 10, credit: 0 }),
        mockEntryRow({ accountId: 'a2', debit: 10, credit: 0 }),
        mockEntryRow({ accountId: 'a3', debit: 10, credit: 0 }),
      ]);

      const result = await service.generate(
        { sortAccountsBy: 'activity', sortAccountsOrder: 'desc' },
        COMPANY_ID,
        USER_ID,
      );

      const ids = result.accounts.map((a) => a.accountId);
      expect(ids).toEqual(['a2', 'a3', 'a1']); // 20, 10, 5
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Summary aggregation
  // ═══════════════════════════════════════════════════════════

  describe('summary', () => {
    it('should aggregate totals across all accounts', async () => {
      prisma.account.findMany.mockResolvedValue([
        mockAccount({ id: 'a1', code: 'A' }),
        mockAccount({ id: 'a2', code: 'B' }),
      ]);
      prisma._openingRows = [mockGroupBySum('a1', 100, 0)];
      prisma._countRows = [
        mockGroupByCount('a1', 5),
        mockGroupByCount('a2', 3),
      ];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: 'a1', debit: 100, credit: 0 }),
        mockEntryRow({ accountId: 'a2', debit: 100, credit: 0 }),
      ]);

      const result = await service.generate({}, COMPANY_ID, USER_ID);

      expect(result.summary.accountsCount).toBe(2);
      expect(result.summary.accountsWithActivity).toBe(2);
      expect(result.summary.totalDebit).toBe(200);
      expect(result.summary.totalCredit).toBe(0);
      expect(result.summary.isBalanced).toBe(false); // لأن الدائن = 0
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
  // 10. Cache (inherited)
  // ═══════════════════════════════════════════════════════════

  describe('cache', () => {
    it('should cache on second call', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupBySum(ACC_CASH, 100, 0)];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH }),
      ]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({}, COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache with skipCache=true', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupBySum(ACC_CASH, 100, 0)];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH }),
      ]);

      await service.generate({}, COMPANY_ID, USER_ID);
      await service.generate({ skipCache: 'true' }, COMPANY_ID, USER_ID);

      expect(prisma.account.findMany).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache on demand', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);
      prisma._openingRows = [mockGroupBySum(ACC_CASH, 100, 0)];
      prisma._countRows = [mockGroupByCount(ACC_CASH, 1)];
      prisma.journalLine.findMany.mockResolvedValue([
        mockEntryRow({ accountId: ACC_CASH }),
      ]);

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

    it('should use different cache keys for different filters', async () => {
      prisma.account.findMany.mockResolvedValue([mockAccount()]);

      await service.generate({ accountType: 'ASSET' }, COMPANY_ID, USER_ID);
      await service.generate({ accountType: 'LIABILITY' }, COMPANY_ID, USER_ID);

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
        { fromDate: '2026-01-01', toDate: '2026-12-31' },
        COMPANY_ID,
        USER_ID,
      );

      expect(result.meta.title).toBe('دفتر الأستاذ العام');
      expect(result.meta.companyName).toBe('صيدلية داوا');
      expect(result.meta.fromDate).toBe('2026-01-01');
      expect(result.meta.toDate).toBe('2026-12-31');
      expect(result.meta.timezone).toBe('Africa/Cairo');
    });
  });
});
