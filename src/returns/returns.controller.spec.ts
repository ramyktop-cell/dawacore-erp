import { Test, TestingModule } from '@nestjs/testing';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { PaymentMethod, ReturnCondition } from '@prisma/client';

describe('ReturnsController', () => {
  let controller: ReturnsController;
  let service: ReturnsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReturnsController],
      providers: [
        {
          provide: ReturnsService,
          useValue: {
            create: jest.fn(),
            createReturn: jest.fn(),
          },
        },
      ],
    }).compile();


    controller = module.get<ReturnsController>(ReturnsController);
    service = module.get<ReturnsService>(ReturnsService);
  });

  it('should call createReturn and return response', async () => {
    const mockResult = {
      success: true,
      message: 'تم تسجيل المرتجع وتحديث الأرصدة بدقة',
      returnNumber: 'RET-20260907-00001',
      totalRefund: '100.00',
      refundMethod: PaymentMethod.CASH,
    };

    (service.create as jest.Mock).mockResolvedValue(mockResult);

    const dto = {
      originalSaleId: '11111111-1111-4111-a111-111111111111',
      shiftId: '22222222-2222-4222-a222-222222222222',
      cashierId: '33333333-3333-4333-a333-333333333333',
      refundMethod: PaymentMethod.CASH,
      items: [
        {
          saleItemId: 'item-1',
          quantity: 1,
          condition: ReturnCondition.RESTOCKABLE,
        },
      ],
    };

    const response = await controller.createReturn(dto);
    expect(response).toEqual(mockResult);
    expect(service.create).toHaveBeenCalledWith(dto, undefined);
  });
});

