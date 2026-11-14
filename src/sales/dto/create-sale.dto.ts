import {
  IsNotEmpty,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentMethod, UnitType } from '@prisma/client';

export class SaleItemDto {
  @IsString({ message: 'medicineId غير صالح' })
  @IsNotEmpty({ message: 'medicineId مطلوب' })
  medicineId: string;

  @IsEnum(UnitType, { message: 'نوع الوحدة غير صالح' })
  unitType: UnitType;

  @Min(0.001, { message: 'أقل كمية هي 0.001' })
  quantity: number;

  @Transform(({ value }) => (value !== undefined && value !== null ? String(value) : '0'))
  @IsNotEmpty({ message: 'سعر الوحدة يجب أن يكون رقماً مالياً' })
  unitPrice: string | number;

  @IsOptional()
  @IsString({ message: 'سبب تعديل السعر غير صالح' })
  priceOverrideReason?: string;
}

export class SalePaymentDto {
  @IsEnum(PaymentMethod, { message: 'طريقة الدفع غير مدعومة' })
  method: PaymentMethod;

  @Transform(({ value }) => (value !== undefined && value !== null ? String(value) : '0'))
  @IsNotEmpty({ message: 'مبلغ الدفع يجب أن يكون رقماً مالياً' })
  amount: string;

  @IsString()
  @IsOptional()
  referenceNo?: string;
}

export class CreateSaleDto {
  @IsString({ message: 'companyId غير صالح' })
  @IsOptional()
  companyId?: string;

  @IsString({ message: 'pricingStrategy غير صالح' })
  @IsOptional()
  pricingStrategy?: string;

  @IsString({ message: 'branchId غير صالح' })
  @IsNotEmpty({ message: 'branchId مطلوب' })
  branchId: string;

  @IsString({ message: 'cashierId غير صالح' })
  @IsNotEmpty({ message: 'cashierId مطلوب' })
  cashierId: string;

  @IsString({ message: 'shiftId غير صالح' })
  @IsNotEmpty({ message: 'shiftId مطلوب' })
  shiftId: string;

  @IsString({ message: 'customerId غير صالح' })
  @IsOptional()
  customerId?: string;

  @Transform(({ value }) => (value !== undefined && value !== null ? String(value) : '0'))
  @IsOptional()
  discountTotal?: string | number;

  @IsOptional()
  invoiceDiscount?: string | number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}
