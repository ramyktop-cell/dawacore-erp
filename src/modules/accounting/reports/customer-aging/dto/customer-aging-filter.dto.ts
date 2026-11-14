import {
  IsOptional,
  IsDateString,
  IsUUID,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * خيارات الترتيب لتقرير أعمار ديون العملاء.
 */
export type CustomerAgingSortBy =
  | 'total'
  | 'oldestInvoice'
  | 'name'
  | 'totalBalance'
  | 'oldestInvoiceDays'
  | 'partnerName'
  | 'riskLevel';

/**
 * CustomerAgingFilterDto
 * ──────────────────────
 * فلاتر تقرير أعمار ديون العملاء.
 *
 * يعتمد على asOfDate (لقطة لحظية)، لا فترة.
 * fromDate/toDate من ReportFilterDto تُتجاهل.
 */
export class CustomerAgingFilterDto extends ReportFilterDto {
  /**
   * تاريخ "كما في" (As of).
   * افتراضي: اليوم الحالي في timezone الشركة.
   */
  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  /**
   * فلترة على عميل محدد.
   */
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  /**
   * التوافق مع بارامتر partnerId
   */
  @IsOptional()
  @IsUUID('4')
  partnerId?: string;

  /**
   * التوافق مع compareMode
   */
  @IsOptional()
  compareMode?: string;

  /**
   * فلترة على شريحة معينة (يُظهر فقط العملاء الذين لهم مبلغ في هذه الشريحة).
   */
  @IsOptional()
  @IsIn(['CURRENT', 'DAYS_31_60', 'DAYS_61_90', 'OVER_90'])
  bucket?: 'CURRENT' | 'DAYS_31_60' | 'DAYS_61_90' | 'OVER_90';

  /**
   * إظهار العملاء المتأخرين فقط (عمر أقدم فاتورة > bucket1).
   * افتراضي: false (عرض كل العملاء المدينين).
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyOverdue?: boolean = false;

  /**
   * الحد الأدنى لعمر أقدم فاتورة (بالأيام).
   * مثال: 30 → فقط العملاء الذين لديهم فواتير أقدم من 30 يوماً.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  minOverdueDays?: number;

  /**
   * تضمين تفاصيل الفواتير في الـ response.
   * افتراضي: false (لتخفيف حجم الاستجابة).
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInvoices?: boolean = false;

  /**
   * إخفاء العملاء بدون ديون (totalOutstanding = 0).
   * افتراضي: true.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  hideZeroOutstanding?: boolean = true;

  /**
   * التوافق مع includeZeroBalance
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeZeroBalance?: boolean;

  /**
   * التوافق مع onlyWithBalance
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyWithBalance?: boolean;

  /**
   * إظهار العملاء غير النشطين.
   * افتراضي: false.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean = false;

  // ─────────────────────────────────────────────
  // Custom Bucket Thresholds
  // ─────────────────────────────────────────────

  /**
   * الحد الأعلى للشريحة الأولى (افتراضي: 30).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  bucket1?: number;

  /**
   * الحد الأعلى للشريحة الثانية (افتراضي: 60).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(365)
  bucket2?: number;

  /**
   * الحد الأعلى للشريحة الثالثة (افتراضي: 90).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(365)
  bucket3?: number;

  // ─────────────────────────────────────────────
  // Sorting
  // ─────────────────────────────────────────────

  /**
   * ترتيب النتائج.
   *   - total         : إجمالي الدين (افتراضي)
   *   - oldestInvoice : أقدم فاتورة
   *   - name          : الاسم
   */
  @IsOptional()
  @IsIn([
    'total',
    'oldestInvoice',
    'name',
    'totalBalance',
    'oldestInvoiceDays',
    'partnerName',
    'riskLevel',
  ])
  sortBy?: CustomerAgingSortBy = 'total';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
