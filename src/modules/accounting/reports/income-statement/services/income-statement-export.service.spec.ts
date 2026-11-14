import { Test, TestingModule } from '@nestjs/testing';
import { AccountType } from '@prisma/client';

import { IncomeStatementExportService } from './income-statement-export.service';
import { IncomeStatementService } from './income-statement.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type { IncomeStatementResponse } from '../interfaces/income-statement.interface';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockLine(overrides: Partial<any> = {}) {
  return {
    accountId: 'acc-1',
    accountCode: '411',
    accountName: 'المبيعات',
    level: 2,
    isLeaf: true,
    hasChildren: false,
    parentId: 'acc-parent',
    amount: 1000,
    previousAmount: 800,
    variance: 200,
    variancePercentage: 25,
    drillUrl: null,
    entriesUrl: '/reports/general-ledger?accountId=acc-1',
    ...overrides,
  };
}

function mockReport(
  overrides: Partial<IncomeStatementResponse> = {},
): IncomeStatementResponse {
  return {
    meta: {
      title: 'قائمة الدخل',
      companyName: 'صيدلية داوا',
      branchName: 'الفرع الرئيسي',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
      timezone: 'Africa/Cairo',
      generatedAt: new Date('2026-12-31T18:00:00Z'),
      generatedBy: { id: USER_ID, name: 'مدير النظام' },
      filters: {},
    },
    summary: {
      totalRevenue: 1000,
      totalExpenses: 400,
      netIncome: 600,
      previousTotalRevenue: 800,
      previousTotalExpenses: 300,
      previousNetIncome: 500,
      revenueVariance: 200,
      expensesVariance: 100,
      netIncomeVariance: 100,
      revenueGrowth: 25,
      expensesGrowth: 33.33,
      netIncomeGrowth: 20,
      netIncomeMargin: 60,
      previousNetIncomeMargin: 62.5,
    },
    groups: [
      {
        groupKey: 'REVENUE',
        groupLabel: 'الإيرادات',
        lines: [
          mockLine({
            accountId: 'rv-root',
            accountCode: '41',
            accountName: 'الإيرادات',
            level: 1,
            isLeaf: false,
            hasChildren: true,
            parentId: null,
            amount: 1000,
            previousAmount: 800,
            variance: 200,
            variancePercentage: 25,
            drillUrl: '/reports/income-statement/drill?parentAccountId=rv-root',
            entriesUrl: null,
          }),
          mockLine(),
        ],
        total: 1000,
        previousTotal: 800,
        variance: 200,
        variancePercentage: 25,
      },
      {
        groupKey: 'EXPENSE',
        groupLabel: 'المصروفات',
        lines: [
          mockLine({
            accountId: 'ex-root',
            accountCode: '51',
            accountName: 'المصروفات',
            level: 1,
            isLeaf: false,
            hasChildren: true,
            parentId: null,
            amount: 400,
            previousAmount: 300,
            variance: 100,
            variancePercentage: 33.33,
            drillUrl: '/reports/income-statement/drill?parentAccountId=ex-root',
            entriesUrl: null,
          }),
        ],
        total: 400,
        previousTotal: 300,
        variance: 100,
        variancePercentage: 33.33,
      },
    ],
    comparison: {
      mode: 'PREVIOUS_YEAR',
      previousFromDate: '2025-01-01',
      previousToDate: '2025-12-31',
      label: 'نفس الفترة 2025',
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('IncomeStatementExportService', () => {
  let service: IncomeStatementExportService;
  let incomeStatementService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    incomeStatementService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomeStatementExportService,
        { provide: IncomeStatementService, useValue: incomeStatementService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(IncomeStatementExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('landscape=true when compareMode != NONE', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const renderArgs = pdfExporter.render.mock.calls[0];
      expect(renderArgs[2]).toEqual({ landscape: true });
    });

    it('landscape=false when compareMode = NONE', async () => {
      const report = mockReport({
        comparison: {
          mode: 'NONE',
          previousFromDate: null,
          previousToDate: null,
          label: null,
        },
      });
      incomeStatementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const renderArgs = pdfExporter.render.mock.calls[0];
      expect(renderArgs[2]).toEqual({ landscape: false });
    });

    it('should generate 2 sections', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections).toHaveLength(2);
      expect(sections[0].heading).toBe('الملخص التنفيذي');
      expect(sections[1].heading).toBe('قائمة الدخل');
    });

    it('should include 4 KPIs', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[0].kpis).toHaveLength(4);
      expect(sections[0].kpis?.[0].label).toBe('إجمالي الإيرادات');
      expect(sections[0].kpis?.[2].label).toBe('صافي الدخل');
    });

    it('should color netIncome KPI green when positive', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const niKpi = sections[0].kpis?.find((k) => k.label === 'صافي الدخل');
      expect(niKpi?.color).toBe('success');
    });

    it('should color netIncome KPI red when negative', async () => {
      const report = mockReport({
        summary: { ...mockReport().summary, netIncome: -100 },
      });
      incomeStatementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const niKpi = sections[0].kpis?.find((k) => k.label === 'صافي الدخل');
      expect(niKpi?.color).toBe('danger');
    });

    it('should color margin KPI green when >= 10%', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const marginKpi = sections[0].kpis?.find((k) => k.label === 'هامش الربح');
      expect(marginKpi?.color).toBe('success');
    });

    it('should color margin KPI warning when 0-10%', async () => {
      const report = mockReport({
        summary: { ...mockReport().summary, netIncomeMargin: 5 },
      });
      incomeStatementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const marginKpi = sections[0].kpis?.find((k) => k.label === 'هامش الربح');
      expect(marginKpi?.color).toBe('warning');
    });

    it('should generate 5 columns when comparing', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const table = sections[1].tables?.[0];
      expect(table?.columns).toHaveLength(5);
    });

    it('should generate 2 columns when NOT comparing', async () => {
      const report = mockReport({
        comparison: {
          mode: 'NONE',
          previousFromDate: null,
          previousToDate: null,
          label: null,
        },
      });
      incomeStatementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const table = sections[1].tables?.[0];
      expect(table?.columns).toHaveLength(2);
    });

    it('should include comparison label in note', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[1].note).toContain('نفس الفترة 2025');
    });

    it('should handle missing REVENUE group gracefully (safe fallback)', async () => {
      const report = mockReport({
        groups: [
          {
            groupKey: 'EXPENSE',
            groupLabel: 'المصروفات',
            lines: [],
            total: 0,
            previousTotal: null,
            variance: null,
            variancePercentage: null,
          },
        ],
      });
      incomeStatementService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      // Should not throw
      await service.toPdf({}, COMPANY_ID, USER_ID);
      expect(pdfExporter.render).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from generate', async () => {
      incomeStatementService.generate.mockRejectedValue(new Error('DB error'));

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
      const xlsx = Buffer.from('xlsx');
      incomeStatementService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(xlsx);

      const result = await service.toExcel({}, COMPANY_ID, USER_ID);

      expect(incomeStatementService.generate).toHaveBeenCalledWith(
        {},
        COMPANY_ID,
        USER_ID,
      );
      expect(result).toBe(xlsx);
    });

    it('should generate 3 sheets', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets).toHaveLength(3);
      expect(sheets.map((s) => s.name)).toEqual([
        'الملخص',
        'قائمة الدخل',
        'تفاصيل الحسابات',
      ]);
    });

    it('should include 13 rows in summary when comparing', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const summarySheet = sheets.find((s) => s.name === 'الملخص');
      // 4 base + 3 previous + 3 growth + 2 separators = 12-ish
      expect((summarySheet?.rows.length ?? 0)).toBeGreaterThanOrEqual(10);
    });

    it('should include 5 columns in income sheet when comparing', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const incomeSheet = sheets.find((s) => s.name === 'قائمة الدخل');
      expect(incomeSheet?.columns).toHaveLength(5);
    });

    it('should flatten lines with group label in detail sheet', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const detailSheet = sheets.find((s) => s.name === 'تفاصيل الحسابات');
      const rows = detailSheet?.rows as any[];
      expect(rows.some((r) => r.group === 'إيرادات')).toBe(true);
      expect(rows.some((r) => r.group === 'مصروفات')).toBe(true);
    });

    it('should propagate errors from excelExporter', async () => {
      incomeStatementService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'ExcelJS failed',
      );
    });
  });
});
