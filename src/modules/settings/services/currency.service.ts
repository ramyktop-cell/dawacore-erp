import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  AddCompanyCurrencyDto,
  UpdateExchangeRateDto,
  CreateCurrencyDto,
} from '../dto/currency.dto';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listGlobalCurrencies() {
    return this.prisma.currency.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async createGlobalCurrency(dto: CreateCurrencyDto) {
    const ex = await this.prisma.currency.findUnique({
      where: { code: dto.code.toUpperCase() },
    });
    if (ex) throw new ConflictException(`العملة ${dto.code} موجودة`);
    return this.prisma.currency.create({
      data: {
        code: dto.code.toUpperCase(),
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        symbol: dto.symbol,
        decimalPlaces: dto.decimalPlaces ?? 2,
      },
    });
  }

  async listCompanyCurrencies(companyId: string) {
    const rows = await this.prisma.companyCurrency.findMany({
      where: { companyId },
      include: { currency: true },
      orderBy: [{ isBase: 'desc' }, { currency: { code: 'asc' } }],
    });
    return rows.map((r) => ({
      id: r.id,
      currencyId: r.currencyId,
      code: r.currency.code,
      nameAr: r.currency.nameAr,
      nameEn: r.currency.nameEn,
      symbol: r.currency.symbol,
      decimalPlaces: r.currency.decimalPlaces,
      isBase: r.isBase,
      exchangeRate: Number(r.exchangeRate),
      effectiveFrom: r.effectiveFrom.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async getBaseCurrency(companyId: string) {
    const base = await this.prisma.companyCurrency.findFirst({
      where: { companyId, isBase: true },
      include: { currency: true },
    });
    if (!base) throw new NotFoundException('لا توجد عملة أساسية');
    return {
      id: base.id,
      code: base.currency.code,
      nameAr: base.currency.nameAr,
      symbol: base.currency.symbol,
      decimalPlaces: base.currency.decimalPlaces,
    };
  }

  async addCurrencyToCompany(
    companyId: string,
    dto: AddCompanyCurrencyDto,
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.currency.findUnique({ where: { id: dto.currencyId } });
      if (!c || !c.isActive) throw new NotFoundException('العملة غير موجودة');
      const ex = await tx.companyCurrency.findUnique({
        where: {
          companyId_currencyId: { companyId, currencyId: dto.currencyId },
        },
      });
      if (ex) throw new ConflictException(`العملة ${c.code} مضافة مسبقاً`);
      if (dto.isBase) {
        await tx.companyCurrency.updateMany({
          where: { companyId, isBase: true },
          data: { isBase: false },
        });
      }
      return tx.companyCurrency.create({
        data: {
          companyId,
          currencyId: dto.currencyId,
          isBase: dto.isBase ?? false,
          exchangeRate: new Prisma.Decimal(dto.exchangeRate),
          createdBy: userId,
        },
        include: { currency: true },
      });
    });
  }

  async updateExchangeRate(
    companyId: string,
    companyCurrencyId: string,
    dto: UpdateExchangeRateDto,
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ex = await tx.companyCurrency.findFirst({
        where: { id: companyCurrencyId, companyId },
        include: { currency: true },
      });
      if (!ex) throw new NotFoundException('العملة غير موجودة');
      if (ex.isBase)
        throw new BadRequestException('لا يمكن تعديل سعر العملة الأساسية');
      await tx.exchangeRateHistory.create({
        data: {
          companyId,
          currencyId: ex.currencyId,
          oldRate: ex.exchangeRate,
          newRate: new Prisma.Decimal(dto.newRate),
          changedBy: userId,
          reason: dto.reason,
        },
      });
      return tx.companyCurrency.update({
        where: { id: companyCurrencyId },
        data: {
          exchangeRate: new Prisma.Decimal(dto.newRate),
          effectiveFrom: new Date(),
        },
        include: { currency: true },
      });
    });
  }

  async getExchangeHistory(companyId: string, currencyId?: string, limit = 100) {
    return this.prisma.exchangeRateHistory.findMany({
      where: { companyId, ...(currencyId ? { currencyId } : {}) },
      include: { currency: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async removeCurrencyFromCompany(companyId: string, companyCurrencyId: string) {
    const ex = await this.prisma.companyCurrency.findFirst({
      where: { id: companyCurrencyId, companyId },
    });
    if (!ex) throw new NotFoundException('العملة غير موجودة');
    if (ex.isBase)
      throw new BadRequestException('لا يمكن حذف العملة الأساسية');
    await this.prisma.companyCurrency.delete({
      where: { id: companyCurrencyId },
    });
    return { success: true };
  }

  async convertToBase(
    companyId: string,
    amount: number | Prisma.Decimal,
    fromCurrencyCode: string,
  ): Promise<Prisma.Decimal> {
    const c = await this.prisma.companyCurrency.findFirst({
      where: { companyId, currency: { code: fromCurrencyCode } },
      select: { exchangeRate: true, isBase: true },
    });
    if (!c) throw new NotFoundException(`العملة ${fromCurrencyCode} غير مسجلة`);
    if (c.isBase) return new Prisma.Decimal(amount).toDecimalPlaces(2);
    return new Prisma.Decimal(amount)
      .times(new Prisma.Decimal(c.exchangeRate))
      .toDecimalPlaces(2);
  }

  async convertFromBase(
    companyId: string,
    amount: number | Prisma.Decimal,
    toCurrencyCode: string,
  ): Promise<Prisma.Decimal> {
    const c = await this.prisma.companyCurrency.findFirst({
      where: { companyId, currency: { code: toCurrencyCode } },
      select: { exchangeRate: true, isBase: true },
    });
    if (!c) throw new NotFoundException(`العملة ${toCurrencyCode} غير مسجلة`);
    if (c.isBase) return new Prisma.Decimal(amount).toDecimalPlaces(2);
    const r = new Prisma.Decimal(c.exchangeRate);
    if (r.isZero()) throw new BadRequestException('سعر الصرف صفر');
    return new Prisma.Decimal(amount).dividedBy(r).toDecimalPlaces(2);
  }
}
