import { IsUUID, IsEnum, IsOptional, IsArray, IsString, MaxLength } from 'class-validator';
import { StockCountType } from '@prisma/client';

export class StartStockCountDto {
  @IsUUID('4', { message: 'معرف الفرع غير صالح' })
  branchId: string;

  @IsEnum(StockCountType, { message: 'نوع الجرد غير صالح' })
  countType: StockCountType;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'معرفات الدفعات يجب أن تكون UUID صالحة' })
  batchIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryFilter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
