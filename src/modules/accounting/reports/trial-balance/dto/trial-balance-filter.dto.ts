import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * TrialBalanceFilterDto
 * ─────────────────────
 * فلاتر تقرير ميزان المراجعة.
 *
 * ⚠️ ملاحظة: العزل الأمني في التقارير المحاسبية مباشر
 * (Account.companyId و JournalEntry.companyId)
 * — لا حاجة لـ branch.companyId مثل Sales/Inventory.
 */
export class TrialBalanceFilterDto extends ReportFilterDto {
  /**
   * فلترة على حساب معين بالتفصيل.
   */
  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  /**
   * فلترة حسب نوع الحساب.
   */
  @IsOptional()
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
  accountType?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

  /**
   * المستوى المطلوب في الشجرة (1-5).
   * افتراضي: كل المستويات.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;

  /**
   * إظهار الحسابات بصفر رصيد (افتتاحي + ختامي = 0).
   *
   * ⚠️ FIX: كنا نستخدم @IsIn(['true', 'false']) → bug latent.
   * الآن bool حقيقي عبر @Transform.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  showZeroBalances?: boolean = false;

  /**
   * إظهار الحسابات الفارغة (بدون أي حركة في الفترة).
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  showEmptyAccounts?: boolean = false;

  /**
   * إظهار الحسابات الطرفية فقط (isLeaf = true).
   * افتراضي: true — يطابق السلوك المحاسبي المعتاد.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  onlyLeaf?: boolean = true;

  /**
   * الترتيب.
   * افتراضي: accountCode asc.
   */
  @IsOptional()
  @IsIn([
    'accountCode',
    'accountName',
    'openingBalance',
    'movement',
    'closingBalance',
  ])
  sortBy?:
    | 'accountCode'
    | 'accountName'
    | 'openingBalance'
    | 'movement'
    | 'closingBalance' = 'accountCode';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}
