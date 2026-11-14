import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyService } from './currency.service';
import { PrismaService } from 'src/core/prisma/prisma.service';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = 'user-uuid-1';

describe('CurrencyService', () => {
  let service: CurrencyService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      currency: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      companyCurrency: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      exchangeRateHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CurrencyService>(CurrencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listGlobalCurrencies & createGlobalCurrency', () => {
    it('should list all active global currencies', async () => {
      prisma.currency.findMany.mockResolvedValue([
        { code: 'USD', nameAr: 'دولار أمريكي', nameEn: 'US Dollar', symbol: '$' },
        { code: 'YER', nameAr: 'ريال يمني', nameEn: 'Yemeni Rial', symbol: 'ر.ي' },
      ]);

      const list = await service.listGlobalCurrencies();
      expect(list).toHaveLength(2);
      expect(list[0].code).toBe('USD');
    });

    it('should throw ConflictException when creating duplicate currency code', async () => {
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-1', code: 'USD' });

      await expect(
        service.createGlobalCurrency({
          code: 'USD',
          nameAr: 'دولار',
          nameEn: 'US Dollar',
          symbol: '$',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create new currency when code is unique', async () => {
      prisma.currency.findUnique.mockResolvedValue(null);
      prisma.currency.create.mockResolvedValue({
        id: 'cur-sar',
        code: 'SAR',
        nameAr: 'ريال سعودي',
        nameEn: 'Saudi Riyal',
        symbol: 'ر.س',
        decimalPlaces: 2,
      });

      const res = await service.createGlobalCurrency({
        code: 'SAR',
        nameAr: 'ريال سعودي',
        nameEn: 'Saudi Riyal',
        symbol: 'ر.س',
      });

      expect(res.code).toBe('SAR');
    });
  });

  describe('listCompanyCurrencies & getBaseCurrency', () => {
    it('should list mapped company currencies', async () => {
      prisma.companyCurrency.findMany.mockResolvedValue([
        {
          id: 'cc-1',
          currencyId: 'cur-yer',
          isBase: true,
          exchangeRate: new Prisma.Decimal(1),
          effectiveFrom: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          currency: {
            code: 'YER',
            nameAr: 'ريال يمني',
            nameEn: 'Yemeni Rial',
            symbol: 'ر.ي',
            decimalPlaces: 2,
          },
        },
      ]);

      const list = await service.listCompanyCurrencies(COMPANY_ID);
      expect(list).toHaveLength(1);
      expect(list[0].code).toBe('YER');
      expect(list[0].isBase).toBe(true);
      expect(list[0].exchangeRate).toBe(1);
    });

    it('should throw NotFoundException if no base currency is set for company', async () => {
      prisma.companyCurrency.findFirst.mockResolvedValue(null);
      await expect(service.getBaseCurrency(COMPANY_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('addCurrencyToCompany', () => {
    it('should add a new currency and demote existing base if isBase is true', async () => {
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-usd', code: 'USD', isActive: true });
      prisma.companyCurrency.findUnique.mockResolvedValue(null);
      prisma.companyCurrency.create.mockResolvedValue({
        id: 'cc-usd',
        companyId: COMPANY_ID,
        currencyId: 'cur-usd',
        isBase: true,
        exchangeRate: new Prisma.Decimal(1),
        currency: { code: 'USD' },
      });

      const res = await service.addCurrencyToCompany(
        COMPANY_ID,
        { currencyId: 'cur-usd', exchangeRate: 1, isBase: true },
        USER_ID,
      );

      expect(prisma.companyCurrency.updateMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, isBase: true },
        data: { isBase: false },
      });
      expect(res.currency.code).toBe('USD');
    });

    it('should throw ConflictException if company already has this currency', async () => {
      prisma.currency.findUnique.mockResolvedValue({ id: 'cur-usd', code: 'USD', isActive: true });
      prisma.companyCurrency.findUnique.mockResolvedValue({ id: 'existing-usd' });

      await expect(
        service.addCurrencyToCompany(
          COMPANY_ID,
          { currencyId: 'cur-usd', exchangeRate: 530 },
          USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateExchangeRate', () => {
    it('should reject updating base currency exchange rate', async () => {
      prisma.companyCurrency.findFirst.mockResolvedValue({
        id: 'cc-base',
        isBase: true,
        currency: { code: 'YER' },
      });

      await expect(
        service.updateExchangeRate(COMPANY_ID, 'cc-base', { newRate: 1.5 }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record rate history and update companyCurrency exchange rate', async () => {
      prisma.companyCurrency.findFirst.mockResolvedValue({
        id: 'cc-usd',
        currencyId: 'cur-usd',
        isBase: false,
        exchangeRate: new Prisma.Decimal(530),
        currency: { code: 'USD' },
      });
      prisma.companyCurrency.update.mockResolvedValue({
        id: 'cc-usd',
        exchangeRate: new Prisma.Decimal(535),
        currency: { code: 'USD' },
      });

      const updated = await service.updateExchangeRate(
        COMPANY_ID,
        'cc-usd',
        { newRate: 535, reason: 'Market price adjustment' },
        USER_ID,
      );

      expect(prisma.exchangeRateHistory.create).toHaveBeenCalled();
      expect(prisma.companyCurrency.update).toHaveBeenCalled();
      expect(updated.exchangeRate).toEqual(new Prisma.Decimal(535));
    });
  });

  describe('convertToBase & convertFromBase', () => {
    it('should convert foreign amount to base correctly', async () => {
      prisma.companyCurrency.findFirst.mockResolvedValue({
        isBase: false,
        exchangeRate: new Prisma.Decimal(530),
      });

      const converted = await service.convertToBase(COMPANY_ID, 10, 'USD');
      // 10 * 530 = 5300
      expect(converted.toNumber()).toBe(5300);
    });

    it('should convert base amount to foreign currency correctly', async () => {
      prisma.companyCurrency.findFirst.mockResolvedValue({
        isBase: false,
        exchangeRate: new Prisma.Decimal(530),
      });

      const converted = await service.convertFromBase(COMPANY_ID, 5300, 'USD');
      // 5300 / 530 = 10
      expect(converted.toNumber()).toBe(10);
    });
  });
});
