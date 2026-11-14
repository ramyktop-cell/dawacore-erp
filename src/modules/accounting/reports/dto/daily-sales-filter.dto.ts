import { IsOptional, IsUUID, IsString, IsIn } from 'class-validator';
import { ReportFilterDto } from './report-filter.dto';

export class DailySalesFilterDto extends ReportFilterDto {
  @IsOptional()
  @IsUUID('4', { message: 'معرف الكاشير غير صالح' })
  cashierId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsIn(['COMPLETED', 'PARTIAL_RETURN', 'RETURNED', 'CANCELLED'], {
    message: 'حالة الفاتورة غير صالحة',
  })
  status?: string;
}
