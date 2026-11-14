import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CancelStockCountDto {
  @IsString()
  @IsNotEmpty({ message: 'يجب إدخال سبب الإلغاء' })
  @MaxLength(500)
  reason: string;
}
