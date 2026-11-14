import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddCompanyCurrencyDto {
  @IsUUID('4')
  currencyId: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  exchangeRate: number;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean = false;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class UpdateExchangeRateDto {
  @IsNumber()
  @Min(0.000001)
  @Type(() => Number)
  newRate: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CreateCurrencyDto {
  @IsString()
  @MaxLength(3)
  code: string;

  @IsString()
  @MaxLength(100)
  nameEn: string;

  @IsString()
  @MaxLength(100)
  nameAr: string;

  @IsString()
  @MaxLength(10)
  symbol: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  decimalPlaces?: number = 2;
}
