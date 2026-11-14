import { Test, TestingModule } from '@nestjs/testing';
import { ShiftsService } from './shifts.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, ShiftStatus } from '@prisma/client';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: PrismaService;

  const mockBranchId = '11111111-1111-4111-a111-111111111111';
  const mockUserId = '22222222-2222-4222-a222-222222222222';
  const mockShiftId = '33333333-3333-4333-a333-333333333333';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {
            branch: { findUnique: jest.fn() },
            shift: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            cashMovement: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('openShift', () => {
    it('يجب أن يرمي NotFoundException إذا كان الفرع غير مسجل', async () => {
      (prisma.shift.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.openShift({
          branchId: mockBranchId,
          userId: mockUserId,
          openingBalance: '50000.00',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('يجب فتح وردية جديدة وتوثيق openingBalance', async () => {
      (prisma.shift.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({ id: mockBranchId, companyId: 'comp-1' });
      (prisma.shift.create as jest.Mock).mockResolvedValue({
        id: mockShiftId,
        shiftNumber: 1,
        branchId: mockBranchId,
        userId: mockUserId,
        openingBalance: new Prisma.Decimal('50000.00'),
        status: ShiftStatus.OPEN,
      });

      const result = await service.openShift({
        branchId: mockBranchId,
        userId: mockUserId,
        openingBalance: '50000.00',
      });

      expect(result.status).toBe(ShiftStatus.OPEN);
      expect(result.openingBalance).toEqual(new Prisma.Decimal('50000.00'));
    });
  });

  describe('closeShift', () => {
    it('يجب إغلاق الوردية وحساب الفرق بين النقد الفعلي والمتوقع', async () => {
      const shiftData = {
        id: mockShiftId,
        shiftNumber: 1,
        openingBalance: new Prisma.Decimal('50000.00'),
        expectedCash: new Prisma.Decimal('150000.00'),
        status: ShiftStatus.OPEN,
      };

      (prisma.shift.findUnique as jest.Mock).mockResolvedValue(shiftData);
      (prisma.shift.update as jest.Mock).mockResolvedValue({
        ...shiftData,
        status: ShiftStatus.CLOSED,
        actualCash: new Prisma.Decimal('150000.00'),
        cashDifference: new Prisma.Decimal('0.00'),
      });

      const result = await service.closeShift(mockShiftId, {
        actualCash: 150000,
        notes: 'مطابقة تامة',
      });

      expect(result.status).toBe(ShiftStatus.CLOSED);
      expect(result.cashDifference).toEqual(new Prisma.Decimal('0.00'));
    });
  });
});
