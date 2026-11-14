import { Permission, Public } from '../auth/security.policy';
import { Controller, Post, Get, Patch, Body, Param, Query, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto, CloseShiftDto, ApproveShiftDto, CashMovementDto, QueryShiftsDto } from './dto/shift.dto';

@ApiTags('Shifts')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post('open')
  @Permission('shifts:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'فتح وردية جديدة لكاشير' })
  async openShift(@Body() dto: OpenShiftDto, @Req() req: any) {
    return await this.shiftsService.openShift(dto, req.user);
  }

  @Get('active')
  @Permission('shifts:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب الوردية المفتوحة حالياً' })
  async getActiveShift(@Query('branchId') branchId: string, @Query('userId') userId: string | undefined, @Req() req: any) {
    return await this.shiftsService.getActiveShift(branchId, userId || req.user.id, req.user);
  }

  @Patch(':id/close')
  @Permission('shifts:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إغلاق الوردية وحساب العجز أو الفائض' })
  async closeShift(@Param('id') id: string, @Body() dto: CloseShiftDto, @Req() req: any) {
    return await this.shiftsService.closeShift(id, dto, req.user);
  }

  @Patch(':id/approve')
  @Permission('shifts:approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'اعتماد الوردية المغلقة من قبل المشرف' })
  async approveShift(@Param('id') id: string, @Body() dto: ApproveShiftDto, @Req() req: any) {
    return await this.shiftsService.approveShift(id, dto, req.user);
  }

  @Post('cash-movement')
  @Permission('shifts:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'تسجيل حركة نقدية في الصندوق (سحب/إيداع)' })
  async recordCashMovement(@Body() dto: CashMovementDto, @Req() req: any) {
    return await this.shiftsService.recordCashMovement(dto, req.user);
  }

  @Get()
  @Permission('shifts:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'عرض قائمة الورديات مع التصفية' })
  async findAll(@Query() query: QueryShiftsDto) {
    return await this.shiftsService.findAll(query);
  }

  @Get(':id')
  @Permission('shifts:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب تفاصيل وردية محددة' })
  async findOne(@Param('id') id: string) {
    return await this.shiftsService.findOne(id);
  }
}
