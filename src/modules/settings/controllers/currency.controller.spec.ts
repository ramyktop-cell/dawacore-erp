import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from '../services/currency.service';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = 'user-uuid-1';

describe('CurrencyController', () => {
  let controller: CurrencyController;
  let service: any;

  beforeEach(async () => {
    service = {
      listGlobalCurrencies: jest.fn().mockResolvedValue([]),
      createGlobalCurrency: jest.fn().mockResolvedValue({}),
      listCompanyCurrencies: jest.fn().mockResolvedValue([]),
      getBaseCurrency: jest.fn().mockResolvedValue({}),
      addCurrencyToCompany: jest.fn().mockResolvedValue({}),
      updateExchangeRate: jest.fn().mockResolvedValue({}),
      setBaseCurrency: jest.fn().mockResolvedValue({}),
      removeCurrencyFromCompany: jest.fn().mockResolvedValue({ success: true }),
      getExchangeHistory: jest.fn().mockResolvedValue([]),
      convertToBase: jest.fn().mockResolvedValue(100),
      convertFromBase: jest.fn().mockResolvedValue(100),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurrencyController],
      providers: [{ provide: CurrencyService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CurrencyController>(CurrencyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list global currencies without companyId check', async () => {
    const res = await controller.listGlobal();
    expect(service.listGlobalCurrencies).toHaveBeenCalled();
    expect(res).toEqual([]);
  });

  it('should throw UnauthorizedException if req.user has no companyId', async () => {
    await expect(controller.listCompany({ user: null })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should list company currencies', async () => {
    const res = await controller.listCompany({
      user: { companyId: COMPANY_ID, id: USER_ID },
    });
    expect(service.listCompanyCurrencies).toHaveBeenCalledWith(COMPANY_ID);
    expect(res).toEqual([]);
  });

  it('should add company currency', async () => {
    await controller.addToCompany(
      { currencyId: 'cur-usd', exchangeRate: 530 },
      { user: { companyId: COMPANY_ID, id: USER_ID } },
    );
    expect(service.addCurrencyToCompany).toHaveBeenCalledWith(
      COMPANY_ID,
      { currencyId: 'cur-usd', exchangeRate: 530 },
      USER_ID,
    );
  });
});
