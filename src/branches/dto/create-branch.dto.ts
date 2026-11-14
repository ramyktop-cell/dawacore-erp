import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class CreateBranchDto {
  @IsString({ message: 'معرف الشركة غير صالح' })
  @IsNotEmpty({ message: 'يجب ربط الفرع بشركة' })
  companyId: string;

  @IsString()
  @IsNotEmpty({ message: 'اسم الفرع مطلوب' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'كود الفرع مطلوب' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  code: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsBoolean()
  @IsOptional()
  isMain?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateBranchDto extends CreateBranchDto {}
