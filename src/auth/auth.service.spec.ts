class MockUnauthorizedException extends Error {}
class MockBadRequestException extends Error {}
class MockNotFoundException extends Error {}

jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  UnauthorizedException: MockUnauthorizedException,
  BadRequestException: MockBadRequestException,
  NotFoundException: MockNotFoundException,
}));

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

jest.mock('@prisma/client', () => ({
  Role: {
    SUPER_ADMIN: 'SUPER_ADMIN',
    COMPANY_ADMIN: 'COMPANY_ADMIN',
    BRANCH_MANAGER: 'BRANCH_MANAGER',
  },
}));

import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService tenant-local usernames', () => {
  let passwordHash: string;
  let otherHash: string;
  let prisma: any;
  let service: AuthService;

  const user = (companyId: string, companyName: string, hash = passwordHash) => ({
    id: `user-${companyId}`,
    companyId,
    branchId: null,
    username: 'admin',
    name: `Admin ${companyName}`,
    email: null,
    phone: null,
    passwordHash: hash,
    role: 'COMPANY_ADMIN',
    isActive: true,
    company: { id: companyId, name: companyName },
    branch: null,
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('CorrectPassword!', 4);
    otherHash = await bcrypt.hash('OtherPassword!', 4);
  });

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new AuthService(prisma, { sign: jest.fn().mockReturnValue('jwt-token') } as any);
  });

  it('logs in directly when only one active credential matches', async () => {
    prisma.user.findMany.mockResolvedValue([user('company-a', 'Company A')]);
    const result: any = await service.login({ username: 'admin', password: 'CorrectPassword!' });
    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.companyId).toBe('company-a');
  });

  it('returns only password-matching companies when credentials are ambiguous', async () => {
    prisma.user.findMany.mockResolvedValue([
      user('company-a', 'Company A'),
      user('company-b', 'Company B'),
      user('company-c', 'Company C', otherHash),
    ]);
    const result: any = await service.login({ username: 'admin', password: 'CorrectPassword!' });
    expect(result).toEqual({
      requiresCompanySelection: true,
      companies: [
        { id: 'company-a', name: 'Company A' },
        { id: 'company-b', name: 'Company B' },
      ],
    });
  });

  it('restricts a selected login to the supplied company', async () => {
    prisma.user.findMany.mockResolvedValue([user('company-b', 'Company B')]);
    const result: any = await service.login({
      username: 'admin',
      password: 'CorrectPassword!',
      companyId: 'company-b',
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'company-b' }),
    }));
    expect(result.user.companyId).toBe('company-b');
  });

  it('uses the generic rejection for a wrong selected company or password', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await expect(service.login({
      username: 'admin',
      password: 'WrongPassword!',
      companyId: 'company-b',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires company selection before changing an ambiguous password', async () => {
    prisma.user.findMany.mockResolvedValue([
      user('company-a', 'Company A'),
      user('company-b', 'Company B'),
    ]);
    const result: any = await service.changePassword({
      username: 'admin',
      currentPassword: 'CorrectPassword!',
      newPassword: 'NewCorrectPassword!',
    });
    expect(result.requiresCompanySelection).toBe(true);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('changes only the selected tenant account', async () => {
    prisma.user.findMany.mockResolvedValue([user('company-a', 'Company A')]);
    await service.changePassword({
      username: 'admin',
      currentPassword: 'CorrectPassword!',
      newPassword: 'NewCorrectPassword!',
      companyId: 'company-a',
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'user-company-a' }),
    }));
  });
});
