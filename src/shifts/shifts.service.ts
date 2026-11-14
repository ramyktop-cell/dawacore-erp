import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { OpenShiftDto, CloseShiftDto, ApproveShiftDto, CashMovementDto, QueryShiftsDto } from './dto/shift.dto';
import { Prisma, ShiftStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/security.policy';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * فتح وردية جديدة للكاشير
   */
  async openShift(dto: OpenShiftDto, actor?: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException('هوية المستخدم مطلوبة');
    if (actor.id !== dto.userId) throw new ForbiddenException('لا يمكن فتح وردية لكاشير آخر');
    const activeShift = await this.prisma.shift.findFirst({
      where: {
        userId: actor.id,
        branchId: dto.branchId,
        companyId: actor.companyId,
        status: ShiftStatus.OPEN,
      },
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, username: true } },
      },
    });

    if (activeShift) {
      return activeShift; // Return the currently active shift instead of hard crashing if already open
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
      include: { company: true },
    });
    if (!branch) {
      throw new NotFoundException(`الفرع غير موجود`);
    }

    if (branch.companyId !== actor.companyId || (actor.branchId && actor.branchId !== branch.id)) {
      throw new ForbiddenException('الفرع خارج نطاق المستخدم');
    }
    const companyId = actor.companyId;

    // حساب رقم الوردية المتسلسل للفرع
    const shiftMax = await this.prisma.shift.aggregate({
      where: { branchId: dto.branchId },
      _max: { shiftNumber: true },
    });
    const shiftNumber = (shiftMax._max.shiftNumber || 0) + 1;

    const openingDec = new Prisma.Decimal(dto.openingBalance || 0);
    if (openingDec.isNegative()) throw new BadRequestException('العهدة الافتتاحية لا يمكن أن تكون سالبة');

    return await this.prisma.shift.create({
      data: {
        companyId,
        branchId: dto.branchId,
        userId: actor.id,
        shiftNumber,
        status: ShiftStatus.OPEN,
        openingBalance: openingDec,
        expectedCash: openingDec,
      },
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, username: true } },
      },
    });
  }

  /**
   * جلب الوردية المفتوحة حالياً لمستخدم أو فرع
   */
  async getActiveShift(branchId: string, userId?: string, actor?: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException('هوية المستخدم مطلوبة');
    if (actor.companyId && actor.branchId && actor.branchId !== branchId) throw new ForbiddenException('الفرع خارج نطاق المستخدم');
    const where: Prisma.ShiftWhereInput = {
      branchId,
      companyId: actor.companyId,
      status: ShiftStatus.OPEN,
    };
    if (userId) {
      where.userId = actor.id;
    }

    const shift = await this.prisma.shift.findFirst({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true, username: true } },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { customer: { select: { name: true } } },
        },
        cashMovements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return shift;
  }

  /**
   * إغلاق الوردية وحساب العجز أو الفائض
   */
  async closeShift(id: string, dto: CloseShiftDto, actor?: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException('هوية المستخدم مطلوبة');
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: { cashMovements: true },
    });

    if (!shift) {
      throw new NotFoundException('الوردية غير موجودة');
    }

    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('الوردية ليست مفتوحة للإغلاق');
    }
    if (shift.companyId !== actor.companyId || (actor.role === 'CASHIER' && shift.userId !== actor.id)) {
      throw new ForbiddenException('لا يمكنك إغلاق هذه الوردية');
    }

    const actualCashDec = new Prisma.Decimal(dto.actualCash);
    if (actualCashDec.isNegative()) throw new BadRequestException('النقد الفعلي لا يمكن أن يكون سالباً');
    const expectedCashDec = new Prisma.Decimal(shift.expectedCash);
    const cashDifferenceDec = actualCashDec.minus(expectedCashDec);

    const claimed = await this.prisma.shift.updateMany({
      where: { id, status: ShiftStatus.OPEN },
      data: {
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
        actualCash: actualCashDec,
        cashDifference: cashDifferenceDec,
        notes: dto.notes,
      },
    });
    if (claimed.count !== 1) throw new ConflictException('تم إغلاق الوردية من طلب آخر');
    const updated = await this.prisma.shift.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, username: true } },
      },
    });
    if (!updated) throw new NotFoundException('الوردية غير موجودة');
    /*
      data: {
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
        actualCash: actualCashDec,
        cashDifference: cashDifferenceDec,
        notes: dto.notes,
      },
    */

    this.eventEmitter.emit('shift.closed', {
      shiftId: updated.id,
      branchId: updated.branchId,
      expectedCash: expectedCashDec.toString(),
      actualCash: actualCashDec.toString(),
      difference: cashDifferenceDec.toString(),
    });

    return updated;
  }

  /**
   * اعتماد الوردية من قبل المدير المشرف
   */
  async approveShift(id: string, dto: ApproveShiftDto, actor?: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException('هوية المستخدم مطلوبة');
    if (actor.id !== dto.approvedBy) throw new ForbiddenException('المعتمد يجب أن يكون المستخدم الحالي');
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) {
      throw new NotFoundException('الوردية غير موجودة');
    }

    if (shift.status !== ShiftStatus.CLOSED || shift.companyId !== actor.companyId) {
      throw new BadRequestException('يجب إغلاق الوردية أولاً قبل اعتمادها');
    }

    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: dto.approvedBy,
        notes: dto.notes ? `${shift.notes || ''} | اعتماد: ${dto.notes}` : shift.notes,
      },
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });

    this.eventEmitter.emit('shift.approved', {
      shiftId: updated.id,
      companyId: updated.companyId,
      branchId: updated.branchId,
      cashierId: updated.userId,
      approvedBy: dto.approvedBy,
      cashDifference: updated.cashDifference?.toString() || '0',
      difference: Number(updated.cashDifference || 0),
    });

    return updated;
  }

  /**
   * تسجيل حركة نقدية في الصندوق (سحب مصروفات أو إيداع)
   */
  async recordCashMovement(dto: CashMovementDto, actor?: AuthenticatedUser) {
    if (!actor) throw new ForbiddenException('هوية المستخدم مطلوبة');
    if (!['CASH_IN', 'CASH_OUT'].includes(dto.type)) throw new BadRequestException('نوع حركة نقدية غير صالح');
    const shift = await this.prisma.shift.findUnique({ where: { id: dto.shiftId } });
    if (!shift || shift.status !== ShiftStatus.OPEN || shift.companyId !== actor.companyId) {
      throw new BadRequestException('لا يمكن تسجيل حركة نقدية لوردية غير مفتوحة');
    }

    const amountDec = new Prisma.Decimal(dto.amount);
    if (amountDec.isNegative() || amountDec.isZero()) throw new BadRequestException('مبلغ الحركة يجب أن يكون أكبر من صفر');
    if (dto.authorizedBy !== actor.id && actor.role === 'CASHIER') throw new ForbiddenException('المصرح يجب أن يكون المستخدم الحالي');
    const isCashIn = dto.type === 'CASH_IN';

    return await this.prisma.$transaction(async (tx) => {
      const movement = await tx.cashMovement.create({
        data: {
          shiftId: dto.shiftId,
          type: isCashIn ? 'CASH_IN' : 'CASH_OUT',
          amount: amountDec,
          reason: dto.reason,
          authorizedBy: dto.authorizedBy,
        },
      });

      const newExpectedCash = isCashIn
        ? shift.expectedCash.plus(amountDec)
        : shift.expectedCash.minus(amountDec);
      if (newExpectedCash.isNegative()) throw new BadRequestException('الرصيد المتوقع لا يكفي للحركة');

      await tx.shift.updateMany({
        where: { id: dto.shiftId, status: ShiftStatus.OPEN },
        data: { expectedCash: newExpectedCash },
      });

      return movement;
    });
  }

  /**
   * جلب قائمة الورديات مع التصفية والصفحات
   */
  async findAll(query: QueryShiftsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ShiftWhereInput = {};
    if (query.branchId) where.branchId = query.branchId;
    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.shift.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true, username: true } },
          _count: {
            select: {
              invoices: true,
              sales: true,
              cashMovements: true,
            },
          },
        },
      }),
      this.prisma.shift.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * جلب تفاصيل وردية واحدة مع الفواتير والحركات النقدية
   */
  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true, username: true } },
        invoices: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            items: {
              include: {
                medicine: { select: { id: true, tradeName: true, code: true } },
                batch: { select: { id: true, batchNumber: true, expiryDate: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        cashMovements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('الوردية غير موجودة');
    }

    return shift;
  }
}
