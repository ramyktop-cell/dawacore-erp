import { IsUUID, IsNotEmpty, IsArray, ValidateNested, IsNumber, IsOptional, IsEnum, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class CreateInvoiceItemDto {
  @IsUUID('4', { message: 'معرف الدواء غير صالح' })
  medicineId: string;

  @IsUUID('4', { message: 'معرف الدفعة (Batch) غير صالح' })
  batchId: string;

  @IsNumber({}, { message: 'الكمية يجب أن تكون رقماً صحيحاً' })
  @Min(0.001)
  quantity: number;

  @IsNumber({}, { message: 'سعر الوحدة إلزامي' })
  @Min(0, { message: 'سعر الوحدة لا يمكن أن يكون سالباً' })
  unitPrice: number;
}

export class CreateInvoiceDto {
  @IsUUID('4', { message: 'معرف الشركة غير صالح' })
  @IsOptional()
  companyId?: string;

  @IsUUID('4', { message: 'معرف الفرع غير صالح' })
  branchId: string;

  @IsUUID('4', { message: 'معرف الوردية غير صالح' })
  shiftId: string;

  @IsUUID('4', { message: 'معرف المستخدم/الكاشير غير صالح' })
  userId: string;

  @IsUUID('4', { message: 'معرف العميل غير صالح' })
  @IsOptional()
  customerId?: string;

  @IsArray({ message: 'عناصر الفاتورة يجب أن تكون مصفوفة' })
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsNumber()
  @IsOptional()
  discountAmount?: number;

  @IsNumber()
  @IsOptional()
  paidAmount?: number;

  @IsEnum(PaymentMethod, { message: 'طريقة الدفع غير صالحة' })
  paymentMethod: PaymentMethod;

  @IsString()
  @IsOptional()
  bankReference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryInvoicesDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  shiftId?: string;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
