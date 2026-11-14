import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsInt, Min, Max } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'معرف الشركة مطلوب' })
  companyId: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsNotEmpty({ message: 'كود أو رقم الحساب مطلوب' })
  code: string;

  @IsString()
  @IsNotEmpty({ message: 'اسم الحساب مطلوب' })
  name: string;

  @IsEnum(AccountType, { message: 'نوع الحساب غير صالح (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)' })
  type: AccountType;

  @IsInt({ message: 'مستوى الحساب يجب أن يكون رقماً صحيحاً' })
  @Min(1, { message: 'أدنى مستوى للحساب هو 1 (رئيسي)' })
  @Max(5, { message: 'أقصى مستوى للحساب هو 5 (تشغيلي)' })
  level: number;

  @IsString()
  @IsOptional()
  parentId?: string;

  @IsBoolean()
  @IsOptional()
  isLeaf?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
