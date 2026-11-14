import { IsString, IsNotEmpty, IsUUID, IsArray, ValidateNested, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class TransferItemDto {
  @IsNotEmpty({ message: 'معرف التشغيلة مطلوب' })
  @IsUUID('4', { message: 'معرف التشغيلة غير صالح' })
  batchId: string;

  @IsInt({ message: 'الكمية المحولة يجب أن تكون عدداً صحيحاً' })
  @Min(1, { message: 'أقل كمية للتحويل هي 1' })
  quantity: number;
}

export class CreateTransferDto {
  @IsNotEmpty({ message: 'الفرع المصدر مطلوب' })
  @IsUUID('4', { message: 'معرف الفرع المصدر غير صالح' })
  fromBranchId: string;

  @IsNotEmpty({ message: 'الفرع المستلم مطلوب' })
  @IsUUID('4', { message: 'معرف الفرع المستلم غير صالح' })
  toBranchId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray({ message: 'يجب اختيار صنف واحد على الأقل للتحويل' })
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}
