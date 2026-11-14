import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SettingsController } from './settings.controller';
import { SettingsService } from '../services/settings.service';

const COMPANY_ID = '11111111-0000-4000-8000-000000000001';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: any;

  beforeEach(async () => {
    service = {
      getAll: jest.fn().mockResolvedValue([]),
      getByCategory: jest.fn().mockResolvedValue({}),
      getValue: jest.fn().mockResolvedValue('value'),
      bulkUpdate: jest.fn().mockResolvedValue([]),
      updateOne: jest.fn().mockResolvedValue({ key: 'TAX', value: '15' }),
      seedDefaults: jest.fn().mockResolvedValue(10),
      resetDefaults: jest.fn().mockResolvedValue({ success: true, seededCount: 10 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should throw UnauthorizedException if req.user has no companyId', async () => {
    await expect(controller.getAll({ user: null })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should call getAll with companyId', async () => {
    const res = await controller.getAll({ user: { companyId: COMPANY_ID } });
    expect(service.getAll).toHaveBeenCalledWith(COMPANY_ID);
    expect(res).toEqual([]);
  });

  it('should call getByCategory with companyId', async () => {
    const res = await controller.getByCategory({ user: { companyId: COMPANY_ID } });
    expect(service.getByCategory).toHaveBeenCalledWith(COMPANY_ID);
  });

  it('should call updateOne', async () => {
    await controller.updateOne('TAX', { value: '15' }, { user: { companyId: COMPANY_ID } });
    expect(service.updateOne).toHaveBeenCalledWith(COMPANY_ID, 'TAX', '15');
  });

  it('should call resetDefaults', async () => {
    const res = await controller.resetDefaults({ user: { companyId: COMPANY_ID } });
    expect(service.resetDefaults).toHaveBeenCalledWith(COMPANY_ID);
    expect(res.success).toBe(true);
  });
});
