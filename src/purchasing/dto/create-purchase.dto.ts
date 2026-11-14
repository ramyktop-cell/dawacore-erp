import {
  IsUUID,
  IsNotEmpty,
  IsString,
  IsInt,
  Min,
  IsDateString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType, PurchaseStatus } from '@prisma/client';

export class PurchaseOrderItemDto {
  @IsUUID('4', { message: 'معرف الدواء medicineId غير صالح' })
  medicineId: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم التشغيلة/الدفعة (Batch Number) إلزامي' })
  batchNumber: string;

  @IsDateString({}, { message: 'تاريخ الصلاحية يجب أن يكون بصيغة صالحة (YYYY-MM-DD)' })
  expiryDate: string;

  @IsEnum(UnitType, { message: 'نوع الوحدة غير صالح' })
  @IsOptional()
  unitType?: UnitType;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsNumber({}, { message: 'سعر التكلفة يجب أن يكون رقماً' })
  @Min(0, { message: 'سعر التكلفة لا يمكن أن يكون سالباً' })
  costPrice: number;

  @IsNumber({}, { message: 'سعر البيع المقترح يجب أن يكون رقماً' })
  @IsOptional()
  sellingPrice?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID('4', { message: 'معرف الشركة companyId غير صالح' })
  @IsOptional()
  companyId?: string;

  @IsUUID('4', { message: 'معرف الفرع branchId غير صالح' })
  branchId: string;

  @IsUUID('4', { message: 'معرف المورد supplierId غير صالح' })
  supplierId: string;

  @IsString()
  @IsOptional()
  orderNumber?: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsNumber()
  @IsOptional()
  paidAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  additionalExpenses?: number;

  @IsString()
  @IsOptional()
  expenseAllocationMethod?: string;

  @IsString()
  @IsOptional()
  expenseNotes?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray({ message: 'عناصر الطلب يجب أن تكون مصفوفة' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

export class QueryPurchaseOrdersDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
