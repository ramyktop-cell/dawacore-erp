import { IsArray, ValidateNested, IsUUID, IsInt, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CountItemDto {
  @IsUUID('4')
  batchId: string;

  @IsInt({ message: 'الكمية الفعلية يجب أن تكون عدداً صحيحاً' })
  @Min(0, { message: 'الكمية الفعلية لا يمكن أن تكون سالبة' })
  actualQty: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class RecordStockCountItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountItemDto)
  items: CountItemDto[];
}
