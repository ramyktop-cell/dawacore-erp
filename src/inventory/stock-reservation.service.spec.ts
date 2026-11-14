import { Test, TestingModule } from '@nestjs/testing';
import { StockReservationService } from './stock-reservation.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnitType, TransactionType } from '@prisma/client';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('StockReservationService (Acceptance Test Matrix)', () => {
  let service: StockReservationService;
  let prisma: PrismaService;

  const mockMedicineId = '11111111-1111-4111-a111-111111111111';
  const mockBranchId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockReservationService,
        {
          provide: PrismaService,
          useValue: {
            medicineUnit: {
              findUnique: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StockReservationService>(StockReservationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('1. التحويل التلقائي للوحدات (Unit Multiplier Conversion)', () => {
    it('يجب أن يحسب 2 علبة = 60 حبة أساسية إذا كان معامل العلبة = 30', async () => {
      (prisma.medicineUnit.findUnique as jest.Mock).mockResolvedValue({
        id: 'unit-box-id',
        medicineId: mockMedicineId,
        unitType: UnitType.BOX,
        multiplier: 30,
        price: '150.00',
        isDefault: true,
      });

      const baseQty = await service.calculateBaseQuantity(mockMedicineId, UnitType.BOX, 2);
      expect(baseQty).toBe(60);
      expect(prisma.medicineUnit.findUnique).toHaveBeenCalledWith({
        where: {
          medicineId_unitType: {
            medicineId: mockMedicineId,
            unitType: UnitType.BOX,
          },
        },
      });
    });

    it('يجب أن يرمي BadRequestException إذا كانت الوحدة غير مسجلة للدواء', async () => {
      (prisma.medicineUnit.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.calculateBaseQuantity(mockMedicineId, UnitType.STRIP, 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. توزيع السحب على دفعات متعددة وفق FEFO (Multi-batch Allocation)', () => {
    it('يجب سحب 15 حبة عبر تفريغ الدفعة الأولى (5 حبات) وسحب 10 من الدفعة الثانية، مع إنشاء سجلي حركة', async () => {
      // Setup medicine unit (UNIT = multiplier 1)
      (prisma.medicineUnit.findUnique as jest.Mock).mockResolvedValue({
        medicineId: mockMedicineId,
        unitType: UnitType.UNIT,
        multiplier: 1,
      });

      const batch1 = {
        id: 'batch-1',
        batchNumber: 'B001',
        medicineId: mockMedicineId,
        branchId: mockBranchId,
        costPrice: '10.0000',
        salePrice: '15.00',
        expiryDate: new Date('2026-10-01'),
        quantityInBase: 5,
        isFrozen: false,
      };

      const batch2 = {
        id: 'batch-2',
        batchNumber: 'B002',
        medicineId: mockMedicineId,
        branchId: mockBranchId,
        costPrice: '12.0000',
        salePrice: '18.00',
        expiryDate: new Date('2027-01-01'),
        quantityInBase: 20,
        isFrozen: false,
      };

      const txMock = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([batch1, batch2]),
        batch: {
          update: jest.fn().mockImplementation(({ where, data }) => {
            if (where.id === 'batch-1') {
              return Promise.resolve({ ...batch1, quantityInBase: 0 });
            }
            if (where.id === 'batch-2') {
              return Promise.resolve({ ...batch2, quantityInBase: 10 });
            }
          }),
        },
        inventoryTransaction: {
          create: jest.fn().mockImplementation(({ data }) => {
            return Promise.resolve({
              id: `txn-${data.batchId}`,
              ...data,
            });
          }),
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(txMock);
      });

      const result = await service.executeReservationWithLock(
        mockMedicineId,
        mockBranchId,
        UnitType.UNIT,
        15,
        mockUserId,
        'INV-2026-001',
      );

      expect(result.success).toBe(true);
      expect(result.totalRequestedBaseQty).toBe(15);
      expect(result.allocations).toHaveLength(2);

      // Verify lock timeout was set
      expect(txMock.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL lock_timeout = '2s';");

      // Verify first allocation (Depleted batch 1)
      expect(result.allocations[0]).toEqual({
        batchId: 'batch-1',
        batchNumber: 'B001',
        deductedBaseQty: 5,
        remainingBatchQty: 0,
        unitCost: '10.0000',
        transactionId: 'txn-batch-1',
      });

      // Verify second allocation (Deducted 10 from batch 2)
      expect(result.allocations[1]).toEqual({
        batchId: 'batch-2',
        batchNumber: 'B002',
        deductedBaseQty: 10,
        remainingBatchQty: 10,
        unitCost: '12.0000',
        transactionId: 'txn-batch-2',
      });

      // Verify inventory transactions created
      expect(txMock.inventoryTransaction.create).toHaveBeenCalledTimes(2);
      expect(txMock.inventoryTransaction.create).toHaveBeenNthCalledWith(1, {
        data: {
          batchId: 'batch-1',
          branchId: mockBranchId,
          transactionType: 'SALE',
          quantity: -5,
          runningBalance: 0,
          unitCost: '10.0000',
          referenceId: 'INV-2026-001',
          userId: mockUserId,
        },
      });
      expect(txMock.inventoryTransaction.create).toHaveBeenNthCalledWith(2, {
        data: {
          batchId: 'batch-2',
          branchId: mockBranchId,
          transactionType: 'SALE',
          quantity: -10,
          runningBalance: 10,
          unitCost: '12.0000',
          referenceId: 'INV-2026-001',
          userId: mockUserId,
        },
      });
    });
  });

  describe('3. منع البيع بالسالب والتحقق من كفاية المخزون (Negative Stock Prevention)', () => {
    it('يجب أن يرمي ConflictException إذا كان الرصيد الإجمالي أقل من المطلوب دون تعديل قاعدة البيانات', async () => {
      (prisma.medicineUnit.findUnique as jest.Mock).mockResolvedValue({
        medicineId: mockMedicineId,
        unitType: UnitType.UNIT,
        multiplier: 1,
      });

      const batch1 = {
        id: 'batch-1',
        batchNumber: 'B001',
        medicineId: mockMedicineId,
        branchId: mockBranchId,
        costPrice: '10.0000',
        expiryDate: new Date('2026-10-01'),
        quantityInBase: 10,
        isFrozen: false,
      };

      const txMock = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([batch1]),
        batch: { update: jest.fn() },
        inventoryTransaction: { create: jest.fn() },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(txMock);
      });

      // Request 12 units when only 10 available
      await expect(
        service.executeReservationWithLock(
          mockMedicineId,
          mockBranchId,
          UnitType.UNIT,
          12,
          mockUserId,
          'INV-2026-002',
        ),
      ).rejects.toThrow(ConflictException);

      expect(txMock.batch.update).not.toHaveBeenCalled();
      expect(txMock.inventoryTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('4. عزل التزامن اللحظي والقفل الحصري (Concurrency & Pessimistic Lock Timeout)', () => {
    it('يجب أن يضبط lock_timeout = 2s قبل الاستعلام المقفول FOR UPDATE', async () => {
      (prisma.medicineUnit.findUnique as jest.Mock).mockResolvedValue({
        medicineId: mockMedicineId,
        unitType: UnitType.UNIT,
        multiplier: 1,
      });

      const batch1 = {
        id: 'batch-1',
        batchNumber: 'B001',
        medicineId: mockMedicineId,
        branchId: mockBranchId,
        costPrice: '10.0000',
        expiryDate: new Date('2026-10-01'),
        quantityInBase: 10,
        isFrozen: false,
      };

      const txMock = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([batch1]),
        batch: {
          update: jest.fn().mockResolvedValue({ ...batch1, quantityInBase: 5 }),
        },
        inventoryTransaction: {
          create: jest.fn().mockResolvedValue({ id: 'txn-1' }),
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(txMock);
      });

      await service.executeReservationWithLock(
        mockMedicineId,
        mockBranchId,
        UnitType.UNIT,
        5,
        mockUserId,
        'INV-2026-003',
      );

      expect(txMock.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL lock_timeout = '2s';");
    });
  });

  describe('5. استثناء الدفعات المنتهية والمجمدة (Filtering Expired & Frozen Batches)', () => {
    it('يجب ألا يتم احتساب الدفعات المجمدة أو منتهية الصلاحية في الرصيد المتاح', async () => {
      (prisma.medicineUnit.findUnique as jest.Mock).mockResolvedValue({
        medicineId: mockMedicineId,
        unitType: UnitType.UNIT,
        multiplier: 1,
      });

      // The raw query filters out expired and frozen batches at the SQL level.
      // So $queryRaw will only return the valid active batch.
      const validBatch = {
        id: 'batch-valid',
        batchNumber: 'B-VALID',
        medicineId: mockMedicineId,
        branchId: mockBranchId,
        costPrice: '10.0000',
        expiryDate: new Date('2027-12-01'),
        quantityInBase: 5,
        isFrozen: false,
      };

      const txMock = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([validBatch]),
        batch: {
          update: jest.fn().mockResolvedValue({ ...validBatch, quantityInBase: 0 }),
        },
        inventoryTransaction: {
          create: jest.fn().mockResolvedValue({ id: 'txn-valid' }),
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(txMock);
      });

      // Requesting 10 units when only 5 valid units exist (even if expired/frozen had 100) -> throws ConflictException
      await expect(
        service.executeReservationWithLock(
          mockMedicineId,
          mockBranchId,
          UnitType.UNIT,
          10,
          mockUserId,
          'INV-2026-004',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
