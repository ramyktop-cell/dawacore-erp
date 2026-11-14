import { IsUUID, IsNotEmpty, IsDecimal, IsOptional, IsString } from 'class-validator';

export class CloseShiftDto {
  @IsUUID('4', { message: 'shiftId يجب أن يكون UUID صالح' })
  shiftId: string;

  @IsUUID('4', { message: 'cashierId يجب أن يكون UUID صالح' })
  cashierId: string;

  @IsDecimal({ decimal_digits: '1,2' }, { message: 'رصيد نهاية الوردية الفعلي (endCash) يجب أن يكون رقماً مالياً' })
  endCash: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
