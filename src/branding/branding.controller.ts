import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { BrandingService, PlatformBrandingConfig } from './branding.service';

@ApiTags('Branding')
@Public()
@Controller('branding')
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Get()
  @ApiOperation({ summary: 'جلب إعدادات الهوية البصرية للمنصة ووضع النشر' })
  getBranding(): PlatformBrandingConfig {
    return this.brandingService.getPlatformBranding();
  }
}
