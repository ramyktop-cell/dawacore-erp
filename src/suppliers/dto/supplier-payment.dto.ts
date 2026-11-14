import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SupplierPaymentMethod } from '@prisma/client';

export class SupplierPaymentAllocationDto {
  @IsUUID()
  purchaseOrderId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount: number;
}

export class CreateSupplierPaymentDto {
  @IsUUID()
  branchId: string;

  @IsEnum(SupplierPaymentMethod)
  method: SupplierPaymentMethod;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @Length(12, 100)
  idempotencyKey: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  referenceNo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SupplierPaymentAllocationDto)
  allocations: SupplierPaymentAllocationDto[];
}

export class OutstandingSupplierInvoicesQueryDto {
  @IsUUID()
  branchId: string;
}
