import { validateScaleSettings } from '../../../shared/scale-core';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { UpdateSettingsDto } from '../dto/settings.dto';
import {
  SettingResponse,
  SettingsByCategory,
  DEFAULT_SETTINGS,
} from '../interfaces/settings.interface';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, Map<string, string>>();

  constructor(private readonly prisma: PrismaService) {}

  private getCache(companyId: string) {
    if (!this.cache.has(companyId)) this.cache.set(companyId, new Map());
    return this.cache.get(companyId)!;
  }

  async getValue(companyId: string, key: string): Promise<string | null> {
    const c = this.getCache(companyId);
    if (c.has(key)) return c.get(key)!;
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    if (row) {
      c.set(key, row.value);
      return row.value;
    }
    return null;
  }

  async getNumberValue(
    companyId: string,
    key: string,
    def = 0,
  ): Promise<number> {
    const v = await this.getValue(companyId, key);
    if (v === null) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  async getBooleanValue(
    companyId: string,
    key: string,
    def = false,
  ): Promise<boolean> {
    const v = await this.getValue(companyId, key);
    if (v === null) return def;
    return v === 'true' || v === '1';
  }

  async getAll(companyId: string): Promise<SettingResponse[]> {
    const rows = await this.prisma.companySetting.findMany({
      where: { companyId },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    const c = this.getCache(companyId);
    rows.forEach((r) => c.set(r.key, r.value));
    return rows.map(this.toResponse);
  }

  async getByCategory(companyId: string): Promise<SettingsByCategory> {
    const rows = await this.getAll(companyId);
    const g: SettingsByCategory = {};
    for (const r of rows) {
      if (!g[r.category]) g[r.category] = [];
      g[r.category].push(r);
    }
    return g;
  }

  async bulkUpdate(
    companyId: string,
    dto: UpdateSettingsDto | { settings: Record<string, string> | any[] },
  ): Promise<SettingResponse[]> {
    return this.prisma.$transaction(async (tx) => {
      const results: SettingResponse[] = [];
      const items: any[] = Array.isArray(dto.settings)
        ? dto.settings
        : Object.entries(dto.settings || {}).map(([key, value]) => ({
            key,
            value: String(value),
          }));

      for (const item of items) {
        if (item.key === 'scaleBarcodeConfig') {
          try { item.value = JSON.stringify(validateScaleSettings(JSON.parse(item.value))); }
          catch(error) { throw new BadRequestException((error as Error).message); }
        }
        this.validate(item.value, item.dataType ?? 'STRING');
        const u = await tx.companySetting.upsert({
          where: { companyId_key: { companyId, key: item.key } },
          update: {
            value: item.value,
            ...(item.dataType ? { dataType: item.dataType } : {}),
            ...(item.category ? { category: item.category } : {}),
            ...(item.description ? { description: item.description } : {}),
          },
          create: {
            companyId,
            key: item.key,
            value: item.value,
            dataType: item.dataType ?? 'STRING',
            category: item.category ?? 'SYSTEM',
            description: item.description,
          },
        });
        results.push(this.toResponse(u));
      }
      this.cache.delete(companyId);
      return results;
    });
  }

  async updateOne(
    companyId: string,
    key: string,
    value: string,
  ): Promise<SettingResponse> {
    if (key === 'scaleBarcodeConfig') {
      try { value = JSON.stringify(validateScaleSettings(JSON.parse(value))); }
      catch(error) { throw new BadRequestException((error as Error).message); }
    }
    const ex = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    if (!ex) throw new NotFoundException(`الإعداد "${key}" غير موجود`);
    if (!ex.isEditable)
      throw new BadRequestException(`الإعداد "${key}" غير قابل للتعديل`);
    this.validate(value, ex.dataType);
    const u = await this.prisma.companySetting.update({
      where: { id: ex.id },
      data: { value },
    });
    this.cache.delete(companyId);
    return this.toResponse(u);
  }

  async seedDefaults(companyId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      let n = 0;
      for (const d of DEFAULT_SETTINGS) {
        const ex = await tx.companySetting.findUnique({
          where: { companyId_key: { companyId, key: d.key } },
        });
        if (!ex) {
          await tx.companySetting.create({ data: { companyId, ...d } });
          n++;
        }
      }
      this.cache.delete(companyId);
      return n;
    });
  }

  async resetDefaults(
    companyId: string,
  ): Promise<{ success: boolean; message: string; seededCount: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.companySetting.deleteMany({ where: { companyId } });
      let n = 0;
      for (const d of DEFAULT_SETTINGS) {
        await tx.companySetting.create({ data: { companyId, ...d } });
        n++;
      }
      this.cache.delete(companyId);
      return {
        success: true,
        message: 'تمت استعادة الإعدادات الافتراضية بنجاح',
        seededCount: n,
      };
    });
  }

  private validate(v: string, t: string): void {
    if (t === 'NUMBER' && !Number.isFinite(Number(v)))
      throw new BadRequestException(`"${v}" ليس رقماً`);
    if (t === 'BOOLEAN' && !['true', 'false', '0', '1'].includes(v))
      throw new BadRequestException(`"${v}" ليس boolean`);
    if (t === 'JSON') {
      try {
        JSON.parse(v);
      } catch {
        throw new BadRequestException(`"${v}" ليس JSON`);
      }
    }
    if (
      t === 'UUID' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        v,
      )
    )
      throw new BadRequestException(`"${v}" ليس UUID`);
  }

  private toResponse(row: any): SettingResponse {
    return {
      key: row.key,
      value: row.value,
      dataType: row.dataType,
      category: row.category,
      description: row.description,
      isEditable: row.isEditable,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
