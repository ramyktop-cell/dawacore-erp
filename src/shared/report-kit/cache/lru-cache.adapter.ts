import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { ICacheService } from './cache.service';

/**
 * Adapter للتخزين المؤقت داخل الذاكرة (in-memory LRU).
 *
 * ✅ مناسب لـ:
 *   - بيئة تطوير (single instance)
 *   - سيرفر واحد (single-node production)
 *   - اختبارات
 *
 * ❌ غير مناسب لـ:
 *   - multi-node (كل node لها cache منفصل)
 *   - Kubernetes pods متعددة
 *
 * في هذه الحالات استخدم RedisCacheAdapter.
 */
@Injectable()
export class LruCacheAdapter implements ICacheService {
  private readonly logger = new Logger(LruCacheAdapter.name);

  private readonly cache = new LRUCache<string, { value: unknown; expiresAt: number }>({
    max: 500,                 // حد أقصى 500 تقرير
    ttl: 5 * 60 * 1000,       // 5 دقائق افتراضي
    updateAgeOnGet: false,
    updateAgeOnHas: false,
  });

  /**
   * فهرس للمفاتيح حسب companyId — لتفعيل delByPattern بشكل سريع.
   * بنية: Map<companyId, Set<fullCacheKey>>
   */
  private readonly tagIndex = new Map<string, Set<string>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // فحص يدوي للـ TTL (احتياطي — LRUCache يدير TTL تلقائياً)
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    // فهرسة حسب companyId
    const companyId = this.extractCompanyId(key);
    if (companyId) {
      let set = this.tagIndex.get(companyId);
      if (!set) {
        set = new Set();
        this.tagIndex.set(companyId, set);
      }
      set.add(key);
    }
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
    const companyId = this.extractCompanyId(key);
    if (companyId) {
      this.tagIndex.get(companyId)?.delete(key);
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const toDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
      const companyId = this.extractCompanyId(key);
      if (companyId) {
        this.tagIndex.get(companyId)?.delete(key);
      }
    }

    this.logger.log(
      `🗑️  LRU: invalidated ${toDelete.length} keys matching "${pattern}"`,
    );
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.tagIndex.clear();
    this.logger.warn('🗑️  LRU: cache cleared entirely');
  }

  /**
   * يستخرج companyId من مفتاح بصيغة:
   * report:v1:{reportName}:{companyId}:...
   */
  private extractCompanyId(key: string): string | null {
    const parts = key.split(':');
    return parts.length >= 4 ? parts[3] : null;
  }

  /** لأغراض الـ metrics/debugging */
  get size(): number {
    return this.cache.size;
  }
}
