import { Test, TestingModule } from '@nestjs/testing';

import { SupplierAgingExportService } from './supplier-aging-export.service';
import { SupplierAgingService } from './supplier-aging.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type {
  SupplierAgingResponse,
  SupplierAgingRow,
  AgingRiskLevel,
  AgingDocumentItem,
  AgingBucketKey,
} from '../interfaces/supplier-aging.interface';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockDocument(
  overrides: Partial<AgingDocumentItem> = {},
): AgingDocumentItem {
  return {
    id: 'doc-1',
    documentNumber: 'PO-001',
    documentDate: '2026-08-01',
    amount: 1000,
    paidAmount: 0,
    remainingAmount: 1000,
    ageInDays: 56,
    bucket: 'DAYS_31_60' as AgingBucketKey,
    invoiceId: 'doc-1',
    daysOverdue: 56,
    ...overrides,
  };
}

function mockSupplierRow(
  overrides: Partial<SupplierAgingRow> = {},
): SupplierAgingRow {
  return {
    // Base fields (AgingPartnerRow)
    partnerId: 'sup-1',
    partnerCode: 'SUP-001',
    partnerName: 'شركة النيل للأدوية',
    phone: '0912345678',
    currentBalance: 5000,
    buckets: {
      current: 2000,
      days31_60: 1500,
      days61_90: 1000,
      over90: 500,
    },
    percentages: { current: 40, days31_60: 30, days61_90: 20, over90: 10 },
    oldestDocumentDays: 85,
    oldestDocumentDate: '2026-07-03',
    averageAgeDays: 65,
    riskLevel: 'HIGH' as AgingRiskLevel,
    documentsCount: 2,
    documents: [
      mockDocument(),
      mockDocument({ id: 'doc-2', documentNumber: 'PO-002' }),
    ],

    // Supplier-specific
    supplierId: 'sup-1',
    supplierCompanyName: 'النيل فارما',
    taxNumber: 'TAX-123456',

    // Compatibility aliases
    invoices: [
      mockDocument(),
      mockDocument({ id: 'doc-2', documentNumber: 'PO-002' }),
    ],
    oldestInvoiceDate: '2026-07-03',
    oldestInvoiceDays: 85,

    ...overrides,
  };
}

