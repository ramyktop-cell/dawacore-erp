import { Controller, Get, Query, Req } from '@nestjs/common';
import { Permission } from '../auth/security.policy';
import { BranchStockReportsService } from './branch-stock-reports.service';

@Controller('reports/branch-stock')
export class BranchStockReportsController {
  constructor(private readonly service: BranchStockReportsService) {}
  @Get('items')
  @Permission('stock-reports:read')
  catalog(@Req() req: any, @Query('branchId') branchId: string, @Query('search') search?: string) {
    return this.service.catalog(req.user, branchId, search);
  }
  @Get('valuation')
  @Permission('stock-reports:read')
  valuation(@Req() req: any, @Query('branchId') branchId?: string) {
    return this.service.valuation(req.user, branchId);
  }
  @Get('ledger')
  @Permission('stock-reports:read')
  ledger(@Req() req: any, @Query('branchId') branchId?: string, @Query('medicineId') medicineId?: string,
    @Query('from') from?: string, @Query('to') to?: string, @Query('page') page?: string) {
    return this.service.ledger(req.user, {branchId, medicineId, from, to, page});
  }
}
