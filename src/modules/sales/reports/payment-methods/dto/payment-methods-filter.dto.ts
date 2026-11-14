import { IsOptional, IsIn, IsBoolean, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * PaymentMethodsFilterDto
 * ───────────────────────
 * فلاتر تقرير طرق الدفع.
 *
 * يورث من ReportFilterDto:
 *   - fromDate, toDate
 *   - branchId
 *   - page, limit
 *   - skipCache
 */
export class PaymentMethodsFilterDto extends ReportFilterDto {
  /**
   * فلترة على طريقة دفع واحدة (لعرض تفاصيلها فقط).
   */
  @IsOptional()
  @IsIn([
    'CASH',
    'BANK',
    'CREDIT',
    'MIXED',
    'CARD',
    'TRANSFER',
    'BANK_TRANSFER',
  ])
  paymentMethod?:
    | 'CASH'
    | 'BANK'
    | 'CREDIT'
    | 'MIXED'
    | 'CARD'
    | 'TRANSFER'
    | 'BANK_TRANSFER';

  /**
   * تصفية حسب كاشير معين.
   */
  @IsOptional()
  @IsUUID('4')
  cashierId?: string;

  /**
   * هل نضمّن المرتجعات في الحسابات؟
   * true → netSales (بعد خصم المرتجعات)
   * false → grossSales (بدون خصم)
   * افتراضي: true
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return true;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  includeReturns?: boolean = true;

  /**
   * ترتيب النتائج حسب.
   * افتراضي: amount
   */
  @IsOptional()
  @IsIn(['amount', 'count', 'avgTicket', 'returnRate'])
  sortBy?: 'amount' | 'count' | 'avgTicket' | 'returnRate' = 'amount';

  /**
   * اتجاه الترتيب.
   * افتراضي: desc (الأعلى أولاً)
   */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
