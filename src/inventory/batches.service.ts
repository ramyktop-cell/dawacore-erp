import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateBatchDto, UpdateBatchDto } from './dto/create-batch.dto';

@Injectable()
export class BatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * جلب التشغيلات مع الفلترة حسب الفرع، الصلاحية (FEFO)، والبحث
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    branchId?: string;
    medicineId?: string;
    expiryFilter?: 'ALL' | 'EXPIRED' | 'EXPIRING_SOON' | 'VALID';
  }) {
    const { page = 1, limit = 20, search, branchId, medicineId, expiryFilter = 'ALL' } = params;
    const skip = (page - 1) * limit;

    const now = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setDate(threeMonthsLater.getDate() + 90);

    const where: Prisma.BatchWhereInput = {};

    if (branchId) {
      where.branchId = branchId;
    }

    if (medicineId) {
      where.medicineId = medicineId;
    }

    if (expiryFilter === 'EXPIRED') {
      where.expiryDate = { lt: now };
    } else if (expiryFilter === 'EXPIRING_SOON') {
      where.expiryDate = { gte: now, lte: threeMonthsLater };
    } else if (expiryFilter === 'VALID') {
      where.expiryDate = { gt: threeMonthsLater };
    }

    if (search && search.trim().length > 0) {
      const q = search.trim();
      where.OR = [
        { batchNumber: { contains: q, mode: 'insensitive' } },
        { medicine: { tradeName: { contains: q, mode: 'insensitive' } } },
        { medicine: { scientificName: { contains: q, mode: 'insensitive' } } },
        { medicine: { barcode: { contains: q } } },
      ];
    }

    const [items, total, statsRaw, branches] = await Promise.all([
      this.prisma.batch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { expiryDate: 'asc' }, // تطبيق أولوية FEFO تلقائياً
        include: {
          medicine: {
            select: {
              id: true,
              isWeighed: true,
              tradeName: true,
              scientificName: true,
              code: true,
              barcode: true,
              category: true,
              units: {
                select: {
                  unitType: true,
                  multiplier: true,
                  price: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.batch.count({ where }),
      this.prisma.batch.findMany({
        where: branchId ? { branchId } : {},
        select: {
          id: true,
          expiryDate: true,
          isFrozen: true,
          quantityInBase: true,
        },
      }),
      this.prisma.branch.findMany({
        select: { id: true, name: true },
      }),
    ]);

    const branchMap = new Map<string, string>();
    branches.forEach((b) => branchMap.set(b.id, b.name));

    // حساب الإحصائيات الشاملة
    const totalBatches = statsRaw.length;
    const expiredCount = statsRaw.filter((b) => new Date(b.expiryDate) < now).length;
    const expiringSoonCount = statsRaw.filter((b) => {
      const d = new Date(b.expiryDate);
      return d >= now && d <= threeMonthsLater;
    }).length;
    const frozenCount = statsRaw.filter((b) => b.isFrozen).length;
    const totalUnitsInStock = statsRaw.reduce((sum, b) => sum + (b.quantityInBase || 0), 0);

    const formattedItems = items.map((b) => {
      const exp = new Date(b.expiryDate);
      const isExpired = exp < now;
      const isExpiringSoon = exp >= now && exp <= threeMonthsLater;

      // حساب عدد الأيام المتبقية
      const diffTime = exp.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        id: b.id,
        batchNumber: b.batchNumber,
        branchId: b.branchId,
        branchName: branchMap.get(b.branchId) || 'الفرع الرئيسي',
        medicineId: b.medicineId,
        medicine: b.medicine
          ? {
              ...b.medicine,
              units: b.medicine.units.map((u) => ({
                unitType: u.unitType,
                multiplier: u.multiplier,
                price: Number(u.price),
              })),
            }
          : undefined,
        costPrice: Number(b.costPrice),
        salePrice: Number(b.salePrice),
        expiryDate: b.expiryDate,
        quantityInBase: b.quantityInBase,
        isFrozen: b.isFrozen,
        isExpired,
        isExpiringSoon,
        daysRemaining,
        createdAt: b.createdAt,
      };
    });

    return {
      items: formattedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalBatches,
        expiredCount,
        expiringSoonCount,
        frozenCount,
        totalUnitsInStock,
      },
    };
  }

  /**
   * جلب تفاصيل تشغيلة محددة
   */
  async findOne(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        medicine: { include: { units: true } },
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('التشغيلة غير موجودة');
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: batch.branchId },
      select: { id: true, name: true },
    });

    return {
      ...batch,
      branchName: branch?.name,
      costPrice: Number(batch.costPrice),
      salePrice: Number(batch.salePrice),
    };
  }

  /**
   * إضافة تشغيلة جديدة
   */
  async create(dto: CreateBatchDto) {
    const existing = await this.prisma.batch.findUnique({
      where: {
        batchNumber_medicineId_branchId: {
          batchNumber: dto.batchNumber.trim(),
          medicineId: dto.medicineId,
          branchId: dto.branchId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `التشغيلة رقم (${dto.batchNumber}) مسجلة مسبقاً لهذا الدواء بنفس الفرع`
      );
    }

    const batch = await this.prisma.batch.create({
      data: {
        batchNumber: dto.batchNumber.trim(),
        medicineId: dto.medicineId,
        branchId: dto.branchId,
        costPrice: new Prisma.Decimal(dto.costPrice),
        salePrice: new Prisma.Decimal(dto.salePrice),
        expiryDate: new Date(dto.expiryDate),
        quantityInBase: Number(dto.quantityInBase),
        quantity: Number(dto.quantityInBase),
        isFrozen: dto.isFrozen ?? false,
      },
      include: {
        medicine: true,
      },
    });

    return batch;
  }

  /**
   * تعديل تشغيلة
   */
  async update(id: string, dto: UpdateBatchDto) {
    const existing = await this.prisma.batch.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('التشغيلة غير موجودة');
    }

    const updated = await this.prisma.batch.update({
      where: { id },
      data: {
        ...(dto.batchNumber ? { batchNumber: dto.batchNumber.trim() } : {}),
        ...(dto.costPrice !== undefined ? { costPrice: new Prisma.Decimal(dto.costPrice) } : {}),
        ...(dto.salePrice !== undefined ? { salePrice: new Prisma.Decimal(dto.salePrice) } : {}),
        ...(dto.expiryDate ? { expiryDate: new Date(dto.expiryDate) } : {}),
        ...(dto.quantityInBase !== undefined
          ? {
              quantityInBase: Number(dto.quantityInBase),
              quantity: Number(dto.quantityInBase),
            }
          : {}),
        ...(dto.isFrozen !== undefined ? { isFrozen: dto.isFrozen } : {}),
      },
      include: {
        medicine: true,
      },
    });

    return updated;
  }

  /**
   * تجميد أو فك تجميد تشغيلة ( لمنع سحبها في الـ POS )
   */
  async toggleFreeze(id: string) {
    const existing = await this.prisma.batch.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('التشغيلة غير موجودة');
    }

    const updated = await this.prisma.batch.update({
      where: { id },
      data: { isFrozen: !existing.isFrozen },
    });

    return {
      success: true,
      isFrozen: updated.isFrozen,
      message: updated.isFrozen ? 'تم تجميد التشغيلة وعزلها عن المبيعات' : 'تم تنشيط التشغيلة وإعادتها للبيع',
    };
  }

  /**
   * حذف تشغيلة بشرط عدم ارتباطها بحركات بيع
   */
  async remove(id: string) {
    const existing = await this.prisma.batch.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('التشغيلة غير موجودة');
    }

    const hasSales = await this.prisma.saleItem.findFirst({ where: { batchId: id } });
    if (hasSales) {
      throw new BadRequestException('لا يمكن حذف التشغيلة لوجود فواتير مبيعات سابقة مرتبطة بها');
    }

    await this.prisma.inventoryTransaction.deleteMany({ where: { batchId: id } });
    await this.prisma.batch.delete({ where: { id } });

    return { success: true, message: 'تم حذف التشغيلة بنجاح' };
  }
}
