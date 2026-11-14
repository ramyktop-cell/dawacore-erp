import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { AccountType } from '@prisma/client';

export class UpdateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(AccountType, { message: 'نوع الحساب غير صالح' })
  @IsOptional()
  type?: AccountType;

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
