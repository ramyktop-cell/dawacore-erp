import { BranchStockReportsController } from './branch-stock-reports.controller';
import { BranchStockReportsService } from './branch-stock-reports.service';
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingReportsModule } from '../modules/accounting/reports/accounting-reports.module';

@Module({
  imports: [PrismaModule, AccountingReportsModule],
  controllers: [ReportsController, BranchStockReportsController],
  providers: [ReportsService, BranchStockReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

