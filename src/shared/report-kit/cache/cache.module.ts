import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { CACHE_SERVICE } from './cache.service';
import { LruCacheAdapter } from './lru-cache.adapter';
import { RedisCacheAdapter } from './redis-cache.adapter';

/**
 * خيارات تهيئة الـ cache.
 */
export interface CacheModuleOptions {
  /** نوع الـ driver */
  driver: 'lru' | 'redis';

  /** مطلوب فقط لو driver = 'redis' */
  redisUrl?: string;
}

/**
 * وحدة الـ cache الديناميكية.
 *
 * مثال:
 *   ReportCacheModule.forRoot({
 *     driver: process.env.REDIS_URL ? 'redis' : 'lru',
 *     redisUrl: process.env.REDIS_URL,
 *   })
 */
@Global()
@Module({})
export class ReportCacheModule {
  static forRoot(options: CacheModuleOptions): DynamicModule {
    const provider: Provider = this.buildProvider(options);

    return {
      module: ReportCacheModule,
      providers: [provider],
      exports: [provider],
    };
  }

  private static buildProvider(options: CacheModuleOptions): Provider {
    if (options.driver === 'redis') {
      if (!options.redisUrl) {
        throw new Error(
          'ReportCacheModule: redisUrl is required when driver="redis"',
        );
      }
      return {
        provide: CACHE_SERVICE,
        useFactory: () => new RedisCacheAdapter(options.redisUrl!),
      };
    }

    // default: LRU
    return {
      provide: CACHE_SERVICE,
      useClass: LruCacheAdapter,
    };
  }
}
