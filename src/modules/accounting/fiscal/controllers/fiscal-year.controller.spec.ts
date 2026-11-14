import { Test, TestingModule } from '@nestjs/testing';
import { FiscalYearController } from './fiscal-year.controller';
import { FiscalYearService } from '../services/fiscal-year.service';
import { FiscalYearStatus } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

describe('FiscalYearController', () => {
  let controller: FiscalYearController;
  let service: FiscalYearService;

  const mockCompanyId = 'comp-1111-1111-1111-111111111111';
  const mockUserId = 'user-2222-2222-2222-222222222222';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FiscalYearController],
      providers: [
        {
          provide: FiscalYearService,
          useValue: {
            listFiscalYears: jest.fn(),
            getFiscalYear: jest.fn(),
            openFiscalYear: jest.fn(),
            closeFiscalYear: jest.fn(),
            reopenFiscalYear: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FiscalYearController>(FiscalYearController);
    service = module.get<FiscalYearService>(FiscalYearService);
  });

  it('يجب جلب قائمة السنوات المالية عبر list', async () => {
    (service.listFiscalYears as jest.Mock).mockResolvedValue([
      {
        id: 'fy-2026',
        year: 2026,
        status: FiscalYearStatus.OPEN,
      },
    ]);

    const req = { user: { companyId: mockCompanyId, id: mockUserId } };
    const result = await controller.list(req);

    expect(result).toHaveLength(1);
    expect(service.listFiscalYears).toHaveBeenCalledWith(mockCompanyId);
  });

  it('يجب رمي UnauthorizedException إذا كانت جلسة المستخدم لا تحتوي على companyId', async () => {
    const req = { user: {} };
    await expect(controller.list(req)).rejects.toThrow(UnauthorizedException);
  });

  it('يجب استدعاء openFiscalYear مع بيانات الطلب الصحيحة', async () => {
    (service.openFiscalYear as jest.Mock).mockResolvedValue({
      fiscalYear: { year: 2026 },
      carryForward: null,
    });

    const req = { user: { companyId: mockCompanyId, id: mockUserId } };
    const result = await controller.open({ year: 2026 }, req);

    expect(result.fiscalYear.year).toBe(2026);
    expect(service.openFiscalYear).toHaveBeenCalledWith(
      { year: 2026 },
      mockCompanyId,
      mockUserId,
    );
  });

  it('يجب استدعاء closeFiscalYear مع خيارات الإقفال أو Dry-Run', async () => {
    (service.closeFiscalYear as jest.Mock).mockResolvedValue({
      year: 2026,
      netIncome: 5000,
    });

    const req = { user: { companyId: mockCompanyId, id: mockUserId } };
    const result = await controller.close({ year: 2026, dryRun: true }, req);

    expect(result).toBeDefined();
    expect(service.closeFiscalYear).toHaveBeenCalledWith(
      { year: 2026, dryRun: true },
      mockCompanyId,
      mockUserId,
    );
  });
});
