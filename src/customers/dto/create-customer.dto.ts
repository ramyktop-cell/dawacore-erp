import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ description: 'معرف الشركة التابع لها العميل' })
  @IsString({ message: 'معرف الشركة غير صالح' })
  @IsNotEmpty({ message: 'يجب تحديد الشركة' })
  companyId: string;

  @ApiProperty({ description: 'معرف الفرع التابع له العميل' })
  @IsString({ message: 'معرف الفرع غير صالح' })
  @IsNotEmpty({ message: 'يجب تحديد الفرع' })
  branchId: string;

  @ApiProperty({ description: 'اسم العميل الكامل', example: 'أحمد عثمان علي' })
  @IsString()
  @IsNotEmpty({ message: 'اسم العميل مطلوب' })
  name: string;

  @ApiProperty({ description: 'رقم هاتف العميل', example: '0912345678' })
  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  phone: string;

  @ApiPropertyOptional({ description: 'الرقم الوطني / رقم الهوية', example: '1012345678' })
  @IsString()
  @IsOptional()
  nationalId?: string;

  @ApiPropertyOptional({ description: 'سقف الائتمان المسموح به للبيع الآجل', example: 50000 })
  @IsNumber({}, { message: 'سقف الائتمان يجب أن يكون رقماً' })
  @Min(0, { message: 'سقف الائتمان لا يمكن أن يكون سالباً' })
  @IsOptional()
  creditLimit?: number;

  @ApiPropertyOptional({ description: 'الرصيد الافتتاحي السابق للعميل (مديونية سابقة)', example: 0 })
  @IsNumber({}, { message: 'الرصيد الافتتاحي يجب أن يكون رقماً' })
  @Min(0, { message: 'الرصيد الافتتاحي لا يمكن أن يكون سالباً' })
  @IsOptional()
  initialBalance?: number;

  @ApiPropertyOptional({ description: 'العنوان', example: 'الخرطوم - شارع الستين' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'ملاحظات إضافية' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'حالة العميل (نشط / غير نشط)', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
