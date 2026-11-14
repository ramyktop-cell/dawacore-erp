import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ReceiptPaymentMethod, ReceiptStatus } from '@prisma/client';

export class CreateReceiptDto {
  @IsUUID()
  @IsNotEmpty({ message: 'معرف الشركة مطلوب' })
  companyId: string;

  @IsUUID()
  @IsNotEmpty({ message: 'معرف الفرع مطلوب' })
  branchId: string;

  @IsUUID()
  @IsOptional()
  shiftId?: string;

  @IsString()
  @IsNotEmpty({ message: 'نوع الإيراد مطلوب' })
  receiptType: string;

  @IsString()
  @IsOptional()
  receivedFrom?: string; // المستلم منه / الطرف المودع

  @IsUUID()
  @IsNotEmpty({ message: 'الحساب المحاسبي الدائن مطلوب' })
  accountId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'قيمة الإيراد يجب أن تكون أكبر من الصفر' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'جهة الإيداع مطلوبة (CASH للخزنة أو BANK للبنك)' })
  receivedTo: 'CASH' | 'BANK';

  @IsEnum(ReceiptPaymentMethod)
  @IsOptional()
  paymentMethod?: ReceiptPaymentMethod = ReceiptPaymentMethod.CASH;

  @IsString()
  @IsOptional()
  referenceNo?: string; // رقم إشعار التحويل البنكي أو رقم الشيك

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  attachment?: string;
}

export class FilterReceiptDto {
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  shiftId?: string;

  @IsOptional()
  receivedTo?: 'CASH' | 'BANK';

  @IsEnum(ReceiptStatus)
  @IsOptional()
  status?: ReceiptStatus;

  @IsOptional()
  fromDate?: string;

  @IsOptional()
  toDate?: string;
}
