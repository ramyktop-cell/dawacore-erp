import { AuthenticatedUser } from '../auth/security.policy';
import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  private scope(actor: AuthenticatedUser, companyId?: string) {
    if (!actor) throw new ForbiddenException('تسجيل الدخول مطلوب');
    if (actor.role === 'SUPER_ADMIN') return companyId;
    if (!actor.companyId || (companyId && companyId !== actor.companyId)) throw new ForbiddenException('لا يمكنك إدارة فروع شركة أخرى');
    return actor.companyId;
  }

  async create(dto: CreateBranchDto, actor: AuthenticatedUser) {
    this.scope(actor, dto.companyId);
    if (!(await this.prisma.company.findUnique({ where: { id: dto.companyId }, select: { id: true } }))) throw new NotFoundException('الشركة غير موجودة؛ اختر شركة صالحة');
    const existingCode = await this.prisma.branch.findUnique({
      where: { companyId_code: { companyId: dto.companyId, code: dto.code } },
    });
    if (existingCode) throw new ConflictException('كود الفرع مستخدم مسبقاً داخل هذه الشركة');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isMain) {
        await tx.branch.updateMany({
          where: { companyId: dto.companyId, isMain: true },
          data: { isMain: false },
        });
      }
      return tx.branch.create({ data: dto });
    });
  }

  async findAll(params: { companyId?: string; search?: string; page?: number; limit?: number }, actor: AuthenticatedUser) {
    const { companyId, search, page = 1, limit = 20 } = params;
    const where: any = {};

    const scopedCompanyId = this.scope(actor, companyId);
    if (scopedCompanyId) where.companyId = scopedCompanyId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        include: { company: { select: { id: true, name: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');
    this.scope(actor, branch.companyId);
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto, actor: AuthenticatedUser) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('الفرع غير موجود');
    this.scope(actor, branch.companyId);
    this.scope(actor, dto.companyId);
    if (dto.companyId !== branch.companyId) throw new BadRequestException('لا يمكن نقل فرع قائم إلى شركة أخرى');
    const duplicate = await this.prisma.branch.findUnique({ where: { companyId_code: { companyId: dto.companyId, code: dto.code } } });
    if (duplicate && duplicate.id !== id) throw new ConflictException('كود الفرع مستخدم مسبقاً داخل هذه الشركة');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isMain) {
        await tx.branch.updateMany({
          where: { companyId: dto.companyId, isMain: true, id: { not: id } },
          data: { isMain: false },
        });
      }
      return tx.branch.update({ where: { id }, data: dto });
    });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    await this.findOne(id, actor);
    return this.prisma.branch.delete({ where: { id } });
  }
}
