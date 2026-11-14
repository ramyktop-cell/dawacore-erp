import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { ShiftsModule } from './shifts/shifts.module';
import { SalesModule } from './sales/sales.module';
import { ReturnsModule } from './returns/returns.module';
import { MedicinesModule } from './medicines/medicines.module';
import { AccountingModule } from './accounting/accounting.module';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { BranchesModule } from './branches/branches.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { AccountsModule } from './accounts/accounts.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { LicensingModule } from './licensing/licensing.module';
import { StockCountModule } from './modules/stock-count/stock-count.module';
import { OpeningBalanceModule } from './modules/opening-balance/opening-balance.module';
import { AccountingReportsModule } from './modules/accounting/reports/accounting-reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ...(process.env.DISABLE_BACKGROUND_JOBS === 'true' ? [] : [ScheduleModule.forRoot()]),
    StockCountModule,
    OpeningBalanceModule,
    AccountingReportsModule,
    LicensingModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    SuppliersModule,
    CompaniesModule,
    BranchesModule,
    InventoryModule,
    PurchasingModule,
    ShiftsModule,
    SalesModule,
    ReturnsModule,
    MedicinesModule,
    AccountingModule,
    AccountsModule,
    ReportsModule,
    DashboardModule,
    ExpensesModule,
    ReceiptsModule,
  ],
})
export class AppModule {}

