import { Test, TestingModule } from '@nestjs/testing';

import { BalanceSheetExportService } from './balance-sheet-export.service';
import { BalanceSheetService } from './balance-sheet.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type { BalanceSheetResponse } from '../interfaces/balance-sheet.interface';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockLine(overrides: Partial<any> = {}) {
  return {
    accountId: 'acc-1',
    accountCode: '1-1-01',
    accountName: 'النقدية',
    level: 2,
    isLeaf: true,
    hasChildren: false,
    parentId: null,
    balance: 5000,
    absoluteBalance: 5000,
    debit: 5000,
    credit: 0,
    previousBalance: 4000,
    variance: 1000,
    variancePercentage: 25,
    isVirtual: false,
    drillUrl: null,
    entriesUrl: '/reports/general-ledger?accountId=acc-1',
    ...overrides,
  };
}

function mockReport(
  overrides: Partial<BalanceSheetResponse> = {},
): BalanceSheetResponse {
  return {
    meta: {
      title: 'الميزانية العمومية',
      companyName: 'صيدلية داوا',
      branchName: 'الفرع الرئيسي',
      fromDate: '2026-12-31',
      toDate: '2026-12-31',
      timezone: 'Africa/Cairo',
      generatedAt: new Date('2026-12-31T18:00:00Z'),
      generatedBy: { id: USER_ID, name: 'مدير النظام' },
      filters: {},
    },
    summary: {
      totalAssets: 100000,
      totalLiabilities: 40000,
      totalEquity: 60000,
      currentAssets: 30000,
      nonCurrentAssets: 70000,
      currentLiabilities: 20000,
      nonCurrentLiabilities: 20000,
      previousTotalAssets: 90000,
      previousTotalLiabilities: 35000,
      previousTotalEquity: 55000,
      assetsVariance: 10000,
      liabilitiesVariance: 5000,
      equityVariance: 5000,
      balanceDifference: 0,
      isBalanced: true,
      retainedEarnings: 40000,
      currentPeriodNetIncome: 20000,
      ratios: [
        {
          key: 'currentRatio',
          label: 'نسبة التداول',
          value: 1.5,
          isHealthy: true,
          hint: 'الأصول المتداولة / الخصوم المتداولة',
        },
        {
          key: 'workingCapital',
          label: 'رأس المال العامل',
          value: 10000,
          isHealthy: true,
          hint: 'الأصول − الخصوم',
        },
        {
          key: 'debtToEquity',
          label: 'المديونية / حقوق الملكية',
          value: 0.67,
          isHealthy: true,
          hint: 'إجمالي الخصوم / إجمالي حقوق الملكية',
        },
        {
          key: 'debtRatio',
          label: 'نسبة المديونية',
          value: 40,
          isHealthy: true,
          hint: '% من الأصول',
        },
        {
          key: 'equityRatio',
          label: 'نسبة حقوق الملكية',
          value: 60,
          isHealthy: true,
          hint: '% من الأصول',
        },
      ],
    },
    groups: [
      {
        groupKey: 'ASSETS',
        groupLabel: 'الأصول',
        lines: [
          mockLine(),
          mockLine({
            accountId: 'acc-2',
            accountCode: '1-2-01',
            accountName: 'أصول ثابتة',
            balance: 95000,
            absoluteBalance: 95000,
          }),
        ],
        total: 100000,
        previousTotal: 90000,
        variance: 10000,
        variancePercentage: 11.11,
      },
      {
        groupKey: 'LIABILITIES',
        groupLabel: 'الخصوم',
        lines: [
          mockLine({
            accountId: 'acc-3',
            accountCode: '2-1-01',
            accountName: 'الموردون',
            balance: -40000,
            absoluteBalance: 40000,
            debit: 0,
            credit: 40000,
          }),
        ],
        total: 40000,
        previousTotal: 35000,
        variance: 5000,
        variancePercentage: 14.29,
      },
      {
        groupKey: 'EQUITY',
        groupLabel: 'حقوق الملكية',
        lines: [
          mockLine({
            accountId: 'acc-4',
            accountCode: '3-1-99',
            accountName: 'رأس المال',
            balance: -40000,
            absoluteBalance: 40000,
            debit: 0,
            credit: 40000,
          }),
          mockLine({
            accountId: null,
            accountCode: '32-CALC',
            accountName: 'الأرباح المبقاة (تراكمي)',
            balance: -40000,
            absoluteBalance: 40000,
            debit: 0,
            credit: 40000,
            isVirtual: true,
            entriesUrl: null,
          }),
          mockLine({
            accountId: null,
            accountCode: '33-CALC',
            accountName: 'صافي دخل السنة الحالية',
            balance: -20000,
            absoluteBalance: 20000,
            debit: 0,
            credit: 20000,
            isVirtual: true,
            entriesUrl: null,
          }),
        ],
        total: 100000,
        previousTotal: 90000,
        variance: 10000,
        variancePercentage: 11.11,
      },
    ],
    comparison: {
      mode: 'PREVIOUS_YEAR_SAME_DATE',
      asOfDate: '2026-12-31',
      previousAsOfDate: '2025-12-31',
      label: 'نفس التاريخ 2025',
    },
    fiscalYear: {
      startMonth: 1,
      startDate: '2026-01-01',
      label: 'السنة المالية 2026',
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('BalanceSheetExportService', () => {
  let service: BalanceSheetExportService;
  let balanceSheetService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    balanceSheetService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceSheetExportService,
        { provide: BalanceSheetService, useValue: balanceSheetService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(BalanceSheetExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('landscape=true when compareMode != NONE', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      expect(pdfExporter.render.mock.calls[0][2]).toEqual({ landscape: true });
    });

    it('landscape=false when compareMode = NONE', async () => {
      const report = mockReport({
        comparison: {
          mode: 'NONE',
          asOfDate: '2026-12-31',
          previousAsOfDate: null,
          label: null,
        },
      });
      balanceSheetService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      expect(pdfExporter.render.mock.calls[0][2]).toEqual({ landscape: false });
    });

    it('should generate exactly 3 sections', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections).toHaveLength(3);
      expect(sections[0].heading).toBe('الملخص التنفيذي');
      expect(sections[1].heading).toBe('المؤشرات المالية');
      expect(sections[2].heading).toBe('الميزانية العمومية');
    });

    it('should include 4 KPIs in summary section', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[0].kpis).toHaveLength(4);
    });

    it('should show green balance KPI when isBalanced=true', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const balanceKpi = sections[0].kpis?.find((k) =>
        k.label.includes('الميزانية'),
      );
      expect(balanceKpi?.value).toBe('متوازنة ✓');
      expect(balanceKpi?.color).toBe('success');
    });

    it('should show red balance KPI + note when unbalanced', async () => {
      const report = mockReport({
        summary: {
          ...mockReport().summary,
          isBalanced: false,
          balanceDifference: 500,
        },
      });
      balanceSheetService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const balanceKpi = sections[0].kpis?.find((k) =>
        k.label.includes('الميزانية'),
      );
      expect(balanceKpi?.value).toBe('غير متوازنة');
      expect(balanceKpi?.color).toBe('danger');
      expect(sections[0].note).toContain('500.00');
    });

    it('should include ratios KPIs (max 4)', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[1].kpis).toHaveLength(4);
      expect(sections[1].kpis?.[0].label).toBe('نسبة التداول');
    });

    it('should format debtRatio with % symbol', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const debtRatioKpi = sections[1].kpis?.find((k) =>
        k.label.includes('المديونية') && !k.label.includes('حقوق'),
      );
      expect(debtRatioKpi?.value).toContain('%');
    });

    it('should generate 5 columns when comparing', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[2].tables?.[0].columns).toHaveLength(5);
    });

    it('should generate 2 columns when NOT comparing', async () => {
      const report = mockReport({
        comparison: {
          mode: 'NONE',
          asOfDate: '2026-12-31',
          previousAsOfDate: null,
          label: null,
        },
      });
      balanceSheetService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[2].tables?.[0].columns).toHaveLength(2);
    });

    it('should include comparison label in note', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[2].note).toContain('نفس التاريخ 2025');
    });

    it('should propagate errors from generate', async () => {
      balanceSheetService.generate.mockRejectedValue(new Error('DB error'));

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
      balanceSheetService.generate.mockResolvedValue(mockReport());
      const xlsx = Buffer.from('xlsx');
      excelExporter.render.mockResolvedValue(xlsx);

      const result = await service.toExcel({}, COMPANY_ID, USER_ID);

      expect(result).toBe(xlsx);
    });

    it('should generate exactly 4 sheets', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets).toHaveLength(4);
      expect(sheets.map((s) => s.name)).toEqual([
        'الملخص',
        'الميزانية',
        'المؤشرات المالية',
        'تفاصيل الحسابات',
      ]);
    });

    it('should include ratio rows in ratios sheet', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const ratiosSheet = sheets.find((s) => s.name === 'المؤشرات المالية');
      expect(ratiosSheet?.rows).toHaveLength(5);
      expect((ratiosSheet?.rows[0] as any).label).toBe('نسبة التداول');
    });

    it('should include 5 columns in income sheet when comparing', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const balanceSheet = sheets.find((s) => s.name === 'الميزانية');
      expect(balanceSheet?.columns).toHaveLength(5);
    });

    it('should mark virtual lines in detail sheet', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const detailSheet = sheets.find((s) => s.name === 'تفاصيل الحسابات');
      const rows = detailSheet?.rows as any[];
      const virtualRow = rows.find((r) => r.isVirtual === '⚡');
      expect(virtualRow).toBeDefined();
    });

    it('should include all 3 groups in detail sheet', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const detailSheet = sheets.find((s) => s.name === 'تفاصيل الحسابات');
      const rows = detailSheet?.rows as any[];

      expect(rows.some((r) => r.group === 'الأصول')).toBe(true);
      expect(rows.some((r) => r.group === 'الخصوم')).toBe(true);
      expect(rows.some((r) => r.group === 'حقوق الملكية')).toBe(true);
    });

    it('should include fiscalYear in summary sheet', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const summarySheet = sheets.find((s) => s.name === 'الملخص');
      const fyRow = summarySheet?.rows.find(
        (r: any) => r.label === 'بداية السنة المالية',
      );
      expect(fyRow).toBeDefined();
      expect((fyRow as any).value).toBe('2026-01-01');
    });

    it('should handle missing groups gracefully', async () => {
      const report = mockReport({ groups: [] });
      balanceSheetService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      // Should not throw
      await service.toExcel({}, COMPANY_ID, USER_ID);
      expect(excelExporter.render).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from excelExporter', async () => {
      balanceSheetService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'ExcelJS failed',
      );
    });
  });
});