function mockReport(
  overrides: Partial<SupplierAgingResponse> = {},
): SupplierAgingResponse {
  return {
    meta: {
      title: 'تقرير أعمار ديون الموردين',
      companyName: 'صيدلية داوا',
      branchName: 'الفرع الرئيسي',
      fromDate: '2026-09-25',
      toDate: '2026-09-25',
      timezone: 'Africa/Cairo',
      generatedAt: new Date('2026-09-25T18:00:00Z'),
      generatedBy: { id: USER_ID, name: 'مدير النظام' },
      filters: {},
    },
    partnerType: 'SUPPLIER',
    thresholds: { bucket1: 30, bucket2: 60, bucket3: 90 },
    summary: {
      totalPartners: 3,
      partnersWithBalance: 3,
      totalBalance: 15000,
      buckets: [
        {
          key: 'CURRENT',
          label: 'جاري',
          fromDays: 0,
          toDays: 30,
          amount: 6000,
          percentage: 40,
          riskLevel: 'LOW' as const,
        },
        {
          key: 'DAYS_31_60',
          label: 'متأخر 31-60',
          fromDays: 31,
          toDays: 60,
          amount: 4500,
          percentage: 30,
          riskLevel: 'MEDIUM' as const,
        },
        {
          key: 'DAYS_61_90',
          label: 'متأخر 61-90',
          fromDays: 61,
          toDays: 90,
          amount: 3000,
          percentage: 20,
          riskLevel: 'HIGH' as const,
        },
        {
          key: 'OVER_90',
          label: 'متأخر +90',
          fromDays: 91,
          toDays: null,
          amount: 1500,
          percentage: 10,
          riskLevel: 'CRITICAL' as const,
        },
      ],
      ratios: {
        overdueRatio: 50,
        criticalRatio: 10,
        averageDebtPerPartner: 5000,
      },
    },
    partners: [mockSupplierRow()],
    suppliers: [mockSupplierRow()],
    ...overrides,
  } as SupplierAgingResponse;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('SupplierAgingExportService', () => {
  let service: SupplierAgingExportService;
  let supplierAgingService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    supplierAgingService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierAgingExportService,
        { provide: SupplierAgingService, useValue: supplierAgingService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(SupplierAgingExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('should call generate + pdfExporter.render with landscape=true (always)', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      const pdf = Buffer.from('pdf');
      pdfExporter.render.mockResolvedValue(pdf);

      const filters = { asOfDate: '2026-09-25' };
      const result = await service.toPdf(filters, COMPANY_ID, USER_ID);

      expect(supplierAgingService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );
      expect(pdfExporter.render.mock.calls[0][2]).toEqual({ landscape: true });
      expect(result).toBe(pdf);
    });

    it('should generate exactly 2 sections', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections).toHaveLength(2);
      expect(sections[0].heading).toBe('المؤشرات والملخص العام');
      expect(sections[1].heading).toBe('أعمار ديون الموردين بالتفصيل');
    });

    it('should include 4 KPIs with supplier-specific labels', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[0].kpis).toHaveLength(4);
      expect(sections[0].kpis?.[0].label).toBe('إجمالي المستحقات للموردين');
      expect(sections[0].kpis?.[1].label).toBe('نسبة الديون المتأخرة');
      expect(sections[0].kpis?.[2].label).toBe('نسبة الديون الحرجة');
      expect(sections[0].kpis?.[3].label).toBe('متوسط مستحقات المورد');
    });

    it('should include supplier count hint in first KPI', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const firstKpi = sections[0].kpis?.[0];
      expect(firstKpi?.hint).toContain('مورد دائن');
      expect(firstKpi?.hint).toContain('3');
    });

    it('should color overdue KPI as warning when > 40%', async () => {
      const report = mockReport();
      report.summary.ratios!.overdueRatio = 55;
      supplierAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const kpi = sections[0].kpis?.find(
        (k) => k.label === 'نسبة الديون المتأخرة',
      );
      expect(kpi?.color).toBe('warning');
    });

    it('should color overdue KPI as info when <= 40%', async () => {
      const report = mockReport();
      report.summary.ratios!.overdueRatio = 30;
      supplierAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const kpi = sections[0].kpis?.find(
        (k) => k.label === 'نسبة الديون المتأخرة',
      );
      expect(kpi?.color).toBe('info');
    });

    it('should color critical KPI as danger when > 15%', async () => {
      const report = mockReport();
      report.summary.ratios!.criticalRatio = 25;
      supplierAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const kpi = sections[0].kpis?.find(
        (k) => k.label === 'نسبة الديون الحرجة',
      );
      expect(kpi?.color).toBe('danger');
    });

    it('should color critical KPI as success when <= 15%', async () => {
      const report = mockReport();
      report.summary.ratios!.criticalRatio = 8;
      supplierAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const kpi = sections[0].kpis?.find(
        (k) => k.label === 'نسبة الديون الحرجة',
      );
      expect(kpi?.color).toBe('success');
    });

    it('should include summary buckets table with 5 columns and 4 rows', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const table = sections[0].tables?.[0];
      expect(table?.columns).toHaveLength(5);
      expect(table?.rows).toHaveLength(4);
      expect(table?.title).toBe('ملخص شرائح أعمار ديون الموردين');
    });

    it('should translate risk levels to Arabic in summary table', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const rows = sections[0].tables?.[0].rows as any[];
      expect(rows[0].riskLevel).toBe('منخفض');
      expect(rows[1].riskLevel).toBe('متوسط');
      expect(rows[2].riskLevel).toBe('مرتفع');
      expect(rows[3].riskLevel).toBe('حرج');
    });

    it('should use dynamic bucket column labels from thresholds', async () => {
      const report = mockReport();
      report.thresholds = { bucket1: 45, bucket2: 75, bucket3: 120 };
      supplierAgingService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const table = sections[1].tables?.[0];
      const labels = table?.columns.map((c) => c.label);
      expect(labels).toContain('0-45');
      expect(labels).toContain('46-75');
      expect(labels).toContain('76-120');
      expect(labels).toContain('+120');
    });

    it('should include totals in supplier table', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const totals = sections[1].tables?.[0].totals;
      expect(totals?.currentBalance).toBe(15000);
      expect(totals?.current).toBe(6000);
      expect(totals?.over90).toBe(1500);
    });

    it('should include supplier count in table title', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const title = sections[1].tables?.[0].title;
      expect(title).toContain('قائمة الموردين');
      expect(title).toContain('1');
    });

    it('should propagate errors from generate', async () => {
      supplierAgingService.generate.mockRejectedValue(new Error('DB error'));

      await expect(service.toPdf({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'DB error',
      );
      expect(pdfExporter.render).not.toHaveBeenCalled();
    });

    it('should propagate errors from pdfExporter', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockRejectedValue(new Error('PDF failed'));

      await expect(service.toPdf({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'PDF failed',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. toExcel
  // ═══════════════════════════════════════════════════════════

  describe('toExcel', () => {
    it('should call generate + excelExporter.render', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      const xlsx = Buffer.from('xlsx');
      excelExporter.render.mockResolvedValue(xlsx);

      const result = await service.toExcel({}, COMPANY_ID, USER_ID);

      expect(supplierAgingService.generate).toHaveBeenCalledWith(
        {},
        COMPANY_ID,
        USER_ID,
      );
      expect(result).toBe(xlsx);
    });

    it('should generate 3 sheets with correct supplier-specific names', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets).toHaveLength(3);
      expect(sheets.map((s) => s.name)).toEqual([
        'ملخص الأعمار',
        'أعمار ديون الموردين',
        'تفاصيل أوامر الشراء',
      ]);
    });

    it('should include supplier-specific meta keys in summary sheet', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const meta = sheets[0].meta;
      expect(meta?.['إجمالي المستحقات']).toBe('15000');
      expect(meta?.['نسبة الديون المتأخرة']).toBe('50%');
      expect(meta?.['عدد الموردين الدائنين']).toBe('3');
    });

    it('should include 12 columns in suppliers sheet (with companyName)', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const suppliersSheet = sheets[1];
      expect(suppliersSheet.columns).toHaveLength(12);
      const keys = suppliersSheet.columns.map((c) => c.key);
      expect(keys).toContain('partnerCode');
      expect(keys).toContain('companyName'); // ← خاص بالمورد
      expect(keys).toContain('averageAge');
      expect(keys).toContain('riskLevel');
    });

    it('should flatten all purchase orders in Sheet 3', async () => {
      const report = mockReport({
        suppliers: [
          mockSupplierRow({
            documents: [
              mockDocument({ id: 'doc-1', documentNumber: 'PO-001' }),
              mockDocument({ id: 'doc-2', documentNumber: 'PO-002' }),
              mockDocument({ id: 'doc-3', documentNumber: 'PO-003' }),
            ],
          }),
        ],
      });
      supplierAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const ordersSheet = sheets[2];
      expect(ordersSheet.rows).toHaveLength(3);
      expect((ordersSheet.rows[0] as any).orderNumber).toBe('PO-001');
    });

    it('should aggregate PO totals in Sheet 3', async () => {
      const report = mockReport({
        suppliers: [
          mockSupplierRow({
            documents: [
              mockDocument({
                id: 'd1',
                amount: 1000,
                paidAmount: 200,
                remainingAmount: 800,
              }),
              mockDocument({
                id: 'd2',
                amount: 500,
                paidAmount: 0,
                remainingAmount: 500,
              }),
            ],
          }),
        ],
      });
      supplierAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const totals = sheets[2].totals;
      expect(totals?.amount).toBe(1500);
      expect(totals?.paidAmount).toBe(200);
      expect(totals?.remainingAmount).toBe(1300);
    });

    it('should handle supplier with missing companyName (fallback to -)', async () => {
      const report = mockReport({
        suppliers: [mockSupplierRow({ supplierCompanyName: undefined })],
      });
      supplierAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const supplierRow = sheets[1].rows[0] as any;
      expect(supplierRow.companyName).toBe('-');
    });

    it('should handle empty documents gracefully', async () => {
      const report = mockReport({
        suppliers: [mockSupplierRow({ documents: undefined })],
      });
      supplierAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets[2].rows).toHaveLength(0);
    });

    it('should handle empty suppliers array', async () => {
      const report = mockReport({ suppliers: [], partners: [] });
      supplierAgingService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets[1].rows).toHaveLength(0);
      expect(sheets[2].rows).toHaveLength(0);
    });

    it('should use correct sheet titles', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets[0].title).toContain('ملخص الشرائح');
      expect(sheets[1].title).toContain('تفاصيل مستحقات الموردين');
      expect(sheets[2].title).toContain('أوامر الشراء');
    });

    it('should propagate errors from excelExporter', async () => {
      supplierAgingService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'ExcelJS failed',
      );
    });
  });
});
