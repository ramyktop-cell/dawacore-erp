import { Test, TestingModule } from '@nestjs/testing';

import { StockMovementExportService } from './stock-movement-export.service';
import { StockMovementService } from './stock-movement.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type { StockMovementResponse } from '../interfaces/stock-movement.interface';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

function mockItem(overrides: Partial<any> = {}): any {
  return {
    medicineId: 'med-1',
    code: 'MED-001',
    tradeName: 'بنادول',
    scientificName: 'Paracetamol',
    barcode: '6280001',
    category: 'مسكنات',
    currentStock: 100,
    batchesCount: 2,
    minStockLevel: 20,
    isBelowMinStock: false,
    avgCost: 5,
    stockValue: 500,
    nearestExpiry: '2027-03-15T00:00:00.000Z',
    totalIn: 100,
    totalOut: 0,
    netMovement: 100,
    quantitySold: 50,
    quantityReturned: 0,
    netSold: 50,
    salesRevenue: 750,
    turnoverRatio: 0.5,
    coverageDays: 60,
    daysSinceLastSale: 5,
    lastSaleAt: '2026-09-20T10:00:00.000Z',
    lastMovementAt: '2026-09-20T10:00:00.000Z',
    classification: 'FAST_MOVING',
    classificationLabel: 'سريع الحركة',
    ...overrides,
  };
}

function mockReport(
  overrides: Partial<StockMovementResponse> = {},
): StockMovementResponse {
  return {
    meta: {
      title: 'تقرير حركة الأصناف والرواكد',
      companyName: 'صيدلية داوا',
      branchName: 'الفرع الرئيسي',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      timezone: 'Africa/Cairo',
      generatedAt: new Date('2026-09-30T18:00:00Z'),
      generatedBy: { id: USER_ID, name: 'مدير النظام' },
      filters: {},
    },
    summary: {
      totalItems: 3,
      itemsWithStock: 2,
      itemsBelowMinStock: 1,
      totalStockValue: 1500,
      totalQuantityOnHand: 300,
      totalStockValueStagnant: 500,
      stagnantValuePercentage: 33.33,
      totalQuantitySold: 100,
      totalSalesRevenue: 1500,
      avgTurnoverRatio: 0.5,
      avgCoverageDays: 60,
      classificationBreakdown: [
        {
          classification: 'FAST_MOVING',
          label: 'سريع الحركة',
          itemsCount: 1,
          stockValue: 500,
          percentage: 33.33,
        },
        {
          classification: 'NORMAL',
          label: 'طبيعي',
          itemsCount: 1,
          stockValue: 500,
          percentage: 33.33,
        },
        {
          classification: 'SLOW_MOVING',
          label: 'بطيء الحركة',
          itemsCount: 0,
          stockValue: 0,
          percentage: 0,
        },
        {
          classification: 'STAGNANT',
          label: 'راكد',
          itemsCount: 1,
          stockValue: 500,
          percentage: 33.33,
        },
        {
          classification: 'NO_STOCK',
          label: 'نافد',
          itemsCount: 0,
          stockValue: 0,
          percentage: 0,
        },
      ],
    },
    items: [
      mockItem({ medicineId: 'med-1', classification: 'FAST_MOVING' }),
      mockItem({
        medicineId: 'med-2',
        classification: 'NORMAL',
        classificationLabel: 'طبيعي',
      }),
      mockItem({
        medicineId: 'med-3',
        classification: 'STAGNANT',
        classificationLabel: 'راكد',
        isBelowMinStock: true,
        currentStock: 20,
        stockValue: 500,
      }),
    ],
    ...overrides,
  };
}

