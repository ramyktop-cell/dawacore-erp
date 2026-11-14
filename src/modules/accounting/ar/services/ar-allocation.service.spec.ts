import { BadRequestException } from '@nestjs/common';
import { ArAllocationService } from './ar-allocation.service';
import { Prisma } from '@prisma/client';

describe('ArAllocationService', () => {
  let service: ArAllocationService;

  beforeEach(() => {
    service = new ArAllocationService();
  });

  describe('allocatePayment - FIFO Allocation', () => {
    it('should allocate payment across 3 unpaid sales using FIFO (User Scenario)', async () => {
      // أحمد عنده 3 فواتير:
      // Sale 1: 1000 (paid: 0)
      // Sale 2: 2000 (paid: 0)
      // Sale 3: 3000 (paid: 0)
      // يدفع 4000
      const mockSales = [
        {
          id: 'sale-1',
          invoiceNumber: 'INV-001',
          createdAt: new Date('2026-09-01T10:00:00Z'),
          grandTotal: new Prisma.Decimal(1000),
          paidAmount: new Prisma.Decimal(0),
          returns: [],
        },
        {
          id: 'sale-2',
          invoiceNumber: 'INV-002',
          createdAt: new Date('2026-09-02T10:00:00Z'),
          grandTotal: new Prisma.Decimal(2000),
          paidAmount: new Prisma.Decimal(0),
          returns: [],
        },
        {
          id: 'sale-3',
          invoiceNumber: 'INV-003',
          createdAt: new Date('2026-09-03T10:00:00Z'),
          grandTotal: new Prisma.Decimal(3000),
          paidAmount: new Prisma.Decimal(0),
          returns: [],
        },
      ];

      const updatedSales: any[] = [];
      const createdPayments: any[] = [];

      const tx = {
        sale: {
          findMany: jest.fn().mockResolvedValue(mockSales),
          update: jest.fn().mockImplementation((args) => {
            updatedSales.push(args);
            return Promise.resolve(args);
          }),
        },
        salePayment: {
          create: jest.fn().mockImplementation((args) => {
            createdPayments.push(args);
            return Promise.resolve(args);
          }),
        },
      } as unknown as Prisma.TransactionClient;

      const result = await service.allocatePayment(
        tx,
        'cust-ahmed',
        4000,
        'CASH',
        'REC-2026-00001',
      );

      // Total allocated should be 4000, unallocated 0
      expect(result.totalAllocated).toBe(4000);
      expect(result.unallocated).toBe(0);
      expect(result.allocations).toHaveLength(3);

      // Sale 1: fully paid (1000)
      expect(result.allocations[0].saleId).toBe('sale-1');
      expect(result.allocations[0].allocatedAmount).toBe(1000);
      expect(result.allocations[0].newPaidAmount).toBe(1000);
      expect(result.allocations[0].remainingAfter).toBe(0);
      expect(result.allocations[0].fullyPaid).toBe(true);

      // Sale 2: fully paid (2000)
      expect(result.allocations[1].saleId).toBe('sale-2');
      expect(result.allocations[1].allocatedAmount).toBe(2000);
      expect(result.allocations[1].newPaidAmount).toBe(2000);
      expect(result.allocations[1].remainingAfter).toBe(0);
      expect(result.allocations[1].fullyPaid).toBe(true);

      // Sale 3: partially paid (1000 of 3000)
      expect(result.allocations[2].saleId).toBe('sale-3');
      expect(result.allocations[2].allocatedAmount).toBe(1000);
      expect(result.allocations[2].newPaidAmount).toBe(1000);
      expect(result.allocations[2].remainingAfter).toBe(2000);
      expect(result.allocations[2].fullyPaid).toBe(false);

      // Verify Sale.update calls
      expect(updatedSales).toHaveLength(3);
      expect(updatedSales[0].where).toEqual({ id: 'sale-1' });
      expect(updatedSales[0].data.paidAmount.toString()).toBe('1000');
      expect(updatedSales[1].where).toEqual({ id: 'sale-2' });
      expect(updatedSales[1].data.paidAmount.toString()).toBe('2000');
      expect(updatedSales[2].where).toEqual({ id: 'sale-3' });
      expect(updatedSales[2].data.paidAmount.toString()).toBe('1000');

      // Verify SalePayment.create calls
      expect(createdPayments).toHaveLength(3);
      expect(createdPayments[0].data.saleId).toBe('sale-1');
      expect(createdPayments[0].data.method).toBe('CASH');
      expect(createdPayments[0].data.amount.toString()).toBe('1000');
      expect(createdPayments[0].data.referenceNo).toBe('REC-2026-00001');

      expect(createdPayments[1].data.saleId).toBe('sale-2');
      expect(createdPayments[1].data.amount.toString()).toBe('2000');

      expect(createdPayments[2].data.saleId).toBe('sale-3');
      expect(createdPayments[2].data.amount.toString()).toBe('1000');
    });

    it('should respect prior payments and partial returns', async () => {
      const mockSales = [
        {
          id: 'sale-1',
          invoiceNumber: 'INV-001',
          createdAt: new Date('2026-09-01T10:00:00Z'),
          grandTotal: new Prisma.Decimal(1000),
          paidAmount: new Prisma.Decimal(200), // already paid 200
          returns: [{ totalRefund: new Prisma.Decimal(300) }], // returned 300 -> net remaining = 500
        },
        {
          id: 'sale-2',
          invoiceNumber: 'INV-002',
          createdAt: new Date('2026-09-02T10:00:00Z'),
          grandTotal: new Prisma.Decimal(500),
          paidAmount: new Prisma.Decimal(0),
          returns: [],
        },
      ];

      const tx = {
        sale: {
          findMany: jest.fn().mockResolvedValue(mockSales),
          update: jest.fn().mockResolvedValue({}),
        },
        salePayment: {
          create: jest.fn().mockResolvedValue({}),
        },
      } as unknown as Prisma.TransactionClient;

      // Pay 800:
      // Sale 1 needs 500 (1000 - 200 - 300) -> newPaidAmount = 200 + 500 = 700. fullyPaid = true
      // Sale 2 needs 500 -> receives 300 -> newPaidAmount = 300. remainingAfter = 200. fullyPaid = false
      const result = await service.allocatePayment(
        tx,
        'cust-1',
        800,
        'CARD',
        'REC-002',
      );

      expect(result.totalAllocated).toBe(800);
      expect(result.unallocated).toBe(0);
      expect(result.allocations).toHaveLength(2);

      expect(result.allocations[0].saleId).toBe('sale-1');
      expect(result.allocations[0].allocatedAmount).toBe(500);
      expect(result.allocations[0].newPaidAmount).toBe(700);
      expect(result.allocations[0].remainingAfter).toBe(0);
      expect(result.allocations[0].fullyPaid).toBe(true);

      expect(result.allocations[1].saleId).toBe('sale-2');
      expect(result.allocations[1].allocatedAmount).toBe(300);
      expect(result.allocations[1].newPaidAmount).toBe(300);
      expect(result.allocations[1].remainingAfter).toBe(200);
      expect(result.allocations[1].fullyPaid).toBe(false);
    });

    it('should handle unallocated overpayment when payment exceeds total debt', async () => {
      const mockSales = [
        {
          id: 'sale-1',
          invoiceNumber: 'INV-001',
          createdAt: new Date('2026-09-01T10:00:00Z'),
          grandTotal: new Prisma.Decimal(300),
          paidAmount: new Prisma.Decimal(0),
          returns: [],
        },
      ];

      const tx = {
        sale: {
          findMany: jest.fn().mockResolvedValue(mockSales),
          update: jest.fn().mockResolvedValue({}),
        },
        salePayment: {
          create: jest.fn().mockResolvedValue({}),
        },
      } as unknown as Prisma.TransactionClient;

      const result = await service.allocatePayment(
        tx,
        'cust-1',
        500, // debt is 300, overpaying 200
        'TRANSFER',
      );

      expect(result.totalAllocated).toBe(300);
      expect(result.unallocated).toBe(200);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].fullyPaid).toBe(true);
    });

    it('should return unallocated when customer has no unpaid sales', async () => {
      const tx = {
        sale: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as Prisma.TransactionClient;

      const result = await service.allocatePayment(
        tx,
        'cust-1',
        1000,
        'CASH',
      );

      expect(result.totalAllocated).toBe(0);
      expect(result.unallocated).toBe(1000);
      expect(result.allocations).toEqual([]);
    });

    it('should throw BadRequestException if amount <= 0', async () => {
      const tx = {} as Prisma.TransactionClient;
      await expect(service.allocatePayment(tx, 'cust-1', 0, 'CASH')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.allocatePayment(tx, 'cust-1', -50, 'CASH')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
