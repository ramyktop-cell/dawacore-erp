import { IsString, IsNotEmpty, IsOptional, IsUUID, IsBoolean, IsEnum, MinLength, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المستخدم إلزامي' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور إلزامية' })
  password: string;

  @IsString()
  @IsOptional()
  branchId?: string;
}

export class VerifyPinDto {
  @IsUUID('all', { message: 'branchId غير صالح' })
  branchId: string;

  @IsString()
  @IsNotEmpty({ message: 'رمز PIN إلزامي' })
  pin: string;
}

export class CreateAuthUserDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المستخدم إلزامي' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'الاسم الكامل إلزامي' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور إلزامية' })
  password: string;

  @IsUUID('all', { message: 'companyId غير صالح' })
  companyId: string;

  @IsUUID('all', { message: 'branchId غير صالح' })
  @IsOptional()
  branchId?: string;

  @IsEnum(Role, { message: 'الدور الوظيفي غير صالح' })
  role: Role;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  currentPassword: string;

  @IsString()
  @MinLength(12, { message: 'كلمة المرور الجديدة يجب أن تكون 12 حرفاً على الأقل' })
  @MaxLength(72)
  newPassword: string;
}
