import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class HoldCartDto {
  @IsString({ message: 'cashierId يجب أن يكون نصاً صالحاً' })
  @IsNotEmpty({ message: 'cashierId مطلوب' })
  cashierId: string;

  @IsString({ message: 'branchId يجب أن يكون نصاً صالحاً' })
  @IsNotEmpty({ message: 'branchId مطلوب' })
  branchId: string;

  @IsNotEmpty({ message: 'بيانات السلة cartData مطلوبة' })
  cartData: any;
}

export class ResumeCartDto {
  @IsString({ message: 'cashierId يجب أن يكون نصاً صالحاً' })
  @IsOptional()
  cashierId?: string;
}

export class ResumeCartBodyDto {
  @IsString({ message: 'holdId مطلوب' })
  @IsNotEmpty({ message: 'معرف السلة holdId مطلوب' })
  holdId: string;

  @IsString({ message: 'cashierId يجب أن يكون نصاً صالحاً' })
  @IsOptional()
  cashierId?: string;
}
