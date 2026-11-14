import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * OpenFiscalYearDto
 * فتح سنة مالية جديدة + ترحيل الأرصدة تلقائياً.
 */
export class OpenFiscalYearDto {
  @IsInt({ message: 'السنة يجب أن تكون رقماً صحيحاً' })
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * CloseFiscalYearDto
 * إقفال سنة مالية + تصفير الإيرادات والمصروفات.
 *
 * - retainedEarningsAccountId: الحساب الطرفي (isLeaf=true, type=EQUITY)
 *   أو يمكن الاعتماد على Account.isRetainedEarnings=true تلقائياً.
 */
export class CloseFiscalYearDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year: number;

  @IsOptional()
  @IsUUID('4')
  retainedEarningsAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /**
   * Dry-run: يعرض معاينة قيد الإقفال بدون تنفيذ.
   */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  dryRun?: boolean;
}

/**
 * ReopenFiscalYearDto
 * إعادة فتح سنة مقفلة (SUPER_ADMIN فقط).
 */
export class ReopenFiscalYearDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year: number;

  @IsString()
  @MaxLength(500)
  reason: string;
}
