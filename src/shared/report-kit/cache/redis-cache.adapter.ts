import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ICacheService } from './cache.service';

/**
 * Adapter للتخزين المؤقت على Redis.
 *
 * ✅ مناسب لـ:
 *   - multi-node / Kubernetes
 *   - إبطال cache موحّد بين السيرفرات
 *   - Production عالي الحجم
 *
 * ⚙️ الإعداد:
 *   ReportCacheModule.forRoot({
 *     driver: 'redis',
 *     redisUrl: process.env.REDIS_URL,   // redis://localhost:6379
 *   })
 */
@Injectable()
export class RedisCacheAdapter implements ICacheService, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheAdapter.name);
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('🔗 Redis connected');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`⚠️  Failed to parse cache value for ${key}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    // نستخدم SCAN بدل KEYS (آمن على production — لا يحجب Redis)
    let cursor = '0';
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        // v6 يرجّع نتيجة del كـ number، v5 كـ number كذلك
        const deleted = await this.redis.del(...keys);
        totalDeleted += deleted;
      }
    } while (cursor !== '0');

    this.logger.log(
      `🗑️  Redis: invalidated ${totalDeleted} keys matching "${pattern}"`,
    );
  }

  async clear(): Promise<void> {
    await this.redis.flushdb();
    this.logger.warn('🗑️  Redis: cache cleared entirely (flushdb)');
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
      this.logger.log('🔌 Redis connection closed');
    } catch (error) {
      this.logger.warn('⚠️  Failed to close Redis connection gracefully');
    }
  }
}
