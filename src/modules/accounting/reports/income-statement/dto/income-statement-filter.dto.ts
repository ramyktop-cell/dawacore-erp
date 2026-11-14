import {
  IsOptional,
  IsIn,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * نمط المقارنة (Comparative Mode).
 *   - NONE          : بلا مقارنة
 *   - PREVIOUS_YEAR : مقارنة بنفس الفترة من العام السابق (default)
 *   - PREVIOUS_PERIOD: مقارنة بالفترة السابقة مباشرة (بنفس الطول)
 */
export type IncomeStatementCompareMode =
  | 'NONE'
  | 'PREVIOUS_YEAR'
  | 'PREVIOUS_PERIOD';

/**
 * IncomeStatementFilterDto
 * ────────────────────────
 * فلاتر قائمة الدخل ومجمع الأرباح والخسائر (Income Statement / P&L).
 *
 * ⚠️ مهم: في DawaCore، كل المصروفات تحت EXPENSE (لا يوجد COGS منفصل).
 * لذا القائمة مبسّطة: Revenue − Expenses = Net Income.
 */
export class IncomeStatementFilterDto extends ReportFilterDto {
  /**
   * نمط المقارنة.
   * افتراضي: PREVIOUS_YEAR (متوافق مع المعايير المحاسبية IFRS / GAAP).
   */
  @IsOptional()
  @IsIn(['NONE', 'PREVIOUS_YEAR', 'PREVIOUS_PERIOD'])
  compareMode?: IncomeStatementCompareMode = 'PREVIOUS_YEAR';

  /**
   * المستوى الأقصى للعرض في الشجرة (1-5).
   * المستوى 1 = الحسابات الرئيسية فقط.
   * اتركه فارغاً لعرض الشجرة كاملة.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;

  /**
   * إخفاء الحسابات بدون حركة في الفترة.
   * افتراضي: true.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  hideZeroMovement?: boolean = true;

  /**
   * إظهار الحسابات غير النشطة (isActive=false).
   * افتراضي: false.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean = false;
}
