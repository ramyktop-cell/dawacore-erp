import {
  IsString,
  IsOptional,
  IsIn,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export type SettingDataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'UUID';
export type SettingCategory =
  | 'ACCOUNTING'
  | 'SALES'
  | 'REPORTS'
  | 'SYSTEM'
  | 'INTEGRATION';

export class SettingItemDto {
  @IsString()
  @MaxLength(100)
  key: string;

  @IsString()
  @MaxLength(2000)
  value: string;

  @IsOptional()
  @IsIn(['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'UUID'])
  dataType?: SettingDataType = 'STRING';

  @IsOptional()
  @IsIn(['ACCOUNTING', 'SALES', 'REPORTS', 'SYSTEM', 'INTEGRATION'])
  category?: SettingCategory = 'SYSTEM';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  settings: SettingItemDto[];
}

export class SingleSettingDto {
  @IsString()
  @MaxLength(2000)
  value: string;
}
