/**
 * واجهة موحدة لأي cache adapter (LRU أو Redis).
 * كل التطبيقات تستخدم هذه الواجهة — لا تعتمد على التنفيذ الفعلي.
 */
export interface ICacheService {
  /** قراءة قيمة من الـ cache — ترجع null لو غير موجودة أو منتهية */
  get<T>(key: string): Promise<T | null>;

  /** حفظ قيمة في الـ cache مع TTL بالثواني */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;

  /** حذف مفتاح واحد */
  del(key: string): Promise<void>;

  /** حذف كل المفاتيح المطابقة لـ pattern (يدعم *) */
  delByPattern(pattern: string): Promise<void>;

  /** مسح كل شيء (بحذر — للتطوير فقط) */
  clear(): Promise<void>;
}

/** رمز الحقن (Injection token) — يُستخدم في @Inject(CACHE_SERVICE) */
export const CACHE_SERVICE = Symbol('CACHE_SERVICE');

/**
 * توليد مفتاح cache موحّد.
 *
 * الشكل: report:v1:{reportName}:{companyId}:{sortedFilters}
 *
 * - companyId إلزامي (لعزل cache بين الشركات)
 * - الفلاتر تُرتَّب أبجدياً لضمان نفس المفتاح لنفس المدخلات
 * - الفلاتر الفارغة (undefined/null) تُستبعد
 *
 * @example
 * buildCacheKey('DailySalesService', 'comp-uuid', { fromDate: '2026-09-24', branchId: 'br-1' })
 * // "report:v1:DailySalesService:comp-uuid:branchId=br-1&fromDate=2026-09-24"
 */
export function buildCacheKey(
  reportName: string,
  companyId: string,
  filters: Record<string, unknown>,
  version = 'v1',
): string {
  const stable = Object.keys(filters)
    .filter(
      (k) =>
        filters[k] !== undefined &&
        filters[k] !== null &&
        filters[k] !== '',
    )
    .sort()
    .map((k) => `${k}=${filters[k]}`)
    .join('&');

  return `report:${version}:${reportName}:${companyId}:${stable}`;
}
