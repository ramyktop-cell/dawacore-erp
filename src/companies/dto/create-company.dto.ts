import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم الشركة مطلوب' })
  name: string;

  @IsString()
  @IsOptional()
  taxNumber?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @Transform(({ value }) => typeof value === 'string' ? (value.trim() || undefined) : value)
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCompanyDto extends CreateCompanyDto {}
