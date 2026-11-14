import { IsUUID, IsOptional, IsDateString } from 'class-validator';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * BalanceSheetDrillFilterDto
 * ──────────────────────────
 * فلاتر التنقل الشجري في الميزانية العمومية.
 */
export class BalanceSheetDrillFilterDto extends ReportFilterDto {
  /**
   * الحساب الأب الذي نريد عرض أبنائه.
   */
  @IsUUID('4')
  parentAccountId!: string;

  /**
   * تاريخ "كما في".
   * عند عدم التحديد → اليوم الحالي.
   */
  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}
