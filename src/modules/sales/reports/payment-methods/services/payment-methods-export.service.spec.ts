import { Test, TestingModule } from '@nestjs/testing';

import { PaymentMethodsExportService } from './payment-methods-export.service';
import { PaymentMethodsService } from './payment-methods.service';
import { PdfExporter, ExcelExporter } from 'src/shared/report-kit';
import type { PdfSection, ExcelSheet } from 'src/shared/report-kit';
import type { PaymentMethodsResponse } from '../interfaces/payment-methods.interface';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';
const USER_ID = '97632ada-b26d-4415-ba97-baafbbfc2fe5';

function mockReport(
  overrides: Partial<PaymentMethodsResponse> = {},
): PaymentMethodsResponse {
  return {
    meta: {
      title: 'تقرير طرق الدفع والتحصيل',
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
      activeMethodsCount: 2,
      totalInvoicesCount: 15,
      totalGrossAmount: 12000,
      totalReturnsAmount: 500,
      totalNetAmount: 11000,
      overallAvgTicket: 785.71,
      mostUsedMethod: {
        method: 'CASH',
        methodLabel: 'نقدي',
        count: 10,
      },
      topMethodByAmount: {
        method: 'CASH',
        methodLabel: 'نقدي',
        amount: 7000,
      },
    },
    methods: [
      {
        method: 'CASH',
        methodLabel: 'نقدي',
        rank: 1,
        totalCount: 10,
        completedCount: 9,
        returnedCount: 1,
        grossAmount: 7500,
        returnsAmount: 500,
        netAmount: 7000,
        percentage: 63.64,
        avgTicket: 777.78,
        returnRate: 6.67,
      },
      {
        method: 'CARD',
        methodLabel: 'بطاقة / شبكة',
        rank: 2,
        totalCount: 5,
        completedCount: 5,
        returnedCount: 0,
        grossAmount: 4500,
        returnsAmount: 0,
        netAmount: 4000,
        percentage: 36.36,
        avgTicket: 800,
        returnRate: 0,
      },
    ],
    dailyTrend: [
      {
        date: '2026-09-01',
        totalAmount: 5000,
        totalCount: 6,
        byMethod: [
          { method: 'CASH', methodLabel: 'نقدي', amount: 3500, count: 4 },
          { method: 'CARD', methodLabel: 'بطاقة / شبكة', amount: 1500, count: 2 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('PaymentMethodsExportService', () => {
  let service: PaymentMethodsExportService;
  let paymentService: { generate: jest.Mock };
  let pdfExporter: { render: jest.Mock };
  let excelExporter: { render: jest.Mock };

  beforeEach(async () => {
    paymentService = { generate: jest.fn() };
    pdfExporter = { render: jest.fn() };
    excelExporter = { render: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodsExportService,
        { provide: PaymentMethodsService, useValue: paymentService },
        { provide: PdfExporter, useValue: pdfExporter },
        { provide: ExcelExporter, useValue: excelExporter },
      ],
    }).compile();

    service = module.get(PaymentMethodsExportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('toPdf', () => {
    it('should generate 3 sections with top method and most used KPIs', async () => {
      const report = mockReport();
      paymentService.generate.mockResolvedValue(report);
      pdfExporter.render.mockResolvedValue(Buffer.from('pdf'));

      const result = await service.toPdf({}, COMPANY_ID, USER_ID);

      expect(paymentService.generate).toHaveBeenCalledTimes(1);
      expect(pdfExporter.render).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();

      const [, sections] = pdfExporter.render.mock.calls[0] as [unknown, PdfSection[]];
      expect(sections).toHaveLength(3);
      expect(sections[0].heading).toBe('الملخص التنفيذي');
      const topKpi = sections[0].kpis?.find((k) => k.label.includes('أعلى طريقة'));
      expect(topKpi?.value).toBe('نقدي');
    });
  });

  describe('toExcel', () => {
    it('should generate 3 sheets with full details', async () => {
      const report = mockReport();
      paymentService.generate.mockResolvedValue(report);
      excelExporter.render.mockResolvedValue(Buffer.from('excel'));

      const result = await service.toExcel({}, COMPANY_ID, USER_ID);

      expect(excelExporter.render).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();

      const [, sheets] = excelExporter.render.mock.calls[0] as [unknown, ExcelSheet[]];
      expect(sheets).toHaveLength(3);
      expect(sheets.map((s) => s.name)).toEqual([
        'الملخص',
        'طرق الدفع',
        'الاتجاه اليومي',
      ]);
    });
  });
});
