import { PrismaClient, AccountType, Role } from '@prisma/client';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

import { PrismaService } from 'src/core/prisma/prisma.service';
import { ReportMetaBuilder } from 'src/shared/report-kit';
import { LruCacheAdapter } from 'src/shared/report-kit/cache/lru-cache.adapter';
import { TrialBalanceService } from 'src/modules/accounting/reports/trial-balance/services/trial-balance.service';

// ─────────────────────────────────────────────────────────────
// Types & Fixture Helper
// ─────────────────────────────────────────────────────────────

interface AccountingTenantFixture {
  companyId: string;
  branchId: string;
  userId: string;
  accounts: {
    cashId: string;
    bankId: string;
    apId: string;
    capitalId: string;
    cogsId: string;
    revenueId: string;
  };
  entryIds: string[];
}

async function createAccountingTenant(
  prisma: PrismaClient,
  companyName: string,
  codePrefix: string,
): Promise<AccountingTenantFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Company
  const company = await prisma.company.create({
    data: {
      name: `${companyName}-${suffix}`,
      timezone: 'Africa/Cairo',
      currency: 'SDG',
    },
  });

  // 2. Branch
  const branch = await prisma.branch.create({
    data: {
      name: `Branch-${suffix}`,
      code: `BR-${suffix}`,
      companyId: company.id,
    },
  });

  // 3. User
  const user = await prisma.user.create({
    data: {
      username: `accountant-${suffix}`,
      name: `Accountant ${suffix}`,
      passwordHash: 'dummy-hash-for-integration-tests',
      role: Role.ACCOUNTANT,
      companyId: company.id,
      branchId: branch.id,
    },
  });

  // 4. Accounts
  const cash = await prisma.account.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      code: `${codePrefix}1101`,
      name: 'الصندوق',
      type: AccountType.ASSET,
      level: 3,
      isLeaf: true,
    },
  });

  const bank = await prisma.account.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      code: `${codePrefix}1102`,
      name: 'البنك',
      type: AccountType.ASSET,
      level: 3,
      isLeaf: true,
    },
  });

  const ap = await prisma.account.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      code: `${codePrefix}2101`,
      name: 'الموردون',
      type: AccountType.LIABILITY,
      level: 3,
      isLeaf: true,
    },
  });

  const capital = await prisma.account.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      code: `${codePrefix}3101`,
      name: 'رأس المال',
      type: AccountType.EQUITY,
      level: 3,
      isLeaf: true,
    },
  });

  const revenue = await prisma.account.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      code: `${codePrefix}4101`,
      name: 'إيراد المبيعات',
      type: AccountType.REVENUE,
      level: 3,
      isLeaf: true,
    },
  });

  const cogs = await prisma.account.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      code: `${codePrefix}5101`,
      name: 'تكلفة البضاعة المباعة',
      type: AccountType.EXPENSE,
      level: 3,
      isLeaf: true,
    },
  });

  // 5. Journal Entries
  // A) Opening Period Entry (2025-12-15) - Before fromDate (2026-01-01)
  // Debit Cash 10,000 / Credit Capital 10,000
  const entryOpening = await prisma.journalEntry.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      entryNumber: `JV-OP-${suffix}`,
      date: new Date('2025-12-15T10:00:00Z'),
      description: 'قيد رصيد افتتاحي',
      source: 'MANUAL',
      lines: {
        create: [
          { accountId: cash.id, debit: 10000, credit: 0 },
          { accountId: capital.id, debit: 0, credit: 10000 },
        ],
      },
    },
  });

  // B) Period Movement Entry 1 (2026-03-10)
  // Debit COGS 3,000 / Credit Cash 3,000
  const entryPeriod1 = await prisma.journalEntry.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      entryNumber: `JV-P1-${suffix}`,
      date: new Date('2026-03-10T12:00:00Z'),
      description: 'شراء بضاعة نقداً',
      source: 'PURCHASE',
      lines: {
        create: [
          { accountId: cogs.id, debit: 3000, credit: 0 },
          { accountId: cash.id, debit: 0, credit: 3000 },
        ],
      },
    },
  });

  // C) Period Movement Entry 2 (2026-06-20)
  // Debit Bank 8,000 / Credit Revenue 8,000
  const entryPeriod2 = await prisma.journalEntry.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      entryNumber: `JV-P2-${suffix}`,
      date: new Date('2026-06-20T15:00:00Z'),
      description: 'مبيعات محولة على البنك',
      source: 'SALE',
      lines: {
        create: [
          { accountId: bank.id, debit: 8000, credit: 0 },
          { accountId: revenue.id, debit: 0, credit: 8000 },
        ],
      },
    },
  });

  // D) Future Entry (2027-02-01) - After toDate (2026-12-31)
  // Debit Cash 5,000 / Credit Revenue 5,000
  const entryFuture = await prisma.journalEntry.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      entryNumber: `JV-FUT-${suffix}`,
      date: new Date('2027-02-01T10:00:00Z'),
      description: 'حركة في سنة قادمة',
      source: 'SALE',
      lines: {
        create: [
          { accountId: cash.id, debit: 5000, credit: 0 },
          { accountId: revenue.id, debit: 0, credit: 5000 },
        ],
      },
    },
  });

  return {
    companyId: company.id,
    branchId: branch.id,
    userId: user.id,
    accounts: {
      cashId: cash.id,
      bankId: bank.id,
      apId: ap.id,
      capitalId: capital.id,
      cogsId: cogs.id,
      revenueId: revenue.id,
    },
    entryIds: [
      entryOpening.id,
      entryPeriod1.id,
      entryPeriod2.id,
      entryFuture.id,
    ],
  };
}

