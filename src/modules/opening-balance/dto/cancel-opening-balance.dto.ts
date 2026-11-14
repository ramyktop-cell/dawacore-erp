import { IsString, IsNotEmpty } from 'class-validator';

export class CancelOpeningBalanceDto {
  @IsString()
  @IsNotEmpty({ message: 'سبب الإلغاء مطلوب' })
  reason: string;
}
