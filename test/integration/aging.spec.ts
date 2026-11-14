import {
  PrismaClient,
  PaymentMethod,
  SaleStatus,
  PurchaseStatus,
  UnitType,
  Role,
  ShiftStatus,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from 'src/core/prisma/prisma.service';
import { ReportMetaBuilder } from 'src/shared/report-kit';
import { LruCacheAdapter } from 'src/shared/report-kit/cache/lru-cache.adapter';

import { CustomerAgingService } from 'src/modules/accounting/reports/customer-aging/services/customer-aging.service';
import { SupplierAgingService } from 'src/modules/accounting/reports/supplier-aging/services/supplier-aging.service';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface AgingFixture {
  companyId: string;
  branchId: string;
  userId: string;
  shiftId: string;
  medicineId: string;
  batchId: string;
  customerIds: string[];
  supplierIds: string[];
  saleIds: string[];
  purchaseIds: string[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function cleanupFixture(
  prisma: PrismaClient,
  f: AgingFixture,
): Promise<void> {
  try {
    await prisma.salePayment.deleteMany({ where: { saleId: { in: f.saleIds } } });
    await prisma.saleItem.deleteMany({ where: { saleId: { in: f.saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: f.saleIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: f.purchaseIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: f.customerIds } } });
    await prisma.supplier.deleteMany({ where: { id: { in: f.supplierIds } } });
    if (f.batchId) await prisma.batch.deleteMany({ where: { id: f.batchId } });
    if (f.medicineId) {
      await prisma.medicineUnit.deleteMany({ where: { medicineId: f.medicineId } });
      await prisma.medicine.deleteMany({ where: { id: f.medicineId } });
    }
    if (f.shiftId) await prisma.shift.deleteMany({ where: { id: f.shiftId } });
    if (f.userId) await prisma.user.deleteMany({ where: { id: f.userId } });
    if (f.branchId) await prisma.branch.deleteMany({ where: { id: f.branchId } });
    if (f.companyId) await prisma.company.deleteMany({ where: { id: f.companyId } });
  } catch (e) {
    console.warn('Cleanup error:', e);
  }
}

/**
 * ينشئ شركة كاملة مع عملاء وموردين وأصناف ومبيعات/مشتريات.
 *
 * @param withDebtHistory — يتحكم في توزيع المديونية على شرائح
 */
async function createAgingFixture(
  prisma: PrismaClient,
  options: {
    name: string;
    customerConfigs: Array<{
      name: string;
      creditLimit: number;
      currentDebt: number;
      sales: Array<{
        invoiceNumber: string;
        grandTotal: number;
        paidAmount: number;
        ageInDays: number;
        /** دفع إضافي بعد asOfDate (لاختبار الدقة التاريخية) */
        latePayment?: { amount: number; afterDays: number };
      }>;
    }>;
    supplierConfigs: Array<{
      name: string;
      currentDebt: number;
      purchases: Array<{
        orderNumber: string;
        totalAmount: number;
        paidAmount: number;
        receivedDaysAgo: number;
      }>;
    }>;
  },
): Promise<AgingFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Company
  const company = await prisma.company.create({
    data: {
      name: `${options.name}-${suffix}`,
      timezone: 'Africa/Cairo',
      currency: 'SDG',
    } as any,
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
      username: `user-${suffix}`,
      name: `User ${suffix}`,
      passwordHash: 'dummy-hash',
      role: Role.CASHIER,
      companyId: company.id,
      branchId: branch.id,
    },
  });

  // 4. Shift
  const shift = await prisma.shift.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      userId: user.id,
      shiftNumber: 1,
      status: ShiftStatus.OPEN,
    },
  });

  // 5. Medicine + Batch (لتفادي فشل FK في SaleItem)
  const medicine = await prisma.medicine.create({
    data: {
      code: `MED-${suffix}`,
      barcode: `BAR-${suffix}`,
      tradeName: `Medicine ${suffix}`,
      scientificName: 'Test',
      category: 'Test',
    },
  });

  await prisma.medicineUnit.create({
    data: {
      medicineId: medicine.id,
      unitType: UnitType.UNIT,
      multiplier: 1,
      barcode: `UNIT-${suffix}`,
      price: 100,
      isDefault: true,
    },
  });

  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 2);

  const batch = await prisma.batch.create({
    data: {
      batchNumber: `BATCH-${suffix}`,
      medicineId: medicine.id,
      branchId: branch.id,
      costPrice: 50,
      salePrice: 100,
      expiryDate: futureDate,
      quantityInBase: 10000,
      isFrozen: false,
    },
  });

  // 6. Customers + Sales
  const customerIds: string[] = [];
  const saleIds: string[] = [];

  for (const config of options.customerConfigs) {
    const customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        name: config.name,
        phone: `0900-${suffix.slice(-4)}-${customerIds.length}`,
        creditLimit: config.creditLimit,
        currentDebt: config.currentDebt,
        isActive: true,
      },
    });
    customerIds.push(customer.id);

    for (const s of config.sales) {
      const saleDate = daysAgo(s.ageInDays);

      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: `${s.invoiceNumber}-${suffix.slice(-4)}`,
          branchId: branch.id,
          cashierId: user.id,
          shiftId: shift.id,
          customerId: customer.id,
          subTotal: s.grandTotal,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: s.grandTotal,
          paidAmount: s.paidAmount,
          changeAmount: 0,
          paymentMethod: PaymentMethod.CASH,
          status: SaleStatus.COMPLETED,
          createdAt: saleDate,
          items: {
            create: [
              {
                batchId: batch.id,
                unitType: UnitType.UNIT,
                multiplier: 1,
                quantity: 1,
                totalBaseQty: 1,
                returnedQty: 0,
                unitPrice: s.grandTotal,
                costPrice: s.grandTotal / 2,
                totalPrice: s.grandTotal,
              },
            ],
          },
          payments: {
            create: [
              {
                method: PaymentMethod.CASH,
                amount: s.paidAmount,
                createdAt: saleDate,
              },
              ...(s.latePayment
                ? [
                    {
                      method: PaymentMethod.CASH,
                      amount: s.latePayment.amount,
                      createdAt: daysAgo(s.latePayment.afterDays),
                    },
                  ]
                : []),
            ],
          },
        },
      });
      saleIds.push(sale.id);
    }
  }

  // 7. Suppliers + Purchase Orders
  const supplierIds: string[] = [];
  const purchaseIds: string[] = [];

  for (const config of options.supplierConfigs) {
    const supplier = await prisma.supplier.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        name: config.name,
        companyName: `${config.name} Co.`,
        phone: `0901-${suffix.slice(-4)}-${supplierIds.length}`,
        taxNumber: `TAX-${suffix.slice(-4)}-${supplierIds.length}`,
        currentDebt: config.currentDebt,
        isActive: true,
      },
    });
    supplierIds.push(supplier.id);

    for (const p of config.purchases) {
      const receivedDate = daysAgo(p.receivedDaysAgo);

      const po = await prisma.purchaseOrder.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          supplierId: supplier.id,
          orderNumber: `${p.orderNumber}-${suffix.slice(-4)}`,
          status: PurchaseStatus.RECEIVED,
          totalAmount: p.totalAmount,
          paidAmount: p.paidAmount,
          receivedAt: receivedDate,
          createdAt: receivedDate,
          createdBy: user.id,
        },
      });
      purchaseIds.push(po.id);
    }
  }

  return {
    companyId: company.id,
    branchId: branch.id,
    userId: user.id,
    shiftId: shift.id,
    medicineId: medicine.id,
    batchId: batch.id,
    customerIds,
    supplierIds,
    saleIds,
    purchaseIds,
  };
}

