import { Test, TestingModule } from '@nestjs/testing';

import { DailySalesExportService } from './daily-sales-export.service';
import { DailySalesService } from './daily-sales.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type { DailySalesResponse } from '../interfaces/daily-sales.interface';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

/** تقرير وهمي كامل — يحاكي استجابة DailySalesService */
function mockReport(
  overrides: Partial<DailySalesResponse> = {},
): DailySalesResponse {
  return {
    meta: {
      title: 'تقرير المبيعات اليومية والشاملة',
      companyName: 'صيدلية داوا',
      branchName: 'الفرع الرئيسي',
      fromDate: '2026-09-25',
      toDate: '2026-09-25',
      timezone: 'Africa/Cairo',
      generatedAt: new Date('2026-09-25T13:00:00Z'),
      generatedBy: { id: USER_ID, name: 'مدير النظام' },
      filters: {},
    },
    summary: {
      totalInvoicesCount: 10,
      completedInvoicesCount: 9,
      returnedInvoicesCount: 1,
      grossSales: 10000,
      totalDiscounts: 500,
      netSales: 9000,
      totalReturns: 500,
      totalCollected: 8500,
    },
    paymentBreakdown: [
      { method: 'CASH', amount: 6000, percentage: 66.67 },
      { method: 'BANK', amount: 3000, percentage: 33.33 },
    ],
    cashierBreakdown: [
      {
        cashierId: 'c1',
        cashierName: 'أحمد',
        invoicesCount: 6,
        totalSales: 6000,
        returns: 0,
        netTotal: 6000,
      },
      {
        cashierId: 'c2',
        cashierName: 'محمد',
        invoicesCount: 4,
        totalSales: 4000,
        returns: 500,
        netTotal: 3500,
      },
    ],
    hourlyBreakdown: Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      hourLabel:
        i < 12
          ? `${String(i === 0 ? 12 : i).padStart(2, '0')} ص`
          : `${String(i % 12 === 0 ? 12 : i % 12).padStart(2, '0')} م`,
      invoicesCount: i >= 9 && i <= 17 ? 1 : 0,
      totalSales: i >= 9 && i <= 17 ? 1000 : 0,
    })),
    topProducts: [
      {
        medicineId: 'm1',
        tradeName: 'بنادول',
        totalQuantity: 50,
        totalSales: 5000,
      },
      {
        medicineId: 'm2',
        tradeName: 'أوجمنتين',
        totalQuantity: 20,
        totalSales: 3000,
      },
    ],
    invoices: [
      {
        saleId: 's1',
        invoiceNumber: 'INV-001',
        createdAt: '2026-09-25T10:00:00Z',
        cashierName: 'أحمد',
        customerName: 'عميل نقدي',
        paymentMethod: 'CASH',
        subTotal: 1000,
        discountTotal: 0,
        grandTotal: 1000,
        paidAmount: 1000,
        status: 'COMPLETED',
        itemsCount: 3,
      },
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('DailySalesExportService', () => {
  let service: DailySalesExportService;
  let dailySalesService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    dailySalesService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailySalesExportService,
        { provide: DailySalesService, useValue: dailySalesService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(DailySalesExportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('should call generate() and pdfExporter.render()', async () => {
      const report = mockReport();
      const pdfBuffer = Buffer.from('fake-pdf-content');

      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(pdfBuffer);

      const filters = { fromDate: '2026-09-25', toDate: '2026-09-25' };
      const result = await service.toPdf(filters, COMPANY_ID, USER_ID);

      expect(dailySalesService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );
      expect(pdfExporter.render).toHaveBeenCalledTimes(1);
      expect(result).toBe(pdfBuffer);
    });

    it('should pass meta to pdfExporter.render()', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [metaArg, sectionsArg] = pdfExporter.render.mock.calls[0];
      expect(metaArg).toBe(report.meta);
      expect(Array.isArray(sectionsArg)).toBe(true);
    });

    it('should generate 6 sections', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections).toHaveLength(6);

      // عناوين الأقسام
      expect(sections[0].heading).toBe('الملخص التنفيذي');
      expect(sections[1].heading).toBe('توزيع طرق الدفع');
      expect(sections[2].heading).toBe('أداء الكاشيرين');
      expect(sections[3].heading).toBe('المبيعات حسب الساعة');
      expect(sections[4].heading).toBe('أعلى 10 أصناف مبيعاً');
      expect(sections[5].heading).toBe('تفاصيل الفواتير');
    });

    it('should include 8 KPI cards in summary section', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[0].kpis).toHaveLength(8);
      expect(sections[0].kpis?.[0].label).toBe('إجمالي الفواتير');
      expect(sections[0].kpis?.[2].label).toBe('صافي المبيعات');
    });

    it('should format currency KPIs with thousand separator', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const grossKpi = sections[0].kpis?.find(
        (k) => k.label === 'إجمالي المبيعات',
      );
      // 10,000 → "10,000.00"
      expect(grossKpi?.value).toBe('10,000.00');
    });

    it('should filter empty hours in PDF (only active hours)', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const hourlyTable = sections[3].tables?.[0];
      // من fixture: 9 ساعات نشطة (9..17)
      expect(hourlyTable?.rows).toHaveLength(9);
    });

    it('should limit invoices to 100 in PDF with note', async () => {
      const manyInvoices = Array.from({ length: 150 }, (_, i) => ({
        saleId: `s${i}`,
        invoiceNumber: `INV-${String(i).padStart(4, '0')}`,
        createdAt: '2026-09-25T10:00:00Z',
        cashierName: 'أحمد',
        customerName: 'عميل',
        paymentMethod: 'CASH',
        subTotal: 100,
        discountTotal: 0,
        grandTotal: 100,
        paidAmount: 100,
        status: 'COMPLETED',
        itemsCount: 1,
      }));

      const report = mockReport({ invoices: manyInvoices });
      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const invoicesSection = sections[5];
      expect(invoicesSection.tables?.[0].rows).toHaveLength(100);
      expect(invoicesSection.note).toContain('150');
      expect(invoicesSection.note).toContain('100');
    });

    it('should NOT show note when invoices <= 100', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[5].note).toBeUndefined();
    });

    it('should propagate errors from generate()', async () => {
      const error = new Error('DB failure');
      dailySalesService.generate.mockRejectedValue(error);

      await expect(service.toPdf({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'DB failure',
      );
      expect(pdfExporter.render).not.toHaveBeenCalled();
    });

    it('should propagate errors from pdfExporter', async () => {
      dailySalesService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockRejectedValue(new Error('Puppeteer crashed'));

      await expect(service.toPdf({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'Puppeteer crashed',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. toExcel
  // ═══════════════════════════════════════════════════════════

  describe('toExcel', () => {
    it('should call generate() and excelExporter.render()', async () => {
      const report = mockReport();
      const xlsxBuffer = Buffer.from('fake-xlsx-content');

      dailySalesService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(xlsxBuffer);

      const filters = { fromDate: '2026-09-25', toDate: '2026-09-25' };
      const result = await service.toExcel(filters, COMPANY_ID, USER_ID);

      expect(dailySalesService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );
      expect(excelExporter.render).toHaveBeenCalledTimes(1);
      expect(result).toBe(xlsxBuffer);
    });

    it('should generate 6 sheets', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets).toHaveLength(6);

      expect(sheets.map((s) => s.name)).toEqual([
        'الملخص',
        'طرق الدفع',
        'أداء الكاشيرين',
        'الساعات',
        'أعلى الأصناف',
        'الفواتير',
      ]);
    });

    it('should include all 24 hours in Excel (no filter)', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const hoursSheet = sheets.find((s) => s.name === 'الساعات');
      expect(hoursSheet?.rows).toHaveLength(24);
    });

    it('should include ALL invoices in Excel (no 100 limit)', async () => {
      const manyInvoices = Array.from({ length: 250 }, (_, i) => ({
        saleId: `s${i}`,
        invoiceNumber: `INV-${String(i).padStart(4, '0')}`,
        createdAt: '2026-09-25T10:00:00Z',
        cashierName: 'أحمد',
        customerName: 'عميل',
        paymentMethod: 'CASH',
        subTotal: 100,
        discountTotal: 0,
        grandTotal: 100,
        paidAmount: 100,
        status: 'COMPLETED',
        itemsCount: 1,
      }));

      const report = mockReport({ invoices: manyInvoices });
      dailySalesService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const invoicesSheet = sheets.find((s) => s.name === 'الفواتير');
      expect(invoicesSheet?.rows).toHaveLength(250);
    });

    it('should build summary sheet with 8 rows', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const summarySheet = sheets.find((s) => s.name === 'الملخص');
      expect(summarySheet?.rows).toHaveLength(8);
      expect(summarySheet?.rows[0]).toMatchObject({
        label: 'عدد الفواتير الإجمالي',
        value: 10,
      });
    });

    it('should use report.meta.title as sheet title', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const summarySheet = sheets.find((s) => s.name === 'الملخص');
      expect(summarySheet?.title).toBe(
        'تقرير المبيعات اليومية والشاملة',
      );
    });

    it('should propagate errors from excelExporter', async () => {
      dailySalesService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'ExcelJS failed',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Consistency: PDF & Excel use same data source
  // ═══════════════════════════════════════════════════════════

  describe('consistency', () => {
    it('should call generate() once per export call', async () => {
      const report = mockReport();
      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);
      expect(dailySalesService.generate).toHaveBeenCalledTimes(1);

      await service.toExcel({}, COMPANY_ID, USER_ID);
      expect(dailySalesService.generate).toHaveBeenCalledTimes(2);
    });

    it('should pass SAME filters to generate for PDF and Excel', async () => {
      const report = mockReport();
      const filters = {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
        branchId: 'branch-x',
      };

      dailySalesService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf(filters, COMPANY_ID, USER_ID);
      await service.toExcel(filters, COMPANY_ID, USER_ID);

      const pdfCall = dailySalesService.generate.mock.calls[0];
      const excelCall = dailySalesService.generate.mock.calls[1];

      expect(pdfCall[0]).toBe(filters);
      expect(excelCall[0]).toBe(filters);
      expect(pdfCall[1]).toBe(COMPANY_ID);
      expect(excelCall[1]).toBe(COMPANY_ID);
    });
  });
});
