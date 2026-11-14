import { Test, TestingModule } from '@nestjs/testing';
import { AccountType } from '@prisma/client';

import { GeneralLedgerExportService } from './general-ledger-export.service';
import { GeneralLedgerService } from './general-ledger.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type {
  GeneralLedgerResponse,
  AccountLedger,
  GeneralLedgerEntry,
} from '../interfaces/general-ledger.interface';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function mockEntry(overrides: Partial<GeneralLedgerEntry> = {}): GeneralLedgerEntry {
  return {
    journalLineId: 'line-1',
    journalEntryId: 'entry-1',
    entryNumber: 'JV-001',
    date: '2026-03-15T10:00:00.000Z',
    description: 'بيع نقدي',
    referenceId: null,
    source: 'SALE',
    debit: 100,
    credit: 0,
    runningBalance: 1100,
    counterparty: { type: 'NONE' },
    ...overrides,
  };
}

function mockAccount(overrides: Partial<AccountLedger> = {}): AccountLedger {
  return {
    accountId: 'acc-1',
    accountCode: '1101',
    accountName: 'النقدية',
    accountType: AccountType.ASSET,
    level: 3,
    openingBalance: 1000,
    openingDebit: 1000,
    openingCredit: 0,
    totalDebit: 100,
    totalCredit: 0,
    closingBalance: 1100,
    closingDebit: 1100,
    closingCredit: 0,
    totalEntries: 1,
    displayedEntries: 1,
    isTruncated: false,
    entries: [mockEntry()],
    ...overrides,
  };
}

