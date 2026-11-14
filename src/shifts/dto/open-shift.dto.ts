import { IsUUID, IsNotEmpty, IsDecimal, IsOptional, IsString } from 'class-validator';

export class OpenShiftDto {
  @IsUUID('4', { message: 'branchId يجب أن يكون UUID صالح' })
  branchId: string;

  @IsUUID('4', { message: 'cashierId يجب أن يكون UUID صالح' })
  cashierId: string;

  @IsDecimal({ decimal_digits: '1,2' }, { message: 'رصيد بداية الوردية (startCash) يجب أن يكون رقماً مالياً' })
  startCash: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
