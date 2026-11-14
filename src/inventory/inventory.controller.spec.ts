import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { StockReservationService } from './stock-reservation.service';
import { UnitType } from '@prisma/client';
import { HttpStatus } from '@nestjs/common';

describe('InventoryController', () => {
  let controller: InventoryController;
  let service: StockReservationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: StockReservationService,
          useValue: {
            executeReservationWithLock: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
    service = module.get<StockReservationService>(StockReservationService);
  });

  it('should reserve stock and return standard response', async () => {
    const mockResult = {
      success: true,
      medicineId: 'med-uuid',
      totalRequestedBaseQty: 60,
      allocations: [
        {
          batchId: 'batch-1',
          batchNumber: 'B001',
          deductedBaseQty: 60,
          remainingBatchQty: 40,
          unitCost: '10.0000',
          transactionId: 'txn-1',
        },
      ],
    };

    (service.executeReservationWithLock as jest.Mock).mockResolvedValue(mockResult);

    const dto = {
      medicineId: '11111111-1111-4111-a111-111111111111',
      branchId: '22222222-2222-4222-a222-222222222222',
      unitType: UnitType.BOX,
      quantity: 2,
      userId: '33333333-3333-4333-a333-333333333333',
      invoiceNumber: 'INV-1001',
    };

    const response = await controller.reserveStock(dto);

    expect(response).toEqual({
      statusCode: HttpStatus.OK,
      message: 'تم حجز وتخصيص المخزون بنجاح وفق معايير FEFO والقفل الحصري',
      data: mockResult,
    });
    expect(service.executeReservationWithLock).toHaveBeenCalledWith(
      dto.medicineId,
      dto.branchId,
      dto.unitType,
      dto.quantity,
      dto.userId,
      dto.invoiceNumber,
    );
  });
});