function mockReport(
  overrides: Partial<GeneralLedgerResponse> = {},
): GeneralLedgerResponse {
  return {
    meta: {
      title: 'دفتر الأستاذ العام',
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
      accountsCount: 2,
      accountsWithActivity: 2,
      totalEntriesDisplayed: 2,
      totalDebit: 5000,
      totalCredit: 5000,
      difference: 0,
      isBalanced: true,
    },
    accounts: [
      mockAccount({ accountId: 'acc-1', accountCode: '1101' }),
      mockAccount({
        accountId: 'acc-2',
        accountCode: '2101',
        accountName: 'الموردون',
        accountType: AccountType.LIABILITY,
        openingBalance: -1000,
        openingDebit: 0,
        openingCredit: 1000,
        totalDebit: 0,
        totalCredit: 100,
        closingBalance: -1100,
        closingDebit: 0,
        closingCredit: 1100,
        entries: [
          mockEntry({
            journalLineId: 'line-2',
            debit: 0,
            credit: 100,
            runningBalance: -1100,
            counterparty: { type: 'SUPPLIER', id: 'supp-1', name: 'شركة النيل' },
          }),
        ],
      }),
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('GeneralLedgerExportService', () => {
  let service: GeneralLedgerExportService;
  let generalLedgerService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    generalLedgerService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneralLedgerExportService,
        { provide: GeneralLedgerService, useValue: generalLedgerService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(GeneralLedgerExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════
  // 1. toPdf
  // ═══════════════════════════════════════════════════════════

  describe('toPdf', () => {
    it('should call generate + pdfExporter.render with landscape=true', async () => {
      const report = mockReport();
      const pdf = Buffer.from('pdf');
      generalLedgerService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(pdf);

      const filters = { fromDate: '2026-01-01', toDate: '2026-12-31' };
      const result = await service.toPdf(filters, COMPANY_ID, USER_ID);

      expect(generalLedgerService.generate).toHaveBeenCalledWith(
        filters,
        COMPANY_ID,
        USER_ID,
      );

      // فحص إلزامي: landscape
      const renderArgs = pdfExporter.render.mock.calls[0];
      expect(renderArgs[2]).toEqual({ landscape: true });

      expect(result).toBe(pdf);
    });

    it('should generate 2 base sections in All Mode', async () => {
      generalLedgerService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      // ملخص + فهرس + تفاصيل
      expect(sections.length).toBeGreaterThanOrEqual(2);
      expect(sections[0].heading).toBe('الملخص التنفيذي');
      expect(sections[1].heading).toBe('فهرس الحسابات');
    });

    it('should show green balance KPI when isBalanced=true', async () => {
      generalLedgerService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const balanceKpi = sections[0].kpis?.find((k) =>
        k.label.includes('التوازن'),
      );
      expect(balanceKpi?.value).toBe('متوازن ✓');
      expect(balanceKpi?.color).toBe('success');
    });

    it('should show red balance KPI + note when unbalanced', async () => {
      const report = mockReport({
        summary: {
          ...mockReport().summary,
          isBalanced: false,
          difference: 500,
        },
      });
      generalLedgerService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const balanceKpi = sections[0].kpis?.find((k) =>
        k.label.includes('التوازن'),
      );
      expect(balanceKpi?.value).toBe('غير متوازن');
      expect(balanceKpi?.color).toBe('danger');
      expect(sections[0].note).toContain('500.00');
    });

    it('should include balance status in index table', async () => {
      generalLedgerService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      expect(sections[1].tables?.[0].columns).toHaveLength(7);
    });

    it('should generate per-account detail sections (All Mode)', async () => {
      generalLedgerService.generate.mockResolvedValue(mockReport());
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      // يجب أن يكون هناك sections بعد الفهرس (تفاصيل الحسابات)
      expect(sections.length).toBeGreaterThan(2);
      // العناوين تحتوي على أكواد الحسابات
      const detailSections = sections.slice(2);
      expect(detailSections.some((s) => s.heading?.includes('1101'))).toBe(true);
    });

    it('should limit entries per account in PDF (50 max)', async () => {
      const manyEntries = Array.from({ length: 120 }, (_, i) =>
        mockEntry({ journalLineId: `l-${i}`, entryNumber: `JV-${i}` }),
      );
      const report = mockReport({
        accounts: [
          mockAccount({
            entries: manyEntries,
            totalEntries: 120,
            displayedEntries: 120,
          }),
        ],
      });
      generalLedgerService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toPdf({}, COMPANY_ID, USER_ID);

      const [, sections] = pdfExporter.render.mock.calls[0] as [
        unknown,
        PdfSection[],
      ];
      const detailSection = sections.find((s) =>
        s.heading?.includes('1101'),
      );
      expect(detailSection?.tables?.[0].rows).toHaveLength(50);
    });

    it('should propagate errors from generate', async () => {
      generalLedgerService.generate.mockRejectedValue(new Error('DB error'));

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
      generalLedgerService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(xlsx);

      const result = await service.toExcel({}, COMPANY_ID, USER_ID);

      expect(generalLedgerService.generate).toHaveBeenCalledWith(
        {},
        COMPANY_ID,
        USER_ID,
      );
      expect(result).toBe(xlsx);
    });

    it('should generate exactly 3 sheets', async () => {
      generalLedgerService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      expect(sheets).toHaveLength(3);
      expect(sheets.map((s) => s.name)).toEqual([
        'الملخص',
        'فهرس الحسابات',
        'القيود التفصيلية',
      ]);
    });

    it('should include 10 columns in index sheet', async () => {
      generalLedgerService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const indexSheet = sheets.find((s) => s.name === 'فهرس الحسابات');
      expect(indexSheet?.columns).toHaveLength(10);
    });

    it('should flatten entries in detail sheet', async () => {
      const report = mockReport({
        accounts: [
          mockAccount({
            entries: [
              mockEntry({ journalLineId: 'l1' }),
              mockEntry({ journalLineId: 'l2' }),
              mockEntry({ journalLineId: 'l3' }),
            ],
          }),
        ],
      });
      generalLedgerService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const detailSheet = sheets.find((s) => s.name === 'القيود التفصيلية');
      expect(detailSheet?.rows).toHaveLength(3);
      // الصف يحتوي على accountCode
      expect((detailSheet?.rows[0] as any).accountCode).toBe('1101');
    });

    it('should include counterparty formatted as عميل/مورد', async () => {
      const report = mockReport({
        accounts: [
          mockAccount({
            entries: [
              mockEntry({
                counterparty: {
                  type: 'CUSTOMER',
                  id: 'c1',
                  name: 'شركة الأمل',
                },
              }),
              mockEntry({
                counterparty: {
                  type: 'SUPPLIER',
                  id: 's1',
                  name: 'شركة النيل',
                },
              }),
              mockEntry({ counterparty: { type: 'NONE' } }),
            ],
          }),
        ],
      });
      generalLedgerService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const detailSheet = sheets.find((s) => s.name === 'القيود التفصيلية');
      const rows = detailSheet?.rows as any[];

      expect(rows[0].counterpartyLabel).toBe('عميل: شركة الأمل');
      expect(rows[1].counterpartyLabel).toBe('مورد: شركة النيل');
      expect(rows[2].counterpartyLabel).toBe('—');
    });

    it('should include balance status in summary sheet', async () => {
      generalLedgerService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockResolvedValue(Buffer.from(''));

      await service.toExcel({}, COMPANY_ID, USER_ID);

      const [, sheets] = excelExporter.render.mock.calls[0] as [
        unknown,
        ExcelSheet[],
      ];
      const summarySheet = sheets.find((s) => s.name === 'الملخص');
      const balanceRow = summarySheet?.rows.find(
        (r: any) => r.label === 'حالة التوازن',
      );
      expect(balanceRow).toBeDefined();
      expect((balanceRow as any).value).toBe('متوازن ✓');
    });

    it('should propagate errors from excelExporter', async () => {
      generalLedgerService.generate.mockResolvedValue(mockReport());
      excelExporter.render.mockRejectedValue(new Error('ExcelJS failed'));

      await expect(service.toExcel({}, COMPANY_ID, USER_ID)).rejects.toThrow(
        'ExcelJS failed',
      );
    });
  });
});
