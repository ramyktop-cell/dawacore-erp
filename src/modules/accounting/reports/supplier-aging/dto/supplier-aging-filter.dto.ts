import {
  IsOptional,
  IsDateString,
  IsIn,
  IsBoolean,
  IsInt,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * حقول الترتيب المتاحة لتقرير أعمار ديون الموردين.
 */
export type SupplierAgingSortBy =
  | 'partnerName'
  | 'totalBalance'
  | 'oldestInvoiceDays'
  | 'riskLevel';

/**
 * SupplierAgingFilterDto
 * ──────────────────────
 * فلاتر تقرير أعمار ديون الموردين (Accounts Payable Aging).
 */
export class SupplierAgingFilterDto extends ReportFilterDto {
  /**
   * تاريخ "كما في" (Point-in-time).
   * افتراضي: اليوم الحالي.
   */
  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  /**
   * فلترة بمورد محدد.
   */
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  /**
   * التوافق مع بارامتر partnerId القديم.
   */
  @IsOptional()
  @IsUUID('4')
  partnerId?: string;

  /**
   * حد الشريحة الأولى بالأيام (افتراضي: 30).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  bucket1?: number = 30;

  /**
   * حد الشريحة الثانية بالأيام (افتراضي: 60).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(240)
  bucket2?: number = 60;

  /**
   * حد الشريحة الثالثة بالأيام (افتراضي: 90).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(365)
  bucket3?: number = 90;

  /**
   * تضمين الموردين بدون مديونية (الرصيد الصفري)؟
   * افتراضي: false.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeZeroBalance?: boolean = false;

  /**
   * التوافق مع legacy onlyWithBalance ('true' | 'false').
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyWithBalance?: boolean;

  /**
   * تضمين قائمة الفواتير غير المسددة لكل مورد؟
   * افتراضي: true.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInvoices?: boolean = true;

  /**
   * حقل الترتيب (افتراضي: totalBalance).
   */
  @IsOptional()
  @IsIn(['partnerName', 'totalBalance', 'oldestInvoiceDays', 'riskLevel'])
  sortBy?: SupplierAgingSortBy = 'totalBalance';

  /**
   * اتجاه الترتيب (افتراضي: desc).
   */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
