class MockNotFoundException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'NotFoundException';
  }
}

class MockForbiddenException extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = 'ForbiddenException';
  }
}

jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: any) => target,
  NotFoundException: MockNotFoundException,
  ForbiddenException: MockForbiddenException,
  UnauthorizedException: class extends Error {},
  BadRequestException: class extends Error {},
}));

jest.mock('@nestjs/jwt', () => ({
  JwtService: class {},
}));

import { CompaniesService } from './companies.service';
import { AuthenticatedUser } from '../auth/security.policy';

describe('CompaniesService', () => {
  const superAdmin: AuthenticatedUser = {
    id: 'user-sa',
    companyId: 'comp-a',
    branchId: null,
    role: 'SUPER_ADMIN' as any,
    roles: ['SUPER_ADMIN' as any],
  };

  const companyAdminA: AuthenticatedUser = {
    id: 'user-ca-a',
    companyId: 'comp-a',
    branchId: 'branch-a1',
    role: 'COMPANY_ADMIN' as any,
    roles: ['COMPANY_ADMIN' as any],
  };

  const cashierA: AuthenticatedUser = {
    id: 'user-cashier-a',
    companyId: 'comp-a',
    branchId: 'branch-a1',
    role: 'CASHIER' as any,
    roles: ['CASHIER' as any],
  };

  it('SUPER_ADMIN sees all companies (A & B) with batch businessType resolution (no N+1)', async () => {
    const prisma: any = {
      company: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'comp-a', name: 'شركة المدار للأزياء', logoUrl: '/logo-a.png' },
          { id: 'comp-b', name: 'سوبرماركت النيل', logoUrl: '/logo-b.png' },
          { id: 'comp-c', name: 'صيدلية الشفاء', logoUrl: '/logo-c.png' },
        ]),
        count: jest.fn().mockResolvedValue(3),
      },
      companySetting: {
        findMany: jest.fn().mockResolvedValue([
          { companyId: 'comp-a', key: 'businessType', value: 'CLOTHING' },
          { companyId: 'comp-b', key: 'BUSINESS_TYPE', value: 'supermarket' },
        ]),
      },
    };

    const service = new CompaniesService(prisma);
    const res = await service.findAll({ page: 1, limit: 20 }, superAdmin);

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
    expect(prisma.companySetting.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.companySetting.findMany).toHaveBeenCalledWith({
      where: {
        companyId: { in: ['comp-a', 'comp-b', 'comp-c'] },
        key: { in: ['businessType', 'BUSINESS_TYPE'] },
      },
      select: {
        companyId: true,
        key: true,
        value: true,
      },
    });

    expect(res.items).toEqual([
      { id: 'comp-a', name: 'شركة المدار للأزياء', logoUrl: '/logo-a.png', businessType: 'CLOTHING' },
      { id: 'comp-b', name: 'سوبرماركت النيل', logoUrl: '/logo-b.png', businessType: 'SUPERMARKET' },
      { id: 'comp-c', name: 'صيدلية الشفاء', logoUrl: '/logo-c.png', businessType: 'PHARMACY' },
    ]);
  });

  it('non-SUPER_ADMIN (COMPANY_ADMIN / CASHIER of A) findAll scopes strictly to actor.companyId and never returns B', async () => {
    const prisma: any = {
      company: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'comp-a', name: 'شركة أ', logoUrl: '/logo-a.png' },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      companySetting: {
        findMany: jest.fn().mockResolvedValue([
          { companyId: 'comp-a', key: 'businessType', value: 'CLOTHING' },
        ]),
      },
    };

    const service = new CompaniesService(prisma);

    for (const actor of [companyAdminA, cashierA]) {
      const res = await service.findAll({ search: 'شركة', page: 1, limit: 20 }, actor);
      expect(prisma.company.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'comp-a',
          }),
        }),
      );
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toEqual({
        id: 'comp-a',
        name: 'شركة أ',
        logoUrl: '/logo-a.png',
        businessType: 'CLOTHING',
      });
    }
  });

  it('non-SUPER_ADMIN (COMPANY_ADMIN / CASHIER of A) findOne(B) fails with ForbiddenException without querying or leaking B', async () => {
    const prisma: any = {
      company: {
        findUnique: jest.fn(),
      },
      companySetting: {
        findMany: jest.fn(),
      },
    };

    const service = new CompaniesService(prisma);

    await expect(service.findOne('comp-b', companyAdminA)).rejects.toThrow(MockForbiddenException);
    await expect(service.findOne('comp-b', cashierA)).rejects.toThrow(MockForbiddenException);
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    expect(prisma.companySetting.findMany).not.toHaveBeenCalled();
  });

  it('COMPANY_ADMIN of A can findOne(A) and update(A), but cannot update(B), remove(A/B), or create a new company', async () => {
    const prisma: any = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'comp-a',
          name: 'شركة أ',
          branches: [],
        }),
        update: jest.fn().mockResolvedValue({
          id: 'comp-a',
          name: 'شركة أ المحدثة',
        }),
        create: jest.fn(),
        delete: jest.fn(),
      },
      companySetting: {
        findMany: jest.fn().mockResolvedValue([
          { companyId: 'comp-a', key: 'businessType', value: 'TRADING' },
        ]),
      },
    };

    const service = new CompaniesService(prisma);

    const ownCompany = await service.findOne('comp-a', companyAdminA);
    expect(ownCompany.businessType).toBe('TRADING');

    const updated = await service.update('comp-a', { name: 'شركة أ المحدثة' } as any, companyAdminA);
    expect(updated.name).toBe('شركة أ المحدثة');

    // Cannot update B
    await expect(
      service.update('comp-b', { name: 'اختراق ب' } as any, companyAdminA),
    ).rejects.toThrow(MockForbiddenException);

    // Cannot create new tenant
    await expect(
      service.create({ name: 'شركة جديدة' } as any, companyAdminA),
    ).rejects.toThrow(MockForbiddenException);
    expect(prisma.company.create).not.toHaveBeenCalled();

    // Cannot remove A or B
    await expect(service.remove('comp-a', companyAdminA)).rejects.toThrow(MockForbiddenException);
    await expect(service.remove('comp-b', companyAdminA)).rejects.toThrow(MockForbiddenException);
    expect(prisma.company.delete).not.toHaveBeenCalled();

    // CASHIER cannot even update own company A
    await expect(
      service.update('comp-a', { name: 'تعديل كاشير' } as any, cashierA),
    ).rejects.toThrow(MockForbiddenException);
  });
});
