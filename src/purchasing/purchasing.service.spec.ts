import { Test, TestingModule } from '@nestjs/testing';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PurchaseStatus, Prisma } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PurchasingService', () => {
  let service: PurchasingService;
  let prisma: PrismaService;

  const mockSupplierId = '11111111-1111-4111-a111-111111111111';
  const mockBranchId = '22222222-2222-4222-a222-222222222222';
  const mockMedicineId = '33333333-3333-4333-a333-333333333333';
  const mockUserId = '44444444-4444-4444-a444-444444444444';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingService,
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {
            branch: { findUnique: jest.fn() },
            supplier: { findUnique: jest.fn() },
            purchaseOrder: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
              findMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PurchasingService>(PurchasingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create (Draft Purchase Order)', () => {
    it('يجب أن يرمي BadRequestException إذا كانت قائمة الأصناف فارغة', async () => {
      await expect(
        service.create(
          {
            supplierId: mockSupplierId,
            branchId: mockBranchId,
            items: [],
          },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('يجب إنشاء مسودة أمر شراء بنجاح مع حالة PENDING', async () => {
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ id: mockBranchId, companyId: 'comp-1' });
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({ id: mockSupplierId });
      (prisma.purchaseOrder.create as jest.Mock).mockResolvedValue({
        id: 'po-1',
        orderNumber: 'PO-2026-00001',
        status: PurchaseStatus.PENDING,
        totalAmount: new Prisma.Decimal('500.00'),
      });

      const result = await service.create(
        {
          supplierId: mockSupplierId,
          branchId: mockBranchId,
          items: [
            {
              medicineId: mockMedicineId,
              batchNumber: 'B100',
              expiryDate: '2028-01-01',
              quantity: 5,
              costPrice: 100,
            },
          ],
        },
        mockUserId,
      );

      expect(result.status).toBe(PurchaseStatus.PENDING);
    });
  });
});
