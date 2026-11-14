import { IsUUID, IsArray, ValidateNested, IsInt, Min, IsEnum, IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, ReturnCondition } from '@prisma/client';

export class ReturnItemDto {
  @IsUUID('4', { message: 'saleItemId غير صالح' })
  saleItemId: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  returnQuantity?: number;

  @IsOptional()
  @IsEnum(ReturnCondition, { message: 'حالة الصنف يجب أن تكون RESTOCKABLE أو DAMAGED' })
  condition?: ReturnCondition;

  @IsOptional()
  @IsBoolean()
  isDamaged?: boolean;
}

export class CreateSaleReturnDto {
  @IsOptional()
  @IsUUID('4', { message: 'originalSaleId غير صالح' })
  originalSaleId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'saleId غير صالح' })
  saleId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'branchId غير صالح' })
  branchId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'shiftId غير صالح' })
  shiftId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'cashierId غير صالح' })
  cashierId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsEnum(PaymentMethod, { message: 'طريقة رد المبلغ غير صالحة' })
  refundMethod: PaymentMethod;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];
}

export class CreateReturnDto extends CreateSaleReturnDto {}

