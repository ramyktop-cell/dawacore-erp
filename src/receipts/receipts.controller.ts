import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { CreateReceiptDto, FilterReceiptDto } from './dto/create-receipt.dto';
import { Permission } from '../auth/security.policy';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post()
  @Permission('receipts:write')
  async createReceipt(@Body() dto: CreateReceiptDto, @Req() req: any) {
    return this.receiptsService.createReceipt(dto, req.user);
  }

  @Get()
  @Permission('receipts:read')
  async getReceipts(@Query() filters: FilterReceiptDto, @Req() req: any) {
    return this.receiptsService.getReceipts(filters, req.user);
  }

  @Get('stats')
  @Permission('receipts:read')
  async getStats(
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
    @Req() req?: any,
  ) {
    return this.receiptsService.getStats(companyId, branchId, req?.user);
  }

  @Put(':id/cancel')
  @Permission('receipts:approve')
  async cancelReceipt(@Param('id') id: string, @Req() req: any) {
    return this.receiptsService.cancelReceipt(id, req.user);
  }
}
