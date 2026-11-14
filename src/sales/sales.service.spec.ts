class MockBadRequestException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'BadRequestException';
  }
}
class MockNotFoundException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'NotFoundException';
  }
}
class MockConflictException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'ConflictException';
  }
}
class MockForbiddenException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'ForbiddenException';
  }
}

jest.mock('@nestjs/common', () => {
  return {
    Injectable: () => (target: any) => target,
    BadRequestException: MockBadRequestException,
    NotFoundException: MockNotFoundException,
    ConflictException: MockConflictException,
    ForbiddenException: MockForbiddenException,
    Logger: class {
      warn() {}
      log() {}
      error() {}
    },
  };
});

jest.mock('@nestjs/event-emitter', () => {
  return {
    EventEmitter2: class {
      emit = jest.fn();
    },
  };
});

import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../inventory/stock-reservation.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnitType, PaymentMethod, Prisma, Role } from '@prisma/client';
import { BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/security.policy';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: PrismaService;
  let stockService: StockReservationService;
  let eventEmitter: EventEmitter2;

  const mockBranchId = '11111111-1111-4111-a111-111111111111';
  const mockCashierId = '22222222-2222-4222-a222-222222222222';
  const mockShiftId = '33333333-3333-4333-a333-333333333333';
  const mockMedicineId = '44444444-4444-4444-a444-444444444444';

  const defaultCashierActor: AuthenticatedUser = {
    id: mockCashierId,
    companyId: 'comp-1',
    branchId: mockBranchId,
    role: Role.CASHIER,
    roles: [Role.CASHIER],
  };

  const branchManagerActor: AuthenticatedUser = {
    id: 'mgr-1',
    companyId: 'comp-1',
    branchId: mockBranchId,
    role: Role.BRANCH_MANAGER,
    roles: [Role.BRANCH_MANAGER],
  };

  const createTxMock = (options: {
    unitPrice?: number | string;
    minSalePrice?: number | string;
    isWeighed?: boolean;
    multiplier?: number;
    auditLogCreate?: jest.Mock;
    actor?: AuthenticatedUser;
  } = {}) => {
    const actorId = options.actor?.id ?? mockCashierId;
    const companyId = options.actor?.companyId ?? 'comp-1';
    return {
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: mockBranchId, companyId }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: actorId }),
      },
      shift: {
        findFirst: jest.fn().mockResolvedValue({
          id: mockShiftId,
          status: 'OPEN',
          companyId,
          branchId: mockBranchId,
          userId: actorId,
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: mockShiftId,
          status: 'OPEN',
          companyId,
          branchId: mockBranchId,
          userId: actorId,
        }),
        update: jest.fn().mockResolvedValue({ id: mockShiftId }),
      },
      medicineUnit: {
        findMany: jest.fn().mockResolvedValue([
          {
            medicineId: mockMedicineId,
            unitType: UnitType.UNIT,
            multiplier: options.multiplier ?? 1,
            price: new Prisma.Decimal(options.unitPrice ?? 50),
            minSalePrice: new Prisma.Decimal(options.minSalePrice ?? 40),
            medicine: { isWeighed: !!options.isWeighed },
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          medicineId: mockMedicineId,
          unitType: UnitType.UNIT,
          multiplier: options.multiplier ?? 1,
          price: new Prisma.Decimal(options.unitPrice ?? 50),
          minSalePrice: new Prisma.Decimal(options.minSalePrice ?? 40),
          medicine: { isWeighed: !!options.isWeighed },
        }),
      },
      sale: {
        create: jest.fn().mockImplementation(({ data }) => {
          return Promise.resolve({
            id: 'sale-test-id',
            invoiceNumber: 'INV-20261111-00001',
            grandTotal: new Prisma.Decimal(data.grandTotal || 50),
            paidAmount: new Prisma.Decimal(data.paidAmount || 50),
            changeAmount: new Prisma.Decimal(data.changeAmount || 0),
            createdAt: new Date(),
            ...data,
            items: [{ id: 'item-1', costPrice: new Prisma.Decimal(10), totalBaseQty: 1 }],
            payments: [{ id: 'pay-1' }],
          });
        }),
      },
      accountingOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      auditLog: {
        create: options.auditLogCreate ?? jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
  };

  beforeEach(() => {
    prisma = {
      sale: {
        count: jest.fn().mockResolvedValue(0),
      },
      heldCart: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;

    stockService = {
      executeReservationWithLock: jest.fn().mockResolvedValue({
        success: true,
        medicineId: mockMedicineId,
        totalRequestedBaseQty: 1,
        allocations: [
          {
            batchId: 'batch-1',
            batchNumber: 'B01',
            deductedBaseQty: 1,
            remainingBatchQty: 99,
            unitCost: '10.0000',
            transactionId: 'txn-1',
          },
        ],
      }),
    } as any;

    eventEmitter = {
      emit: jest.fn(),
    } as any;

    service = new SalesService(prisma, stockService, eventEmitter);
  });

  describe('createSale Validations', () => {
    it('يجب أن يرمي BadRequestException إذا كانت الفاتورة فارغة من الأصناف', async () => {
      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: mockCashierId,
            shiftId: mockShiftId,
            items: [],
            payments: [{ method: PaymentMethod.CASH, amount: '100.00' }],
          },
          defaultCashierActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('يجب أن يرمي BadRequestException إذا كان الفرع غير موجود أو لا يتبع للشركة', async () => {
      const txMock = {
        branch: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: mockCashierId,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 50.0,
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '50.00' }],
          },
          defaultCashierActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('يجب أن يرمي BadRequestException إذا كانت الوردية مغلقة أو غير موجودة', async () => {
      const txMock = {
        branch: { findFirst: jest.fn().mockResolvedValue({ id: mockBranchId, companyId: 'comp-1' }) },
        user: { findFirst: jest.fn().mockResolvedValue({ id: mockCashierId }) },
        shift: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: mockCashierId,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 50.0,
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '50.00' }],
          },
          defaultCashierActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('يجب أن يرمي BadRequestException إذا كان الخصم يتجاوز إجمالي الفاتورة', async () => {
      const txMock = createTxMock({ unitPrice: 50.0 });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: mockCashierId,
            shiftId: mockShiftId,
            discountTotal: 100.0, // Discount > Subtotal (50)
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 50.0,
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '50.00' }],
          },
          defaultCashierActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('يجب أن يرمي BadRequestException إذا كان المبلغ المدفوع أقل من المطلوب', async () => {
      const txMock = createTxMock({ unitPrice: 50.0 });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: mockCashierId,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 50.0,
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '40.00' }], // Paid 40 < 50
          },
          defaultCashierActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Price Override Validations & Audit Log (POS_PRICE_OVERRIDE_IMPLEMENTATION_PLAN)', () => {
    it('1. سعر معتمد بدون override: ينجح ولا ينشئ SALE_PRICE_OVERRIDDEN', async () => {
      const auditLogCreateMock = jest.fn().mockResolvedValue({ id: 'audit-1' });
      const txMock = createTxMock({
        unitPrice: 50.0,
        minSalePrice: 40.0,
        auditLogCreate: auditLogCreateMock,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      const result = await service.createSale(
        {
          branchId: mockBranchId,
          cashierId: mockCashierId,
          shiftId: mockShiftId,
          items: [
            {
              medicineId: mockMedicineId,
              unitType: UnitType.UNIT,
              quantity: 1,
              unitPrice: 50.0,
            },
          ],
          payments: [{ method: PaymentMethod.CASH, amount: '50.00' }],
        },
        defaultCashierActor,
      );

      expect(result.success).toBe(true);
      expect(auditLogCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SALE_CREATED' }),
        }),
      );
      expect(auditLogCreateMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SALE_PRICE_OVERRIDDEN' }),
        }),
      );
    });

    it('2. سعر معدل بواسطة كاشير: يرفض حتى لو عدّل طلب HTTP يدويًا', async () => {
      const txMock = createTxMock({ unitPrice: 50.0, minSalePrice: 40.0 });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: mockCashierId,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 45.0,
                priceOverrideReason: 'خصم يدوي من الكاشير',
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '45.00' }],
          },
          defaultCashierActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('3. سعر معدل بدون سبب: يرفض', async () => {
      const txMock = createTxMock({
        unitPrice: 50.0,
        minSalePrice: 40.0,
        actor: branchManagerActor,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: branchManagerActor.id,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 45.0,
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '45.00' }],
          },
          branchManagerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. سعر معدل بسبب أقل من 3 أحرف: يرفض', async () => {
      const txMock = createTxMock({
        unitPrice: 50.0,
        minSalePrice: 40.0,
        actor: branchManagerActor,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: branchManagerActor.id,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 45.0,
                priceOverrideReason: '  ok  ', // 2 characters after trim
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '45.00' }],
          },
          branchManagerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. سعر أقل من minSalePrice: يرفض', async () => {
      const txMock = createTxMock({
        unitPrice: 50.0,
        minSalePrice: 40.0,
        actor: branchManagerActor,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: branchManagerActor.id,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 35.0, // < 40.0
                priceOverrideReason: 'تخفيض إضافي للعميل',
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '35.00' }],
          },
          branchManagerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. سعر سالب: يرفض', async () => {
      const txMock = createTxMock({
        unitPrice: 50.0,
        minSalePrice: 40.0,
        actor: branchManagerActor,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: branchManagerActor.id,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: -10.0,
                priceOverrideReason: 'تعديل سالب غير مشروع',
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '10.00' }],
          },
          branchManagerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('7. مدير فرع بسعر ضمن الحد وسبب صحيح: ينجح وينشئ AuditLog بالقيم المطلوبة', async () => {
      const auditLogCreateMock = jest.fn().mockResolvedValue({ id: 'audit-1' });
      const txMock = createTxMock({
        unitPrice: 50.0,
        minSalePrice: 40.0,
        auditLogCreate: auditLogCreateMock,
        actor: branchManagerActor,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      const result = await service.createSale(
        {
          branchId: mockBranchId,
          cashierId: branchManagerActor.id,
          shiftId: mockShiftId,
          items: [
            {
              medicineId: mockMedicineId,
              unitType: UnitType.UNIT,
              quantity: 2,
              unitPrice: 45.0,
              priceOverrideReason: 'موافقة مدير الفرع على تخفيض خاص',
            },
          ],
          payments: [{ method: PaymentMethod.CASH, amount: '90.00' }],
        },
        branchManagerActor,
      );

      expect(result.success).toBe(true);
      expect(auditLogCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SALE_PRICE_OVERRIDDEN',
            entityType: 'Sale',
            userId: branchManagerActor.id,
            companyId: 'comp-1',
            branchId: mockBranchId,
            changes: {
              overrides: [
                {
                  medicineId: mockMedicineId,
                  unitType: UnitType.UNIT,
                  originalUnitPrice: '50',
                  newUnitPrice: '45',
                  minSalePrice: '40',
                  reason: 'موافقة مدير الفرع على تخفيض خاص',
                  quantity: 2,
                },
              ],
            },
          }),
        }),
      );
    });

    it('8. صنف موزون مع سعر معدل: يرفض', async () => {
      const txMock = createTxMock({
        unitPrice: 50.0,
        minSalePrice: 40.0,
        isWeighed: true,
        multiplier: 1000,
        actor: branchManagerActor,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: branchManagerActor.id,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 0.5,
                unitPrice: 45.0,
                priceOverrideReason: 'تخفيض على السكر الموزون',
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '22.50' }],
          },
          branchManagerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('9. السعر والحد الأدنى العشريان يقارنان بدقة، بلا خطأ floating point', async () => {
      const txMock = createTxMock({
        unitPrice: 10.3,
        minSalePrice: 10.29,
        actor: branchManagerActor,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

      // 10.29 must strictly equal minSalePrice 10.29 and succeed
      const result = await service.createSale(
        {
          branchId: mockBranchId,
          cashierId: branchManagerActor.id,
          shiftId: mockShiftId,
          items: [
            {
              medicineId: mockMedicineId,
              unitType: UnitType.UNIT,
              quantity: 1,
              unitPrice: 10.29,
              priceOverrideReason: 'تعديل عشري دقيق',
            },
          ],
          payments: [{ method: PaymentMethod.CASH, amount: '10.29' }],
        },
        branchManagerActor,
      );

      expect(result.success).toBe(true);

      // 10.289 must be rejected against 10.29
      await expect(
        service.createSale(
          {
            branchId: mockBranchId,
            cashierId: branchManagerActor.id,
            shiftId: mockShiftId,
            items: [
              {
                medicineId: mockMedicineId,
                unitType: UnitType.UNIT,
                quantity: 1,
                unitPrice: 10.289,
                priceOverrideReason: 'تعديل عشري أقل بكسر',
              },
            ],
            payments: [{ method: PaymentMethod.CASH, amount: '10.289' }],
          },
          branchManagerActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Held Carts', () => {
    it('يجب تعليق السلة بنجاح في جدول HeldCart', async () => {
      (prisma.heldCart.create as jest.Mock).mockResolvedValue({
        id: 'hold-123',
        status: 'PENDING',
      });

      const result = await service.holdCart(mockCashierId, mockBranchId, { items: [{ medId: '1' }] });
      expect(result.success).toBe(true);
      expect(result.holdId).toBe('hold-123');
    });

    it('يجب استرجاع السلة المعلقة والتحقق من ملكية الكاشير', async () => {
      (prisma.heldCart.findUnique as jest.Mock).mockResolvedValue({
        id: 'hold-123',
        cashierId: mockCashierId,
        cartData: { items: [{ medId: '1' }] },
        status: 'PENDING',
      });

      (prisma.heldCart.update as jest.Mock).mockResolvedValue({
        id: 'hold-123',
        status: 'RESUMED',
      });

      const result = await service.resumeCart('hold-123', mockCashierId);
      expect(result.success).toBe(true);
      expect(result.cartData).toEqual({ items: [{ medId: '1' }] });
    });

    it('يجب أن يرمي ConflictException إذا حاول كاشير آخر استرجاع سلة ليست له', async () => {
      (prisma.heldCart.findUnique as jest.Mock).mockResolvedValue({
        id: 'hold-123',
        cashierId: 'other-cashier',
        status: 'PENDING',
      });

      await expect(service.resumeCart('hold-123', mockCashierId)).rejects.toThrow(ConflictException);
    });
  });
});
