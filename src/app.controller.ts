import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'فحص صحة الخادم وجاهزيته' })
  getHealth() {
    return {
      status: 'ok',
      service: 'MadarCore ERP',
      timestamp: new Date().toISOString(),
    };
  }
}
