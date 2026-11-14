import { IsOptional, IsString, IsUUID, IsDateString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SupplierStatementQueryDto {
  @ApiPropertyOptional({ description: 'تاريخ بداية الفترة YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ البداية يجب أن يكون بصيغة YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'تاريخ نهاية الفترة YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ النهاية يجب أن يكون بصيغة YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'معرف الفرع' })
  @IsOptional()
  @IsUUID('4', { message: 'معرف الفرع غير صالح' })
  branchId?: string;
}

export class CreditorsReportQueryDto extends SupplierStatementQueryDto {
  @ApiPropertyOptional({ description: 'بحث باسم المورد أو رقم الهاتف' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'نوع التقرير: ملخص أو مفصل بالحركات', enum: ['summary', 'detailed'] })
  @IsOptional()
  @IsIn(['summary', 'detailed'], { message: 'نوع التقرير يجب أن يكون summary أو detailed' })
  type?: 'summary' | 'detailed';
}

