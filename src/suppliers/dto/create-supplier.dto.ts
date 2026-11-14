import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSupplierDto {
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString({ message: 'معرف الشركة غير صالح' })
  @IsOptional()
  companyId?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString({ message: 'معرف الفرع غير صالح' })
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsNotEmpty({ message: 'اسم المورد إلزامي' })
  name: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم هاتف المورد إلزامي' })
  phone: string;

  @IsString()
  @IsOptional()
  taxNumber?: string;

  @IsNumber()
  @IsOptional()
  initialDebt?: number;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  taxNumber?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QuerySuppliersDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
