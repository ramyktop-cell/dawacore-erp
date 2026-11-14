import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StockCountService } from './stock-count.service';
import { StartStockCountDto } from './dto/start-stock-count.dto';
import { RecordStockCountItemsDto } from './dto/record-stock-count.dto';
import { CancelStockCountDto } from './dto/cancel-stock-count.dto';
import { QuickAddStockCountItemDto } from './dto/quick-add-stock-count-item.dto';
import { Permission } from '../../auth/security.policy';

@ApiTags('Stock Count')
@Controller('stock-count')
export class StockCountController {
  constructor(private readonly service: StockCountService) {}

  @Get()
  @Permission('stock-count:read')
  @ApiOperation({ summary: 'استعلام قائمة محاضر الجرد' })
  findAll(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      branchId,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    }, req.user);
  }

  @Get(':id')
  @Permission('stock-count:read')
  @ApiOperation({ summary: 'جلب تفاصيل محضر جرد بكامل بنوده' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  @Post('start')
  @Permission('stock-count:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'بدء محضر جرد جديد وتجميد الدفعات' })
  start(@Body() dto: StartStockCountDto, @Req() req: any) {
    return this.service.start(dto, req.user);
  }

  @Put(':id/record')
  @Permission('stock-count:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تسجيل كميات العد الفعلي' })
  recordItems(
    @Param('id') id: string,
    @Body() dto: RecordStockCountItemsDto,
    @Req() req: any,
  ) {
    return this.service.recordItems(id, dto, req.user);
  }

  @Post(':id/record')
  @Permission('stock-count:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تسجيل كميات العد الفعلي (POST)' })
  recordItemsPost(
    @Param('id') id: string,
    @Body() dto: RecordStockCountItemsDto,
    @Req() req: any,
  ) {
    return this.service.recordItems(id, dto, req.user);
  }

  @Put(':id/reconcile')
  @Permission('stock-count:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'مطابقة الفروقات' })
  reconcile(@Param('id') id: string, @Req() req: any) {
    return this.service.reconcile(id, req.user);
  }

  @Post(':id/reconcile')
  @Permission('stock-count:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'مطابقة الفروقات (POST)' })
  reconcilePost(@Param('id') id: string, @Req() req: any) {
    return this.service.reconcile(id, req.user);
  }

  @Post(':id/approve')
  @Permission('stock-count:approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'اعتماد الجرد والترحيل المحاسبي' })
  approve(@Param('id') id: string, @Req() req: any) {
    return this.service.approve(id, req.user);
  }

  @Post(':id/quick-item')
  @Permission('stock-count:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إضافة صنف أو تشغيلة على الطائر أثناء الجرد' })
  addQuickItem(
    @Param('id') id: string,
    @Body() dto: QuickAddStockCountItemDto,
    @Req() req: any,
  ) {
    return this.service.addQuickItem(id, dto, req.user);
  }

  @Post(':id/cancel')
  @Permission('stock-count:approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إلغاء الجرد وفك التجميد' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelStockCountDto,
    @Req() req: any,
  ) {
    return this.service.cancel(id, dto.reason, req.user);
  }
}
