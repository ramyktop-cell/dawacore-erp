import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from 'src/core/prisma/prisma.service';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      companySetting: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAll & getByCategory', () => {
    it('should return settings from database and populate cache', async () => {
      prisma.companySetting.findMany.mockResolvedValue([
        {
          id: 's-1',
          companyId: COMPANY_ID,
          key: 'TAX_RATE',
          value: '15',
          category: 'SALES',
          dataType: 'NUMBER',
          description: 'Tax',
          isEditable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.getAll(COMPANY_ID);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('TAX_RATE');
      expect(result[0].value).toBe('15');

      const byCat = await service.getByCategory(COMPANY_ID);
      expect(byCat.SALES).toBeDefined();
      expect(byCat.SALES[0].key).toBe('TAX_RATE');
    });
  });

  describe('getValue, getNumberValue, and getBooleanValue', () => {
    it('should return string value, utilizing cache on subsequent calls', async () => {
      prisma.companySetting.findUnique.mockResolvedValue({
        companyId: COMPANY_ID,
        key: 'SYSTEM_NAME',
        value: 'DawaCore Pharmacy',
      });

      const firstCall = await service.getValue(COMPANY_ID, 'SYSTEM_NAME');
      expect(firstCall).toBe('DawaCore Pharmacy');
      expect(prisma.companySetting.findUnique).toHaveBeenCalledTimes(1);

      // Second call should hit in-memory cache
      const secondCall = await service.getValue(COMPANY_ID, 'SYSTEM_NAME');
      expect(secondCall).toBe('DawaCore Pharmacy');
      expect(prisma.companySetting.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should return boolean correctly via getBooleanValue', async () => {
      prisma.companySetting.findUnique.mockResolvedValue({
        companyId: COMPANY_ID,
        key: 'ALLOW_NEGATIVE_STOCK',
        value: 'true',
      });

      const val = await service.getBooleanValue(COMPANY_ID, 'ALLOW_NEGATIVE_STOCK');
      expect(val).toBe(true);
    });

    it('should return number correctly via getNumberValue', async () => {
      prisma.companySetting.findUnique.mockResolvedValue({
        companyId: COMPANY_ID,
        key: 'TAX_RATE',
        value: '15.5',
      });

      const val = await service.getNumberValue(COMPANY_ID, 'TAX_RATE');
      expect(val).toBe(15.5);
    });

    it('should return null or fallback if key is not found', async () => {
      prisma.companySetting.findUnique.mockResolvedValue(null);

      const val = await service.getValue(COMPANY_ID, 'NON_EXISTING_KEY');
      expect(val).toBeNull();

      const numVal = await service.getNumberValue(COMPANY_ID, 'NON_EXISTING_KEY', 10);
      expect(numVal).toBe(10);
    });
  });

  describe('bulkUpdate and updateOne', () => {
    it('should update single setting with validation', async () => {
      prisma.companySetting.findUnique.mockResolvedValue({
        id: 's-tax',
        companyId: COMPANY_ID,
        key: 'TAX_RATE',
        value: '5',
        dataType: 'NUMBER',
        isEditable: true,
        category: 'SALES',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.companySetting.update.mockResolvedValue({
        id: 's-tax',
        companyId: COMPANY_ID,
        key: 'TAX_RATE',
        value: '10',
        dataType: 'NUMBER',
        isEditable: true,
        category: 'SALES',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updateOne(COMPANY_ID, 'TAX_RATE', '10');
      expect(result.value).toBe('10');
      expect(prisma.companySetting.update).toHaveBeenCalled();
    });

    it('should fail validation if updating NUMBER setting with invalid string', async () => {
      prisma.companySetting.findUnique.mockResolvedValue({
        id: 's-tax',
        companyId: COMPANY_ID,
        key: 'TAX_RATE',
        value: '5',
        dataType: 'NUMBER',
        isEditable: true,
      });

      await expect(
        service.updateOne(COMPANY_ID, 'TAX_RATE', 'not-a-number'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should bulk update settings and clear company cache', async () => {
      prisma.companySetting.upsert.mockResolvedValue({
        id: 's-1',
        companyId: COMPANY_ID,
        key: 'TAX_RATE',
        value: '5',
        dataType: 'NUMBER',
        isEditable: true,
        category: 'SALES',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updated = await service.bulkUpdate(COMPANY_ID, {
        settings: [
          { key: 'TAX_RATE', value: '5', dataType: 'NUMBER', category: 'SALES' },
        ],
      });

      expect(updated).toHaveLength(1);
      expect(prisma.companySetting.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('seedDefaults', () => {
    it('should insert default settings if not existing', async () => {
      prisma.companySetting.findUnique.mockResolvedValue(null);
      prisma.companySetting.create.mockResolvedValue({});

      const count = await service.seedDefaults(COMPANY_ID);
      expect(count).toBeGreaterThan(0);
      expect(prisma.companySetting.create).toHaveBeenCalled();
    });
  });
});
