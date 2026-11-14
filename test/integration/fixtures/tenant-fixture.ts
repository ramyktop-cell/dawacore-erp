import {
  PrismaClient,
  UnitType,
  PaymentMethod,
  SaleStatus,
  Role,
  ShiftStatus,
} from '@prisma/client';

/**
 * بيانات شركة اختبارية كاملة — للـ Multi-Tenant Integration Tests.
 */
export interface TenantFixture {
  companyId: string;
  branchId: string;
  userId: string;
  shiftId: string;
  medicineIds: string[];
  batchIds: string[];
  saleIds: string[];

  /** قيم متوقعة للتحقق */
  expected: {
    salesCount: number;
    grossSales: number;
    paymentMethod: PaymentMethod;
    medicineTradeNames: string[];
  };
}

export interface TenantFixtureOptions {
  companyName: string;
  salesCount: number;
  pricePerSale: number;
  paymentMethod: PaymentMethod;
  medicineTradeNames: string[];
}

/**
 * ينشئ شركة اختبارية كاملة مع كل ما تحتاجه التقارير:
 *   - Company + Branch + User (cashier) + Shift
 *   - Medicines + MedicineUnits + Batches
 *   - Sales (مع SaleItems + SalePayments)
 *
 * كل entity يحمل لاحقة عشوائية لتفادي التعارض.
 */
export async function createTenantFixture(
  prisma: PrismaClient,
  options: TenantFixtureOptions,
): Promise<TenantFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // ─── 1. Company
  const company = await prisma.company.create({
    data: {
      name: `${options.companyName}-${suffix}`,
      timezone: 'Africa/Cairo',
      currency: 'SDG',
    },
  });

  // ─── 2. Branch
  const branch = await prisma.branch.create({
    data: {
      name: `Branch-${suffix}`,
      code: `BR-${suffix}`,
      companyId: company.id,
    },
  });

  // ─── 3. User (cashier)
  const user = await prisma.user.create({
    data: {
      username: `cashier-${suffix}`,
      name: `Cashier ${suffix}`,
      passwordHash: 'dummy-hash-for-integration-tests',
      role: Role.CASHIER,
      companyId: company.id,
      branchId: branch.id,
    },
  });

  // ─── 4. Shift
  const shift = await prisma.shift.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      userId: user.id,
      shiftNumber: 1,
      status: ShiftStatus.OPEN,
    },
  });

  // ─── 5. Medicines + MedicineUnits + Batches
  const medicineIds: string[] = [];
  const batchIds: string[] = [];

  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 2);

  for (let i = 0; i < options.medicineTradeNames.length; i++) {
    const tradeName = options.medicineTradeNames[i];
    const medSuffix = `${suffix}-${i}`;

    const medicine = await prisma.medicine.create({
      data: {
        code: `MED-${medSuffix}`,
        barcode: `BAR-${medSuffix}`,
        tradeName,
        scientificName: `Scientific-${tradeName}`,
        category: 'IntegrationTests',
      },
    });
    medicineIds.push(medicine.id);

    await prisma.medicineUnit.create({
      data: {
        medicineId: medicine.id,
        unitType: UnitType.UNIT,
        multiplier: 1,
        barcode: `UNIT-BAR-${medSuffix}`,
        price: options.pricePerSale,
        isDefault: true,
      },
    });

    const batch = await prisma.batch.create({
      data: {
        batchNumber: `BATCH-${medSuffix}`,
        medicineId: medicine.id,
        branchId: branch.id,
        costPrice: options.pricePerSale / 2,
        salePrice: options.pricePerSale,
        expiryDate: futureDate,
        quantityInBase: 100,
        isFrozen: false,
      },
    });
    batchIds.push(batch.id);
  }

  // ─── 6. Sales (مع items + payments)
  const saleIds: string[] = [];

  for (let i = 0; i < options.salesCount; i++) {
    // نوزّع الفواتير على الباتشات المتاحة
    const batchId = batchIds[i % batchIds.length];

    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: `INV-${suffix}-${i + 1}`,
        branchId: branch.id,
        cashierId: user.id,
        shiftId: shift.id,
        subTotal: options.pricePerSale,
        discountTotal: 0,
        taxTotal: 0,
        grandTotal: options.pricePerSale,
        paidAmount: options.pricePerSale,
        changeAmount: 0,
        paymentMethod: options.paymentMethod,
        status: SaleStatus.COMPLETED,
        items: {
          create: [
            {
              batchId,
              unitType: UnitType.UNIT,
              multiplier: 1,
              quantity: 1,
              totalBaseQty: 1,
              returnedQty: 0,
              unitPrice: options.pricePerSale,
              costPrice: options.pricePerSale / 2,
              totalPrice: options.pricePerSale,
            },
          ],
        },
        payments: {
          create: [
            {
              method: options.paymentMethod,
              amount: options.pricePerSale,
            },
          ],
        },
      },
    });
    saleIds.push(sale.id);
  }

  return {
    companyId: company.id,
    branchId: branch.id,
    userId: user.id,
    shiftId: shift.id,
    medicineIds,
    batchIds,
    saleIds,
    expected: {
      salesCount: options.salesCount,
      grossSales: options.salesCount * options.pricePerSale,
      paymentMethod: options.paymentMethod,
      medicineTradeNames: options.medicineTradeNames,
    },
  };
}

/**
 * ينظّف كل بيانات شركة اختبارية — بترتيب عكسي لتفادي FK violations.
 */
export async function cleanupTenant(
  prisma: PrismaClient,
  fixture: TenantFixture,
): Promise<void> {
  try {
    // SalePayment + SaleItem + Sale
    await prisma.salePayment.deleteMany({
      where: { saleId: { in: fixture.saleIds } },
    });
    await prisma.saleItem.deleteMany({
      where: { saleId: { in: fixture.saleIds } },
    });
    await prisma.sale.deleteMany({
      where: { id: { in: fixture.saleIds } },
    });

    // InventoryTransaction (إن وُجدت)
    await prisma.inventoryTransaction.deleteMany({
      where: { batchId: { in: fixture.batchIds } },
    });

    // Batch + MedicineUnit + Medicine
    await prisma.batch.deleteMany({
      where: { id: { in: fixture.batchIds } },
    });
    await prisma.medicineUnit.deleteMany({
      where: { medicineId: { in: fixture.medicineIds } },
    });
    await prisma.medicine.deleteMany({
      where: { id: { in: fixture.medicineIds } },
    });

    // Shift + User + Branch + Company
    await prisma.shift.deleteMany({ where: { id: fixture.shiftId } });
    await prisma.user.deleteMany({ where: { id: fixture.userId } });
    await prisma.branch.deleteMany({ where: { id: fixture.branchId } });
    await prisma.company.deleteMany({ where: { id: fixture.companyId } });
  } catch (e) {
    console.warn('⚠️  Cleanup error:', e);
  }
}
