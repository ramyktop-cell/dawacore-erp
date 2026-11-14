import {
  IsUUID,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  Min,
  IsOptional,
  IsString,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseReturnItemDto {
  @IsUUID('4', { message: 'purchaseItemId يجب أن يكون UUID صالح' })
  purchaseItemId: string;

  @IsInt({ message: 'الكمية يجب أن تكون عدداً صحيحاً' })
  @Min(1, { message: 'أقل كمية للمرتجع هي 1' })
  quantity: number;
}

export class CreatePurchaseReturnDto {
  @IsUUID('4', { message: 'purchaseOrderId غير صالح' })
  purchaseOrderId: string;

  @IsUUID('4', { message: 'branchId غير صالح' })
  branchId: string;

  @IsUUID('4', { message: 'returnedBy غير صالح' })
  returnedBy: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  items: PurchaseReturnItemDto[];
}
