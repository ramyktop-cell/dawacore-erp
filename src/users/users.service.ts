import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/security.policy';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async directory(actor: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException();
    const scopedBranch = [Role.CASHIER, Role.BRANCH_MANAGER, Role.INVENTORY].includes(actor.role as any);
    if (scopedBranch && !actor.branchId) return { items: [] };
    return { items: await this.prisma.user.findMany({
      where: { isActive: true, ...(actor.role === Role.SUPER_ADMIN ? {} : { companyId: actor.companyId }), ...(scopedBranch ? { branchId: actor.branchId } : {}) },
      select: { id: true, name: true, role: true }, take: 200, orderBy: { name: 'asc' },
    }) };
  }

  /**
   * إنشاء مستخدم جديد
   */
  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    this.assertActor(actor);
    if (actor.role !== Role.SUPER_ADMIN && (dto.companyId !== actor.companyId || dto.role === Role.SUPER_ADMIN)) throw new ForbiddenException();
    // 1. استخراج والتحقق من الشركة (مع توفير قيمة افتراضية إن لم تحدد)
    let effectiveCompanyId = dto.companyId;
    let company = effectiveCompanyId
      ? await this.prisma.company.findUnique({ where: { id: effectiveCompanyId } })
      : null;

    if (!company) {
      throw new NotFoundException('الشركة غير موجودة');
    }

    // 2. التحقق من وجود الفرع (إذا تم تمريره)
    let effectiveBranchId: string | null = null;
    if (dto.branchId && dto.branchId.trim() !== '') {
      const branch = await this.prisma.branch.findFirst({
        where: {
          OR: [{ id: dto.branchId.trim() }, { code: dto.branchId.trim() }],
          companyId: effectiveCompanyId,
        },
      });
      if (branch) {
        effectiveBranchId = branch.id;
      } else throw new NotFoundException('الفرع لا يتبع الشركة');
    }

    // 3. التحقق من عدم تكرار اسم الدخول (username)
    const cleanUsername = dto.username ? dto.username.trim() : '';
    if (!cleanUsername) {
      throw new ConflictException('اسم تسجيل الدخول مطلوب');
    }

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: cleanUsername },
    });
    if (existingUsername) {
      throw new ConflictException(`اسم الدخول "${cleanUsername}" مستخدم بالفعل، يرجى اختيار اسم مستخدم آخر`);
    }

    // 4. التحقق من عدم تكرار البريد الإلكتروني (email)
    const cleanEmail = dto.email && dto.email.trim() !== '' ? dto.email.trim().toLowerCase() : null;
    if (cleanEmail) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: cleanEmail },
      });
      if (existingEmail) {
        throw new ConflictException(`البريد الإلكتروني "${cleanEmail}" مستخدم بالفعل لمستخدم آخر`);
      }
    }

    // 5. تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // 6. تعيين الدور الوظيفي
    const role = (dto.role as any) === 'STORE_KEEPER' ? Role.INVENTORY : (dto.role as Role);

    // 7. الاسم الكامل
    const fullName = (dto as any).fullName || dto.name || cleanUsername;

    // 8. إنشاء المستخدم مع معالجة استثناءات التكرار (P2002)
    try {
      return await this.prisma.user.create({
        data: {
          companyId: effectiveCompanyId,
          branchId: effectiveBranchId,
          name: fullName,
          username: cleanUsername,
          passwordHash: hashedPassword,
          role: role,
          phone: dto.phone && dto.phone.trim() !== '' ? dto.phone.trim() : null,
          email: cleanEmail,
          isActive: dto.isActive ?? true,
        },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          phone: true,
          email: true,
          isActive: true,
          companyId: true,
          branchId: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'أحد الحقول الفريدة';
        throw new ConflictException(`قيمة مسجلة مسبقاً وغير مسموح بتكرارها: (${target})`);
      }
      throw err;
    }
  }

  /**
   * جلب جميع المستخدمين مع تصفية
   */
  async findAll(params: {
    companyId?: string;
    branchId?: string;
    search?: string;
    role?: Role;
    page?: number;
    limit?: number;
  }, actor: AuthenticatedUser) {
    this.assertActor(actor);
    const { companyId, branchId, search, role } = params;
    const page = Math.max(1, parseInt(String(params.page || 1), 10) || 1);
    const limit = Math.max(1, parseInt(String(params.limit || 20), 10) || 20);
    const where: any = {};

    if (actor.role !== Role.SUPER_ADMIN) where.companyId = actor.companyId;
    else if (companyId) where.companyId = companyId;
    if (branchId) where.branchId = branchId;
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          phone: true,
          email: true,
          isActive: true,
          createdAt: true,
          companyId: true,
          branchId: true,
          company: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * جلب مستخدم واحد
   */
  async findOne(id: string, actor: AuthenticatedUser) {
    this.assertActor(actor);
    const user = await this.prisma.user.findFirst({
      where: { id, ...(actor.role === Role.SUPER_ADMIN ? {} : { companyId: actor.companyId }) },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        phone: true,
        email: true,
        isActive: true,
        companyId: true,
        branchId: true,
        company: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  /**
   * تحديث بيانات المستخدم
   */
  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id, actor);
    if (actor.role !== Role.SUPER_ADMIN && (existing.role === Role.SUPER_ADMIN || dto.role === Role.SUPER_ADMIN)) throw new ForbiddenException();
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, companyId: existing.companyId } });
      if (!branch) throw new NotFoundException('الفرع لا يتبع الشركة');
    }

    const data: any = {
      name: (dto as any).fullName || dto.name,
      role: (dto.role as any) === 'STORE_KEEPER' ? Role.INVENTORY : dto.role,
      phone: dto.phone,
      email: dto.email || null,
      isActive: dto.isActive,
    };

    // إزالة الحقول غير المعرفة (undefined)
    Object.keys(data).forEach((key) => {
      if (data[key] === undefined) delete data[key];
    });

    // تشفير كلمة المرور إذا تم تعديلها
    if (dto.password && dto.password.trim() !== '') {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    // تحويل branchId الفارغ إلى null
    if (dto.branchId !== undefined) {
      data.branchId = dto.branchId === '' ? null : dto.branchId;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        phone: true,
        email: true,
        isActive: true,
        companyId: true,
        branchId: true,
        company: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }

  /**
   * حذف مستخدم
   */
  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.findOne(id, actor);
    if (actor.role !== Role.SUPER_ADMIN && existing.role === Role.SUPER_ADMIN) throw new ForbiddenException();
    return this.prisma.user.update({ where: { id }, data: { isActive: false }, select: { id: true, isActive: true } });
  }
  private assertActor(actor: AuthenticatedUser) {
    if (!actor || ![Role.SUPER_ADMIN, Role.COMPANY_ADMIN].includes(actor.role as any)) throw new ForbiddenException();
  }
}
