import { Test, TestingModule } from '@nestjs/testing';
import { FiscalYearService } from './fiscal-year.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { FiscalYearStatus, Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { SettingsService } from 'src/modules/settings';

describe('FiscalYearService', () => {
  let service: FiscalYearService;
  let prisma: PrismaService;
  let settingsService: any;

  const mockCompanyId = 'comp-1111-1111-1111-111111111111';
  const mockUserId = 'user-2222-2222-2222-222222222222';

  beforeEach(async () => {
    settingsService = {
      getValue: jest.fn().mockResolvedValue('3-1-02'),
      getNumberValue: jest.fn().mockResolvedValue(1),
      getBooleanValue: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalYearService,
        {
          provide: SettingsService,
          useValue: settingsService,
        },
        {
          provide: PrismaService,
          useValue: {
            fiscalYear: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            account: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            journalLine: {
              groupBy: jest.fn(),
              deleteMany: jest.fn(),
            },
            journalEntry: {
              create: jest.fn(),
              delete: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
            $transaction: jest.fn((cb) => cb(prisma)),
          },
        },
      ],
    }).compile();

    service = module.get<FiscalYearService>(FiscalYearService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('listFiscalYears', () => {
    it('يجب جلب قائمة السنوات المالية مرتبة تنازلياً', async () => {
      (prisma.fiscalYear.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'fy-2026',
          year: 2026,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T23:59:59.999Z'),
          status: FiscalYearStatus.OPEN,
          openedAt: new Date(),
          openedBy: mockUserId,
          closedAt: null,
          closedBy: null,
          closingEntryId: null,
          openingEntryId: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const list = await service.listFiscalYears(mockCompanyId);
      expect(list).toHaveLength(1);
      expect(list[0].year).toBe(2026);
      expect(list[0].status).toBe(FiscalYearStatus.OPEN);
    });
  });

  describe('openFiscalYear', () => {
    it('يجب رمي ConflictException إذا كانت السنة موجودة مسبقاً', async () => {
      (prisma.fiscalYear.findUnique as jest.Mock).mockResolvedValue({
        id: 'fy-2026',
        year: 2026,
      });

      await expect(
        service.openFiscalYear({ year: 2026 }, mockCompanyId, mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('يجب فتح سنة مالية جديدة بنجاح وترحيل الأرصدة إذا كانت السنة السابقة مقفلة', async () => {
      (prisma.fiscalYear.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // year exists check
        .mockResolvedValueOnce({
          id: 'fy-2025',
          year: 2025,
          status: FiscalYearStatus.CLOSED,
        }); // prevYear check

      (prisma.fiscalYear.create as jest.Mock).mockResolvedValue({
        id: 'fy-2026',
        year: 2026,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.999Z'),
        status: FiscalYearStatus.OPEN,
        openedAt: new Date(),
        openedBy: mockUserId,
        closedAt: null,
        closedBy: null,
        closingEntryId: null,
        openingEntryId: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (prisma.account.findMany as jest.Mock).mockResolvedValue([
        { id: 'acc-cash', code: '1-1-01', name: 'الصندوق', type: 'ASSET' },
      ]);

      (prisma.journalLine.groupBy as jest.Mock).mockResolvedValue([
        {
          accountId: 'acc-cash',
          _sum: { debit: new Prisma.Decimal(1000), credit: new Prisma.Decimal(200) },
        },
      ]);

      (prisma.journalEntry.create as jest.Mock).mockResolvedValue({
        id: 'opn-entry-1',
        entryNumber: 'OPN-2026',
      });

      (prisma.fiscalYear.update as jest.Mock).mockResolvedValue({});

      const result = await service.openFiscalYear(
        { year: 2026 },
        mockCompanyId,
        mockUserId,
      );

      expect(result.fiscalYear.year).toBe(2026);
      expect(result.carryForward?.openingEntryId).toBe('opn-entry-1');
      expect(result.carryForward?.accountsAffected).toBe(1);
    });
  });

  describe('closeFiscalYear', () => {
    it('يجب إجراء معاينة Dry-Run لقيد الإقفال دون تعديل قاعدة البيانات', async () => {
      (prisma.fiscalYear.findUnique as jest.Mock).mockResolvedValue({
        id: 'fy-2026',
        year: 2026,
        endDate: new Date('2026-12-31T23:59:59.999Z'),
        status: FiscalYearStatus.OPEN,
      });

      (prisma.account.findFirst as jest.Mock).mockResolvedValue({
        id: 'acc-retained',
        code: '3-2-01',
        name: 'الأرباح المحتجزة',
      });

      (prisma.account.findMany as jest.Mock).mockResolvedValue([
        { id: 'acc-rev', code: '4-1-01', name: 'المبيعات', type: 'REVENUE' },
        { id: 'acc-exp', code: '5-1-01', name: 'المصروفات', type: 'EXPENSE' },
      ]);

      (prisma.journalLine.groupBy as jest.Mock).mockResolvedValue([
        {
          accountId: 'acc-rev',
          _sum: { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(5000) },
        },
        {
          accountId: 'acc-exp',
          _sum: { debit: new Prisma.Decimal(3000), credit: new Prisma.Decimal(0) },
        },
      ]);

      const preview: any = await service.closeFiscalYear(
        { year: 2026, dryRun: true },
        mockCompanyId,
        mockUserId,
      );

      expect(preview.year).toBe(2026);
      expect(preview.totalRevenue).toBe(5000);
      expect(preview.totalExpense).toBe(3000);
      expect(preview.netIncome).toBe(2000);
      expect(preview.totals.isBalanced).toBe(true);
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });
  });
});
