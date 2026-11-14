import { IsOptional, IsDateString, IsUUID, IsInt, Min, Max, IsIn, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { IsGreaterThanOrEqualTo } from './validators/is-greater-than-or-equal-to.decorator';

/**
 * DTO موحد لفلترة كل التقارير المالية.
 *
 * ⚠️ ملاحظات:
 * 1. companyId يُستخرج من req.user.companyId في الـ Controller.
 * 2. page/limit للتقارير التفصيلية فقط.
 * 3. sortBy يُقيَّد في DTO الابن.
 */
export class ReportFilterDto {
  @IsOptional()
  @IsUUID('4', { message: 'معرّف الفرع غير صالح' })
  branchId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'صيغة تاريخ البداية غير صالحة (YYYY-MM-DD)' })
  fromDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'صيغة تاريخ النهاية غير صالحة (YYYY-MM-DD)' })
  @IsGreaterThanOrEqualTo('fromDate', {
    message: 'تاريخ النهاية يجب أن يكون بعد أو يطابق تاريخ البداية',
  })
  toDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'صيغة تاريخ الرصيد غير صالحة (YYYY-MM-DD)' })
  @IsGreaterThanOrEqualTo('fromDate', {
    message: 'تاريخ الرصيد يجب أن يكون بعد أو يطابق تاريخ البداية',
  })
  asOfDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم الصفحة يجب أن يكون عدداً صحيحاً' })
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500, { message: 'الحد الأقصى 500 عنصر في الصفحة' })
  limit?: number = 50;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'اتجاه الترتيب: asc أو desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
