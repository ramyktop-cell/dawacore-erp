import {
  IsUUID,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * CustomerAgingDrillFilterDto
 * ───────────────────────────
 * فلاتر Drill-Down: عرض فواتير عميل معين.
 */
export class CustomerAgingDrillFilterDto extends ReportFilterDto {
  /**
   * معرف العميل (إلزامي).
   */
  @IsUUID('4')
  customerId!: string;

  /**
   * تاريخ "كما في".
   * افتراضي: اليوم الحالي.
   */
  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  // ─── Thresholds (نفس القيم للتناسق)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  bucket1?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(365)
  bucket2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(365)
  bucket3?: number;
}