async function cleanupAccountingTenant(
  prisma: PrismaClient,
  fixture: AccountingTenantFixture,
): Promise<void> {
  try {
    // 1. JournalLines & Entries
    await prisma.journalLine.deleteMany({
      where: { journalEntryId: { in: fixture.entryIds } },
    });
    await prisma.journalEntry.deleteMany({
      where: { id: { in: fixture.entryIds } },
    });

    // 2. Accounts
    const accountIds = Object.values(fixture.accounts);
    await prisma.account.deleteMany({
      where: { id: { in: accountIds } },
    });

    // 3. User, Branch, Company
    await prisma.user.deleteMany({ where: { id: fixture.userId } });
    await prisma.branch.deleteMany({ where: { id: fixture.branchId } });
    await prisma.company.deleteMany({ where: { id: fixture.companyId } });
  } catch (err) {
    console.warn('⚠️  Accounting cleanup error:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────

describe('Trial Balance Multi-Tenant & Anti-Leak (Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let cache: LruCacheAdapter;
  let service: TrialBalanceService;

  let tenantA: AccountingTenantFixture;
  let tenantB: AccountingTenantFixture;

  const FILTERS = {
    fromDate: '2026-01-01',
    toDate: '2026-12-31',
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    prismaService = new PrismaService();
    await prismaService.$connect();

    cache = new LruCacheAdapter();
    const metaBuilder = new ReportMetaBuilder(prismaService);
    service = new TrialBalanceService(prismaService, metaBuilder, cache);

    // Seed Tenant A (prefix 'A-')
    tenantA = await createAccountingTenant(prisma, 'PharmaCorp-A', 'A');

    // Seed Tenant B (prefix 'B-')
    tenantB = await createAccountingTenant(prisma, 'PharmaCorp-B', 'B');
  }, 60_000);

  afterAll(async () => {
    if (tenantA) await cleanupAccountingTenant(prisma, tenantA);
    if (tenantB) await cleanupAccountingTenant(prisma, tenantB);
    await prismaService.$disconnect();
    await prisma.$disconnect();
  }, 30_000);

  beforeEach(async () => {
    await cache.clear();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Anti-Leak & Isolation
  // ═══════════════════════════════════════════════════════════

  describe('Multi-Tenant Isolation', () => {
    it('Tenant A sees ONLY its own accounts and balances', async () => {
      const result = await service.generate(
        FILTERS,
        tenantA.companyId,
        tenantA.userId,
      );

      // Verify row isolation: All codes start with 'A'
      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.accountCode.startsWith('A')).toBe(true);
        expect(row.accountCode.startsWith('B')).toBe(false);
      }

      // Verify exact balances for Tenant A in 2026:
      // Opening: Cash debit 10,000, Capital credit 10,000 -> totals = 10,000
      expect(result.summary.totalOpeningDebit).toBe(10000);
      expect(result.summary.totalOpeningCredit).toBe(10000);
      expect(result.summary.openingDifference).toBe(0);

      // Movements in 2026:
      // Entry 1: COGS debit 3,000, Cash credit 3,000
      // Entry 2: Bank debit 8,000, Revenue credit 8,000
      // Total movement debit = 3,000 + 8,000 = 11,000
      // Total movement credit = 3,000 + 8,000 = 11,000
      expect(result.summary.totalMovementDebit).toBe(11000);
      expect(result.summary.totalMovementCredit).toBe(11000);
      expect(result.summary.movementDifference).toBe(0);

      // Closing balances:
      // Cash: Opening 10,000 - credit 3,000 = debit 7,000
      // Bank: Movement debit 8,000 = debit 8,000
      // COGS: Movement debit 3,000 = debit 3,000
      // Total Closing Debit = 7,000 + 8,000 + 3,000 = 18,000
      // Capital: Opening credit 10,000 = credit 10,000
      // Revenue: Movement credit 8,000 = credit 8,000
      // Total Closing Credit = 10,000 + 8,000 = 18,000
      expect(result.summary.totalClosingDebit).toBe(18000);
      expect(result.summary.totalClosingCredit).toBe(18000);
      expect(result.summary.closingDifference).toBe(0);
      expect(result.summary.isBalanced).toBe(true);
    });

    it('Tenant B sees ONLY its own accounts and balances', async () => {
      const result = await service.generate(
        FILTERS,
        tenantB.companyId,
        tenantB.userId,
      );

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.accountCode.startsWith('B')).toBe(true);
        expect(row.accountCode.startsWith('A')).toBe(false);
      }

      expect(result.summary.isBalanced).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Cross-Tenant Attack & Security Boundary Checks
  // ═══════════════════════════════════════════════════════════

  describe('Security Boundaries & Anti-Tampering', () => {
    it('Tenant A CANNOT use Tenant B branchId', async () => {
      await expect(
        service.generate(
          { ...FILTERS, branchId: tenantB.branchId },
          tenantA.companyId,
          tenantA.userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Tenant A CANNOT inject companyId in filters', async () => {
      await expect(
        service.generate(
          { ...FILTERS, companyId: tenantB.companyId } as any,
          tenantA.companyId,
          tenantA.userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Tenant A querying with Tenant B accountId returns empty report (no leak)', async () => {
      const result = await service.generate(
        { ...FILTERS, accountId: tenantB.accounts.cashId },
        tenantA.companyId,
        tenantA.userId,
      );

      // Account does not belong to Tenant A -> filtered out
      expect(result.rows).toHaveLength(0);
      expect(result.summary.totalAccounts).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Date Boundary & Filtering Integrity
  // ═══════════════════════════════════════════════════════════

  describe('Accounting Filter Precision', () => {
    it('Future entries after toDate are strictly excluded', async () => {
      const result = await service.generate(
        FILTERS,
        tenantA.companyId,
        tenantA.userId,
      );

      // Future entry was 5,000 on 2027-02-01
      // If it leaked into movement, movementDebit would be 16,000 instead of 11,000
      expect(result.summary.totalMovementDebit).toBe(11000);
      expect(result.summary.totalClosingDebit).toBe(18000);
    });

    it('Filters by accountType properly', async () => {
      const result = await service.generate(
        { ...FILTERS, accountType: AccountType.ASSET },
        tenantA.companyId,
        tenantA.userId,
      );

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.accountType).toBe(AccountType.ASSET);
      }
    });

    it('Honors branchId filter for the same company', async () => {
      const result = await service.generate(
        { ...FILTERS, branchId: tenantA.branchId },
        tenantA.companyId,
        tenantA.userId,
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.summary.isBalanced).toBe(true);
    });
  });
});
