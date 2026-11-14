import { Test, TestingModule } from '@nestjs/testing';

import { CustomerAgingExportService } from './customer-aging-export.service';
import { CustomerAgingService } from './customer-aging.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type {
  CustomerAgingResponse,
  CustomerAgingRow,
  AgingRiskLevel,
} from '../interfaces/customer-aging.interface';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockDocument(overrides: Partial<any> = {}) {
  return {
    documentNumber: 'INV-001',
    documentDate: '2026-08-01T00:00:00.000Z',
    amount: 1000,
    paidAmount: 0,
    remainingAmount: 1000,
    ageInDays: 56,
    bucket: 'DAYS_31_60',
    ...overrides,
  };
}

function mockCustomerRow(
  overrides: Partial<CustomerAgingRow> = {},
): CustomerAgingRow {
  return {
    // Base fields (AgingRowBase)
    partyId: 'cust-1',
    partyName: 'شركة الأمل',
    totalOutstanding: 5000,
    invoicesCount: 2,
    oldestInvoiceDays: 85,
    riskLevel: 'HIGH' as AgingRiskLevel,
    buckets: {
      current: 2000,
      days31_60: 1500,
      days61_90: 1000,
      over90: 500,
    },
    entriesUrl: '/reports/general-ledger?customerId=cust-1',
    invoicesUrl: '/reports/customer-aging/drill?customerId=cust-1',

    // Customer-specific
    creditLimit: 10000,
    currentDebt: 5000,
    isOverCreditLimit: false,
    creditUtilization: 50,

    // Compatibility aliases
    customerId: 'cust-1',
    partnerId: 'cust-1',
    partnerCode: 'C-001',
    partnerName: 'شركة الأمل',
    currentBalance: 5000,
    oldestDocumentDays: 85,
    oldestDocumentDate: '2026-07-03T00:00:00.000Z',
    averageAgeDays: 65,
    documents: [mockDocument(), mockDocument({ documentNumber: 'INV-002' })],
    documentsCount: 2,
    percentages: { current: 40, days31_60: 30, days61_90: 20, over90: 10 },

    ...overrides,
  };
}

