import {
  IsOptional,
  IsUUID,
  IsIn,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * GeneralLedgerFilterDto
 * ──────────────────────
 * فلاتر تقرير دفتر الأستاذ العام (كشف الحساب التفصيلي).
 *
 * يدعم وضعين:
 *   1. Single Account Mode  → عند تمرير `accountId`
 *   2. All Accounts Mode    → عند عدم تمرير `accountId`
 *
 * يورث من ReportFilterDto:
 *   - fromDate, toDate (الفترة)
 *   - branchId (فلترة الحركات بالفرع)
 *   - page, limit (pagination على عدد الحسابات في All Mode)
 *   - skipCache
 */
export class GeneralLedgerFilterDto extends ReportFilterDto {
  /**
   * فلترة على حساب واحد (يفعّل Single Account Mode).
   * عند تحديده: يُعرض كشف كامل للحساب مع كل قيوده.
   */
  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  /**
   * فلترة حسب نوع الحساب (ASSET, LIABILITY, ...).
   * يُستخدم في All Mode.
   */
  @IsOptional()
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
  accountType?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

  /**
   * المستوى في شجرة الحسابات (1-5).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;

  /**
   * حد أقصى للقيود المعروضة لكل حساب.
   * افتراضي: 100. القيمة 0 = بلا حد.
   *
   * ⚠️ الحد الفعلي في DB هو COUNT، والعرض يُقتطع عند هذه القيمة.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  entriesPerAccount?: number = 100;

  /**
   * إخفاء الحسابات بدون أي حركة (لا افتتاحي ولا حركة).
   * افتراضي: true.
   *
   * ⚠️ FIX: نستخدم !== 'false' && !== false للحفاظ على القيمة الافتراضية true عند عدم التمرير.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  hideZeroMovement?: boolean = true;

  /**
   * تضمين الرصيد الافتتاحي في الحساب.
   * عند false: يُحذف الرصيد الافتتاحي من العرض (لكن الحساب يبقى).
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  includeOpeningBalance?: boolean = true;

  /**
   * إظهار الحسابات الطرفية فقط (isLeaf).
   * افتراضي: true.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  onlyLeaf?: boolean = true;

  /**
   * ترتيب الحسابات في All Mode.
   */
  @IsOptional()
  @IsIn(['code', 'name', 'activity'])
  sortAccountsBy?: 'code' | 'name' | 'activity' = 'code';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortAccountsOrder?: 'asc' | 'desc' = 'asc';
}
