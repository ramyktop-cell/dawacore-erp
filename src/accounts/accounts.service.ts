import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * إنشاء حساب جديد مع التحقق من صحة المستوى والتسلسل الهرمي
   */
  async create(dto: CreateAccountDto, companyId: string, branchId?: string) {
    dto.companyId = companyId;
    if (branchId) dto.branchId = branchId;
    // 1. التحقق من تفرد الكود داخل الشركة
    const existing = await this.prisma.account.findUnique({
      where: { companyId_code: { companyId: dto.companyId, code: dto.code } },
    });
    if (existing) {
      throw new ConflictException('رقم أو كود الحساب موجود بالفعل داخل الشركة');
    }

    // 2. التحقق من صحة المستوى وعلاقته بالأب
    if (dto.level > 1) {
      if (!dto.parentId) {
        throw new BadRequestException('الحسابات الفرعية (Level > 1) يجب أن يكون لها حساب أب');
      }

      const parent = await this.prisma.account.findUnique({ where: { id: dto.parentId } });
      if (!parent) {
        throw new NotFoundException('الحساب الأب غير موجود');
      }

      if (parent.level !== dto.level - 1) {
        throw new BadRequestException(
          `مستوى الأب (${parent.level}) يجب أن يكون ${dto.level - 1} ليتناسب مع مستوى الحساب الجديد (${dto.level})`,
        );
      }

      if (!parent.isActive) {
        throw new BadRequestException('لا يمكن إنشاء حساب تحت حساب غير نشط أو معطل');
      }

      // إذا كان الأب معرفاً كحساب طرفي (isLeaf)، يتم تحويله إلى تجميعي (isLeaf = false)
      if (parent.isLeaf) {
        await this.prisma.account.update({
          where: { id: parent.id },
          data: { isLeaf: false },
        });
      }
    } else {
      // المستوى 1 يجب ألا يكون له أب
      if (dto.parentId) {
        throw new BadRequestException('الحسابات الرئيسية (Level 1) لا يمكن أن يكون لها أب');
      }
    }

    // 3. إنشاء الحساب
    return this.prisma.account.create({
      data: {
        companyId: dto.companyId,
        branchId: dto.branchId || null,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        level: dto.level,
        parentId: dto.parentId || null,
        isLeaf: dto.isLeaf ?? true,
        isActive: dto.isActive ?? true,
        balance: 0,
      },
      include: {
        parent: { select: { id: true, code: true, name: true, level: true } },
      },
    });
  }

  /**
   * جلب شجرة الحسابات الكاملة مع حساب الأرصدة التراكمية الشجرية
   */
  async getTree(companyId: string, branchId?: string) {
    const where: Prisma.AccountWhereInput = { companyId };
    if (branchId) {
      where.OR = [{ branchId: null }, { branchId }];
    }

    // جلب جميع الحسابات للشركة
    const accounts = await this.prisma.account.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    // بناء الشجرة باستخدام Map
    const map = new Map<string, any>();
    const roots: any[] = [];

    // تهيئة جميع العقد
    for (const acc of accounts) {
      map.set(acc.id, {
        ...acc,
        balance: Number(acc.balance || 0),
        totalBalance: 0,
        children: [],
      });
    }

    // ربط الأبناء بالآباء
    for (const acc of accounts) {
      const node = map.get(acc.id);
      if (acc.parentId && map.has(acc.parentId)) {
        const parent = map.get(acc.parentId);
        parent.children.push(node);
      } else if (!acc.parentId) {
        roots.push(node);
      }
    }

    // دالة عودية لحساب الرصيد التراكمي وترتيب الأبناء
    const processNode = (node: any): number => {
      let subtotal = Number(node.balance || 0);
      if (node.children && node.children.length > 0) {
        node.children.sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true }));
        for (const child of node.children) {
          subtotal += processNode(child);
        }
      }
      node.totalBalance = subtotal;
      return subtotal;
    };

    roots.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    for (const root of roots) {
      processNode(root);
    }

    return roots;
  }

  /**
   * جلب قائمة الحسابات البسيطة (للقوائم المنسدلة والبحث)
   */
  async findAll(companyId: string, options?: { isLeaf?: boolean; type?: string; level?: number }) {
    const where: Prisma.AccountWhereInput = { companyId, isActive: true };
    if (options?.isLeaf !== undefined) where.isLeaf = options.isLeaf;
    if (options?.type) where.type = options.type as any;
    if (options?.level) where.level = options.level;

    return this.prisma.account.findMany({
      where,
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        level: true,
        isLeaf: true,
        balance: true,
        parentId: true,
      },
    });
  }

  /**
   * تحديث حساب (مع التحقق من isLeaf والارتباط بالأب)
   */
  async update(id: string, dto: UpdateAccountDto, companyId?: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('الحساب غير موجود');
    }
    if (companyId && account.companyId !== companyId) throw new NotFoundException('الحساب غير موجود');

    // إذا كان الحساب عليه حركات، نمنع تحويله إلى حساب رئيسي (isLeaf = false)
    if (dto.isLeaf === false && account.isLeaf) {
      const lines = await this.prisma.journalLine.findFirst({
        where: { accountId: id },
      });
      if (lines) {
        throw new BadRequestException(
          'لا يمكن تحويل هذا الحساب إلى حساب رئيسي لأنه يحتوي على حركات محاسبية مسجلة',
        );
      }
    }

    // التحقق من المستوى إذا تم تغيير الأب
    if (dto.parentId && dto.parentId !== account.parentId) {
      const parent = await this.prisma.account.findUnique({ where: { id: dto.parentId } });
      if (!parent) {
        throw new NotFoundException('الحساب الأب غير موجود');
      }
      if (parent.level !== account.level - 1) {
        throw new BadRequestException(
          `مستوى الأب (${parent.level}) لا يتناسب مع مستوى الحساب (${account.level})`,
        );
      }
    }

    return this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        isLeaf: dto.isLeaf,
        isActive: dto.isActive,
        parentId: dto.parentId,
      },
    });
  }

  /**
   * حذف حساب مع التحقق الصارم من القواعد المحاسبية:
   * 1. منع حذف الحسابات الرئيسية والتجميعية نهائياً.
   * 2. منع حذف الحسابات التي تحتوي على أبناء أو فروع تابعة.
   * 3. منع حذف الحسابات التي تحتوي على قيود وحركات محاسبية مسجلة.
   * 4. منع حذف الحسابات التي تمتلك رصيداً مالياً غير صفري.
   * 5. منع حذف الحسابات المرتبطة بإعدادات الفروع المحاسبية.
   */
  async remove(id: string, companyId?: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        children: true,
        _count: {
          select: { lines: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('الحساب المالي غير موجود');
    }
    if (companyId && account.companyId !== companyId) throw new NotFoundException('الحساب المالي غير موجود');

    // 1. منع حذف الحسابات الرئيسية (Level 1) أو أي حساب غير طرفي (isLeaf = false)
    if (account.level === 1 || !account.isLeaf) {
      throw new BadRequestException(
        `لا يمكن حذف الحسابات الرئيسية أو التجميعية (مستوى ${account.level}): ${account.name} (${account.code})، حفاظاً على سلامة الهيكل المحاسبي العام`,
      );
    }

    // 2. التحقق من عدم وجود حسابات فرعية تابعة له
    if (account.children.length > 0) {
      throw new BadRequestException(
        `لا يمكن حذف الحساب "${account.name}" لأنه يحتوي على ${account.children.length} حسابات فرعية تابعة له`,
      );
    }

    // 3. التحقق من عدم وجود أي بيانات أو حركات محاسبية مسجلة (JournalLines)
    if (account._count.lines > 0) {
      throw new BadRequestException(
        `لا يمكن حذف الحساب "${account.name}" (${account.code}) لأنه يحتوي على ${account._count.lines} حركة وقيود محاسبية مسجلة`,
      );
    }

    // فحص إضافي للتأكد عبر جدول JournalLine مباشرة
    const existingLine = await this.prisma.journalLine.findFirst({
      where: { accountId: id },
    });
    if (existingLine) {
      throw new BadRequestException(
        `لا يمكن حذف الحساب "${account.name}" (${account.code}) لارتباطه ببيانات وقيود محاسبية مسجلة`,
      );
    }

    // 4. التحقق من أن الرصيد المالي للحساب صفري تماماً
    if (Math.abs(Number(account.balance || 0)) > 0.001) {
      throw new BadRequestException(
        `لا يمكن حذف الحساب "${account.name}" لأنه يحتوي على رصيد مالي قائم قدره (${Number(account.balance).toLocaleString()} ج.س)`,
      );
    }

    // 5. التحقق من عدم ارتباط الحساب بإعدادات ربط الفروع
    const linkedBranch = await this.prisma.branchAccountMapping.findFirst({
      where: {
        OR: [
          { cashAccountId: id },
          { bankAccountId: id },
          { inventoryAccountId: id },
          { salesAccountId: id },
          { cogsAccountId: id },
          { arAccountId: id },
          { apAccountId: id },
          { shortageAccountId: id },
          { surplusAccountId: id },
        ],
      },
      include: { branch: true },
    });

    if (linkedBranch) {
      throw new BadRequestException(
        `لا يمكن حذف الحساب "${account.name}" لأنه مرتبط بإعدادات الربط المحاسبي لفرع (${linkedBranch.branch.name})`,
      );
    }

    return this.prisma.account.delete({ where: { id } });
  }

  /**
   * جلب حساب واحد مع تفاصيله وأبنائه
   */
  async findOneWithChildren(id: string, companyId?: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          orderBy: { code: 'asc' },
        },
      },
    });
    if (!account) throw new NotFoundException('الحساب غير موجود');
    if (companyId && account.companyId !== companyId) throw new NotFoundException('الحساب غير موجود');
    return account;
  }
}
