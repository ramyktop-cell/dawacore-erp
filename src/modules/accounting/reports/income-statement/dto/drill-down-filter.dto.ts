import {
  IsUUID,
  IsOptional,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';
import { IncomeStatementCompareMode } from './income-statement-filter.dto';

/**
 * DrillDownFilterDto
 * ──────────────────
 * فلاتر التنقل الشجري (Drill-Down) في قائمة الدخل.
 *
 * مثال: من "الإيرادات" (level 1) → "المبيعات" (level 2) → القيود.
 */
export class DrillDownFilterDto extends ReportFilterDto {
  /**
   * الحساب الأب الذي نريد عرض أبنائه.
   * إلزامي.
   */
  @IsUUID('4')
  parentAccountId!: string;

  /**
   * نمط المقارنة — نفس نمط القائمة الأساسية.
   */
  @IsOptional()
  @IsIn(['NONE', 'PREVIOUS_YEAR', 'PREVIOUS_PERIOD'])
  compareMode?: IncomeStatementCompareMode = 'PREVIOUS_YEAR';

  /**
   * إخفاء الحسابات بدون حركة.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  hideZeroMovement?: boolean = true;
}
