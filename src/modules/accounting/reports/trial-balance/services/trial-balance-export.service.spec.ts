import { Test, TestingModule } from '@nestjs/testing';

import { AccountType } from '@prisma/client';
import { TrialBalanceExportService } from './trial-balance-export.service';
import { TrialBalanceService } from './trial-balance.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type {
  TrialBalanceResponse,
  TrialBalanceRow,
} from '../interfaces/trial-balance.interface';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockRow(overrides: Partial<TrialBalanceRow> = {}): TrialBalanceRow {
  return {
    accountId: 'acc-1',
    accountCode: '1101',
    accountName: 'النقدية',
    accountType: AccountType.ASSET,
    level: 3,
    openingDebit: 1000,
    openingCredit: 0,
    openingBalance: 1000,
    movementDebit: 500,
    movementCredit: 0,
    movementBalance: 500,
    closingDebit: 1500,
    closingCredit: 0,
    closingBalance: 1500,
    ...overrides,
  };
}

function mockReport(
  overrides: Partial<TrialBalanceResponse> = {},
): TrialBalanceResponse {
  return {
    meta: {
      title: 'ميزان المراجعة',
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
      totalAccounts: 2,
      accountsWithActivity: 2,
      totalOpeningDebit: 5000,
      totalOpeningCredit: 5000,
      openingDifference: 0,
      totalMovementDebit: 12000,
      totalMovementCredit: 12000,
      movementDifference: 0,
      totalClosingDebit: 8000,
      totalClosingCredit: 8000,
      closingDifference: 0,
      isBalanced: true,
    },
    rows: [
      mockRow({ accountId: 'acc-1', accountCode: '1101' }),
      mockRow({
        accountId: 'acc-2',
        accountCode: '2101',
        accountName: 'الموردون',
        accountType: AccountType.LIABILITY,
        openingDebit: 0,
        openingCredit: 5000,
        openingBalance: -5000,
        movementDebit: 0,
        movementCredit: 12000,
        movementBalance: -12000,
        closingDebit: 0,
        closingCredit: 8000,
        closingBalance: -8000,
      }),
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('TrialBalanceExportService', () => {
  let service: TrialBalanceExportService;
  let trialBalanceService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    trialBalanceService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrialBalanceExportService,
        { provide: TrialBalanceService, useValue: trialBalanceService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(TrialBalanceExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('should call generate + pdfExporter.render with landscape=true', async () => {
      const report = mockReport();
      const pdf = Buffer.from('pdf');
      trialBalanceService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(pdf);

      const filters = { fromDate: '2026-01-01', toDate: '2026-12-31' };
      const result = await service.toPdf(filters, COMPANY_ID, USER_ID);

      expect(trialBalanceService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );
      expect(pdfExporter.render).toHaveBeenCalledTimes(1);

      // ← فحص إلزامي: landscape يجب أن يكون true
      const renderArgs = pdfExporter.render.mock.calls[0];
      expect(renderArgs[2]).toEqual({ landscape: true });

      expect(result).toBe(pdf);
    });

    it('should generate exactly 2 sections', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections).toHaveLength(2);
      expect(sections[0].heading).toBe('الملخص التنفيذي');
      expect(sections[1].heading).toBe('تفاصيل ميزان المراجعة');
    });

    it('should show green balance KPI when isBalanced=true', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const balanceKpi = sections[0].kpis?.find((k) =>
        k.label.includes('حالة الميزان'),
      );
      expect(balanceKpi?.value).toBe('متوازن ✓');
      expect(balanceKpi?.color).toBe('success');
    });

    it('should show red balance KPI + note when isBalanced=false', async () => {
      const report = mockReport({
        summary: {
          ...mockReport().summary,
          isBalanced: false,
          closingDifference: 500,
        },
      });
      trialBalanceService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const balanceKpi = sections[0].kpis?.find((k) =>
        k.label.includes('حالة الميزان'),
      );
      expect(balanceKpi?.value).toBe('غير متوازن');
      expect(balanceKpi?.color).toBe('danger');
      expect(sections[0].note).toContain('500.00');
    });

    it('should include 9 KPIs in summary section', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[0].kpis).toHaveLength(9);
    });

    it('should include 8 columns in details table', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[1].tables?.[0].columns).toHaveLength(8);
    });

    it('should limit to 200 rows with note when > 200', async () => {
      const manyRows = Array.from({ length: 250 }, (_, i) =>
        mockRow({ accountId: `acc-${i}`, accountCode: `A-${i}` }),
      );
      const report = mockReport({ rows: manyRows });
      trialBalanceService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[1].tables?.[0].rows).toHaveLength(200);
      expect(sections[1].note).toContain('250');
      expect(sections[1].note).toContain('200');
    });

    it('should NOT include note when <= 200 rows', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[1].note).toBeUndefined();
    });

    it('should propagate errors from generate', async () => {
      trialBalanceService.generate.mockRejectedValue(new Error('DB error'));

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
      trialBalanceService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(xlsx);

      const result = await service.toExcel({}, COMPANY_ID, USER_ID);

      expect(trialBalanceService.generate).toHaveBeenCalledWith(
        {},
        COMPANY_ID,
        USER_ID,
      );
      expect(result).toBe(xlsx);
    });

    it('should generate exactly 2 sheets', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets).toHaveLength(2);
      expect(sheets.map((s) => s.name)).toEqual(['الملخص', 'ميزان المراجعة']);
    });

    it('should include ALL rows (no 200 limit) in Excel', async () => {
      const manyRows = Array.from({ length: 500 }, (_, i) =>
        mockRow({ accountId: `acc-${i}`, accountCode: `A-${i}` }),
      );
      const report = mockReport({ rows: manyRows });
      trialBalanceService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const dataSheet = sheets.find((s) => s.name === 'ميزان المراجعة');
      expect(dataSheet?.rows).toHaveLength(500);
    });

    it('should include 9 columns in Excel data sheet', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const dataSheet = sheets.find((s) => s.name === 'ميزان المراجعة');
      // accountCode + accountName + accountType + 6 (opening/movement/closing × 2)
      expect(dataSheet?.columns).toHaveLength(9);
    });

    it('should include balance status row in summary sheet', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const summarySheet = sheets.find((s) => s.name === 'الملخص');
      const balanceRow = summarySheet?.rows.find(
        (r: any) => r.label === 'حالة الميزان',
      );
      expect(balanceRow).toBeDefined();
      expect((balanceRow as any).value).toBe('متوازن ✓');
    });

    it('should show negative status in Excel when unbalanced', async () => {
      const report = mockReport({
        summary: {
          ...mockReport().summary,
          isBalanced: false,
          closingDifference: 300,
        },
      });
      trialBalanceService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const summarySheet = sheets.find((s) => s.name === 'الملخص');
      const balanceRow = summarySheet?.rows.find(
        (r: any) => r.label === 'حالة الميزان',
      );
      expect((balanceRow as any).value).toBe('غير متوازن ⚠️');
    });

    it('should propagate errors from excelExporter', async () => {
      trialBalanceService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'ExcelJS failed',
      );
    });
  });
});
