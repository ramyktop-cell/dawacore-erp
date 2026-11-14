import { Test, TestingModule } from '@nestjs/testing';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesInvoicesService } from './sales-invoices.service';
import { UnitType, PaymentMethod } from '@prisma/client';

describe('SalesController', () => {
  let controller: SalesController;
  let service: SalesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [
        {
          provide: SalesService,
          useValue: {
            createSale: jest.fn(),
            holdCart: jest.fn(),
            resumeCart: jest.fn(),
          },
        },
        {
          provide: SalesInvoicesService,
          useValue: {
            createInvoice: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SalesController>(SalesController);
    service = module.get<SalesService>(SalesService);
  });

  it('should call createSale and return result', async () => {
    const mockResult = {
      success: true,
      message: 'تم إنشاء الفاتورة بنجاح وتحديث الأرصدة وسجل الحركات',
      data: {
        saleId: 'sale-1',
        invoiceNumber: 'INV-20260907-00001',
        grandTotal: '100.00',
        paidAmount: '100.00',
        changeAmount: '0.00',
        itemsCount: 1,
      },
    };

    (service.createSale as jest.Mock).mockResolvedValue(mockResult);

    const dto = {
      branchId: '11111111-1111-4111-a111-111111111111',
      cashierId: '22222222-2222-4222-a222-222222222222',
      shiftId: '33333333-3333-4333-a333-333333333333',
      invoiceDiscount: 0,
      items: [
        {
          medicineId: '44444444-4444-4444-a444-444444444444',
          unitType: UnitType.UNIT,
          quantity: 1,
          unitPrice: 100.00,
        },
      ],
      payments: [
        {
          method: PaymentMethod.CASH,
          amount: '100.00',
        },
      ],
    };

    const response = await controller.createSale(dto);
    expect(response).toEqual(mockResult);
    expect(service.createSale).toHaveBeenCalledWith(dto);
  });
});
