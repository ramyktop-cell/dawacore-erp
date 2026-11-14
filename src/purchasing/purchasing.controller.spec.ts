import { Test, TestingModule } from '@nestjs/testing';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

describe('PurchasingController', () => {
  let controller: PurchasingController;
  let service: PurchasingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchasingController],
      providers: [
        {
          provide: PurchasingService,
          useValue: {
            create: jest.fn(),
            directReceive: jest.fn(),
            receiveOrder: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            cancelOrder: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PurchasingController>(PurchasingController);
    service = module.get<PurchasingService>(PurchasingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
