import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CustomerAgingService } from './services/customer-aging.service';
import { CustomerAgingExportService } from './services/customer-aging-export.service';
import { CustomerAgingController } from './controllers/customer-aging.controller';

/**
 * CustomerAgingModule
 * ───────────────────
 * يجمع كل مكونات تقرير أعمار ديون العملاء (AR Aging).
 */
@Module({
  controllers: [CustomerAgingController],
  providers: [
    PrismaService,
    CustomerAgingService,
    CustomerAgingExportService,
  ],
  exports: [CustomerAgingService, CustomerAgingExportService],
})
export class CustomerAgingModule {}
