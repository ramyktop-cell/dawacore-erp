import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  ParseIntPipe,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Permission } from '../../../../auth/security.policy';
import { FiscalYearService } from '../services/fiscal-year.service';
import {
  OpenFiscalYearDto,
  CloseFiscalYearDto,
  ReopenFiscalYearDto,
} from '../dto/fiscal-year.dto';

@ApiTags('Accounting — Fiscal Years')
@Controller('accounting/fiscal-years')
export class FiscalYearController {
  constructor(private readonly service: FiscalYearService) {}

  private extractUser(req: any): { companyId: string; userId: string } {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId) {
      throw new UnauthorizedException('جلسة غير صالحة');
    }
    return { companyId, userId };
  }

  @Get()
  @Permission('accounting:read')
  @ApiOperation({ summary: 'قائمة السنوات المالية للشركة' })
  async list(@Req() req: any) {
    const { companyId } = this.extractUser(req);
    return this.service.listFiscalYears(companyId);
  }

  @Get(':year')
  @Permission('accounting:read')
  @ApiOperation({ summary: 'تفاصيل سنة مالية محددة' })
  async getOne(
    @Param('year', ParseIntPipe) year: number,
    @Req() req: any,
  ) {
    const { companyId } = this.extractUser(req);
    return this.service.getFiscalYear(companyId, year);
  }

  @Post('open')
  @Permission('accounting:write')
  @ApiOperation({ summary: 'فتح سنة مالية جديدة + ترحيل الأرصدة' })
  @ApiResponse({ status: 201 })
  async open(@Body() dto: OpenFiscalYearDto, @Req() req: any) {
    const { companyId, userId } = this.extractUser(req);
    return this.service.openFiscalYear(dto, companyId, userId);
  }

  @Post('close')
  @Permission('accounting:write')
  @ApiOperation({
    summary: 'إقفال سنة مالية (dryRun=true للمعاينة فقط)',
  })
  @ApiResponse({ status: 200 })
  async close(@Body() dto: CloseFiscalYearDto, @Req() req: any) {
    const { companyId, userId } = this.extractUser(req);
    return this.service.closeFiscalYear(dto, companyId, userId);
  }

  @Post('reopen')
  @Permission('accounting:write')
  @ApiOperation({ summary: 'إعادة فتح سنة مقفلة (للمشرفين)' })
  @ApiResponse({ status: 200 })
  async reopen(@Body() dto: ReopenFiscalYearDto, @Req() req: any) {
    const { companyId, userId } = this.extractUser(req);
    return this.service.reopenFiscalYear(dto, companyId, userId);
  }
}
