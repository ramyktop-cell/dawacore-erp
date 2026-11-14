import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {
  @ApiPropertyOptional({ description: 'كلمة مرور جديدة (اختياري)', example: 'newpassword123' })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن لا تقل عن 6 خانات' })
  @IsOptional()
  password?: string;
}
