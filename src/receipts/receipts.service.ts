import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/security.policy';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateReceiptDto, FilterReceiptDto } from './dto/create-receipt.dto';
import { ReceiptStatus, Role } from '@prisma/client';

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * إنشاء سند قبض جديد (إيراد خارج البيع للبنك أو الخزنة)
   */
  async createReceipt(dto: CreateReceiptDto, user: AuthenticatedUser) {
    if (dto.companyId !== user.companyId) throw new ForbiddenException('لا يمكنك تسجيل سند قبض لشركة أخرى');
    if (user.branchId && dto.branchId !== user.branchId) throw new ForbiddenException('لا يمكنك تسجيل سند قبض لفرع آخر');
    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, companyId: user.companyId, isActive: true }, select: { id: true } });
    if (!branch) throw new BadRequestException('الفرع غير موجود أو غير نشط أو لا يتبع شركة المستخدم');
    // 1. التحقق من الحساب المحاسبي الدائن (إيرادات، رأس مال، تسويات، إلخ)
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

    // 2. التحقق من الوردية إذا كان التوريد نقداً لدرج الكاشير / الصندوق
    if (dto.receivedTo === 'CASH') {
      if (!dto.shiftId) throw new BadRequestException('القبض النقدي يتطلب وردية مفتوحة للمستخدم');
      const shift = await this.prisma.shift.findFirst({
        where: { id: dto.shiftId, companyId: user.companyId, branchId: dto.branchId, userId: user.id },
      });

      if (!shift || shift.status !== 'OPEN') {
        throw new BadRequestException('لا يمكن التوريد لوردية مغلقة أو غير موجودة');
      }
    }

    // 3. توليد رقم السند التسلسلي (REC-YYYY-XXXXX)
    const year = new Date().getFullYear();
    const sequence = await this.prisma.documentSequence.upsert({
      where: { type_year_branchId: { type: 'RECEIPT', year, branchId: dto.branchId } },
      update: { lastValue: { increment: 1 } },
      create: { type: 'RECEIPT', year, branchId: dto.branchId, lastValue: 1 },
    });
    const receiptNumber = `REC-${year}-${String(sequence.lastValue).padStart(5, '0')}`;

    // 4. الحفظ في قاعدة البيانات في معاملة ذرية Transaction
    const receipt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.receipt.create({
        data: {
          companyId: dto.companyId,
          branchId: dto.branchId,
          shiftId: dto.shiftId || null,
          receiptNumber,
          receiptType: dto.receiptType,
          receivedFrom: dto.receivedFrom || null,
          accountId: dto.accountId,
          amount: dto.amount,
          receivedTo: dto.receivedTo,
          paymentMethod: dto.paymentMethod || 'CASH',
          referenceNo: dto.referenceNo || null,
          description: dto.description || null,
          attachment: dto.attachment || null,
          status: ReceiptStatus.APPROVED,
          createdBy: user.id,
        },
        include: {
          account: true,
          branch: true,
          shift: true,
          creator: { select: { id: true, name: true, role: true } },
        },
      });

      // إذا كان الإيداع نقداً في الوردية المفتوحة، نزيد المبلغ في النقدية المتوقعة
      if (dto.receivedTo === 'CASH' && dto.shiftId) {
        await tx.shift.update({
          where: { id: dto.shiftId },
          data: {
            expectedCash: { increment: dto.amount },
          },
        });

        // تسجيل حركة نقدية واردة في الوردية (CASH_IN)
        await tx.cashMovement.create({
          data: {
            shiftId: dto.shiftId,
            type: 'CASH_IN',
            amount: dto.amount,
            reason: `سند قبض إيراد #${receiptNumber}: ${dto.receiptType} - ${dto.description || ''}`,
            authorizedBy: user.id,
          },
        });
      }

      await tx.accountingOutbox.create({
        data: {
          eventType: 'RECEIPT_CREATED',
          status: 'PENDING',
          payload: { receiptId: created.id, companyId: created.companyId, branchId: created.branchId, receiptNumber: created.receiptNumber, amount: Number(created.amount), accountCode: account.code, accountId: account.id, receivedTo: created.receivedTo, description: created.description || created.receiptType, createdBy: user.id },
        },
      });

      return created;
    });

    // 5. إطلاق الحدث المحاسبي لإنشاء قيد اليومية المزدوج التلقائي
    return receipt;
  }

  /**
   * استرجاع قائمة سندات القبض مع التصفية والصلاحيات
   */
  async getReceipts(filters: FilterReceiptDto, user: { id: string; role: Role; branchId?: string; companyId?: string }) {
    const where: any = { companyId: user.companyId };

    if (user.branchId) where.branchId = user.branchId;
    else if (filters.branchId) where.branchId = filters.branchId;

    if (filters.shiftId) {
      where.shiftId = filters.shiftId;
    }

    if (filters.receivedTo) {
      where.receivedTo = filters.receivedTo;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.fromDate || filters.toDate) {
      where.date = {};
      if (filters.fromDate) where.date.gte = new Date(filters.fromDate);
      if (filters.toDate) where.date.lte = new Date(filters.toDate);
    }

    return this.prisma.receipt.findMany({
      where,
      include: {
        account: true,
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, shiftNumber: true, status: true } },
        creator: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * إحصائيات الإيرادات وسندات القبض
   */
  async getStats(companyId?: string, branchId?: string, user?: { role: Role; companyId?: string; branchId?: string }) {
    const where: any = { status: ReceiptStatus.APPROVED };

    if (user?.companyId) where.companyId = user.companyId;
    else if (companyId) where.companyId = companyId;

    if (user?.branchId) {
      where.branchId = user.branchId;
    } else if (branchId) {
      where.branchId = branchId;
    }

    const receipts = await this.prisma.receipt.findMany({
      where,
      select: {
        amount: true,
        receivedTo: true,
        receiptType: true,
      },
    });

    let totalAmount = 0;
    let cashAmount = 0;
    let bankAmount = 0;
    const byType: Record<string, number> = {};

    for (const r of receipts) {
      const amt = Number(r.amount);
      totalAmount += amt;
      if (r.receivedTo === 'CASH') {
        cashAmount += amt;
      } else if (r.receivedTo === 'BANK') {
        bankAmount += amt;
      }

      byType[r.receiptType] = (byType[r.receiptType] || 0) + amt;
    }

    return {
      totalAmount,
      cashAmount,
      bankAmount,
      count: receipts.length,
      byType,
    };
  }

  /**
   * إلغاء سند قبض
   */
  async cancelReceipt(id: string, user: AuthenticatedUser) {
    const isManager =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.COMPANY_ADMIN ||
      user.role === Role.BRANCH_MANAGER;

    if (!isManager) {
      throw new ForbiddenException('فقط الإدارة يمكنها إلغاء سندات القبض');
    }

    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: { shift: true },
    });

    if (!receipt) {
      throw new NotFoundException('سند القبض غير موجود');
    }
    if (receipt.companyId !== user.companyId || (user.branchId && receipt.branchId !== user.branchId)) throw new ForbiddenException('سند القبض خارج نطاق المستخدم');

    if (receipt.status === ReceiptStatus.CANCELLED) {
      throw new BadRequestException('السند ملغي مسبقاً');
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.receipt.updateMany({
        where: { id, status: { not: ReceiptStatus.CANCELLED } },
        data: { status: ReceiptStatus.CANCELLED },
      });
      if (claimed.count !== 1) throw new BadRequestException('السند ملغي أو تغيّرت حالته؛ أعد تحميل الصفحة');
      const updated = await tx.receipt.findUnique({ where: { id }, include: { account: true, branch: true, shift: true, creator: { select: { id: true, name: true, role: true } } } });
      if (!updated) throw new NotFoundException('سند القبض غير موجود');

      // إذا كان مودعاً في الوردية المفتوحة، نخفض النقدية
      if (receipt.receivedTo === 'CASH') {
        if (!receipt.shiftId || receipt.shift?.status !== 'OPEN') throw new BadRequestException('لا يمكن إلغاء قبض نقدي بعد إغلاق الوردية؛ استخدم سند عكسي معتمد');
        const cashUpdate = await tx.shift.updateMany({
          where: { id: receipt.shiftId, companyId: user.companyId, branchId: receipt.branchId, status: 'OPEN', expectedCash: { gte: receipt.amount } },
          data: {
            expectedCash: { decrement: receipt.amount },
          },
        });
        if (cashUpdate.count !== 1) throw new BadRequestException('لا يمكن عكس السند: الوردية مغلقة أو الرصيد النقدي غير كافٍ');

        await tx.cashMovement.create({
          data: {
            shiftId: receipt.shiftId,
            type: 'CASH_OUT',
            amount: receipt.amount,
            reason: `إلغاء سند قبض إيراد #${receipt.receiptNumber}`,
            authorizedBy: user.id,
          },
        });
      }

      await tx.accountingOutbox.create({ data: { eventType: 'RECEIPT_CANCELLED', status: 'PENDING', payload: { receiptId: receipt.id, companyId: receipt.companyId, branchId: receipt.branchId, receiptNumber: receipt.receiptNumber, amount: Number(receipt.amount), accountCode: updated.account.code, receivedTo: receipt.receivedTo, createdBy: user.id } } });

      return updated;
    });
  }
}
