import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';
import { normalizeBusinessType, SupportedBusinessType } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/security.policy';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  private isSuperAdmin(actor?: AuthenticatedUser | null): boolean {
    if (!actor) return false;
    return (
      actor.role === 'SUPER_ADMIN' ||
      (Array.isArray(actor.roles) && actor.roles.includes('SUPER_ADMIN' as any))
    );
  }

  private isCompanyAdmin(actor?: AuthenticatedUser | null): boolean {
    if (!actor) return false;
    return (
      actor.role === 'COMPANY_ADMIN' ||
      (Array.isArray(actor.roles) && actor.roles.includes('COMPANY_ADMIN' as any))
    );
  }

  private assertAuthenticated(actor?: AuthenticatedUser | null): AuthenticatedUser {
    if (!actor || (!this.isSuperAdmin(actor) && !actor.companyId)) {
      throw new ForbiddenException('صلاحية الوصول للشركة غير متاحة');
    }
    return actor;
  }

  private assertSuperAdmin(
    actor?: AuthenticatedUser | null,
    message = 'هذه العملية متاحة لمدير النظام العام فقط',
  ): AuthenticatedUser {
    const user = this.assertAuthenticated(actor);
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenException(message);
    }
    return user;
  }

  private assertCanReadCompany(
    actor: AuthenticatedUser | undefined | null,
    targetCompanyId: string,
  ): AuthenticatedUser {
    const user = this.assertAuthenticated(actor);
    if (this.isSuperAdmin(user)) {
      return user;
    }
    if (user.companyId !== targetCompanyId) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذه الشركة');
    }
    return user;
  }

  private assertCanUpdateCompany(
    actor: AuthenticatedUser | undefined | null,
    targetCompanyId: string,
  ): AuthenticatedUser {
    const user = this.assertAuthenticated(actor);
    if (this.isSuperAdmin(user)) {
      return user;
    }
    if (!this.isCompanyAdmin(user) || user.companyId !== targetCompanyId) {
      throw new ForbiddenException('لا تملك صلاحية تعديل بيانات هذه الشركة');
    }
    return user;
  }

  private async resolveBusinessTypesMap(
    companyIds: string[],
  ): Promise<Map<string, SupportedBusinessType>> {
    const result = new Map<string, SupportedBusinessType>();
    if (!companyIds.length || !this.prisma.companySetting) {
      return result;
    }

    const settings = await this.prisma.companySetting.findMany({
      where: {
        companyId: { in: companyIds },
        key: { in: ['businessType', 'BUSINESS_TYPE'] },
      },
      select: {
        companyId: true,
        key: true,
        value: true,
      },
    });

    const grouped = new Map<string, { exact?: string; fallback?: string }>();
    for (const row of settings) {
      const current = grouped.get(row.companyId) || {};
      if (row.key === 'businessType') {
        current.exact = row.value;
      } else if (row.key === 'BUSINESS_TYPE') {
        current.fallback = row.value;
      }
      grouped.set(row.companyId, current);
    }

    for (const id of companyIds) {
      const entry = grouped.get(id);
      result.set(id, normalizeBusinessType(entry?.exact ?? entry?.fallback ?? null));
    }

    return result;
  }

  async create(dto: CreateCompanyDto, actor: AuthenticatedUser) {
    this.assertSuperAdmin(actor, 'إنشاء شركة جديدة متاح لمدير النظام العام فقط');

    const company = await this.prisma.company.create({
      data: {
        name: dto.name.trim(),
        taxNumber: dto.taxNumber?.trim() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        address: dto.address?.trim() || null,
        logoUrl: dto.logoUrl || '/logo.png',
        isActive: dto.isActive ?? true,
      },
    });

    // إنشاء فرع رئيسي تلقائياً للشركة الجديدة لتكون جاهزة للعمل فوراً
    await this.prisma.branch.create({
      data: {
        name: `الفرع الرئيسي - ${company.name}`,
        code: 'MAIN-01',
        address: company.address || 'المقر الرئيسي',
        phone: company.phone || null,
        isMain: true,
        isActive: true,
        companyId: company.id,
      },
    }).catch(() => null);

    return this.findOne(company.id, actor);
  }

  async findAll(
    params: { search?: string; page?: number; limit?: number },
    actor: AuthenticatedUser,
  ) {
    const user = this.assertAuthenticated(actor);
    const { search, page = 1, limit = 20 } = params;
    const where: any = {};

    if (!this.isSuperAdmin(user)) {
      where.id = user.companyId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { taxNumber: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: { _count: { select: { branches: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count({ where }),
    ]);

    const businessTypesMap = await this.resolveBusinessTypesMap(items.map((c) => c.id));
    const enrichedItems = items.map((company) => ({
      ...company,
      businessType: businessTypesMap.get(company.id) || 'PHARMACY',
    }));

    return { items: enrichedItems, total, page, limit };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    this.assertCanReadCompany(actor, id);
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { branches: true },
    });
    if (!company) throw new NotFoundException('الشركة غير موجودة');
    const businessTypesMap = await this.resolveBusinessTypesMap([id]);
    return {
      ...company,
      businessType: businessTypesMap.get(id) || 'PHARMACY',
    };
  }

  async update(id: string, dto: UpdateCompanyDto, actor: AuthenticatedUser) {
    this.assertCanUpdateCompany(actor, id);
    await this.findOne(id, actor);
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    this.assertSuperAdmin(actor, 'حذف الشركات متاح لمدير النظام العام فقط');
    await this.findOne(id, actor);
    return this.prisma.company.delete({ where: { id } });
  }
}
