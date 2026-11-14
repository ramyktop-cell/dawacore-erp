import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CACHE_SERVICE, ICacheService } from 'src/shared/report-kit';

/**
 * ReportCacheListener
 * ───────────────────
 * يستمع لأحداث البيع ويُبطل الـ cache تلقائياً.
 *
 * عند إضافة/تعديل/حذف فاتورة:
 *   → كل تقارير هذه الشركة تُبطَل
 *   → الطلب التالي يبني cache جديد ببيانات حديثة
 *
 * ⚠️ يعمل فقط لو الـ SalesService يُطلق أحداث EventEmitter.
 *    لو لسه ما عندك emit('sale.created')، هذا الـ listener
 *    سيكون جاهزاً لكن لن يُنفّذ حتى تُضيف الإطلاق.
 */
@Injectable()
export class ReportCacheListener {
  private readonly logger = new Logger(ReportCacheListener.name);

  constructor(@Inject(CACHE_SERVICE) private readonly cache: ICacheService) {}

  @OnEvent('sale.created')
  @OnEvent('sale.updated')
  @OnEvent('sale.returned')
  @OnEvent('sale.deleted')
  async onSaleChanged(payload: { companyId?: string }): Promise<void> {
    if (!payload?.companyId) {
      this.logger.warn('⚠️  sale event received without companyId — skipping');
      return;
    }

    const pattern = `report:v1:*:${payload.companyId}:*`;
    await this.cache.delByPattern(pattern);

    this.logger.log(
      `♻️  Report cache invalidated for company=${payload.companyId}`,
    );
  }
}
