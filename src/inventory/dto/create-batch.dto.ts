import { IsString, IsNotEmpty, IsUUID, IsNumber, Min, IsDateString, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class CreateBatchDto {
  @IsNotEmpty({ message: 'رقم التشغيلة مطلوب' })
  @IsString()
  batchNumber: string;

  @IsNotEmpty({ message: 'معرف الدواء مطلوب' })
  @IsUUID('4', { message: 'معرف الدواء غير صالح' })
  medicineId: string;

  @IsNotEmpty({ message: 'معرف الفرع مطلوب' })
  @IsUUID('4', { message: 'معرف الفرع غير صالح' })
  branchId: string;

  @IsNumber({}, { message: 'سعر التكلفة يجب أن يكون رقماً' })
  @Min(0, { message: 'سعر التكلفة لا يمكن أن يكون سالباً' })
  costPrice: number;

  @IsNumber({}, { message: 'سعر البيع يجب أن يكون رقماً' })
  @Min(0, { message: 'سعر البيع لا يمكن أن يكون سالباً' })
  salePrice: number;

  @IsNotEmpty({ message: 'تاريخ الصلاحية مطلوب' })
  @IsDateString({}, { message: 'تاريخ الصلاحية غير صالح' })
  expiryDate: string;

  @IsInt({ message: 'المخزون بوحدة أساسية صحيحة؛ أدخل الجرام للصنف الموزون' })
  @Min(0, { message: 'الكمية لا يمكن أن تكون سالبة' })
  quantityInBase: number;

  @IsOptional()
  @IsBoolean()
  isFrozen?: boolean;
}

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityInBase?: number;

  @IsOptional()
  @IsBoolean()
  isFrozen?: boolean;
}
