import { parseScaleBarcodeValue, scaleQuantity } from '../shared/scale-core';
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/security.policy';
import {
  CreateMedicineDto,
  UpdateMedicineDto,
  BulkImportMedicinesDto,
} from './dto/create-medicine.dto';

export function getDefaultUnitLabel(unitType: string, isWeighed?: boolean): string {
  if (isWeighed && unitType === 'UNIT') return 'كيلوجرام';
  switch (unitType) {
    case 'BOX':
      return 'علبة';
    case 'STRIP':
      return 'شريط';
    case 'UNIT':
    default:
      return 'حبة';
  }
}

@Injectable()
export class MedicinesService {
  private readonly logger = new Logger(MedicinesService.name);
  constructor(private readonly prisma: PrismaService) {}

  getDefaultUnitLabel(unitType: string, isWeighed?: boolean): string {
    return getDefaultUnitLabel(unitType, isWeighed);
  }

  async resolveBranchScope(requestedBranchId: string | undefined, actor?: AuthenticatedUser, required = false) {
    if (!actor) throw new NotFoundException('الفرع غير موجود');
    if (actor.branchId) {
      if (requestedBranchId && requestedBranchId !== actor.branchId) {
        throw new NotFoundException('الفرع غير موجود');
      }
      return actor.branchId;
    }
    if (!requestedBranchId) {
      if (required) throw new BadRequestException('يجب تحديد فرع نقطة البيع');
      return undefined;
    }
    const branch = await this.prisma.branch.findFirst({
      where: actor.role === Role.SUPER_ADMIN
        ? { id: requestedBranchId, isActive: true }
        : { id: requestedBranchId, companyId: actor.companyId, isActive: true },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');
    return branch.id;
  }

  /**
   * جلب قائمة الأدوية مع الوحدات والمخزون والترقيم والفلترة
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    branchId?: string;
  }) {
    const { page = 1, limit = 20, search, category, branchId } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.MedicineWhereInput = {};

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (search && search.trim().length > 0) {
      const q = search.trim();
      where.OR = [
        { tradeName: { contains: q, mode: 'insensitive' } },
        { scientificName: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { units: { some: { barcode: { contains: q } } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.medicine.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          units: {
            orderBy: { multiplier: 'desc' },
          },
          batches: {
            select: {
              quantityInBase: true,
              branchId: true,
              expiryDate: true,
            },
          },
        },
      }),
      this.prisma.medicine.count({ where }),
    ]);

    const formattedItems = items.map((med) => {
      // إجمالي الكمية بجميع الفروع
      const totalStockInBase = med.batches.reduce((sum, b) => sum + (b.quantityInBase || 0), 0);

      // كمية الفرع المحدد إذا تم تمرير branchId
      const branchStockInBase = branchId
        ? med.batches
            .filter((b) => b.branchId === branchId)
            .reduce((sum, b) => sum + (b.quantityInBase || 0), 0)
        : totalStockInBase;

      // العلبة الأساسية
      const defaultUnit = med.units.find((u) => u.isDefault) || med.units[0];

      return {
        isWeighed: med.isWeighed,
        scalePlu: med.scalePlu,
        id: med.id,
        code: med.code,
        barcode: med.barcode,
        tradeName: med.tradeName,
        scientificName: med.scientificName,
        category: med.category,
        minStockLevel: med.minStockLevel,
        createdAt: med.createdAt,
        totalStockInBase: branchId ? branchStockInBase : totalStockInBase,
        branchStockInBase,
        isLowStock: branchStockInBase <= med.minStockLevel,
        units: med.units.map((u) => ({
          id: u.id,
          unitType: u.unitType,
          label: u.label || getDefaultUnitLabel(u.unitType, med.isWeighed),
          multiplier: u.multiplier,
          price: Number(u.price),
          minSalePrice: u.minSalePrice !== undefined && u.minSalePrice !== null ? Number(u.minSalePrice) : Number(u.price),
          barcode: u.barcode,
          isDefault: u.isDefault,
        })),
        defaultUnit: defaultUnit
          ? {
              unitType: defaultUnit.unitType,
              label: defaultUnit.label || getDefaultUnitLabel(defaultUnit.unitType, med.isWeighed),
              multiplier: defaultUnit.multiplier,
              price: Number(defaultUnit.price),
              minSalePrice: defaultUnit.minSalePrice !== undefined && defaultUnit.minSalePrice !== null ? Number(defaultUnit.minSalePrice) : Number(defaultUnit.price),
            }
          : null,
      };
    });

    return {
      items: formattedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * جلب التصنيفات الدوائية المتاحة
   */
  async getCategories(): Promise<string[]> {
    const raw = await this.prisma.medicine.findMany({
      select: { category: true },
      distinct: ['category'],
      where: { category: { not: '' } },
      orderBy: { category: 'asc' },
    });
    return raw.map((r) => r.category).filter(Boolean);
  }

  /**
   * جلب دواء واحد بالتفصيل
   */
  async findOne(id: string) {
    const med = await this.prisma.medicine.findUnique({
      where: { id },
      include: {
        units: { orderBy: { multiplier: 'desc' } },
        batches: {
          orderBy: { expiryDate: 'asc' },
          select: {
            id: true,
            batchNumber: true,
            branchId: true,
            expiryDate: true,
            costPrice: true,
            salePrice: true,
            quantityInBase: true,
            isFrozen: true,
          },
        },
      },
    });

    if (!med) {
      throw new NotFoundException('الدواء غير موجود');
    }

    const totalStockInBase = med.batches.reduce((sum, b) => sum + (b.quantityInBase || 0), 0);

    return {
      isWeighed: med.isWeighed,
      scalePlu: med.scalePlu,
      id: med.id,
      code: med.code,
      barcode: med.barcode,
      tradeName: med.tradeName,
      scientificName: med.scientificName,
      category: med.category,
      minStockLevel: med.minStockLevel,
      createdAt: med.createdAt,
      totalStockInBase,
      isLowStock: totalStockInBase <= med.minStockLevel,
      units: med.units.map((u) => ({
        id: u.id,
        unitType: u.unitType,
        label: u.label || getDefaultUnitLabel(u.unitType, med.isWeighed),
        multiplier: u.multiplier,
        price: Number(u.price),
        minSalePrice: u.minSalePrice !== undefined && u.minSalePrice !== null ? Number(u.minSalePrice) : Number(u.price),
        barcode: u.barcode,
        isDefault: u.isDefault,
      })),
      batches: med.batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        branchId: b.branchId,
        expiryDate: b.expiryDate,
        costPrice: Number(b.costPrice),
        salePrice: Number(b.salePrice),
        quantityInBase: b.quantityInBase,
        isFrozen: b.isFrozen,
      })),
    };
  }

  /**
   * إنشاء صنف دوائي جديد مع وحدات القياس
   */
  public validateWeighed(dto: { isWeighed?: boolean; scalePlu?: string; units?: any[] }) {
    if (!dto.isWeighed) return;
    if (!/^\d{5}$/.test(dto.scalePlu || '')) throw new BadRequestException('كود PLU للصنف الموزون يجب أن يكون 5 أرقام مع الاحتفاظ بالأصفار');
    const units = dto.units || [];
    const kilo = units.find((unit) => unit.unitType === 'UNIT');
    if (!kilo || Number(kilo.multiplier) !== 1000) {
      throw new BadRequestException('الصنف الموزون يجب أن يحتوي وحدة كيلو بمعامل 1000 جرام');
    }
    if (new Set(units.map((unit) => unit.unitType)).size !== units.length) {
      throw new BadRequestException('لا يمكن تكرار نوع الوحدة للصنف الموزون');
    }
    const invalidUnit = units.find((unit) => {
      const multiplier = Number(unit.multiplier);
      const price = new Prisma.Decimal(unit.price);
      return !Number.isInteger(multiplier) || multiplier < 1 || price.lessThan(0.01) || !price.equals(price.toDecimalPlaces(2));
    });
    if (invalidUnit) {
      throw new BadRequestException('كل وحدة للصنف الموزون تحتاج معامل تحويل صحيحاً وسعر بيع موجباً بمنزلتين عشريتين كحد أقصى');
    }
  }

  private async validateScientificName(value: string, actor?: AuthenticatedUser) {
    if (value?.trim()) return;
    const settings = actor?.companyId ? await this.prisma.companySetting.findMany({
      where: { companyId: actor.companyId, key: { in: ['businessType', 'BUSINESS_TYPE'] } },
      select: { key: true, value: true },
    }) : [];
    const rawBusinessType = (settings.find(s => s.key === 'businessType') || settings.find(s => s.key === 'BUSINESS_TYPE'))?.value;
    const businessType = (rawBusinessType || '').trim().toUpperCase();
    if (!['SUPERMARKET', 'TRADING', 'CLOTHING'].includes(businessType)) {
      throw new BadRequestException('الاسم العلمي مطلوب لنشاط الصيدلية؛ تأكد من حفظ نوع النشاط في إعدادات الشركة');
    }
  }

  async create(dto: CreateMedicineDto, actor?: AuthenticatedUser) {
    await this.validateScientificName(dto.scientificName, actor);
    this.validateWeighed(dto);
    if (dto.isWeighed && await this.prisma.medicine.findUnique({where:{scalePlu:dto.scalePlu}})) throw new BadRequestException('كود PLU مستخدم لصنف ميزان آخر');
    // التحقق من تكرار الباركود
    const existingBarcode = await this.prisma.medicine.findUnique({
      where: { barcode: dto.barcode.trim() },
    });
    if (existingBarcode) {
      throw new BadRequestException(`الباركود (${dto.barcode}) مسجل مسبقاً لدواء: ${existingBarcode.tradeName}`);
    }

    // توليد كود إن لم يوجد
    let code = dto.code?.trim();
    if (!code) {
      const count = await this.prisma.medicine.count();
      code = `MED-${String(count + 1).padStart(5, '0')}`;
    }

    const existingCode = await this.prisma.medicine.findUnique({
      where: { code },
    });
    if (existingCode) {
      code = `MED-${Date.now().toString().slice(-6)}`;
    }

    // ضمان وجود وحدة افتراضية واحدة على الأقل
    const unitsData = (dto.units && dto.units.length > 0)
      ? dto.units
      : [{ unitType: 'BOX' as const, multiplier: 1, price: 0, isDefault: true, label: 'علبة' }];

    const hasDefault = unitsData.some((u) => u.isDefault);
    if (!hasDefault && unitsData.length > 0) {
      unitsData[0].isDefault = true;
    }

    const medicine = await this.prisma.medicine.create({
      data: {
        code,
        isWeighed: dto.isWeighed ?? false,
        scalePlu: dto.isWeighed ? dto.scalePlu : null,
        barcode: dto.barcode.trim(),
        tradeName: dto.tradeName.trim(),
        scientificName: (dto.scientificName || '').trim(),
        category: dto.category.trim(),
        minStockLevel: dto.minStockLevel ?? 10,
        units: {
          create: unitsData.map((u) => {
            const price = new Prisma.Decimal(u.price || 0);
            if (price.isNegative()) {
              throw new BadRequestException(`سعر الوحدة (${u.unitType}) لا يمكن أن يكون سالباً`);
            }
            let minSalePrice: Prisma.Decimal;
            if (dto.isWeighed) {
              minSalePrice = price;
            } else if (u.minSalePrice !== undefined && u.minSalePrice !== null) {
              minSalePrice = new Prisma.Decimal(u.minSalePrice);
              if (minSalePrice.isNegative()) {
                throw new BadRequestException(`الحد الأدنى لسعر البيع للوحدة (${u.unitType}) لا يمكن أن يكون سالباً`);
              }
              if (minSalePrice.greaterThan(price)) {
                throw new BadRequestException(`الحد الأدنى لسعر البيع للوحدة (${u.unitType}) لا يمكن أن يتجاوز سعر البيع الافتراضي`);
              }
            } else {
              minSalePrice = price;
            }
            return {
              unitType: u.unitType,
              label: (u.label && u.label.trim()) ? u.label.trim() : getDefaultUnitLabel(u.unitType, dto.isWeighed),
              multiplier: Number(u.multiplier),
              price,
              minSalePrice,
              barcode: u.barcode ? u.barcode.trim() : null,
              isDefault: !!u.isDefault,
            };
          }),
        },
      },
      include: {
        units: true,
      },
    });

    return medicine;
  }

  /**
   * تعديل بيانات دواء ووحداته
   */
  async update(id: string, dto: UpdateMedicineDto, actor?: AuthenticatedUser) {
    if (dto.scientificName !== undefined) await this.validateScientificName(dto.scientificName, actor);
    const existing = await this.prisma.medicine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('الدواء غير موجود');
    }

    if (dto.scalePlu) { const duplicate = await this.prisma.medicine.findUnique({where:{scalePlu:dto.scalePlu}}); if (duplicate && duplicate.id !== id) throw new BadRequestException('كود PLU مستخدم لصنف ميزان آخر'); }
    const changingMeasure = dto.isWeighed !== undefined && dto.isWeighed !== existing.isWeighed;
    if (changingMeasure && (await this.prisma.batch.count({where:{medicineId:id}}) || await this.prisma.purchaseItem.count({where:{medicineId:id}}))) throw new BadRequestException('لا يمكن تحويل وحدة صنف له مخزون أو مشتريات؛ أنشئ صنف ميزان جديداً أو نفذ ترحيلاً مدققاً');
    const effectiveWeighed = dto.isWeighed ?? existing.isWeighed;
    this.validateWeighed({isWeighed:effectiveWeighed,scalePlu:dto.scalePlu ?? existing.scalePlu ?? undefined,units:dto.units || await this.prisma.medicineUnit.findMany({where:{medicineId:id}})});
    // فحص تكرار الباركود في حال تعديله
    if (dto.barcode && dto.barcode.trim() !== existing.barcode) {
      const duplicate = await this.prisma.medicine.findUnique({
        where: { barcode: dto.barcode.trim() },
      });
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException('الباركود الجديد مسجل بالفعل لدواء آخر');
      }
    }

    // تنفيذ التحديث داخل معاملة ذرية
    return await this.prisma.$transaction(async (tx) => {
      if (dto.units && dto.units.length > 0) {
        // حذف الوحدات القديمة واستبدالها
        await tx.medicineUnit.deleteMany({ where: { medicineId: id } });

        const unitsData = dto.units;
        const hasDefault = unitsData.some((u) => u.isDefault);
        if (!hasDefault) unitsData[0].isDefault = true;

        await tx.medicineUnit.createMany({
          data: unitsData.map((u) => {
            const price = new Prisma.Decimal(u.price || 0);
            if (price.isNegative()) {
              throw new BadRequestException(`سعر الوحدة (${u.unitType}) لا يمكن أن يكون سالباً`);
            }
            let minSalePrice: Prisma.Decimal;
            if (effectiveWeighed) {
              minSalePrice = price;
            } else if (u.minSalePrice !== undefined && u.minSalePrice !== null) {
              minSalePrice = new Prisma.Decimal(u.minSalePrice);
              if (minSalePrice.isNegative()) {
                throw new BadRequestException(`الحد الأدنى لسعر البيع للوحدة (${u.unitType}) لا يمكن أن يكون سالباً`);
              }
              if (minSalePrice.greaterThan(price)) {
                throw new BadRequestException(`الحد الأدنى لسعر البيع للوحدة (${u.unitType}) لا يمكن أن يتجاوز سعر البيع الافتراضي`);
              }
            } else {
              minSalePrice = price;
            }
            return {
              medicineId: id,
              unitType: u.unitType,
              label: (u.label && u.label.trim()) ? u.label.trim() : getDefaultUnitLabel(u.unitType, effectiveWeighed),
              multiplier: Number(u.multiplier),
              price,
              minSalePrice,
              barcode: u.barcode ? u.barcode.trim() : null,
              isDefault: !!u.isDefault,
            };
          }),
        });
      }

      const updated = await tx.medicine.update({
        where: { id },
        data: {
          ...(dto.isWeighed !== undefined ? { isWeighed: dto.isWeighed, scalePlu: dto.isWeighed ? dto.scalePlu ?? existing.scalePlu : null } : dto.scalePlu !== undefined ? { scalePlu: effectiveWeighed ? dto.scalePlu : null } : {}),
          ...(dto.tradeName ? { tradeName: dto.tradeName.trim() } : {}),
          ...(dto.scientificName ? { scientificName: dto.scientificName.trim() } : {}),
          ...(dto.category ? { category: dto.category.trim() } : {}),
          ...(dto.barcode ? { barcode: dto.barcode.trim() } : {}),
          ...(dto.code ? { code: dto.code.trim() } : {}),
          ...(dto.minStockLevel !== undefined ? { minStockLevel: dto.minStockLevel } : {}),
        },
        include: {
          units: true,
        },
      });

      return updated;
    });
  }

  /**
   * حذف صنف دوائي مع التحقق من عدم وجود حركات سابقة
   */
  async remove(id: string) {
    const existing = await this.prisma.medicine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('الدواء غير موجود');
    }

    const hasBatches = await this.prisma.batch.findFirst({ where: { medicineId: id } });
    if (hasBatches) {
      throw new BadRequestException('لا يمكن حذف الدواء لوجود تشغيلات ومخزون مرتبط به في الفروع');
    }

    const hasPurchases = await this.prisma.purchaseItem.findFirst({ where: { medicineId: id } });
    if (hasPurchases) {
      throw new BadRequestException('لا يمكن حذف الدواء لوجود فواتير مشتريات وتوريدات سابقة له');
    }

    await this.prisma.medicineUnit.deleteMany({ where: { medicineId: id } });
    await this.prisma.medicine.delete({ where: { id } });

    return { success: true, message: 'تم حذف الدواء ووحداته بنجاح' };
  }

  /**
   * استعلام سريع بالبحث (للبحث الفوري بالاسم أو الباركود)
   */
  async search(query: string, branchId?: string) {
    if (!query || query.trim().length === 0) return [];

    const medicines = await this.prisma.medicine.findMany({
      where: {
        OR: [
          { tradeName: { contains: query, mode: 'insensitive' } },
          { scientificName: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
          { code: { contains: query, mode: 'insensitive' } },
          { units: { some: { barcode: { contains: query } } } },
        ],
      },
      include: {
        units: true,
        batches: {
          where: { isFrozen: false, ...(branchId ? { branchId } : {}) },
          select: { quantityInBase: true, branchId: true },
        },
      },
      take: 24,
    });

    return medicines.map((med) => {
      const totalStockInBase = (med.batches || []).reduce(
        (sum, b) => sum + (b.quantityInBase || 0),
        0,
      );
      return {
        isWeighed: med.isWeighed,
        scalePlu: med.scalePlu,
        id: med.id,
        medicineId: med.id,
        code: med.code,
        tradeName: med.tradeName,
        scientificName: med.scientificName,
        barcode: med.barcode,
        category: med.category,
        minStockLevel: med.minStockLevel,
        totalStockInBase,
        units: med.units.map((u) => ({
          unitType: u.unitType,
          label: u.label || getDefaultUnitLabel(u.unitType, med.isWeighed),
          multiplier: u.multiplier,
          price: Number(u.price),
          minSalePrice: u.minSalePrice !== undefined && u.minSalePrice !== null ? Number(u.minSalePrice) : Number(u.price),
          barcode: u.barcode || undefined,
          isDefault: u.isDefault,
        })),
      };
    });
  }

  /**
   * مطابقة الباركود الممسوح بدقة
   */
  async scan(barcode: string, branchId?: string, companyId?: string) {
    if (!barcode) {
      throw new NotFoundException('الباركود مطلوب');
    }

    let medicine: any = await this.prisma.medicine.findFirst({
      where: { barcode: barcode.trim() },
      include: {
        units: true,
        batches: {
          where: { isFrozen: false, ...(branchId ? { branchId } : {}) },
          select: { quantityInBase: true, branchId: true },
        },
      },
    });

    if (!medicine) {
      const unit = await this.prisma.medicineUnit.findFirst({
        where: { barcode: barcode.trim() },
        include: {
          medicine: {
            include: {
              units: true,
              batches: {
                where: { isFrozen: false, ...(branchId ? { branchId } : {}) },
                select: { quantityInBase: true, branchId: true },
              },
            },
          },
        },
      });

      if (unit && unit.medicine) {
        medicine = unit.medicine;
      }
    }

    let scaleWeight: number | undefined = undefined;
    let isScaleScan = false;
    const cleanBarcode = barcode.trim();

    if (!medicine) {
      if (!companyId && branchId) companyId = (await this.prisma.branch.findUnique({where:{id:branchId},select:{companyId:true}}))?.companyId;
      const setting = companyId ? await this.prisma.companySetting.findUnique({where:{companyId_key:{companyId,key:'scaleBarcodeConfig'}}}) : null;
      let parsed;
      try { parsed = parseScaleBarcodeValue(cleanBarcode,setting ? JSON.parse(setting.value) : {}); }
      catch(error) { throw new BadRequestException(error instanceof Error ? error.message : 'باركود ميزان غير صالح'); }
      if (parsed) {
        medicine = await this.prisma.medicine.findUnique({where:{scalePlu:parsed.itemCode},include:{units:true,batches:{where:{isFrozen:false,...(branchId?{branchId}:{})},select:{quantityInBase:true,branchId:true}}}});
        if (medicine?.isWeighed) {
          const unit=medicine.units.find((u:any)=>u.unitType==='UNIT' && u.multiplier===1000);
          if (!unit) throw new BadRequestException('وحدة كيلو الصنف غير صحيحة');
          try { scaleWeight=scaleQuantity(parsed,Number(unit.price)); }
          catch(error) { throw new BadRequestException((error as Error).message); }
          isScaleScan=true;
        } else medicine=null;
      }
    }

    if (!medicine) {
      throw new NotFoundException(`لم يتم العثور على أي صنف مطابق للباركود: ${barcode}`);
    }

    const totalStockInBase = (medicine.batches || []).reduce(
      (sum: number, b: any) => sum + (b.quantityInBase || 0),
      0,
    );

    return {
      isWeighed: medicine.isWeighed,
      scalePlu: medicine.scalePlu,
      id: medicine.id,
      medicineId: medicine.id,
      code: medicine.code,
      tradeName: medicine.tradeName,
      scientificName: medicine.scientificName,
      barcode: medicine.barcode,
      category: medicine.category,
      minStockLevel: medicine.minStockLevel,
      totalStockInBase,
      ...(isScaleScan ? { isScaleScan: true, scaleWeight } : {}),
      units: medicine.units.map((u: any) => ({
        unitType: u.unitType,
        label: u.label || getDefaultUnitLabel(u.unitType, medicine.isWeighed),
        multiplier: u.multiplier,
        price: Number(u.price),
        minSalePrice: u.minSalePrice !== undefined && u.minSalePrice !== null ? Number(u.minSalePrice) : Number(u.price),
        barcode: u.barcode || undefined,
        isDefault: u.isDefault,
      })),
    };
  }

  /**
   * استعلام الأدوية للـ POS مع التشغيلات المتاحة مرتبة حسب FEFO
   */
  async findForPos(branchId?: string, search?: string) {
    if (!search || search.trim().length === 0) return [];

    const branchCondition = branchId ? { branchId } : {};

    const medicines = await this.prisma.medicine.findMany({
      where: {
        OR: [
          { tradeName: { contains: search, mode: 'insensitive' } },
          { scientificName: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search } },
          { units: { some: { barcode: { contains: search } } } },
        ],
        batches: {
          some: {
            ...branchCondition,
            quantityInBase: { gt: 0 },
            expiryDate: { gt: new Date() },
          },
        },
      },
      include: {
        units: true,
        batches: {
          where: {
            ...branchCondition,
            quantityInBase: { gt: 0 },
            expiryDate: { gt: new Date() },
          },
          orderBy: { expiryDate: 'asc' },
        },
      },
      take: 15,
    });

    return medicines.map((med) => ({
      isWeighed: med.isWeighed,
      scalePlu: med.scalePlu,
      id: med.id,
      medicineId: med.id,
      code: med.code,
      tradeName: med.tradeName,
      scientificName: med.scientificName,
      barcode: med.barcode,
      category: med.category,
      units: med.units.map((u) => ({
        unitType: u.unitType,
        label: u.label || getDefaultUnitLabel(u.unitType, med.isWeighed),
        multiplier: u.multiplier,
        price: Number(u.price),
        minSalePrice: u.minSalePrice !== undefined && u.minSalePrice !== null ? Number(u.minSalePrice) : Number(u.price),
        barcode: u.barcode || undefined,
        isDefault: u.isDefault,
      })),
      batches: med.batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        costPrice: Number(b.costPrice),
        salePrice: Number(b.salePrice),
        quantityInBase: b.quantityInBase,
        isFrozen: b.isFrozen,
      })),
    }));
  }

  /**
   * جلب أكثر الأصناف مبيعاً (Top 20 Best Sellers) مع أرصدة المخزون والأسعار والوحدات
   */
  async getTopSelling(limit: number = 20, branchId?: string) {
    const branchCondition = branchId ? { branchId } : {};
    const soldMap = new Map<string, number>();

    try {
      const aggregateLimit = Math.max(100, limit * 5);
      const directItems = branchId
        ? await this.prisma.$queryRaw<Array<{ medicineId: string; totalSold: bigint }>>(Prisma.sql`
            SELECT b."medicineId", SUM(si."totalBaseQty")::bigint AS "totalSold"
            FROM "SaleItem" si
            JOIN "Sale" s ON s.id = si."saleId"
            JOIN "Batch" b ON b.id = si."batchId"
            WHERE s."branchId" = ${branchId}
            GROUP BY b."medicineId"
            ORDER BY "totalSold" DESC
            LIMIT ${aggregateLimit}
          `)
        : [];
      for (const item of directItems) {
        soldMap.set(item.medicineId, (soldMap.get(item.medicineId) || 0) + Number(item.totalSold));
      }

      const invoiceItems = branchId
        ? await this.prisma.$queryRaw<Array<{ medicineId: string; totalSold: bigint }>>(Prisma.sql`
            SELECT sii."medicineId", SUM(sii.quantity)::bigint AS "totalSold"
            FROM "SaleInvoiceItem" sii
            JOIN "SalesInvoice" inv ON inv.id = sii."invoiceId"
            WHERE inv."branchId" = ${branchId}
            GROUP BY sii."medicineId"
            ORDER BY "totalSold" DESC
            LIMIT ${aggregateLimit}
          `)
        : [];
      for (const item of invoiceItems) {
        soldMap.set(item.medicineId, (soldMap.get(item.medicineId) || 0) + Number(item.totalSold));
      }
    } catch (e: any) {
      this.logger.warn(`Failed to aggregate sales for top-selling: ${e.message}`);
    }

    // فرز معرفات الأدوية حسب أعلى كمية مبيعات
    const sortedMedIds = Array.from(soldMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([medId]) => medId);

    const targetMedIds = sortedMedIds.slice(0, limit);

    // جلب الأدوية الأكثر مبيعاً
    let medicines = await this.prisma.medicine.findMany({
      where: targetMedIds.length > 0 ? { id: { in: targetMedIds } } : undefined,
      include: {
        units: { orderBy: { multiplier: 'desc' } },
        batches: {
          where: {
            ...branchCondition,
            quantityInBase: { gt: 0 },
            expiryDate: { gt: new Date() },
            isFrozen: false,
          },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    // استكمال العدد إلى 20 صنفاً في حال كانت المبيعات السابقة أقل من 20 صنفاً (Backfill)
    if (medicines.length < limit) {
      const existingIds = medicines.map((m) => m.id);
      const remainingCount = limit - medicines.length;
      const additional = await this.prisma.medicine.findMany({
        where: existingIds.length > 0 ? { id: { notIn: existingIds } } : undefined,
        take: remainingCount,
        orderBy: { createdAt: 'desc' },
        include: {
          units: { orderBy: { multiplier: 'desc' } },
          batches: {
            where: {
              ...branchCondition,
              quantityInBase: { gt: 0 },
              expiryDate: { gt: new Date() },
              isFrozen: false,
            },
            orderBy: { expiryDate: 'asc' },
          },
        },
      });
      medicines = [...medicines, ...additional];
    }

    // ترتيب النتيجة بحسب رتبة الأكثر مبيعاً
    medicines.sort((a, b) => {
      const salesA = soldMap.get(a.id) || 0;
      const salesB = soldMap.get(b.id) || 0;
      return salesB - salesA;
    });

    return medicines.slice(0, limit).map((med, idx) => {
      const totalStockInBase = med.batches.reduce((sum, b) => sum + (b.quantityInBase || 0), 0);
      const defaultUnit = med.units.find((u) => u.isDefault) || med.units[0];

      return {
        isWeighed: med.isWeighed,
        scalePlu: med.scalePlu,
        id: med.id,
        medicineId: med.id,
        code: med.code,
        tradeName: med.tradeName,
        scientificName: med.scientificName,
        barcode: med.barcode,
        category: med.category,
        minStockLevel: med.minStockLevel,
        totalStockInBase,
        availableStockInBase: totalStockInBase,
        branchStockInBase: totalStockInBase,
        isLowStock: totalStockInBase <= med.minStockLevel,
        rank: idx + 1,
        totalSold: soldMap.get(med.id) || 0,
        units: med.units.map((u) => ({
          id: u.id,
          unitType: u.unitType,
          label: u.label || getDefaultUnitLabel(u.unitType, med.isWeighed),
          multiplier: u.multiplier,
          price: Number(u.price),
          minSalePrice: u.minSalePrice !== undefined && u.minSalePrice !== null ? Number(u.minSalePrice) : Number(u.price),
          barcode: u.barcode || undefined,
          isDefault: u.isDefault,
        })),
        batches: med.batches.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          costPrice: Number(b.costPrice),
          salePrice: Number(b.salePrice),
          quantityInBase: b.quantityInBase,
          isFrozen: b.isFrozen,
        })),
        defaultUnit: defaultUnit
          ? {
              id: defaultUnit.id,
              unitType: defaultUnit.unitType,
              label: defaultUnit.label || getDefaultUnitLabel(defaultUnit.unitType, med.isWeighed),
              multiplier: defaultUnit.multiplier,
              price: Number(defaultUnit.price),
              minSalePrice: defaultUnit.minSalePrice !== undefined && defaultUnit.minSalePrice !== null ? Number(defaultUnit.minSalePrice) : Number(defaultUnit.price),
              isDefault: defaultUnit.isDefault,
            }
          : null,
      };
    });
  }

  /**
   * استيراد جماعي للأصناف والأسعار والأرصدة الافتتاحية من Odoo أو Excel/CSV
   */
  async bulkImport(dto: BulkImportMedicinesDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('قائمة الأصناف المراد استيرادها فارغة');
    }

    // تحديد الفرع الافتراضي لإنشاء التشغيلات الافتتاحية في حال وجود كميات
    let targetBranchId = dto.branchId;
    if (!targetBranchId) {
      const firstBranch = await this.prisma.branch.findFirst({ orderBy: { createdAt: 'asc' } });
      targetBranchId = firstBranch?.id;
    }

    let createdCount = 0;
    let updatedCount = 0;
    let batchesCreatedCount = 0;
    const errors: Array<{ row: number; tradeName: string; reason: string }> = [];

    for (let idx = 0; idx < dto.items.length; idx++) {
      const row = dto.items[idx];
      const tradeName = (row.tradeName || '').trim();
      if (!tradeName) continue;

      try {
        const cleanBarcode =
          (row.barcode || '').trim() ||
          `ODOO-${Date.now().toString().slice(-6)}-${String(idx + 1).padStart(4, '0')}`;
        const cleanCode =
          (row.code || '').trim() ||
          `ITM-${Date.now().toString().slice(-5)}-${String(idx + 1).padStart(4, '0')}`;
        const scientificName = (row.scientificName || tradeName).trim();
        const category = (row.category || 'عام').trim();
        const salePrice = Math.max(0, Number(row.salePrice ?? 0));
        const costPrice = Math.max(0, Number(row.costPrice ?? (salePrice * 0.8)));
        const minStockLevel = Math.max(0, Math.round(Number(row.minStockLevel ?? 5)));
        const quantityOnHand = Math.max(0, Math.round(Number(row.quantityOnHand ?? 0)));

        // التحقق مما إذا كان الصنف موجوداً مسبقاً بالباركود أو الكود أو الاسم التجاري
        const existing = await this.prisma.medicine.findFirst({
          where: {
            OR: [
              { barcode: cleanBarcode },
              { code: cleanCode },
              { tradeName: { equals: tradeName, mode: 'insensitive' } },
            ],
          },
          include: { units: true },
        });

        let medicineId: string;

        if (existing) {
          medicineId = existing.id;
          await this.prisma.medicine.update({
            where: { id: existing.id },
            data: {
              tradeName,
              scientificName,
              category,
              minStockLevel,
            },
          });

          // تحديث سعر الوحدة الافتراضية إذا تم تمرير سعر بيع موجب
          if (salePrice > 0 && existing.units.length > 0) {
            const defUnit = existing.units.find((u) => u.isDefault) || existing.units[0];
            await this.prisma.medicineUnit.update({
              where: { id: defUnit.id },
              data: { price: salePrice, minSalePrice: salePrice },
            });
          }
          updatedCount++;
        } else {
          const created = await this.prisma.medicine.create({
            data: {
              code: cleanCode,
              barcode: cleanBarcode,
              tradeName,
              scientificName,
              category,
              minStockLevel,
              units: {
                create: [
                  {
                    unitType: 'BOX',
                    label: 'علبة',
                    multiplier: 1,
                    price: salePrice,
                    minSalePrice: salePrice,
                    barcode: cleanBarcode,
                    isDefault: true,
                  },
                ],
              },
            },
          });
          medicineId = created.id;
          createdCount++;
        }

        // إذا كان هناك رصيد متاح في ملف Odoo وفرع محدد، ننشئ دفعة مخزنية افتتاحية
        if (quantityOnHand > 0 && targetBranchId) {
          const batchNo =
            (row.batchNumber || '').trim() ||
            `ODOO-OB-${new Date().getFullYear()}-${String(idx + 1).padStart(4, '0')}`;

          let expDate = new Date();
          expDate.setFullYear(expDate.getFullYear() + 2); // صلاحية افتراضية سنتين إذا لم يحددها ملف أودو
          if (row.expiryDate) {
            const parsed = new Date(row.expiryDate);
            if (!isNaN(parsed.getTime())) {
              expDate = parsed;
            }
          }

          await this.prisma.batch.create({
            data: {
              medicineId,
              branchId: targetBranchId,
              batchNumber: batchNo,
              expiryDate: expDate,
              costPrice,
              salePrice: salePrice > 0 ? salePrice : costPrice,
              quantityInBase: quantityOnHand,
            },
          });
          batchesCreatedCount++;
        }
      } catch (err: any) {
        errors.push({
          row: idx + 1,
          tradeName,
          reason: err?.message || 'خطأ غير متوقع',
        });
      }
    }

    return {
      success: true,
      totalProcessed: dto.items.length,
      createdCount,
      updatedCount,
      batchesCreatedCount,
      errorsCount: errors.length,
      errors: errors.slice(0, 20),
    };
  }
}

