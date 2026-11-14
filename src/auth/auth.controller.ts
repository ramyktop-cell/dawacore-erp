import { Controller, Post, Body, Param, Patch, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { Public, Permission } from './security.policy';
import { LoginRateGuard } from './login-rate.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, VerifyPinDto, UpdateUserStatusDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @UseGuards(LoginRateGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تسجيل الدخول للمنظومة وإصدار JWT Token والصلاحيات' })
  @ApiResponse({ status: 200, description: 'تم تسجيل الدخول بنجاح' })
  @ApiResponse({ status: 401, description: 'بيانات الاعتماد غير صحيحة' })
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto);
  }

  @Post('change-password')
  @Public()
  @UseGuards(LoginRateGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(dto);
  }

  @Post('verify-pin')
  @Permission('auth:verify')
  @UseGuards(LoginRateGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'التحقق من كود PIN للمدير لتخويل العمليات الحساسة في POS' })
  @ApiResponse({ status: 200, description: 'نتيجة التحقق من الـ PIN (صالح أو غير صالح)' })
  async verifyPin(@Body() dto: VerifyPinDto, @Req() req: any) {
    const isValid = await this.authService.verifyManagerPin(dto.branchId, dto.pin, req.user);
    return { valid: isValid };
  }

  @Patch('users/:id/status')
  @Permission('users:write')
  @ApiOperation({ summary: 'تفعيل أو تعطيل حساب مستخدم' })
  @ApiResponse({ status: 200, description: 'تم تحديث حالة المستخدم بنجاح' })
  async toggleStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto, @Req() req: any) {
    return await this.authService.toggleUserStatus(id, dto.isActive, req.user);
  }
}
