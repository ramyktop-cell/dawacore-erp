import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesController } from './sales.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from 'src/modules/settings';
import { AccountingReportsModule } from '../modules/accounting/reports/accounting-reports.module';

@Module({
  imports: [InventoryModule, SettingsModule, AccountingReportsModule],
  controllers: [SalesController],
  providers: [SalesService, SalesInvoicesService],
  exports: [SalesService, SalesInvoicesService],
})
export class SalesModule {}
