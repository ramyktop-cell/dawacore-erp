import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LicensingService, LicenseInfo } from './licensing.service';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Licensing')
@Public()
@Controller('licensing')
export class LicensingController {
  constructor(private readonly licensingService: LicensingService) {}

  @ApiOperation({ summary: 'فحص حالة تفعيل وترخيص النظام وبصمة الجهاز' })
  @Get('status')
  getStatus(): LicenseInfo {
    return this.licensingService.checkCurrentLicense();
  }

  @ApiOperation({ summary: 'تفعيل النظام بمفتاح الترخيص' })
  @Post('activate')
  activate(@Body() dto: ActivateLicenseDto): LicenseInfo {
    return this.licensingService.activate(dto.licenseKey);
  }
}
