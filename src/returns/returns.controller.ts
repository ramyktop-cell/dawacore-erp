import { Permission } from '../auth/security.policy';
import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { CreateSaleReturnDto } from './dto/create-return.dto';

@ApiTags('Returns')
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post('create')
  @Permission('returns:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'تسجيل مرتجع مبيعات وتوجيه المخزون (سليم / تالف) وتحديث الصندوق' })
  @ApiResponse({ status: 201, description: 'تم تسجيل المرتجع وتحديث الأرصدة بنجاح' })
  async createReturn(@Body() dto: CreateSaleReturnDto, @Req() req?: any) {
    const userId = req?.user?.id;
    return await this.returnsService.create(dto, userId, req?.user);
  }


  @Get()
  @Permission('returns:read')
  @ApiOperation({ summary: 'جلب جميع المرتجعات مع الفلترة والترقيم' })
  async findAll(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.returnsService.findAll({
      branchId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    }, req.user);
  }

  @Get('sale/:invoiceNumber')
  @Permission('returns:read')
  @ApiOperation({ summary: 'البحث عن فاتورة أصلية بواسطة رقمها لبدء عملية المرتجع' })
  async findSaleForReturn(@Param('invoiceNumber') invoiceNumber: string, @Req() req: any) {
    return await this.returnsService.findSaleForReturn(invoiceNumber, req.user);
  }

  @Get(':id')
  @Permission('returns:read')
  @ApiOperation({ summary: 'جلب تفاصيل مرتجع واحد' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return await this.returnsService.findOne(id, req.user);
  }
}

