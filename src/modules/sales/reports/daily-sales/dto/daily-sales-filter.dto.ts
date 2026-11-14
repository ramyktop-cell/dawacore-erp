import { IsOptional, IsUUID, IsIn } from 'class-validator';
import { ReportFilterDto } from 'src/shared/report-kit';

/**
 * DailySalesFilterDto
 * ───────────────────
 * فلاتر خاصة بتقرير المبيعات اليومية.
 *
 * يورث من ReportFilterDto:
 *   - fromDate, toDate
 *   - branchId
 *   - page, limit
 *   - skipCache
 *
 * ويضيف:
 *   - cashierId      (فلترة حسب الكاشير)
 *   - paymentMethod  (فلترة حسب طريقة الدفع)
 *   - status         (فلترة حسب حالة الفاتورة)
 */
export class DailySalesFilterDto extends ReportFilterDto {
  /**
   * فلترة حسب كاشير معين.
   */
  @IsOptional()
  @IsUUID('4')
  cashierId?: string;

  /**
   * فلترة حسب طريقة الدفع.
   */
  @IsOptional()
  @IsIn(['CASH', 'BANK', 'CREDIT', 'MIXED'])
  paymentMethod?: 'CASH' | 'BANK' | 'CREDIT' | 'MIXED';

  /**
   * فلترة حسب حالة الفاتورة.
   */
  @IsOptional()
  @IsIn(['COMPLETED', 'RETURNED', 'PARTIAL_RETURN'])
  status?: 'COMPLETED' | 'RETURNED' | 'PARTIAL_RETURN';
}
