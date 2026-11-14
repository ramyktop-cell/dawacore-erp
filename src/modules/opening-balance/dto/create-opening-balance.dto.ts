import {
  IsUUID,
  IsNotEmpty,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OpeningBalanceItemDto {
  @IsUUID('4', { message: 'معرف الحساب غير صالح' })
  @IsNotEmpty()
  accountId: string;

  @IsNumber()
  @Min(0)
  debit: number;

  @IsNumber()
  @Min(0)
  credit: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @IsString()
  @IsOptional()
  referenceType?: string;

  @IsString()
  @IsOptional()
  referenceId?: string;
}

export class CreateOpeningBalanceDto {
  @ValidateIf((o) => !o.companyId || !o.companyId.startsWith('11111111-'))
  @IsUUID('4', { message: 'معرف الشركة غير صالح' })
  @IsNotEmpty({ message: 'معرف الشركة مطلوب' })
  companyId: string;

  @IsUUID('4', { message: 'معرف الفرع غير صالح' })
  @IsNotEmpty({ message: 'معرف الفرع مطلوب' })
  branchId: string;

  @IsDateString({}, { message: 'تاريخ السريان غير صالح' })
  @IsNotEmpty({ message: 'تاريخ السريان مطلوب' })
  effectiveDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceItemDto)
  items: OpeningBalanceItemDto[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
