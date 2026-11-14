import { Permission, Public } from '../auth/security.policy';
import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AccountingService } from './accounting.service';

@ApiTags('Accounting')
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('entries')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إنشاء قيد يومية محاسبي مزدوج ومتوازن' })
  @ApiResponse({ status: 201, description: 'تم إنشاء وترحيل القيد وتحديث الأرصدة بنجاح' })
  @ApiResponse({ status: 400, description: 'القيد غير متوازن أو الحساب ليس طرفياً' })
  async createAutoEntry(@Body() body: any, @Req() req: any) {
    return await this.accountingService.createAutoEntry({
      ...body,
      companyId: req.user.companyId,
      branchId: req.user.branchId || body.branchId,
      createdBy: req.user.id,
      source: body.source || body.sourceModule || 'MANUAL',
    });
  }

  @Get('entries')
  @Permission('accounting:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب قائمة القيود المحاسبية مع التصفية' })
  async findAll(@Query() query: { companyId?: string; source?: string; search?: string; page?: number; limit?: number }, @Req() req: any) {
    return await this.accountingService.findAll({ ...query, companyId: req.user.companyId });
  }

  @Get('entries/:id')
  @Permission('accounting:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب تفاصيل قيد يومية محدد' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return await this.accountingService.findOne(id, req.user.companyId);
  }

  @Get('accounts')
  @Permission('accounting:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'استعراض شجرة الحسابات المالية (Chart of Accounts)' })
  async getAccounts(@Req() req: any) {
    return await this.accountingService.getAccounts(req.user.companyId);
  }
}
