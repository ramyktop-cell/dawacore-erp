import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { SupplierAgingService } from './services/supplier-aging.service';
import { SupplierAgingExportService } from './services/supplier-aging-export.service';
import { SupplierAgingController } from './controllers/supplier-aging.controller';

/**
 * SupplierAgingModule
 * ───────────────────
 * يجمع كل مكونات تقرير أعمار ديون الموردين (AP Aging).
 */
@Module({
  controllers: [SupplierAgingController],
  providers: [
    PrismaService,
    SupplierAgingService,
    SupplierAgingExportService,
  ],
  exports: [SupplierAgingService, SupplierAgingExportService],
})
export class SupplierAgingModule {}