// ─────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────

describe('Aging Integration — Multi-Tenant Isolation', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let cache: LruCacheAdapter;
  let customerAgingService: CustomerAgingService;
  let supplierAgingService: SupplierAgingService;

  let tenantA: AgingFixture;
  let tenantB: AgingFixture;

  // ─── asOfDate ثابت (قبل `latePayment` بقليل)
  const AS_OF_DATE = new Date();
  AS_OF_DATE.setDate(AS_OF_DATE.getDate() - 10);
  const AS_OF_DATE_STR = AS_OF_DATE.toISOString().split('T')[0];

  beforeAll(async () => {
    prisma = new PrismaClient();
    prismaService = new PrismaService();
    await prismaService.$connect();

    cache = new LruCacheAdapter();
    const metaBuilder = new ReportMetaBuilder(prismaService);

    customerAgingService = new CustomerAgingService(prismaService, metaBuilder, cache);
    supplierAgingService = new SupplierAgingService(prismaService, metaBuilder, cache);

    // ─── Tenant A
    tenantA = await createAgingFixture(prisma, {
      name: 'TenantA',
      customerConfigs: [
        {
          name: 'Customer A1',
          creditLimit: 10000,
          currentDebt: 0,
          sales: [
            {
              invoiceNumber: 'INV-A1-001',
              grandTotal: 1000,
              paidAmount: 0,
              ageInDays: 45, // DAYS_31_60
            },
            {
              invoiceNumber: 'INV-A1-002',
              grandTotal: 2000,
              paidAmount: 0,
              ageInDays: 80, // DAYS_61_90
              // دفع 500 بعد asOfDate (10 أيام مضت) — يجب ألا يُحتسب
              latePayment: { amount: 500, afterDays: 3 },
            },
          ],
        },
        {
          name: 'Customer A2 (fallback)',
          creditLimit: 5000,
          currentDebt: 750, // لا فواتير → fallback
          sales: [],
        },
      ],
      supplierConfigs: [
        {
          name: 'Supplier A1',
          currentDebt: 0,
          purchases: [
            {
              orderNumber: 'PO-A1-001',
              totalAmount: 3000,
              paidAmount: 1000,
              receivedDaysAgo: 20, // CURRENT
            },
          ],
        },
      ],
    });

    // ─── Tenant B
    tenantB = await createAgingFixture(prisma, {
      name: 'TenantB',
      customerConfigs: [
        {
          name: 'Customer B1',
          creditLimit: 20000,
          currentDebt: 0,
          sales: [
            {
              invoiceNumber: 'INV-B1-001',
              grandTotal: 5000,
              paidAmount: 1000,
              ageInDays: 15, // CURRENT
            },
          ],
        },
      ],
      supplierConfigs: [
        {
          name: 'Supplier B1',
          currentDebt: 0,
          purchases: [
            {
              orderNumber: 'PO-B1-001',
              totalAmount: 8000,
              paidAmount: 2000,
              receivedDaysAgo: 100, // OVER_90
            },
          ],
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    if (tenantA) await cleanupFixture(prisma, tenantA);
    if (tenantB) await cleanupFixture(prisma, tenantB);
    await prismaService.$disconnect();
    await prisma.$disconnect();
  }, 30_000);

  beforeEach(async () => {
    await cache.clear();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Customer Aging — Isolation
  // ═══════════════════════════════════════════════════════════

  describe('Customer Aging — Isolation', () => {
    it('Company A sees ONLY its own customers', async () => {
      const result = await customerAgingService.generate(
        { asOfDate: AS_OF_DATE_STR, compareMode: 'NONE' },
        tenantA.companyId,
        tenantA.userId,
      );

      expect(result.summary.totalPartners).toBe(2); // A1 + A2
      const names = result.rows.map((r: any) => r.partyName);
      expect(names).toContain('Customer A1');
      expect(names).toContain('Customer A2 (fallback)');
      expect(names).not.toContain('Customer B1');
    });

    it('Company B sees ONLY its own customers', async () => {
      const result = await customerAgingService.generate(
        { asOfDate: AS_OF_DATE_STR, compareMode: 'NONE' },
        tenantB.companyId,
        tenantB.userId,
      );

      expect(result.summary.totalPartners).toBe(1);
      const names = result.rows.map((r: any) => r.partyName);
      expect(names).toContain('Customer B1');
      expect(names).not.toContain('Customer A1');
    });

    it('Company A CANNOT use Company B branchId', async () => {
      await expect(
        customerAgingService.generate(
          { asOfDate: AS_OF_DATE_STR, branchId: tenantB.branchId, compareMode: 'NONE' },
          tenantA.companyId,
          tenantA.userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Customer Aging — Historical Accuracy
  // ═══════════════════════════════════════════════════════════

  describe('Customer Aging — Historical Accuracy', () => {
    it('late payment after asOfDate is NOT counted in outstanding', async () => {
      const result = await customerAgingService.generate(
        { asOfDate: AS_OF_DATE_STR, compareMode: 'NONE' },
        tenantA.companyId,
        tenantA.userId,
      );

      const customerA1 = result.rows.find((r: any) => r.partyName === 'Customer A1');
      expect(customerA1).toBeDefined();

      // فاتورتان: 1000 + 2000 = 3000. الدفع المؤجل 500 يجب ألا يُخصم.
      // لكن الدفع الأولي (paidAmount=0) أيضاً 0.
      expect(customerA1?.totalOutstanding).toBe(3000);
    });

    it('bucket distribution matches invoice ages', async () => {
      const result = await customerAgingService.generate(
        { asOfDate: AS_OF_DATE_STR, compareMode: 'NONE' },
        tenantA.companyId,
        tenantA.userId,
      );

      const customerA1 = result.rows.find((r: any) => r.partyName === 'Customer A1');

      // Invoice 001: 45 يوم → DAYS_31_60 = 1000
      // Invoice 002: 80 يوم → DAYS_61_90 = 2000
      expect(customerA1?.buckets.days31_60).toBe(1000);
      expect(customerA1?.buckets.days61_90).toBe(2000);
      expect(customerA1?.buckets.current).toBe(0);
      expect(customerA1?.buckets.over90).toBe(0);
    });

    it('oldestInvoiceDays reflects oldest outstanding invoice', async () => {
      const result = await customerAgingService.generate(
        { asOfDate: AS_OF_DATE_STR, compareMode: 'NONE' },
        tenantA.companyId,
        tenantA.userId,
      );

      const customerA1 = result.rows.find((r: any) => r.partyName === 'Customer A1');
      // أقدم فاتورة 80 يوماً من اليوم، أي 70 يوماً كما في asOfDate (الذي هو قبل 10 أيام)
      expect(customerA1?.oldestInvoiceDays).toBeGreaterThanOrEqual(69);
      expect(customerA1?.oldestInvoiceDays).toBeLessThanOrEqual(71);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Customer Aging — Accounting Fallback
  // ═══════════════════════════════════════════════════════════

  describe('Customer Aging — Accounting Fallback', () => {
    it('customer with currentDebt but no invoices appears in CURRENT bucket', async () => {
      const result = await customerAgingService.generate(
        { asOfDate: AS_OF_DATE_STR, compareMode: 'NONE' },
        tenantA.companyId,
        tenantA.userId,
      );

      const customerA2 = result.rows.find(
        (r: any) => r.partyName === 'Customer A2 (fallback)',
      );

      expect(customerA2).toBeDefined();
      expect(customerA2?.totalOutstanding).toBe(750);
      expect(customerA2?.buckets.current).toBe(750);
      expect(customerA2?.buckets.days31_60).toBe(0);
      expect(customerA2?.invoicesCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Supplier Aging — Isolation
  // ═══════════════════════════════════════════════════════════

  describe('Supplier Aging — Isolation', () => {
    it('Company A sees ONLY its own suppliers', async () => {
      const result = await supplierAgingService.generate(
        { asOfDate: AS_OF_DATE_STR },
        tenantA.companyId,
        tenantA.userId,
      );

      expect(result.summary.totalPartners).toBe(1);
      const names = result.partners.map((p: any) => p.partnerName);
      expect(names).toContain('Supplier A1');
      expect(names).not.toContain('Supplier B1');
    });

    it('Company B sees ONLY its own suppliers', async () => {
      const result = await supplierAgingService.generate(
        { asOfDate: AS_OF_DATE_STR },
        tenantB.companyId,
        tenantB.userId,
      );

      expect(result.summary.totalPartners).toBe(1);
      const names = result.partners.map((p: any) => p.partnerName);
      expect(names).toContain('Supplier B1');
      expect(names).not.toContain('Supplier A1');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Supplier Aging — Outstanding Calculation
  // ═══════════════════════════════════════════════════════════

  describe('Supplier Aging — Outstanding', () => {
    it('computes remaining = totalAmount - paidAmount', async () => {
      const result = await supplierAgingService.generate(
        { asOfDate: AS_OF_DATE_STR },
        tenantA.companyId,
        tenantA.userId,
      );

      const supplierA1 = result.partners[0];
      // PO: 3000 - 1000 = 2000
      expect(supplierA1.currentBalance).toBe(2000);
    });

    it('places 20-day-old purchase in CURRENT bucket', async () => {
      const result = await supplierAgingService.generate(
        { asOfDate: AS_OF_DATE_STR },
        tenantA.companyId,
        tenantA.userId,
      );

      const supplierA1 = result.partners[0];
      expect(supplierA1.buckets.current).toBe(2000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Custom Thresholds
  // ═══════════════════════════════════════════════════════════

  describe('Custom Thresholds', () => {
    it('supports custom bucket1/bucket2/bucket3', async () => {
      const result = await customerAgingService.generate(
        {
          asOfDate: AS_OF_DATE_STR,
          bucket1: 60,
          bucket2: 100,
          bucket3: 150,
          compareMode: 'NONE',
        },
        tenantA.companyId,
        tenantA.userId,
      );

      // With bucket1=60: 45-day invoice falls in CURRENT
      const customerA1 = result.rows.find((r: any) => r.partyName === 'Customer A1');
      expect(customerA1?.buckets.current).toBe(1000);   // 45d → CURRENT (0-60)
      expect(customerA1?.buckets.days31_60).toBe(2000); // 80d → DAYS_31_60 (61-100)
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. Cache Isolation
  // ═══════════════════════════════════════════════════════════

  describe('Cache Isolation', () => {
    it('cache does not leak between companies', async () => {
      // First call (populates cache)
      const r1 = await customerAgingService.generate(
        { asOfDate: AS_OF_DATE_STR, compareMode: 'NONE' },
        tenantA.companyId,
        tenantA.userId,
      );

      // Second call for different company
      const r2 = await customerAgingService.generate(
        { asOfDate: AS_OF_DATE_STR, compareMode: 'NONE' },
        tenantB.companyId,
        tenantB.userId,
      );

      expect(r1.summary.totalPartners).toBe(2);
      expect(r2.summary.totalPartners).toBe(1);
    });
  });
});
