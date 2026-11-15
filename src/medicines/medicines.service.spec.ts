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

jest.mock('@nestjs/common', () => {
  return {
    Injectable: () => (target: any) => target,
    BadRequestException: MockBadRequestException,
    NotFoundException: MockNotFoundException,
    Logger: class {
      warn() {}
      log() {}
      error() {}
    },
  };
});

import { MedicinesService, getDefaultUnitLabel } from './medicines.service';
import { UnitType } from '@prisma/client';

describe('MedicinesService - Unit Labels & Weighed Items', () => {
  let service: MedicinesService;
  const mockPrisma: any = {
    medicine: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    medicineUnit: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    companySetting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MedicinesService(mockPrisma);
  });

  describe('getDefaultUnitLabel fallback logic', () => {
    it('returns custom or standard fallback for standard unit types', () => {
      expect(getDefaultUnitLabel('BOX')).toBe('علبة');
      expect(getDefaultUnitLabel('STRIP')).toBe('شريط');
      expect(getDefaultUnitLabel('UNIT')).toBe('حبة');
      expect(service.getDefaultUnitLabel('BOX')).toBe('علبة');
      expect(service.getDefaultUnitLabel('STRIP')).toBe('شريط');
      expect(service.getDefaultUnitLabel('UNIT')).toBe('حبة');
    });

    it('uses kilogram for the weighed base unit and keeps package labels distinct', () => {
      expect(getDefaultUnitLabel('UNIT', true)).toBe('كيلوجرام');
      expect(getDefaultUnitLabel('BOX', true)).toBe('علبة');
      expect(service.getDefaultUnitLabel('UNIT', true)).toBe('كيلوجرام');
    });

    it('falls back to "حبة" for unknown unit types', () => {
      expect(getDefaultUnitLabel('OTHER' as any)).toBe('حبة');
    });
  });

  describe('validateWeighed - kilo base plus optional package units', () => {
    it('passes for a valid weighed item with unitType UNIT, multiplier 1000, and 5-digit PLU', () => {
      expect(() => {
        service.validateWeighed({
          isWeighed: true,
          scalePlu: '12345',
          units: [
            {
              unitType: 'UNIT',
              multiplier: 1000,
              price: 50.0,
              label: 'كيلوجرام',
            },
          ],
        });
      }).not.toThrow();
    });

    it('rejects weighed item if multiplier is not 1000', () => {
      expect(() => {
        service.validateWeighed({
          isWeighed: true,
          scalePlu: '12345',
          units: [
            {
              unitType: 'UNIT',
              multiplier: 1,
              price: 50.0,
            },
          ],
        });
      }).toThrow(MockBadRequestException);
    });

    it('rejects weighed item if unitType is not UNIT', () => {
      expect(() => {
        service.validateWeighed({
          isWeighed: true,
          scalePlu: '12345',
          units: [
            {
              unitType: 'BOX',
              multiplier: 1000,
              price: 50.0,
            },
          ],
        });
      }).toThrow(MockBadRequestException);
    });

    it('accepts a weighed item with kilo and sack units', () => {
      expect(() => {
        service.validateWeighed({
          isWeighed: true,
          scalePlu: '12345',
          units: [
            { unitType: 'UNIT', multiplier: 1000, price: 50.0 },
            { unitType: 'BOX', multiplier: 50000, price: 2400.0, label: 'شوال' },
          ],
        });
      }).not.toThrow();
    });

    it('rejects weighed item if PLU is not exactly 5 digits', () => {
      expect(() => {
        service.validateWeighed({
          isWeighed: true,
          scalePlu: '123',
          units: [{ unitType: 'UNIT', multiplier: 1000, price: 50.0 }],
        });
      }).toThrow(MockBadRequestException);
    });
  });

  describe('Multi-unit custom labels for non-weighed items (e.g. Spaghetti)', () => {
    it('creates medicine with custom labels: كيس (multiplier: 1) and كرتونة (multiplier: 20)', async () => {
      const mockActor: any = { companyId: 'comp-supermarket-1', branchId: 'branch-1' };
      mockPrisma.medicine.findUnique.mockResolvedValue(null);
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.companySetting.findMany.mockResolvedValue([{ key: 'businessType', value: 'SUPERMARKET' }]);

      const createdUnits = [
        {
          unitType: 'UNIT' as UnitType,
          label: 'كيس',
          multiplier: 1,
          price: 15,
          barcode: '6221111111111',
          isDefault: false,
        },
        {
          unitType: 'BOX' as UnitType,
          label: 'كرتونة',
          multiplier: 20,
          price: 280,
          barcode: '6222222222222',
          isDefault: true,
        },
      ];

      mockPrisma.medicine.create.mockImplementation((args: any) => {
        return Promise.resolve({
          id: 'med-spaghetti-1',
          code: 'MED-00001',
          tradeName: 'مكرونة إسبكتي',
          scientificName: '',
          barcode: '6220000000000',
          category: 'مواد غذائية',
          isWeighed: false,
          scalePlu: null,
          units: args.data.units.create,
        });
      });

      const result = await service.create(
        {
          tradeName: 'مكرونة إسبكتي',
          scientificName: '',
          barcode: '6220000000000',
          category: 'مواد غذائية',
          isWeighed: false,
          units: createdUnits,
        },
        mockActor,
      );

      expect(mockPrisma.medicine.create).toHaveBeenCalled();
      const callData = mockPrisma.medicine.create.mock.calls[0][0].data;
      expect(callData.units.create).toEqual([
        {
          unitType: 'UNIT',
          label: 'كيس',
          multiplier: 1,
          price: expect.any(Object),
          minSalePrice: expect.any(Object),
          barcode: '6221111111111',
          isDefault: false,
        },
        {
          unitType: 'BOX',
          label: 'كرتونة',
          multiplier: 20,
          price: expect.any(Object),
          minSalePrice: expect.any(Object),
          barcode: '6222222222222',
          isDefault: true,
        },
      ]);
    });
  });

  describe('minSalePrice preservation, validation & POS retrieval', () => {
    const mockActor: any = { companyId: 'comp-1', branchId: 'branch-1' };

    it('حفظ الحد الأدنى المحدد صراحة (مثال: السعر 20 والحد 12) بدقة دون الرجوع إلى صفر', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue(null);
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.companySetting.findMany.mockResolvedValue([]);

      mockPrisma.medicine.create.mockImplementation((args: any) => {
        return Promise.resolve({
          id: 'med-min-price-1',
          ...args.data,
          units: args.data.units.create,
        });
      });

      await service.create(
        {
          tradeName: 'صنف محدد الحد الأدنى',
          scientificName: 'باراسيتامول',
          barcode: '6229999999991',
          category: 'عام',
          units: [
            {
              unitType: 'UNIT' as UnitType,
              label: 'حبة',
              multiplier: 1,
              price: 20,
              minSalePrice: 12,
              isDefault: true,
            },
          ],
        },
        mockActor,
      );

      const createdUnit = mockPrisma.medicine.create.mock.calls[0][0].data.units.create[0];
      expect(createdUnit.price.toString()).toBe('20');
      expect(createdUnit.minSalePrice.toString()).toBe('12');
    });

    it('ضبط الحد الأدنى تلقائياً إلى سعر البيع عند عدم تمريره صراحة (مثال: سعر 50 -> حد أدنى 50)', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue(null);
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.companySetting.findMany.mockResolvedValue([]);

      mockPrisma.medicine.create.mockImplementation((args: any) => {
        return Promise.resolve({
          id: 'med-min-price-2',
          ...args.data,
          units: args.data.units.create,
        });
      });

      await service.create(
        {
          tradeName: 'صنف افتراضي الحد',
          scientificName: 'باراسيتامول',
          barcode: '6229999999992',
          category: 'عام',
          units: [
            {
              unitType: 'BOX' as UnitType,
              label: 'علبة',
              multiplier: 1,
              price: 50,
              isDefault: true,
            },
          ],
        },
        mockActor,
      );

      const createdUnit = mockPrisma.medicine.create.mock.calls[0][0].data.units.create[0];
      expect(createdUnit.price.toString()).toBe('50');
      expect(createdUnit.minSalePrice.toString()).toBe('50');
    });

    it('رفض إدخال حد أدنى يتجاوز سعر البيع الافتراضي', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue(null);
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.companySetting.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          {
            tradeName: 'صنف حد أدنى متجاوز',
            scientificName: 'باراسيتامول',
            barcode: '6229999999993',
            category: 'عام',
            units: [
              {
                unitType: 'UNIT' as UnitType,
                multiplier: 1,
                price: 20,
                minSalePrice: 25, // > 20
                isDefault: true,
              },
            ],
          },
          mockActor,
        ),
      ).rejects.toThrow(MockBadRequestException);
    });

    it('رفض إدخال حد أدنى سالب', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue(null);
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.companySetting.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          {
            tradeName: 'صنف حد أدنى سالب',
            scientificName: 'باراسيتامول',
            barcode: '6229999999994',
            category: 'عام',
            units: [
              {
                unitType: 'UNIT' as UnitType,
                multiplier: 1,
                price: 20,
                minSalePrice: -5,
                isDefault: true,
              },
            ],
          },
          mockActor,
        ),
      ).rejects.toThrow(MockBadRequestException);
    });

    it('إلزام الصنف الموزون بمطابقة الحد الأدنى لسعر الكيلو تماماً', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue(null);
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.companySetting.findMany.mockResolvedValue([]);

      mockPrisma.medicine.create.mockImplementation((args: any) => {
        return Promise.resolve({
          id: 'med-weighed-min',
          ...args.data,
          units: args.data.units.create,
        });
      });

      await service.create(
        {
          tradeName: 'سكر موزون',
          scientificName: 'باراسيتامول',
          barcode: '221234500000',
          category: 'موزونات',
          isWeighed: true,
          scalePlu: '12345',
          units: [
            {
              unitType: 'UNIT' as UnitType,
              multiplier: 1000,
              price: 30,
              minSalePrice: 15, // should be forced to 30 for weighed
              isDefault: true,
            },
          ],
        },
        mockActor,
      );

      const createdUnit = mockPrisma.medicine.create.mock.calls[0][0].data.units.create[0];
      expect(createdUnit.minSalePrice.toString()).toBe('30');
    });

    it('حفظ وتحديث الحد الأدنى في دالة update داخل المعاملة الذرية', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({
        id: 'med-update-1',
        isWeighed: false,
        barcode: '6229999999995',
      });
      mockPrisma.batch = { count: jest.fn().mockResolvedValue(0) };
      mockPrisma.purchaseItem = { count: jest.fn().mockResolvedValue(0) };

      let createdManyData: any = null;
      mockPrisma.$transaction = jest.fn().mockImplementation(async (cb) => {
        const tx = {
          medicineUnit: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            createMany: jest.fn().mockImplementation(({ data }) => {
              createdManyData = data;
              return Promise.resolve({ count: data.length });
            }),
          },
          medicine: {
            update: jest.fn().mockResolvedValue({ id: 'med-update-1' }),
          },
        };
        return cb(tx);
      });

      await service.update(
        'med-update-1',
        {
          units: [
            {
              unitType: 'UNIT' as UnitType,
              multiplier: 1,
              price: 40,
              minSalePrice: 32,
              isDefault: true,
            },
          ],
        },
        mockActor,
      );

      expect(createdManyData).toBeDefined();
      expect(createdManyData[0].minSalePrice.toString()).toBe('32');
    });

    it('إرجاع minSalePrice في استعلامات findForPos و search و scan و findOne', async () => {
      const mockMed = {
        id: 'med-pos-test',
        tradeName: 'دواء فحص البوس',
        scientificName: 'علمي',
        barcode: '6228888888888',
        category: 'عام',
        isWeighed: false,
        scalePlu: null,
        minStockLevel: 5,
        batches: [],
        units: [
          {
            id: 'u-1',
            unitType: 'UNIT' as UnitType,
            label: 'حبة',
            multiplier: 1,
            price: '50.00',
            minSalePrice: '42.00',
            barcode: '6228888888888',
            isDefault: true,
          },
        ],
      };

      // 1. findForPos
      mockPrisma.medicine.findMany.mockResolvedValue([mockMed]);
      const posResults = await service.findForPos('branch-1', 'فحص');
      expect(posResults[0].units[0].minSalePrice).toBe(42);

      // 2. search
      const searchResults = await service.search('فحص', 'branch-1');
      expect(searchResults[0].units[0].minSalePrice).toBe(42);

      // 3. scan
      mockPrisma.medicine.findFirst.mockResolvedValue(mockMed);
      const scanResult = await service.scan('6228888888888');
      expect(scanResult.units[0].minSalePrice).toBe(42);

      // 4. findOne
      mockPrisma.medicine.findUnique.mockResolvedValue(mockMed);
      const findOneResult = await service.findOne('med-pos-test');
      expect(findOneResult.units[0].minSalePrice).toBe(42);
    });
  });

  describe('validateScientificName for CLOTHING activity', () => {
    it('allows empty scientificName when company businessType is CLOTHING', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        { key: 'businessType', value: 'CLOTHING' },
      ]);
      mockPrisma.medicine.findUnique.mockResolvedValue(null);
      mockPrisma.medicine.count.mockResolvedValue(10);
      mockPrisma.medicine.create.mockResolvedValue({
        id: 'med-cloth-1',
        tradeName: 'قميص رجالي قطن',
        scientificName: '',
        units: [],
      });

      const created = await service.create(
        {
          tradeName: 'قميص رجالي قطن',
          scientificName: '',
          barcode: '6229990001112',
          category: 'ملابس رجالية',
          units: [{ unitType: 'UNIT' as UnitType, multiplier: 1, price: 250, isDefault: true }],
        } as any,
        { companyId: 'comp-cloth' } as any,
      );

      expect(created.tradeName).toBe('قميص رجالي قطن');
      expect(mockPrisma.medicine.create).toHaveBeenCalled();
    });

    it('rejects empty scientificName when company businessType is PHARMACY', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        { key: 'businessType', value: 'PHARMACY' },
      ]);

      await expect(
        service.create(
          {
            tradeName: 'بانادول إكسترا',
            scientificName: '   ',
            barcode: '6229990001113',
            category: 'مسكنات',
          } as any,
          { companyId: 'comp-pharm' } as any,
        ),
      ).rejects.toThrow(MockBadRequestException);
    });
  });
});
