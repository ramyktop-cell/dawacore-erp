import { AuthenticatedUser } from '../auth/security.policy';
import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto, QuerySuppliersDto } from './dto/create-supplier.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(actor: AuthenticatedUser, companyId?: string, branchId?: string) {
    if (!actor?.companyId) throw new ForbiddenException('تسجيل الدخول بشركة صحيحة مطلوب');
    if (companyId && companyId !== actor.companyId) throw new ForbiddenException('لا يمكنك الوصول إلى مورد شركة أخرى');
    const restricted = !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(actor.role);
    if (restricted && !actor.branchId) throw new ForbiddenException('يجب ربط المستخدم بفرع');
    if (restricted && branchId && branchId !== actor.branchId) throw new ForbiddenException('لا يمكنك الوصول إلى مورد فرع آخر');
    return { companyId: actor.companyId, branchId: restricted ? actor.branchId : branchId };
  }

  async create(dto: CreateSupplierDto, actor: AuthenticatedUser) {
    const scope = this.scope(actor, dto.companyId, dto.branchId);
    const effectiveCompanyId = scope.companyId;
    const effectiveBranchId = scope.branchId || actor.branchId;
    if (!effectiveBranchId) throw new BadRequestException('اختر فرع المورد قبل الحفظ');
    const branch = await this.prisma.branch.findFirst({
      where: { id: effectiveBranchId, companyId: effectiveCompanyId, isActive: true },
    });
    if (!branch) throw new BadRequestException('الفرع غير موجود أو غير نشط أو لا يتبع الشركة');

    const existing = await this.prisma.supplier.findFirst({
      where: {
        companyId: effectiveCompanyId,
        branchId: effectiveBranchId,
        phone: dto.phone,
      },
    });

    if (existing) {
      throw new ConflictException('رقم الهاتف مسجل مسبقاً لمورد آخر في هذا الفرع');
    }

    const { initialDebt = 0, companyId, branchId, ...rest } = dto;

    return await this.prisma.supplier.create({
      data: {
        ...rest,
        companyId: effectiveCompanyId,
        branchId: effectiveBranchId,
        currentDebt: new Prisma.Decimal(initialDebt),
      },
      include: {
        company: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async findAll(query: QuerySuppliersDto, actor: AuthenticatedUser) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 50)));
    const skip = (page - 1) * limit;

    const scope = this.scope(actor, query.companyId, query.branchId);
    const where: Prisma.SupplierWhereInput = { companyId: scope.companyId };
    if (scope.branchId) where.branchId = scope.branchId;

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true, code: true } },
          _count: {
            select: {
              purchases: true,
              purchaseReturns: true,
              ledgerLines: true,
            },
          },
        },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        company: true,
        branch: true,
        purchases: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('المورد غير موجود');
    }

    this.scope(actor, supplier.companyId, supplier.branchId);
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, actor: AuthenticatedUser) {
    await this.findOne(id, actor);
    return await this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            purchases: true,
            purchaseReturns: true,
            ledgerLines: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('المورد غير موجود');
    }

    this.scope(actor, supplier.companyId, supplier.branchId);

    const purchasesCount = supplier._count?.purchases || 0;
    const returnsCount = supplier._count?.purchaseReturns || 0;
    const ledgerLinesCount = supplier._count?.ledgerLines || 0;
    const currentDebt = Number(supplier.currentDebt || 0);

    if (purchasesCount > 0 || returnsCount > 0 || ledgerLinesCount > 0 || Math.abs(currentDebt) > 0.001) {
      const reasons: string[] = [];
      if (purchasesCount > 0) reasons.push(`${purchasesCount} فاتورة/أمر شراء`);
      if (returnsCount > 0) reasons.push(`${returnsCount} مرتجع مشتريات`);
      if (ledgerLinesCount > 0) reasons.push(`${ledgerLinesCount} قيد دفتري مسجل`);
      if (Math.abs(currentDebt) > 0.001) reasons.push(`رصيد مديونية قائم بقيمة ${currentDebt.toLocaleString()} ج.س`);

      throw new BadRequestException(
        `لا يسمح النظام بحذف المورد (${supplier.name}) لوجود عمليات سابقة مرتبطة به: [${reasons.join('، ')}]. يمكنك إلغاء تفعيل المورد بدلاً من حذفه للحفاظ على السلامة المحاسبية وسجلات التدقيق المالي.`
      );
    }

    return await this.prisma.supplier.delete({
      where: { id },
    });
  }
}