describe('StockMovementExportService', () => {
  let service: StockMovementExportService;
  let stockMovementService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    stockMovementService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementExportService,
        { provide: StockMovementService, useValue: stockMovementService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(StockMovementExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('should call generate + pdfExporter.render', async () => {
      const report = mockReport();
      const pdf = Buffer.from('pdf');
      stockMovementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(pdf);

      const filters = { fromDate: '2026-09-01', toDate: '2026-09-30' };
      const result = await service.toPdf(filters, COMPANY_ID, USER_ID);

      expect(stockMovementService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );
      expect(result).toBe(pdf);
    });

    it('should generate 5 sections with full data', async () => {
      stockMovementService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections).toHaveLength(5);
      const headings = sections.map((s) => s.heading);
      expect(headings).toContain('الملخص التنفيذي');
      expect(headings).toContain('توزيع التصنيفات');
      expect(headings?.some((h) => h?.includes('الراكدة'))).toBe(true);
      expect(headings?.some((h) => h?.includes('تحت الحد'))).toBe(true);
      expect(headings).toContain('تفاصيل الأصناف');
    });

    it('should NOT include stagnant/belowMin sections when empty', async () => {
      const report = mockReport({
        items: [mockItem({ classification: 'FAST_MOVING', isBelowMinStock: false })],
      });
      stockMovementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      // فقط: الملخص + التصنيفات + كل الأصناف = 3
      expect(sections).toHaveLength(3);
    });

    it('should format coverageDays=9999 as ∞', async () => {
      const report = mockReport({
        items: [mockItem({ coverageDays: 9999 })],
      });
      stockMovementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const itemsSection = sections.find(
        (s) => s.heading === 'تفاصيل الأصناف',
      );
      const row = itemsSection?.tables?.[0].rows[0] as any;
      expect(row.coverageDays).toBe('∞');
    });

    it('should limit items to 100 with note when more', async () => {
      const manyItems = Array.from({ length: 150 }, (_, i) =>
        mockItem({ medicineId: `med-${i}` }),
      );
      const report = mockReport({ items: manyItems });
      stockMovementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const itemsSection = sections.find(
        (s) => s.heading === 'تفاصيل الأصناف',
      );
      expect(itemsSection?.tables?.[0].rows).toHaveLength(100);
      expect(itemsSection?.note).toContain('150');
    });

    it('should propagate errors from generate', async () => {
      stockMovementService.generate.mockRejectedValue(new Error('DB error'));

      await expect(service.toPdf({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'DB error',
      );
      expect(pdfExporter.render).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. toExcel
  // ═══════════════════════════════════════════════════════════

  describe('toExcel', () => {
    it('should call generate + excelExporter.render', async () => {
      stockMovementService.generate.mockResolvedValue(mockReport());
      const xlsx = Buffer.from('xlsx');
      excelExporter.render.mockResolvedValue(xlsx);

      const result = await service.toExcel({}, COMPANY_ID, USER_ID);

      expect(stockMovementService.generate).toHaveBeenCalledWith(
        {},
        COMPANY_ID,
        USER_ID,
      );
      expect(result).toBe(xlsx);
    });

    it('should generate 4 sheets with correct names', async () => {
      stockMovementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets).toHaveLength(4);
      expect(sheets.map((s) => s.name)).toEqual([
        'الملخص',
        'التصنيفات',
        'الأصناف',
        'الرواكد',
      ]);
    });

    it('should include ALL items (no 100 limit)', async () => {
      const manyItems = Array.from({ length: 250 }, (_, i) =>
        mockItem({ medicineId: `med-${i}` }),
      );
      const report = mockReport({ items: manyItems });
      stockMovementService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const itemsSheet = sheets.find((s) => s.name === 'الأصناف');
      expect(itemsSheet?.rows).toHaveLength(250);
    });

    it('should include nearestExpiry and classificationLabel columns', async () => {
      stockMovementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const itemsSheet = sheets.find((s) => s.name === 'الأصناف');
      const keys = itemsSheet?.columns.map((c) => c.key);
      expect(keys).toContain('nearestExpiry');
      expect(keys).toContain('classificationLabel');
    });

    it('should list only stagnant items in الرواكد sheet', async () => {
      stockMovementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const stagnantSheet = sheets.find((s) => s.name === 'الرواكد');
      expect(stagnantSheet?.rows).toHaveLength(1);
      const row = stagnantSheet?.rows[0] as any;
      expect(row.code).toBe('MED-001');
    });

    it('should propagate errors from excelExporter', async () => {
      stockMovementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'ExcelJS failed',
      );
    });
  });
});
