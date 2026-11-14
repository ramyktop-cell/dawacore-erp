import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { OpeningBalanceService } from './opening-balance.service';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { CancelOpeningBalanceDto } from './dto/cancel-opening-balance.dto';
import { Permission } from '../../auth/security.policy';

@Controller('opening-balance')
export class OpeningBalanceController {
  constructor(private readonly service: OpeningBalanceService) {}

  @Get()
  @Permission('opening-balance:read')
  async getAll(@Req() req: any, @Query('branchId') branchId?: string) {
    return this.service.getAll({ branchId }, req.user);
  }

  @Get('suggest/:companyId/:branchId')
  @Permission('opening-balance:read')
  async suggest(@Param('companyId') companyId: string, @Param('branchId') branchId: string, @Req() req: any) {
    return this.service.suggest(companyId, branchId, req.user);
  }

  @Get(':id')
  @Permission('opening-balance:read')
  async getOne(@Param('id') id: string, @Req() req: any) {
    return this.service.getOne(id, req.user);
  }

  @Post()
  @Permission('opening-balance:write')
  async create(@Body() dto: CreateOpeningBalanceDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Post(':id/post')
  @Permission('opening-balance:approve')
  async post(@Param('id') id: string, @Req() req: any) {
    return this.service.post(id, req.user);
  }

  @Post(':id/cancel')
  @Permission('opening-balance:approve')
  async cancel(@Param('id') id: string, @Body() dto: CancelOpeningBalanceDto, @Req() req: any) {
    return this.service.cancel(id, dto.reason, req.user);
  }
}
