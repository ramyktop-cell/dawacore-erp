import {
  IsOptional,
  IsUUID,
  IsIn,
  IsString,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * تصنيفات الأصناف حسب سرعة الحركة.
 */
export type StockClassificationFilter =
  | 'FAST_MOVING'
  | 'NORMAL'
  | 'SLOW_MOVING'
  | 'STAGNANT'
  | 'NO_STOCK';

/**
 * StockMovementFilterDto
 * ──────────────────────
 * فلاتر تقرير حركة الأصناف والرواكد.
 *
 * يورث من ReportFilterDto:
 *   - fromDate, toDate (الفترة المطلوب تحليل الحركة خلالها)
 *   - branchId
 *   - page, limit
 *   - skipCache
 */
export class StockMovementFilterDto extends ReportFilterDto {
  /**
   * عرض صنف واحد بالتفصيل عبر الـ ID.
   */
  @IsOptional()
  @IsUUID('4')
  medicineId?: string;

  /**
   * بحث بالاسم التجاري، العلمي، أو الباركود.
   */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * فلترة حسب فئة الصنف (String مباشر في schema).
   * مثال: "مضادات حيوية"
   */
  @IsOptional()
  @IsString()
  category?: string;

  /**
   * فلترة حسب مورد الصنف (آخر أمر شراء).
   */
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  /**
   * فلترة حسب التصنيف المحسوب لسرعة الحركة.
   */
  @IsOptional()
  @IsIn(['FAST_MOVING', 'NORMAL', 'SLOW_MOVING', 'STAGNANT', 'NO_STOCK'])
  classification?: StockClassificationFilter;

  /**
   * إظهار الرواكد فقط (اختصار لـ classification=STAGNANT).
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  onlyStagnant?: boolean;

  /**
   * إظهار الأصناف تحت حد المخزون الأدنى فقط (currentStock <= minStockLevel).
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  onlyBelowMinStock?: boolean;

  /**
   * إخفاء الأصناف صفرية المخزون.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  hideZeroStock?: boolean;

  /**
   * عتبة الركود بالأيام (عدد الأيام دون حركة بيع لاحتساب الصنف راكداً).
   * افتراضي: 90 يوماً.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  stagnantThresholdDays?: number = 90;

  /**
   * ترتيب النتائج.
   * افتراضي: stockValue (الأعلى قيمة أولاً).
   */
  @IsOptional()
  @IsIn([
    'turnoverRatio',
    'coverageDays',
    'quantitySold',
    'currentStock',
    'stockValue',
    'lastSaleDate',
  ])
  sortBy?:
    | 'turnoverRatio'
    | 'coverageDays'
    | 'quantitySold'
    | 'currentStock'
    | 'stockValue'
    | 'lastSaleDate' = 'stockValue';

  /**
   * اتجاه الترتيب (تنازلي desc أو تصاعدي asc).
   * افتراضي: desc.
   */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
