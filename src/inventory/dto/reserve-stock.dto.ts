import { IsUUID, IsNotEmpty, IsInt, Min, IsEnum, IsString } from 'class-validator';
import { UnitType } from '@prisma/client';

export class ReserveStockDto {
  @IsUUID('4', { message: 'medicineId يجب أن يكون معرف UUID صالح' })
  medicineId: string;

  @IsUUID('4', { message: 'branchId يجب أن يكون معرف UUID صالح' })
  branchId: string;

  @IsEnum(UnitType, { message: 'نوع الوحدة يجب أن يكون UNIT أو STRIP أو BOX' })
  unitType: UnitType;

  @IsInt({ message: 'الكمية يجب أن تكون عدداً صحيحاً' })
  @Min(1, { message: 'الحد الأدنى للكمية هو 1' })
  quantity: number;

  @IsUUID('4', { message: 'userId يجب أن يكون معرف UUID صالح' })
  userId: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم الفاتورة أو المرجع إلزامي' })
  invoiceNumber: string;
}
