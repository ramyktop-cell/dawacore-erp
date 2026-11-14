import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpensePaymentMethod, ExpenseStatus } from '@prisma/client';

export class CreateExpenseDto {
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
  @IsNotEmpty({ message: 'نوع المصروف مطلوب' })
  expenseType: string;

  @IsString()
  @IsOptional()
  category?: string; // 'EXPENSE' (مصروف) | 'LIABILITY' (سداد التزام)

  @IsString()
  @IsOptional()
  paidTo?: string; // المستفيد / المدفوع له

  @IsUUID()
  @IsNotEmpty({ message: 'الحساب المحاسبي مطلوب' })
  accountId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'قيمة المصروف يجب أن تكون أكبر من الصفر' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'جهة الصرف مطلوبة (CASH أو BANK)' })
  paidFrom: 'CASH' | 'BANK';

  @IsEnum(ExpensePaymentMethod)
  @IsOptional()
  paymentMethod?: ExpensePaymentMethod = ExpensePaymentMethod.CASH;

  @IsString()
  @IsOptional()
  referenceNo?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  attachment?: string;
}

export class RejectExpenseDto {
  @IsString()
  @IsNotEmpty({ message: 'سبب الرفض إلزامي' })
  reason: string;
}

export class FilterExpenseDto {
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
  paidFrom?: 'CASH' | 'BANK';

  @IsOptional()
  category?: string;

  @IsEnum(ExpenseStatus)
  @IsOptional()
  status?: ExpenseStatus;

  @IsOptional()
  fromDate?: string;

  @IsOptional()
  toDate?: string;
}
