import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsArray, ValidateNested, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType } from '@prisma/client';

export class MedicineUnitDto {
  @IsEnum(UnitType, { message: 'نوع الوحدة غير صالح (UNIT, STRIP, BOX)' })
  unitType: UnitType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsInt({ message: 'معامل التحويل يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'أقل معامل تحويل هو 1' })
  multiplier: number;

  @IsNumber({}, { message: 'سعر الوحدة يجب أن يكون رقماً' })
  @Min(0, { message: 'السعر لا يمكن أن يكون سالباً' })
  price: number;

  @IsOptional()
  @IsNumber({}, { message: 'الحد الأدنى لسعر البيع يجب أن يكون رقماً' })
  @Min(0, { message: 'الحد الأدنى لسعر البيع لا يمكن أن يكون سالباً' })
  minSalePrice?: number;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateMedicineDto {
  @IsOptional() @IsBoolean() isWeighed?: boolean;
  @IsOptional() @IsString() scalePlu?: string;

  @IsNotEmpty({ message: 'الاسم التجاري للدواء مطلوب' })
  @IsString()
  tradeName: string;

  @IsString()
  scientificName: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsNotEmpty({ message: 'الباركود الرئيسي مطلوب' })
  @IsString()
  barcode: string;

  @IsNotEmpty({ message: 'التصنيف الدوائي مطلوب' })
  @IsString()
  category: string;

  @IsOptional()
  @IsInt({ message: 'حد الطلب الأدنى يجب أن يكون رقماً صحيحاً' })
  @Min(0)
  minStockLevel?: number;

  @IsArray({ message: 'يجب توفير وحدات القياس' })
  @ValidateNested({ each: true })
  @Type(() => MedicineUnitDto)
  units: MedicineUnitDto[];
}

export class UpdateMedicineDto {
  @IsOptional() @IsBoolean() isWeighed?: boolean;
  @IsOptional() @IsString() scalePlu?: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  scientificName?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStockLevel?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicineUnitDto)
  units?: MedicineUnitDto[];
}

export class BulkImportMedicineItemDto {
  @IsNotEmpty({ message: 'اسم الصنف مطلوب' })
  @IsString()
  tradeName: string;

  @IsOptional()
  @IsString()
  scientificName?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  quantityOnHand?: number;

  @IsOptional()
  @IsInt()
  minStockLevel?: number;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;
}

export class BulkImportMedicinesDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportMedicineItemDto)
  items: BulkImportMedicineItemDto[];
}

