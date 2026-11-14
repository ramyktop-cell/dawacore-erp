import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  IsNumber,
  Min,
  IsDateString,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { UnitType } from '@prisma/client';

export class QuickAddStockCountItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsUUID('4', { message: 'معرف الدواء يجب أن يكون UUID صالح' })
  medicineId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'اسم الدواء لا يتجاوز 200 حرف' })
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @IsDateString({}, { message: 'تاريخ الانتهاء يجب أن يكون بصيغة تاريخ صالحة (YYYY-MM-DD)' })
  expiryDate: string;

  @IsNumber({}, { message: 'سعر الشراء يجب أن يكون رقماً' })
  @Min(0, { message: 'سعر الشراء لا يمكن أن يكون سالباً' })
  costPrice: number;

  @IsNumber({}, { message: 'سعر البيع يجب أن يكون رقماً' })
  @Min(0, { message: 'سعر البيع لا يمكن أن يكون سالباً' })
  salePrice: number;

  @IsInt({ message: 'الكمية الفعلية يجب أن تكون عدداً صحيحاً' })
  @Min(1, { message: 'الكمية الفعلية يجب أن تكون 1 على الأقل' })
  actualQty: number;

  @IsOptional()
  @IsEnum(UnitType, { message: 'نوع الوحدة غير صالح' })
  unitType?: UnitType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
