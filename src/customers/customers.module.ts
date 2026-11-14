import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingReportsModule } from '../modules/accounting/reports/accounting-reports.module';
import { AccountingModule } from '../accounting/accounting.module';
import { ArModule } from '../modules/accounting/ar/ar.module';

@Module({
  imports: [PrismaModule, AccountingReportsModule, AccountingModule, ArModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}