function mockReport(
  overrides: Partial<CustomerAgingResponse> = {},
): CustomerAgingResponse {
  return {
    meta: {
      title: 'أعمار ديون العملاء',
      companyName: 'صيدلية داوا',
      branchName: 'الفرع الرئيسي',
      fromDate: '2026-09-25',
      toDate: '2026-09-25',
      timezone: 'Africa/Cairo',
      generatedAt: new Date('2026-09-25T18:00:00Z'),
      generatedBy: { id: USER_ID, name: 'مدير النظام' },
      filters: {},
    },
    summary: {
      // Base
      partiesCount: 3,
      totalOutstanding: 15000,
      totalInvoicesCount: 6,
      bucketsTotals: {
        current: 6000,
        days31_60: 4500,
        days61_90: 3000,
        over90: 1500,
      },
      bucketsPercentages: {
        current: 40,
        days31_60: 30,
        days61_90: 20,
        over90: 10,
      },
      averageAgeDays: 65,
      topDebtor: { partyId: 'cust-1', partyName: 'شركة الأمل', amount: 5000 },
      criticalPartiesCount: 1,

      // Customer-specific
      overCreditLimitCount: 1,
      totalCreditLimit: 30000,
      overallCreditUtilization: 50,

      // Compatibility aliases
      totalPartners: 3,
      partnersWithBalance: 3,
      totalBalance: 15000,
      buckets: [
        { label: 'جاري', fromDays: 0, toDays: 30, amount: 6000, percentage: 40, riskLevel: 'LOW' },
        { label: 'متأخر 31-60', fromDays: 31, toDays: 60, amount: 4500, percentage: 30, riskLevel: 'MEDIUM' },
        { label: 'متأخر 61-90', fromDays: 61, toDays: 90, amount: 3000, percentage: 20, riskLevel: 'HIGH' },
        { label: 'متأخر +90', fromDays: 91, toDays: null, amount: 1500, percentage: 10, riskLevel: 'CRITICAL' },
      ],
      ratios: {
        overdueRatio: 50,      // (10000/20000 * 100)
        criticalRatio: 10,
        averageDebtPerPartner: 5000,
      },
    },
    rows: [mockCustomerRow()],
    comparison: { mode: 'NONE', label: null },
    thresholds: { bucket1: 30, bucket2: 60, bucket3: 90 },

    // Compatibility aliases
    customers: [mockCustomerRow()],
    partners: [mockCustomerRow()],
    partnerType: 'CUSTOMER',

    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('CustomerAgingExportService', () => {
  let service: CustomerAgingExportService;
  let customerAgingService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    customerAgingService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAgingExportService,
        { provide: CustomerAgingService, useValue: customerAgingService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(CustomerAgingExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('should call generate + pdfExporter.render with landscape=true (always)', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      const pdf = Buffer.from('pdf');
      pdfExporter.render.mockResolvedValue(pdf);

      const filters = { asOfDate: '2026-09-25' };
      const result = await service.toPdf(filters, COMPANY_ID, USER_ID);

      expect(customerAgingService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );
      expect(pdfExporter.render.mock.calls[0][2]).toEqual({ landscape: true });
      expect(result).toBe(pdf);
    });

    it('should generate exactly 2 sections', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      expect(sections).toHaveLength(2);
      expect(sections[0].heading).toBe('المؤشرات والملخص العام');
      expect(sections[1].heading).toBe('أعمار ديون العملاء بالتفصيل');
    });

    it('should include 4 KPIs in first section', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      expect(sections[0].kpis).toHaveLength(4);
      expect(sections[0].kpis?.[0].label).toBe('إجمالي المديونية');
      expect(sections[0].kpis?.[1].label).toBe('نسبة الديون المتأخرة');
      expect(sections[0].kpis?.[2].label).toBe('نسبة الديون الحرجة');
      expect(sections[0].kpis?.[3].label).toBe('متوسط دين العميل');
    });

    it('should color overdue KPI as warning when > 40%', async () => {
      const report = mockReport();
      report.summary.ratios!.overdueRatio = 55; // > 40
      customerAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      const kpi = sections[0].kpis?.find((k) => k.label === 'نسبة الديون المتأخرة');
      expect(kpi?.color).toBe('warning');
    });

    it('should color overdue KPI as info when <= 40%', async () => {
      const report = mockReport();
      report.summary.ratios!.overdueRatio = 30;
      customerAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      const kpi = sections[0].kpis?.find((k) => k.label === 'نسبة الديون المتأخرة');
      expect(kpi?.color).toBe('info');
    });

    it('should color critical KPI as danger when > 15%', async () => {
      const report = mockReport();
      report.summary.ratios!.criticalRatio = 25; // > 15
      customerAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      const kpi = sections[0].kpis?.find((k) => k.label === 'نسبة الديون الحرجة');
      expect(kpi?.color).toBe('danger');
    });

    it('should color critical KPI as success when <= 15%', async () => {
      const report = mockReport();
      report.summary.ratios!.criticalRatio = 8;
      customerAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      const kpi = sections[0].kpis?.find((k) => k.label === 'نسبة الديون الحرجة');
      expect(kpi?.color).toBe('success');
    });

    it('should include summary buckets table with 5 columns', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      const table = sections[0].tables?.[0];
      expect(table?.columns).toHaveLength(5);
      expect(table?.rows).toHaveLength(4); // 4 buckets
    });

    it('should translate risk levels to Arabic in summary table', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      const rows = sections[0].tables?.[0].rows as any[];
      expect(rows[0].riskLevel).toBe('منخفض');   // LOW
      expect(rows[1].riskLevel).toBe('متوسط');   // MEDIUM
      expect(rows[2].riskLevel).toBe('مرتفع');   // HIGH
      expect(rows[3].riskLevel).toBe('حرج');     // CRITICAL
    });

    it('should use dynamic bucket column labels from thresholds', async () => {
      const report = mockReport();
      report.thresholds = { bucket1: 45, bucket2: 75, bucket3: 120 };
      customerAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      const table = sections[1].tables?.[0];
      const labels = table?.columns.map((c) => c.label);
      expect(labels).toContain('0-45');
      expect(labels).toContain('46-75');
      expect(labels).toContain('76-120');
      expect(labels).toContain('+120');
    });

    it('should include totals in customer table', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      const totals = sections[1].tables?.[0].totals;
      expect(totals).toBeDefined();
      expect(totals?.currentBalance).toBe(15000);
      expect(totals?.current).toBe(6000);
      expect(totals?.over90).toBe(1500);
    });

    it('should propagate errors from generate', async () => {
      customerAgingService.generate.mockRejectedValue(new Error('DB error'));

      await expect(service.toPdf({}, COMPANY_ID, USER_ID)).rejects.toThrow('DB error');
      expect(pdfExporter.render).not.toHaveBeenCalled();
    });

    it('should propagate errors from pdfExporter', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockRejectedValue(new Error('PDF failed'));

      await expect(service.toPdf({}, COMPANY_ID, USER_ID)).rejects.toThrow('PDF failed');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. toExcel
  // ═══════════════════════════════════════════════════════════

  describe('toExcel', () => {
    it('should call generate + excelExporter.render', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      const xlsx = Buffer.from('xlsx');
      excelExporter.render.mockResolvedValue(xlsx);

      const result = await service.toExcel({}, COMPANY_ID, USER_ID);

      expect(customerAgingService.generate).toHaveBeenCalledWith({}, COMPANY_ID, USER_ID);
      expect(result).toBe(xlsx);
    });

    it('should generate 3 sheets with correct names', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [unknown, ExcelSheet[]];
      expect(sheets).toHaveLength(3);
      expect(sheets.map((s) => s.name)).toEqual([
        'ملخص الأعمار',
        'أعمار ديون العملاء',
        'تفاصيل الفواتير',
      ]);
    });

    it('should include meta info in summary sheet', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [unknown, ExcelSheet[]];
      const summarySheet = sheets[0];
      expect(summarySheet.meta).toBeDefined();
      expect(summarySheet.meta?.['إجمالي الديون']).toBe('15000');
      expect(summarySheet.meta?.['نسبة الديون المتأخرة']).toBe('50%');
    });

    it('should include 12 columns in customers sheet', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [unknown, ExcelSheet[]];
      const customersSheet = sheets[1];
      expect(customersSheet.columns).toHaveLength(12);
      const keys = customersSheet.columns.map((c) => c.key);
      expect(keys).toContain('partnerCode');
      expect(keys).toContain('creditLimit');
      expect(keys).toContain('averageAge');
      expect(keys).toContain('riskLevel');
    });

    it('should flatten all documents in invoices sheet', async () => {
      const report = mockReport({
        customers: [
          mockCustomerRow({
            documents: [
              mockDocument({ documentNumber: 'INV-001' }),
              mockDocument({ documentNumber: 'INV-002' }),
              mockDocument({ documentNumber: 'INV-003' }),
            ],
          }),
        ],
      });
      customerAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [unknown, ExcelSheet[]];
      const invoicesSheet = sheets[2];
      expect(invoicesSheet.rows).toHaveLength(3);
      expect((invoicesSheet.rows[0] as any).invoiceNumber).toBe('INV-001');
    });

    it('should aggregate invoice totals in invoices sheet', async () => {
      const report = mockReport({
        customers: [
          mockCustomerRow({
            documents: [
              mockDocument({ amount: 1000, paidAmount: 200, remainingAmount: 800 }),
              mockDocument({ amount: 500, paidAmount: 0, remainingAmount: 500 }),
            ],
          }),
        ],
      });
      customerAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [unknown, ExcelSheet[]];
      const totals = sheets[2].totals;
      expect(totals?.amount).toBe(1500);
      expect(totals?.paidAmount).toBe(200);
      expect(totals?.remainingAmount).toBe(1300);
    });

    it('should handle empty documents gracefully', async () => {
      const report = mockReport({
        customers: [mockCustomerRow({ documents: undefined })],
      });
      customerAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [unknown, ExcelSheet[]];
      expect(sheets[2].rows).toHaveLength(0);
    });

    it('should handle empty customers array', async () => {
      const report = mockReport({ customers: [], rows: [] });
      customerAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      // Should not throw
      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [unknown, ExcelSheet[]];
      expect(sheets[1].rows).toHaveLength(0);
      expect(sheets[2].rows).toHaveLength(0);
    });

    it('should propagate errors from excelExporter', async () => {
      customerAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow('ExcelJS failed');
    });
  });
});
