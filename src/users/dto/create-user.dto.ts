import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, IsBoolean, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRoleInput {
  SUPER_ADMIN = 'SUPER_ADMIN',
  COMPANY_ADMIN = 'COMPANY_ADMIN',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  CASHIER = 'CASHIER',
  ACCOUNTANT = 'ACCOUNTANT',
  INVENTORY = 'INVENTORY',
  STORE_KEEPER = 'STORE_KEEPER',
}

export class CreateUserDto {
  @ApiProperty({ description: 'معرف الشركة التابع لها المستخدم', example: '11111111-0000-0000-0000-000000000001' })
  @IsString({ message: 'معرف الشركة يجب أن يكون نصاً صالحاً' })
  @IsNotEmpty({ message: 'يجب تحديد الشركة' })
  companyId: string;

  @ApiPropertyOptional({ description: 'معرف الفرع التابع له المستخدم (إلزامي لموظفي الفروع، اختياري لمدير الشركة)' })
  @IsString({ message: 'معرف الفرع يجب أن يكون نصاً صالحاً' })
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'الاسم الكامل للمستخدم', example: 'أحمد عثمان' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ description: 'الاسم الكامل للمستخدم', example: 'أحمد عثمان' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'اسم تسجيل الدخول', example: 'ahmed_pos' })
  @IsString()
  @IsNotEmpty({ message: 'اسم تسجيل الدخول مطلوب' })
  username: string;

  @ApiPropertyOptional({ description: 'البريد الإلكتروني', example: 'ahmed@dawacore.com' })
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة' })
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'كلمة المرور (6 خانات على الأقل)', example: '123456' })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن لا تقل عن 6 خانات' })
  password: string;

  @ApiProperty({ enum: UserRoleInput, description: 'الدور الوظيفي والصلاحيات', example: UserRoleInput.CASHIER })
  @IsEnum(UserRoleInput, { message: 'الدور المحدد غير صالح' })
  role: Role | 'STORE_KEEPER';

  @ApiPropertyOptional({ description: 'رقم الهاتف', example: '+249912345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'حالة الحساب', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
