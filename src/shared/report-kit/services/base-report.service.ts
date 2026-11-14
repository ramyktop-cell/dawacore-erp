import {
  Logger,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReportFilterDto } from '../dto/report-filter.dto';
import { ReportContext } from '../interfaces/report-context.interface';
import { ReportMetaBuilder } from './report-meta.builder';
import { round2 } from '../utils/round.util';
import {
  CACHE_SERVICE,
  ICacheService,
  buildCacheKey,
} from '../cache/cache.service';

/**
 * عقد أساسي لكل تقرير.
 */
export interface IReportService<
  TFilter extends ReportFilterDto,
  TData,
> {
  generate(
    filters: TFilter,
    companyId: string,
    userId: string,
  ): Promise<TData>;
}

/**
 * خيارات الـ cache — يمكن لكل تقرير تجاوزها.
 */
export interface CacheOptions {
  /** مدة الصلاحية بالثواني (افتراضي: 300) */
  ttlSeconds?: number;

  /** تفعيل/تعطيل الـ cache لهذا التقرير (افتراضي: true) */
  enabled?: boolean;
}

/**
 * BaseReportService
 * ─────────────────
 * Abstract class يحتوي على "البنية التحتية" لكل تقرير:
 *   🔒 حماية multi-tenant (companyId من JWT فقط)
 *   🔒 التحقق من ملكية الفرع
 *   ⚡ Cache lookup + invalidation
 *   📋 بناء الـ meta تلقائياً
 *   🕐 Error handling + logging موحّد
 *
 * كل تقرير يورثها وينفّذ فقط:
 *   - getReportTitle()
 *   - buildReport()  (منطق التقرير فقط)
 *
 * ويستفيد مجاناً بكل ما سبق.
 */
export abstract class BaseReportService<
  TFilter extends ReportFilterDto,
  TData,
> implements IReportService<TFilter, TData> {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly metaBuilder: ReportMetaBuilder,
    @Inject(CACHE_SERVICE) protected readonly cache: ICacheService,
  ) {}

  // ─────────────────────────────────────────────
  // Abstract hooks — يُنفّذها كل تقرير
  // ─────────────────────────────────────────────

  /**
   * عنوان التقرير بالعربية (يُستخدم في meta والـ logs).
   */
  protected abstract getReportTitle(): string;

  /**
   * منطق التقرير الفعلي.
   * يُستدعى بعد التحقق الأمني وبناء الـ meta.
   */
  protected abstract buildReport(
    filters: TFilter,
    context: ReportContext,
  ): Promise<TData>;

  /**
   * خيارات الـ cache — يمكن تجاوزها في التقرير.
   */
  protected getCacheOptions(): CacheOptions {
    return { ttlSeconds: 300, enabled: true };
  }

  // ─────────────────────────────────────────────
  // Entry point — كل التقارير تستدعي generate()
  // ─────────────────────────────────────────────

  async generate(
    filters: TFilter,
    companyId: string,
    userId: string,
  ): Promise<TData> {
    const startTime = Date.now();

    // ─── 🔒 1. حماية أمنية: companyId يجب ألا يُمرَّر في filters
    if ((filters as Record<string, unknown>).companyId) {
      this.logger.error(
        `🚨 SECURITY: companyId detected in filters. user=${userId}, value=${(filters as Record<string, unknown>).companyId}`,
      );
      throw new BadRequestException('معامل غير مسموح: companyId');
    }

    // ─── 🔒 2. التأكد من وجود companyId
    if (!companyId) {
      throw new ForbiddenException('جلسة غير صالحة — companyId مفقود');
    }

    // ─── 🔒 3. التحقق من ملكية الفرع للشركة
    if (filters.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: filters.branchId, companyId },
        select: { id: true },
      });

      if (!branch) {
        this.logger.warn(
          `🚨 SECURITY: branchId=${filters.branchId} not owned by company=${companyId}, user=${userId}`,
        );
        throw new ForbiddenException('غير مصرح لك بالوصول لهذا الفرع');
      }
    }

    // ─── ⚡ 4. Cache lookup
    const cacheOpts = this.getCacheOptions();
    const cacheKey = buildCacheKey(
      this.constructor.name,
      companyId,
      this.extractFilterSnapshot(filters),
    );

    const skipCache = filters.skipCache === 'true';

    if (cacheOpts.enabled && !skipCache) {
      const cached = await this.cache.get<TData>(cacheKey);
      if (cached) {
        this.logger.log(
          `⚡ CACHE HIT — ${this.getReportTitle()} (${Date.now() - startTime}ms)`,
        );
        return cached;
      }
    }

    // ─── 📋 5. بناء التقرير
    try {
      const { meta, timezone, currency } = await this.metaBuilder.build({
        title: this.getReportTitle(),
        companyId,
        userId,
        branchId: filters.branchId,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        filters: this.extractFilterSnapshot(filters),
      });

      const context: ReportContext = {
        companyId,
        userId,
        timezone,
        currency,
        meta,
      };

      const data = await this.buildReport(filters, context);

      // ─── 💾 6. حفظ في الـ cache
      if (cacheOpts.enabled) {
        await this.cache.set(
          cacheKey,
          data,
          cacheOpts.ttlSeconds ?? 300,
        );
      }

      this.logger.log(
        `✅ ${this.getReportTitle()} — ${Date.now() - startTime}ms${skipCache ? ' (bypass cache)' : ''}`,
      );

      return data;
    } catch (error) {
      this.logger.error(
        `❌ ${this.getReportTitle()} failed — ${Date.now() - startTime}ms`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * إبطال الـ cache لهذه الشركة لهذا التقرير.
   * يُستدعى من Event Listeners عند تغيّر البيانات.
   *
   * @example
   * await dailySalesService.invalidate('company-uuid');
   */
  async invalidate(companyId: string): Promise<void> {
    const pattern = `report:v1:${this.constructor.name}:${companyId}:*`;
    await this.cache.delByPattern(pattern);
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * يستخرج لقطة من الفلاتر لاستخدامها في:
   *   - بناء cache key
   *   - تخزينها في meta.filters
   *
   * يستبعد: skipCache, page, limit (لأنها لا تؤثر على محتوى التقرير)
   */
  protected extractFilterSnapshot(
    filters: TFilter,
  ): Record<string, unknown> {
    const {
      skipCache: _s,
      page: _p,
      limit: _l,
      ...rest
    } = filters as Record<string, unknown>;
    return rest;
  }

  /**
   * يُرجع كائن where لعزل الشركة تلقائياً في استعلامات المبيعات.
   *
   * ⚠️ مهم: في DawaCore، جداول Sale/SaleItem تتبع الشركة عبر الفرع،
   * وليس عبر companyId مباشر. استخدم هذا الـ helper دائماً بدلاً من
   * كتابة { companyId } مباشرة (الذي يسبب أخطاء Prisma أو تسريب بيانات).
   *
   * @example
   * where: {
   *   ...this.companyFilter(ctx.companyId),
   *   createdAt: { gte: from, lte: to },
   * }
   */
  protected companyFilter(companyId: string) {
    return { branch: { companyId } } as const;
  }

  /** Helper للتقريب المالي — مُتاح لكل التقارير */
  protected round2 = round2;
}
