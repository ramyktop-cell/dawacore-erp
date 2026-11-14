import { IsUUID, IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ShiftStatus, PaymentMethod } from '@prisma/client';

export class OpenShiftDto {
  @IsUUID('4', { message: 'معرف الشركة غير صالح' })
  @IsOptional()
  companyId?: string;

  @IsUUID('4', { message: 'معرف الفرع غير صالح' })
  branchId: string;

  @IsUUID('4', { message: 'معرف المستخدم/الكاشير غير صالح' })
  userId: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'الرصيد الافتتاحي يجب أن يكون رقماً' })
  @Min(0, { message: 'الرصيد الافتتاحي لا يمكن أن يكون سالباً' })
  openingBalance: number | string;
}

export class CloseShiftDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'النقد الفعلي يجب أن يكون رقماً' })
  @Min(0, { message: 'النقد الفعلي لا يمكن أن يكون سالباً' })
  actualCash: number | string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ApproveShiftDto {
  @IsUUID('4', { message: 'معرف المدير المشرف إلزامي' })
  approvedBy: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CashMovementDto {
  @IsUUID('4', { message: 'shiftId غير صالح' })
  shiftId: string;

  @IsIn(['CASH_IN', 'CASH_OUT'])
  type: 'CASH_IN' | 'CASH_OUT';

  @Type(() => Number)
  @IsNumber({}, { message: 'المبلغ يجب أن يكون رقماً' })
  @Min(0.01, { message: 'المبلغ يجب أن يكون أكبر من صفر' })
  amount: number | string;

  @IsString()
  @IsNotEmpty({ message: 'سبب حركة الصندوق إلزامي' })
  reason: string;

  @IsUUID('4', { message: 'معرف المدير المصرح إلزامي' })
  authorizedBy: string;
}

export class QueryShiftsDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
