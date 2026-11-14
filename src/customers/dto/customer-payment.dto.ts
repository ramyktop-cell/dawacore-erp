import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsIn, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerPaymentDto {
  @ApiProperty({ description: 'المبلغ المدفوع', example: 5000 })
  @IsNumber({}, { message: 'المبلغ يجب أن يكون رقماً' })
  @Min(0.01, { message: 'المبلغ يجب أن يكون أكبر من الصفر' })
  @IsNotEmpty({ message: 'المبلغ مطلوب' })
  amount: number;

  @ApiPropertyOptional({
    description: 'طريقة الدفع',
    enum: ['CASH', 'CARD', 'TRANSFER', 'CHECK'],
    default: 'CASH',
  })
  @IsIn(['CASH', 'CARD', 'TRANSFER', 'CHECK'], { message: 'طريقة الدفع غير صالحة' })
  @IsOptional()
  paymentMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK';

  @ApiPropertyOptional({ description: 'معرف الفرع' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'معرف الوردية الحالية للكاشير' })
  @IsUUID('4')
  @IsOptional()
  shiftId?: string;

  @ApiPropertyOptional({ description: 'رقم المرجع / الإشعار البنكي أو رقم الشيك' })
  @IsString()
  @IsOptional()
  referenceNo?: string;

  @ApiPropertyOptional({ description: 'ملاحظات أو بيان السند' })
  @IsString()
  @IsOptional()
  notes?: string;

}
