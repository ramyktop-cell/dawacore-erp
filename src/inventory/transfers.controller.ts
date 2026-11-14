import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { Permission } from '../auth/security.policy';

@ApiTags('Transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @Permission('transfers:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'تنفيذ تحويل مخزني ذري بين الفروع وتوليد سند تحويل TRF' })
  async create(@Body() dto: CreateTransferDto, @Req() req?: any) {
    return await this.transfersService.executeTransfer(dto, req.user);
  }

  @Get()
  @Permission('transfers:read')
  @ApiOperation({ summary: 'استعلام سجل عمليات التحويل بين الفروع' })
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    return await this.transfersService.getTransfersHistory({
      branchId,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    }, req.user);
  }

  @Get(':referenceId')
  @Permission('transfers:read')
  @ApiOperation({ summary: 'جلب تفاصيل سند تحويل محدد برقم السند' })
  async findOne(@Param('referenceId') referenceId: string, @Req() req: any) {
    return await this.transfersService.getTransferDetails(referenceId, req.user);
  }
}
