import { Test, TestingModule } from '@nestjs/testing';

import { CashierPerformanceExportService } from './cashier-performance-export.service';
import { CashierPerformanceService } from './cashier-performance.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type { CashierPerformanceResponse } from '../interfaces/cashier-performance.interface';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

function mockReport(
  overrides: Partial<CashierPerformanceResponse> = {},
): CashierPerformanceResponse {
  return {
    meta: {
      title: 'تقرير أداء الكاشيرين',
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
      totalCashiers: 2,
      totalInvoicesCount: 15,
      totalGrossSales: 12000,
      totalReturns: 500,
      totalNetSales: 11000,
      overallAvgTicket: 785.71,
      bestCashier: {
        cashierId: 'c1',
        cashierName: 'أحمد',
        netSales: 7000,
      },
    },
    cashiers: [
      {
        cashierId: 'c1',
        cashierName: 'أحمد',
        rank: 1,
        invoicesCount: 8,
        completedInvoicesCount: 7,
        returnedInvoicesCount: 1,
        grossSales: 7500,
        totalDiscounts: 0,
        returns: 500,
        netSales: 7000,
        totalCollected: 7000,
        avgTicket: 1000,
        returnRate: 6.67,
        firstSaleAt: '2026-09-01T08:00:00Z',
        lastSaleAt: '2026-09-30T17:00:00Z',
      },
      {
        cashierId: 'c2',
        cashierName: 'محمد',
        rank: 2,
        invoicesCount: 7,
        completedInvoicesCount: 7,
        returnedInvoicesCount: 0,
        grossSales: 4500,
        totalDiscounts: 0,
        returns: 0,
        netSales: 4000,
        totalCollected: 4500,
        avgTicket: 571.43,
        returnRate: 0,
        firstSaleAt: '2026-09-01T09:00:00Z',
        lastSaleAt: '2026-09-30T16:00:00Z',
      },
    ],
    dailyTrend: [
      {
        date: '2026-09-01',
        totalSales: 5000,
        totalInvoices: 6,
        byCashier: [
          {
            cashierId: 'c1',
            cashierName: 'أحمد',
            sales: 3500,
            invoicesCount: 4,
          },
          {
            cashierId: 'c2',
            cashierName: 'محمد',
            sales: 1500,
            invoicesCount: 2,
          },
        ],
      },
      {
        date: '2026-09-02',
        totalSales: 6000,
        totalInvoices: 9,
        byCashier: [
          {
            cashierId: 'c1',
            cashierName: 'أحمد',
            sales: 3500,
            invoicesCount: 4,
          },
          {
            cashierId: 'c2',
            cashierName: 'محمد',
            sales: 2500,
            invoicesCount: 5,
          },
        ],
      },
    ],
    invoices: [
      {
        saleId: 's1',
        invoiceNumber: 'INV-001',
        createdAt: '2026-09-01T10:00:00Z',
        cashierId: 'c1',
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

describe('CashierPerformanceExportService', () => {
  let service: CashierPerformanceExportService;
  let cashierService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    cashierService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashierPerformanceExportService,
        { provide: CashierPerformanceService, useValue: cashierService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(CashierPerformanceExportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('should call generate + pdfExporter.render', async () => {
      const report = mockReport();
      const pdfBuffer = Buffer.from('fake-pdf');
      cashierService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(pdfBuffer);

      const filters = { fromDate: '2026-09-01', toDate: '2026-09-30' };
      const result = await service.toPdf(filters, COMPANY_ID, USER_ID);

      expect(cashierService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );
      expect(pdfExporter.render).toHaveBeenCalledTimes(1);
      expect(result).toBe(pdfBuffer);
    });

    it('should generate 4 sections', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections).toHaveLength(4);

      expect(sections.map((s) => s.heading)).toEqual([
        'الملخص التنفيذي',
        'ترتيب أداء الكاشيرين',
        'الاتجاه اليومي للمبيعات',
        'تفاصيل الفواتير',
      ]);
    });

    it('should include best cashier KPI', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const bestKpi = sections[0].kpis?.find((k) =>
        k.label.includes('أفضل كاشير'),
      );
      expect(bestKpi).toBeDefined();
      expect(bestKpi?.value).toBe('أحمد');
      expect(bestKpi?.hint).toBe('7,000.00');
    });

    it('should format summary KPIs with thousand separators', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const grossKpi = sections[0].kpis?.find(
        (k) => k.label === 'إجمالي المبيعات',
      );
      expect(grossKpi?.value).toBe('12,000.00');
    });

    it('should include rank in cashiers table', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const rankCol = sections[1].tables?.[0].columns.find(
        (c) => c.key === 'rank',
      );
      expect(rankCol).toBeDefined();
      expect(rankCol?.label).toBe('#');
    });

    it('should compute totals in cashiers table', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const totals = sections[1].tables?.[0].totals;
      expect(totals?.netSales).toBe(11000);
      expect(totals?.invoicesCount).toBe(15);
    });

    it('should include topCashier for each day in trend table', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const trendRows = sections[2].tables?.[0].rows as any[];
      expect(trendRows[0].topCashier).toBe('أحمد'); // 3500 > 1500
      expect(trendRows[1].topCashier).toBe('أحمد'); // 3500 > 2500
    });

    it('should limit invoices to 100 with note', async () => {
      const manyInvoices = Array.from({ length: 150 }, (_, i) => ({
        saleId: `s${i}`,
        invoiceNumber: `INV-${i}`,
        createdAt: '2026-09-01T10:00:00Z',
        cashierId: 'c1',
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
      cashierService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[3].tables?.[0].rows).toHaveLength(100);
      expect(sections[3].note).toContain('150');
    });

    it('should propagate errors from generate', async () => {
      cashierService.generate.mockRejectedValue(new Error('DB error'));

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
      const report = mockReport();
      const xlsxBuffer = Buffer.from('fake-xlsx');
      cashierService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(xlsxBuffer);

      const filters = { fromDate: '2026-09-01', toDate: '2026-09-30' };
      const result = await service.toExcel(filters, COMPANY_ID, USER_ID);

      expect(cashierService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );
      expect(excelExporter.render).toHaveBeenCalledTimes(1);
      expect(result).toBe(xlsxBuffer);
    });

    it('should generate 4 sheets with correct names', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets).toHaveLength(4);
      expect(sheets.map((s) => s.name)).toEqual([
        'الملخص',
        'أداء الكاشيرين',
        'الاتجاه اليومي',
        'الفواتير',
      ]);
    });

    it('should include bestCashier name in summary sheet', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const summarySheet = sheets.find((s) => s.name === 'الملخص');
      const bestRow = summarySheet?.rows.find(
        (r: any) => r.label === 'أفضل كاشير',
      );
      expect(bestRow).toBeDefined();
      expect((bestRow as any).value).toBe('أحمد');
    });

    it('should include 12 columns in cashiers sheet', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const cashiersSheet = sheets.find((s) => s.name === 'أداء الكاشيرين');
      expect(cashiersSheet?.columns).toHaveLength(12);
    });

    it('should include cashier breakdown string in daily trend', async () => {
      const report = mockReport();
      cashierService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const trendSheet = sheets.find((s) => s.name === 'الاتجاه اليومي');
      const firstRow = trendSheet?.rows[0] as any;
      expect(firstRow.cashierBreakdown).toContain('أحمد');
      expect(firstRow.cashierBreakdown).toContain('محمد');
    });

    it('should include ALL invoices (no 100 limit)', async () => {
      const manyInvoices = Array.from({ length: 250 }, (_, i) => ({
        saleId: `s${i}`,
        invoiceNumber: `INV-${i}`,
        createdAt: '2026-09-01T10:00:00Z',
        cashierId: 'c1',
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
      cashierService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const invoicesSheet = sheets.find((s) => s.name === 'الفواتير');
      expect(invoicesSheet?.rows).toHaveLength(250);
    });

    it('should propagate errors from excelExporter', async () => {
      cashierService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'ExcelJS failed',
      );
    });
  });
});
