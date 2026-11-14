import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateExpenseDto, FilterExpenseDto, RejectExpenseDto } from './dto/create-expense.dto';
import { ExpenseStatus, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/security.policy';
import { PdfExportService } from '../modules/accounting/reports/services/pdf-export.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pdfExportService: PdfExportService,
  ) {}

  // سقف الاعتماد التلقائي (المصروفات الأقل من أو تساوي 50,000 ج.س تُعتمد مباشرة)
  private readonly AUTO_APPROVE_LIMIT = 50000;

  /**
   * إنشاء سند صرف جديد مع التحقق من الحساب الطرفي والوردية
   */
  async createExpense(dto: CreateExpenseDto, user: AuthenticatedUser) {
    if (dto.companyId !== user.companyId) throw new ForbiddenException('لا يمكنك تسجيل مصروف لشركة أخرى');
    if (user.branchId && dto.branchId !== user.branchId) throw new ForbiddenException('لا يمكنك تسجيل مصروف لفرع آخر');
    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, companyId: user.companyId, isActive: true }, select: { id: true } });
    if (!branch) throw new BadRequestException('الفرع غير موجود أو غير نشط أو لا يتبع شركة المستخدم');
    // 1. التحقق من الحساب المحاسبي
    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
    });

    if (!account) {
      throw new NotFoundException('الحساب المحاسبي المحدد غير موجود');
    }

    if (!account.isLeaf) {
      throw new BadRequestException('لا يمكن القيد إلا على حساب طرفي (فرعي) فقط');
    }
    if (account.companyId !== user.companyId) throw new ForbiddenException('الحساب المحاسبي لا يتبع شركة المستخدم');

    // 2. التحقق من الوردية إذا كان الصرف نقداً من درج الكاشير
    if (dto.paidFrom === 'CASH') {
      if (!dto.shiftId) throw new BadRequestException('الصرف النقدي يتطلب وردية مفتوحة للمستخدم');
      const shift = await this.prisma.shift.findFirst({
        where: { id: dto.shiftId, companyId: user.companyId, branchId: dto.branchId, userId: user.id },
      });

      if (!shift || shift.status !== 'OPEN') {
        throw new BadRequestException('لا يمكن الصرف من وردية مغلقة أو غير موجودة');
      }

      // التحقق من كفاية الرصيد النقدي الحالي في الوردية
      const currentCash = Number(shift.expectedCash);
      if (currentCash < dto.amount) {
        throw new BadRequestException(
          `رصيد النقدية الحالي في الوردية (${currentCash.toLocaleString()} ج.س) لا يكفي لصرف مبلغ (${dto.amount.toLocaleString()} ج.س)`,
        );
      }
    }

    // 3. تحديد حالة الاعتماد: هل تُعتمد فوراً أم تنتظر اعتماد المدير؟
    const isManager =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.COMPANY_ADMIN ||
      user.role === Role.BRANCH_MANAGER;

    const shouldAutoApprove = isManager || dto.amount <= this.AUTO_APPROVE_LIMIT;
    const initialStatus = shouldAutoApprove ? ExpenseStatus.APPROVED : ExpenseStatus.PENDING;

    // 4. توليد رقم السند التسلسلي (EXP-YYYY-XXXXX)
    const year = new Date().getFullYear();
    const sequence = await this.prisma.documentSequence.upsert({
      where: { type_year_branchId: { type: 'EXPENSE', year, branchId: dto.branchId } },
      update: { lastValue: { increment: 1 } },
      create: { type: 'EXPENSE', year, branchId: dto.branchId, lastValue: 1 },
    });
    const expenseNumber = `EXP-${year}-${String(sequence.lastValue).padStart(5, '0')}`;

    // 5. الحفظ في قاعدة البيانات في معاملة ذرية Transaction
    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          companyId: dto.companyId,
          branchId: dto.branchId,
          shiftId: dto.shiftId || null,
          expenseNumber,
          expenseType: dto.expenseType,
          category: dto.category || 'EXPENSE',
          paidTo: dto.paidTo || null,
          accountId: dto.accountId,
          amount: dto.amount,
          paidFrom: dto.paidFrom,
          paymentMethod: dto.paymentMethod || 'CASH',
          referenceNo: dto.referenceNo || null,
          description: dto.description || null,
          attachment: dto.attachment || null,
          status: initialStatus,
          approvedBy: shouldAutoApprove ? user.id : null,
          approvedAt: shouldAutoApprove ? new Date() : null,
          createdBy: user.id,
        },
        include: {
          account: true,
          branch: true,
          shift: true,
          creator: { select: { id: true, name: true, role: true } },
        },
      });

      // إذا تم الاعتماد المباشر وكان الصرف نقداً من الوردية، نخصم المبلغ من النقد المتوقع
      if (shouldAutoApprove && dto.paidFrom === 'CASH' && dto.shiftId) {
        const cashUpdate = await tx.shift.updateMany({
          where: { id: dto.shiftId, companyId: user.companyId, branchId: dto.branchId, userId: user.id, status: 'OPEN', expectedCash: { gte: dto.amount } },
          data: {
            expectedCash: { decrement: dto.amount },
          },
        });
        if (cashUpdate.count !== 1) {
          throw new BadRequestException('الرصيد النقدي تغير أو لم يعد كافياً؛ أعد المحاولة');
        }

        // تسجيل حركة نقدية خارجة في الوردية
        await tx.cashMovement.create({
          data: {
            shiftId: dto.shiftId,
            type: 'CASH_OUT',
            amount: dto.amount,
            reason: `سند صرف #${expenseNumber}: ${dto.expenseType} - ${dto.description || ''}`,
            authorizedBy: user.id,
          },
        });
      }

      if (shouldAutoApprove) {
        await tx.accountingOutbox.create({
          data: {
            eventType: 'EXPENSE_CREATED',
            status: 'PENDING',
            payload: { expenseId: created.id, companyId: created.companyId, branchId: created.branchId, expenseNumber: created.expenseNumber, amount: Number(created.amount), accountCode: account.code, accountId: account.id, paidFrom: created.paidFrom, description: created.description || created.expenseType, createdBy: user.id },
          },
        });
      }

      return created;
    });

    // 6. إطلاق الحدث المحاسبي لإنشاء قيد اليومية التلقائي إذا اعتمد السند
    return expense;
  }

  /**
   * اعتماد سند صرف معلق من قبل الإدارة
   */
  async approveExpense(id: string, user: AuthenticatedUser) {
    const isManager =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.COMPANY_ADMIN ||
      user.role === Role.BRANCH_MANAGER;

    if (!isManager) {
      throw new ForbiddenException('فقط المدير أو المشرف المخول يمكنه اعتماد سندات الصرف');
    }

    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { account: true, shift: true },
    });

    if (!expense) {
      throw new NotFoundException('سند الصرف غير موجود');
    }
    if (expense.companyId !== user.companyId || (user.branchId && expense.branchId !== user.branchId)) {
      throw new ForbiddenException('سند الصرف خارج نطاق المستخدم');
    }

    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('السند ليس في حالة انتظار الاعتماد');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.expense.updateMany({
        where: { id, status: ExpenseStatus.PENDING },
        data: {
          status: ExpenseStatus.APPROVED,
          approvedBy: user.id,
          approvedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw new BadRequestException('تم اعتماد السند أو تغيّرت حالته؛ أعد تحميل الصفحة');
      const res = await tx.expense.findUnique({ where: { id }, include: { account: true, branch: true, shift: true, creator: { select: { id: true, name: true, role: true } } } });
      if (!res) throw new NotFoundException('سند الصرف غير موجود');

      if (res.paidFrom === 'CASH') {
        if (!res.shiftId || res.shift?.status !== 'OPEN') throw new BadRequestException('لا يمكن اعتماد صرف نقدي بعد إغلاق الوردية');
        const cashUpdate = await tx.shift.updateMany({
          where: { id: res.shiftId, companyId: user.companyId, branchId: res.branchId, status: 'OPEN', expectedCash: { gte: res.amount } },
          data: {
            expectedCash: { decrement: res.amount },
          },
        });
        if (cashUpdate.count !== 1) throw new BadRequestException('الوردية أغلقت أو رصيدها لم يعد كافياً');

        await tx.cashMovement.create({
          data: {
            shiftId: res.shiftId,
            type: 'CASH_OUT',
            amount: res.amount,
            reason: `اعتماد سند صرف #${res.expenseNumber}: ${res.expenseType}`,
            authorizedBy: user.id,
          },
        });
      }

      await tx.accountingOutbox.create({ data: { eventType: 'EXPENSE_CREATED', status: 'PENDING', payload: { expenseId: res.id, companyId: res.companyId, branchId: res.branchId, expenseNumber: res.expenseNumber, amount: Number(res.amount), accountCode: res.account.code, accountId: res.account.id, paidFrom: res.paidFrom, description: res.description || res.expenseType, createdBy: user.id } } });

      return res;
    });

    return updated;
  }

  /**
   * رفض سند صرف مع ذكر السبب
   */
  async rejectExpense(id: string, dto: RejectExpenseDto, user: AuthenticatedUser) {
    const isManager =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.COMPANY_ADMIN ||
      user.role === Role.BRANCH_MANAGER;

    if (!isManager) {
      throw new ForbiddenException('فقط المدير أو المشرف المخول يمكنه رفض سندات الصرف');
    }

    const expense = await this.prisma.expense.findUnique({
      where: { id },
    });

    if (!expense) {
      throw new NotFoundException('سند الصرف غير موجود');
    }
    if (expense.companyId !== user.companyId || (user.branchId && expense.branchId !== user.branchId)) {
      throw new ForbiddenException('سند الصرف خارج نطاق المستخدم');
    }

    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('السند ليس في حالة انتظار الاعتماد');
    }

    const rejected = await this.prisma.expense.updateMany({
      where: { id, status: ExpenseStatus.PENDING },
      data: {
        status: ExpenseStatus.REJECTED,
        rejectionReason: dto.reason,
        approvedBy: user.id,
        approvedAt: new Date(),
      },
    });
    if (rejected.count !== 1) throw new BadRequestException('تم تغيير حالة السند بواسطة مستخدم آخر');
    return this.prisma.expense.findUnique({
      where: { id },
      include: { account: true, branch: true, creator: { select: { id: true, name: true, role: true } } },
    });
  }

  /**
   * جلب قائمة سندات الصرف مع فلاتر التاريخ والفرع والحالة
   */
  async getExpenses(filters: FilterExpenseDto, actor?: AuthenticatedUser) {
    const where: any = { companyId: actor?.companyId || filters.companyId };
    if (actor?.branchId) where.branchId = actor.branchId;

    if (!actor?.companyId && filters.companyId) where.companyId = filters.companyId;
    if (!actor?.branchId && filters.branchId) where.branchId = filters.branchId;
    if (filters.shiftId) where.shiftId = filters.shiftId;
    if (filters.paidFrom) where.paidFrom = filters.paidFrom;
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;

    if (filters.fromDate || filters.toDate) {
      where.date = {};
      if (filters.fromDate) where.date.gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999);
        where.date.lte = to;
      }
    }

    return this.prisma.expense.findMany({
      where,
      include: {
        account: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
        shift: { select: { id: true, shiftNumber: true, status: true } },
        creator: { select: { id: true, name: true, username: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * إحصائيات سريعة لسندات الصرف
   */
  async getStats(companyId?: string, branchId?: string, actor?: AuthenticatedUser) {
    const where: any = { companyId: actor?.companyId || companyId };
    if (actor?.branchId) where.branchId = actor.branchId;
    if (!actor?.companyId && companyId) where.companyId = companyId;
    if (!actor?.branchId && branchId) where.branchId = branchId;

    const [totalApproved, cashApproved, bankApproved, pendingCount, pendingAmount, rejectedCount] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { ...where, status: ExpenseStatus.APPROVED },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: { ...where, status: ExpenseStatus.APPROVED, paidFrom: 'CASH' },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { ...where, status: ExpenseStatus.APPROVED, paidFrom: 'BANK' },
        _sum: { amount: true },
      }),
      this.prisma.expense.count({
        where: { ...where, status: ExpenseStatus.PENDING },
      }),
      this.prisma.expense.aggregate({
        where: { ...where, status: ExpenseStatus.PENDING },
        _sum: { amount: true },
      }),
      this.prisma.expense.count({
        where: { ...where, status: ExpenseStatus.REJECTED },
      }),
    ]);

    return {
      approvedTotalAmount: Number(totalApproved._sum.amount || 0),
      approvedCashAmount: Number(cashApproved._sum.amount || 0),
      approvedBankAmount: Number(bankApproved._sum.amount || 0),
      approvedCount: totalApproved._count || 0,
      pendingCount,
      pendingAmount: Number(pendingAmount._sum.amount || 0),
      rejectedCount,
    };
  }

  /**
   * توليد ملف PDF لسند صرف محدد بنطاق أمان محكم للشركة والفرع
   */
  async getExpenseVoucherPdf(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; expenseNumber: string }> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      throw new BadRequestException('معرف السند غير صالح');
    }

    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, currency: true, timezone: true } },
        branch: { select: { id: true, name: true, code: true } },
        account: { select: { id: true, code: true, name: true } },
        shift: { select: { id: true, shiftNumber: true, status: true } },
        creator: { select: { id: true, name: true, role: true } },
      },
    });

    if (!expense || expense.companyId !== user.companyId || (user.branchId && expense.branchId !== user.branchId)) {
      throw new NotFoundException('سند الصرف غير موجود أو لا تملك صلاحية الوصول إليه');
    }

    let approverName: string | undefined;
    if (expense.approvedBy) {
      const approver = await this.prisma.user.findUnique({
        where: { id: expense.approvedBy },
        select: { name: true },
      });
      approverName = approver?.name;
    }

    const buffer = await this.pdfExportService.generateExpenseVoucherPdf({
      companyName: expense.company?.name || 'مجموعة صيدليات داواكور',
      branchName: expense.branch?.name || 'الفرع الرئيسي',
      currency: expense.company?.currency || 'ج.س',
      timezone: expense.company?.timezone || 'Africa/Cairo',
      expenseNumber: expense.expenseNumber,
      date: expense.date,
      createdAt: expense.createdAt,
      status: expense.status,
      amount: Number(expense.amount),
      expenseType: expense.expenseType,
      category: expense.category,
      paidTo: expense.paidTo,
      paidFrom: expense.paidFrom,
      paymentMethod: expense.paymentMethod,
      accountCode: expense.account?.code,
      accountName: expense.account?.name,
      referenceNo: expense.referenceNo,
      description: expense.description,
      creatorName: expense.creator?.name || 'المحاسب',
      approverName,
      approvedAt: expense.approvedAt,
      rejectionReason: expense.rejectionReason,
    });

    return { buffer, expenseNumber: expense.expenseNumber };
  }
}
