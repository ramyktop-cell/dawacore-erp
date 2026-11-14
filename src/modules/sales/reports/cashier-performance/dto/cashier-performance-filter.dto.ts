import { IsOptional, IsIn } from 'class-validator';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * CashierPerformanceFilterDto
 * ───────────────────────────
 * فلاتر تقرير أداء الكاشيرين.
 *
 * يورث من ReportFilterDto:
 *   - fromDate, toDate
 *   - branchId
 *   - page, limit
 *   - skipCache
 *
 * ملاحظة: لا يحتوي على cashierId لأن التقرير يقارن بين كل الكاشيرين.
 */
export class CashierPerformanceFilterDto extends ReportFilterDto {
  /**
   * فلترة حسب طريقة الدفع (عرض أداء الكاشيرين لهذه الطريقة فقط).
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
   * ترتيب النتائج حسب.
   * افتراضي: netSales
   */
  @IsOptional()
  @IsIn(['netSales', 'invoicesCount', 'avgTicket', 'returns'])
  sortBy?: 'netSales' | 'invoicesCount' | 'avgTicket' | 'returns' = 'netSales';

  /**
   * اتجاه الترتيب.
   * افتراضي: desc (الأعلى أولاً)
   */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
