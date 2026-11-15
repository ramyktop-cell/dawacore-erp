jest.mock('@nestjs/common', () => ({
  Controller: () => (target: any) => target,
  Get: () => () => {},
  Post: () => () => {},
  Put: () => () => {},
  Delete: () => () => {},
  Body: () => () => {},
  Param: () => () => {},
  Query: () => () => {},
  SetMetadata: () => () => {},
  createParamDecorator: () => () => () => {},
  Injectable: () => (target: any) => target,
}));

jest.mock('@nestjs/swagger', () => ({
  ApiTags: () => (target: any) => target,
  ApiOperation: () => () => {},
  ApiResponse: () => () => {},
  ApiQuery: () => () => {},
}));

jest.mock('@nestjs/jwt', () => ({
  JwtService: class {},
}));

import { CompaniesController } from './companies.controller';
import { AuthenticatedUser } from '../auth/security.policy';

describe('CompaniesController', () => {
  const actor: AuthenticatedUser = {
    id: 'u-1',
    companyId: 'comp-a',
    branchId: 'br-1',
    role: 'COMPANY_ADMIN' as any,
    roles: ['COMPANY_ADMIN' as any],
  };

  it('forwards authenticated actor to service methods (create, findAll, findOne, update, remove)', async () => {
    const service: any = {
      create: jest.fn().mockResolvedValue({ id: 'comp-new' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
      findOne: jest.fn().mockResolvedValue({ id: 'comp-a' }),
      update: jest.fn().mockResolvedValue({ id: 'comp-a' }),
      remove: jest.fn().mockResolvedValue({ id: 'comp-a' }),
    };

    const controller = new CompaniesController(service);

    await controller.create({ name: 'New Co' } as any, actor);
    expect(service.create).toHaveBeenCalledWith({ name: 'New Co' }, actor);

    await controller.findAll(actor, 'بحث', '2', '10');
    expect(service.findAll).toHaveBeenCalledWith({ search: 'بحث', page: 2, limit: 10 }, actor);

    await controller.findOne('comp-a', actor);
    expect(service.findOne).toHaveBeenCalledWith('comp-a', actor);

    await controller.update('comp-a', { name: 'Updated' } as any, actor);
    expect(service.update).toHaveBeenCalledWith('comp-a', { name: 'Updated' }, actor);

    await controller.remove('comp-a', actor);
    expect(service.remove).toHaveBeenCalledWith('comp-a', actor);
  });
});
