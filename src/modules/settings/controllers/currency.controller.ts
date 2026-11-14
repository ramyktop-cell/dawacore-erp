import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../auth/security.policy';
import { CurrencyService } from '../services/currency.service';
import {
  AddCompanyCurrencyDto,
  UpdateExchangeRateDto,
  CreateCurrencyDto,
} from '../dto/currency.dto';

@ApiTags('Settings — Currencies')
@Controller('settings/currencies')
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}

  private ctx(req: any) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId) throw new UnauthorizedException('جلسة غير صالحة');
    return { companyId, userId };
  }

  @Get('global')
  @Permission('accounting:read')
  async listGlobal() {
    return this.service.listGlobalCurrencies();
  }

  @Post('global')
  @Permission('companies:write')
  async createGlobal(@Body() dto: CreateCurrencyDto) {
    return this.service.createGlobalCurrency(dto);
  }

  @Get()
  @Permission('accounting:read')
  async listCompany(@Req() req: any) {
    return this.service.listCompanyCurrencies(this.ctx(req).companyId);
  }

  @Get('base')
  @Permission('accounting:read')
  async getBase(@Req() req: any) {
    return this.service.getBaseCurrency(this.ctx(req).companyId);
  }

  @Get('history')
  @Permission('accounting:read')
  async history(
    @Query('currencyId') cid: string | undefined,
    @Req() req: any,
  ) {
    return this.service.getExchangeHistory(this.ctx(req).companyId, cid);
  }

  @Post()
  @Permission('accounting:write')
  async addToCompany(@Body() dto: AddCompanyCurrencyDto, @Req() req: any) {
    const { companyId, userId } = this.ctx(req);
    return this.service.addCurrencyToCompany(companyId, dto, userId);
  }

  @Put(':id/rate')
  @Permission('accounting:write')
  async updateRate(
    @Param('id') id: string,
    @Body() dto: UpdateExchangeRateDto,
    @Req() req: any,
  ) {
    const { companyId, userId } = this.ctx(req);
    return this.service.updateExchangeRate(companyId, id, dto, userId);
  }

  @Delete(':id')
  @Permission('accounting:write')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.service.removeCurrencyFromCompany(this.ctx(req).companyId, id);
  }
}
