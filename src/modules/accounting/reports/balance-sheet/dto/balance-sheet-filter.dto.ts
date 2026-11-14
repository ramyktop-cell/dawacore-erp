import {
  IsOptional,
  IsDateString,
  IsIn,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * نمط المقارنة (Comparative Balance Sheet).
 *
 *   - NONE                      : بلا مقارنة
 *   - PREVIOUS_YEAR_SAME_DATE   : نفس التاريخ من السنة السابقة (افتراضي)
 *   - PREVIOUS_YEAR_END         : نهاية السنة المالية السابقة (31 ديسمبر)
 */
export type BalanceSheetCompareMode =
  | 'NONE'
  | 'PREVIOUS_YEAR_SAME_DATE'
  | 'PREVIOUS_YEAR_END';

/**
 * BalanceSheetFilterDto
 * ─────────────────────
 * فلاتر تقرير الميزانية العمومية.
 *
 * ⚠️ ملاحظة معمارية:
 *   Balance Sheet = **لقطة لحظية** (Point-in-time)
 *   لا يستخدم fromDate/toDate كفترة، بل asOfDate.
 *
 *   fromDate/toDate من ReportFilterDto تُتجاهل (مع دعم toDate كـ fallback لـ asOfDate).
 */
export class BalanceSheetFilterDto extends ReportFilterDto {
  /**
   * تاريخ "كما في" (As of).
   * الرصيد يُحسب من بداية الشركة حتى نهاية هذا اليوم.
   *
   * افتراضي: اليوم الحالي (في timezone الشركة).
   */
  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  /**
   * نمط المقارنة.
   * افتراضي: PREVIOUS_YEAR_SAME_DATE.
   */
  @IsOptional()
  @IsIn(['NONE', 'PREVIOUS_YEAR_SAME_DATE', 'PREVIOUS_YEAR_END'])
  compareMode?: BalanceSheetCompareMode = 'PREVIOUS_YEAR_SAME_DATE';

  /**
   * المستوى الأقصى للعرض في الشجرة (1-5).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;

  /**
   * إخفاء الحسابات بصفر رصيد.
   * افتراضي: true.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  hideZeroBalances?: boolean = true;

  /**
   * إظهار الحسابات غير النشطة.
   * افتراضي: false.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean = false;

  /**
   * إظهار سطري "الأرباح المبقاة" و"صافي دخل الفترة".
   * افتراضي: true.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  showRetainedEarnings?: boolean = true;

  /**
   * بداية السنة المالية (شهر 1-12).
   * عند عدم تحديده → يُقرأ من `company.fiscalYearStartMonth`
   * مع fallback لشهر 1 (يناير).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;
}
