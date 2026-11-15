class MockUnauthorizedException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'UnauthorizedException';
  }
}
class MockBadRequestException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'BadRequestException';
  }
}
class MockNotFoundException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'NotFoundException';
  }
}

jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: any) => target,
  UnauthorizedException: MockUnauthorizedException,
  BadRequestException: MockBadRequestException,
  NotFoundException: MockNotFoundException,
}));

jest.mock('@nestjs/jwt', () => ({
  JwtService: class {},
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { AuthService, normalizeBusinessType } from './auth.service';

describe('AuthService', () => {
  const makeService = (overrides?: {
    user?: any;
    settings?: Array<{ key: string; value: string }>;
  }) => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          overrides?.user ?? {
            id: 'user-1',
            username: 'cashier1',
            name: 'كاشير أول',
            email: 'cashier1@example.com',
            phone: '0912345678',
            passwordHash: '$2a$12$abcdefghijklmnopqrstuv',
            isActive: true,
            companyId: 'comp-1',
            branchId: 'branch-1',
            role: Role.CASHIER,
            company: {
              id: 'comp-1',
              name: 'معرض الأناقة للملابس',
              logoUrl: '/uploads/elegance-logo.png',
            },
            branch: {
              id: 'branch-1',
              name: 'الفرع الرئيسي',
            },
          },
        ),
      },
      companySetting: {
        findMany: jest.fn().mockResolvedValue(overrides?.settings ?? []),
      },
    };

    const jwtService: any = {
      sign: jest.fn().mockReturnValue('signed-jwt-token'),
    };

    return {
      service: new AuthService(prisma, jwtService),
      prisma,
      jwtService,
    };
  };

  beforeEach(() => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  it('normalizes businessType allowlist values and falls back to PHARMACY', () => {
    expect(normalizeBusinessType('CLOTHING')).toBe('CLOTHING');
    expect(normalizeBusinessType('supermarket')).toBe('SUPERMARKET');
    expect(normalizeBusinessType('TRADING')).toBe('TRADING');
    expect(normalizeBusinessType('PHARMACY')).toBe('PHARMACY');
    expect(normalizeBusinessType('UNKNOWN_ACTIVITY')).toBe('PHARMACY');
    expect(normalizeBusinessType(null)).toBe('PHARMACY');
  });

  it('returns companyName, companyLogoUrl, and normalized CLOTHING businessType on login', async () => {
    const { service, prisma, jwtService } = makeService({
      settings: [{ key: 'businessType', value: 'clothing' }],
    });

    const result = await service.login({
      username: 'cashier1',
      password: 'ValidPassword123!',
    });

    expect(prisma.companySetting.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'comp-1',
        key: { in: ['businessType', 'BUSINESS_TYPE'] },
      },
      select: { key: true, value: true },
    });
    expect(result.user.companyName).toBe('معرض الأناقة للملابس');
    expect(result.user.companyLogoUrl).toBe('/uploads/elegance-logo.png');
    expect(result.user.businessType).toBe('CLOTHING');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'comp-1',
        companyName: 'معرض الأناقة للملابس',
        companyLogoUrl: '/uploads/elegance-logo.png',
        businessType: 'CLOTHING',
      }),
    );
  });

  it('falls back to PHARMACY when companySetting has no businessType or an invalid value', async () => {
    const { service } = makeService({
      settings: [{ key: 'businessType', value: 'RESTAURANT_UNSUPPORTED' }],
    });

    const result = await service.login({
      username: 'cashier1',
      password: 'ValidPassword123!',
    });

    expect(result.user.businessType).toBe('PHARMACY');
  });
});
