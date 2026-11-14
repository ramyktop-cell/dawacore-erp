import { Test, TestingModule } from '@nestjs/testing';
import { ReturnsService } from './returns.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentMethod, ReturnCondition, ShiftStatus, Prisma } from '@prisma/client';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';

describe('ReturnsService (Return Integrity Matrix)', () => {
  let service: ReturnsService;
  let prisma: PrismaService;

  const mockBranchId = '11111111-1111-4111-a111-111111111111';
  const mockCashierId = '22222222-2222-4222-a222-222222222222';
  const mockShiftId = '33333333-3333-4333-a333-333333333333';
  const mockSaleId = '44444444-4444-4444-a444-444444444444';
  const mockBatchId = '55555555-5555-5555-a555-555555555555';
  const mockSaleItemId = '66666666-6666-6666-a666-666666666666';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            accountingOutbox: { update: jest.fn() },
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();


    service = module.get<ReturnsService>(ReturnsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create Validations & Integrity Rules', () => {
    it('يجب أن يرمي NotFoundException إذا كانت الفاتورة الأصلية غير موجودة', async () => {
      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([]),
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.create({
          saleId: mockSaleId,
          refundMethod: PaymentMethod.CASH,
          items: [{ saleItemId: mockSaleItemId, returnQuantity: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('يجب منع استرجاع كمية تتجاوز المباع الأصلي (Return Integrity Rule)', async () => {
      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([
          { id: mockSaleId, status: 'COMPLETED', branchId: mockBranchId, subTotal: 200, discountTotal: 0 },
        ]),
        saleItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: mockSaleItemId,
              multiplier: 1,
              totalBaseQty: 2,
              returnedQty: 1, // 1 remaining
              unitPrice: new Prisma.Decimal('100.00'),
              costPrice: new Prisma.Decimal('50.00'),
              batch: { medicine: { tradeName: 'Panadol' } },
            },
          ]),
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      // Attempt to return 2 when only 1 is remaining
      await expect(
        service.create({
          saleId: mockSaleId,
          refundMethod: PaymentMethod.CASH,
          items: [{ saleItemId: mockSaleItemId, returnQuantity: 2 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('يجب تنفيذ المرتجع السليم بنجاح مع التكلفة التاريخية والـ Outbox Event', async () => {
      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([
          { id: mockSaleId, status: 'COMPLETED', branchId: mockBranchId, subTotal: 100, discountTotal: 0, shiftId: mockShiftId },
        ]),
        saleItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: mockSaleItemId,
              batchId: mockBatchId,
              multiplier: 1,
              totalBaseQty: 5,
              returnedQty: 0,
              unitPrice: new Prisma.Decimal('100.00'),
              costPrice: new Prisma.Decimal('60.00'),
              batch: { medicine: { tradeName: 'Panadol' } },
            },
          ]),
          update: jest.fn().mockResolvedValue({}),
        },
        documentSequence: {
          upsert: jest.fn().mockResolvedValue({ lastValue: 1 }),
        },
        saleReturn: {
          create: jest.fn().mockResolvedValue({
            id: 'ret-1',
            returnNumber: 'RET-2026-00001',
            totalRefund: new Prisma.Decimal('100.00'),
            refundMethod: PaymentMethod.CASH,
          }),
        },
        saleReturnItem: {
          create: jest.fn().mockResolvedValue({}),
        },
        batch: {
          update: jest.fn().mockResolvedValue({ id: mockBatchId, quantityInBase: 10 }),
        },
        inventoryTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
        sale: {
          findMany: jest.fn().mockResolvedValue([{ returnedQty: 1, totalBaseQty: 5 }]),
          update: jest.fn().mockResolvedValue({}),
        },
        accountingOutbox: {
          create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      const result = await service.create(
        {
          saleId: mockSaleId,
          refundMethod: PaymentMethod.CASH,
          items: [{ saleItemId: mockSaleItemId, returnQuantity: 1, condition: ReturnCondition.RESTOCKABLE }],
        },
        mockCashierId,
      );

      expect(result.success).toBe(true);
      expect(result.returnNumber).toBe('RET-2026-00001');

      // Verify batch increment
      expect(txMock.batch.update).toHaveBeenCalledWith({
        where: { id: mockBatchId },
        data: {
          quantityInBase: { increment: 1 },
          quantity: { increment: 1 },
        },
      });

      // Verify inventory transaction with historical cost
      expect(txMock.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          batchId: mockBatchId,
          branchId: mockBranchId,
          transactionType: 'SALE_RETURN',
          quantity: 1,
          runningBalance: 10,
          unitCost: new Prisma.Decimal('60.00'),
          referenceId: 'RET-2026-00001',
          userId: mockCashierId,
          notes: 'مرتجع مبيعات سليم - أضيف للمخزون',
        },
      });
    });
  });
});

