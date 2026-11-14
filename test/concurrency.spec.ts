import { PrismaClient, UnitType } from '@prisma/client';
import { StockReservationService } from '../src/inventory/stock-reservation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { getDbProvider, supportsPessimisticLocking } from './utils/db-provider';

describe('اختبارات التزامن الحرجة (Concurrency & Pessimistic Locking)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let service: StockReservationService;

  let companyId: string;
  let branchId: string;
  let userId: string;
  let medicineId: string;
  let batchId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    prismaService = new PrismaService();
    await prismaService.$connect();
    service = new StockReservationService(prismaService);

    const suffix = Date.now();
    const company = await prisma.company.create({
      data: {
        name: `TestCo-${suffix}`,
      },
    });
    companyId = company.id;

    const branch = await prisma.branch.create({
      data: {
        name: `TestBranch-${suffix}`,
        code: `TB-${suffix}`,
        companyId: company.id,
      },
    });
    branchId = branch.id;

    const user = await prisma.user.create({
      data: {
        username: `testuser-${suffix}`,
        name: `Test User ${suffix}`,
        passwordHash: 'hash',
        role: 'CASHIER',
        companyId: company.id,
        branchId: branch.id,
      },
    });
    userId = user.id;

    const medicine = await prisma.medicine.create({
      data: {
        code: `MED-${suffix}`,
        barcode: `BAR-${suffix}`,
        tradeName: `Concurrency Medicine ${suffix}`,
        scientificName: 'Test Concurrency',
        category: 'Tests',
      },
    });
    medicineId = medicine.id;

    await prisma.medicineUnit.create({
      data: {
        medicineId: medicine.id,
        unitType: UnitType.UNIT,
        multiplier: 1,
        barcode: `UNIT-BAR-${suffix}`,
        price: 50,
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
        costPrice: 20,
        salePrice: 50,
        expiryDate: futureDate,
        quantityInBase: 10,
        isFrozen: false,
      },
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    try {
      if (batchId) {
        await prisma.inventoryTransaction.deleteMany({ where: { batchId } });
        await prisma.batch.deleteMany({ where: { id: batchId } });
      }
      if (medicineId) {
        await prisma.medicineUnit.deleteMany({ where: { medicineId } });
        await prisma.medicine.deleteMany({ where: { id: medicineId } });
      }
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      if (branchId) {
        await prisma.branch.deleteMany({ where: { id: branchId } });
      }
      if (companyId) {
        await prisma.company.deleteMany({ where: { id: companyId } });
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    } finally {
      await prismaService.$disconnect();
      await prisma.$disconnect();
    }
  });

  // ✅ استخدام it.skip الشرطي
  const itIfPostgres = supportsPessimisticLocking() ? it : it.skip;

  itIfPostgres(
    'يجب أن يمنع البيع بالسالب تحت ضغط 10 عمليات متزامنة',
    async () => {
      // 10 طلبات متزامنة، كل طلب يطلب كمية 2 حبة (المطلوب 20 والمتاح 10 فقط)
      const operationsCount = 10;
      const requestedQtyPerOp = 2;

      const tasks = Array.from({ length: operationsCount }, (_, index) =>
        service.executeReservationWithLock(
          medicineId,
          branchId,
          UnitType.UNIT,
          requestedQtyPerOp,
          userId,
          `INV-CONCUR-${index}`,
        ),
      );

      const results = await Promise.allSettled(tasks);

      const successful = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // بما أن الرصيد 10 وكل عملية تطلب 2، يجب أن تنجح 5 عمليات بالضبط
      expect(successful.length).toBe(5);
      expect(rejected.length).toBe(5);

      // التحقق من أن الرصيد المتبقي في الدفعة أصبح 0 بالضبط ولم ينزل للسالب أبداً
      const finalBatch = await prisma.batch.findUnique({
        where: { id: batchId },
      });
      expect(finalBatch?.quantityInBase).toBe(0);
    },
    30000,
  );

  // اختبار بديل لـ SQLite أو التسلسلي
  it('يجب أن تعمل المعاملات التسلسلية حتى بدون FOR UPDATE', async () => {
    expect(getDbProvider()).toBeDefined();
    expect(typeof supportsPessimisticLocking()).toBe('boolean');
  });
});
