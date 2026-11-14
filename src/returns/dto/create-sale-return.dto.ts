import {
  IsUUID,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsDecimal,
  Min,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, UnitType } from '@prisma/client';

export class SaleReturnItemDto {
  @IsUUID('4', { message: 'saleItemId يجب أن يكون UUID صالح' })
  saleItemId: string;

  @IsEnum(UnitType, { message: 'نوع الوحدة غير صالح' })
  unitType: UnitType;

  @Min(1, { message: 'أقل كمية للمرتجع هي 1' })
  quantity: number;
}

export class SaleReturnRefundDto {
  @IsEnum(PaymentMethod, { message: 'طريقة الاسترداد غير مدعومة' })
  method: PaymentMethod;

  @IsDecimal({ decimal_digits: '1,2' }, { message: 'مبلغ الاسترداد يجب أن يكون رقماً مالياً' })
  amount: string;

  @IsString()
  @IsOptional()
  referenceNo?: string;
}

export class CreateSaleReturnDto {
  @IsUUID('4', { message: 'saleId غير صالح' })
  saleId: string;

  @IsUUID('4', { message: 'branchId غير صالح' })
  branchId: string;

  @IsUUID('4', { message: 'cashierId غير صالح' })
  cashierId: string;

  @IsUUID('4', { message: 'shiftId غير صالح' })
  shiftId: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleReturnItemDto)
  items: SaleReturnItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleReturnRefundDto)
  refunds: SaleReturnRefundDto[];
}
