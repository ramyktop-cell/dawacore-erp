import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { StockMovementService } from './services/stock-movement.service';
import { StockMovementExportService } from './services/stock-movement-export.service';
import { StockMovementController } from './controllers/stock-movement.controller';

/**
 * StockMovementModule
 * ───────────────────
 * يجمع كل مكونات تقرير حركة الأصناف والرواكد.
 */
@Module({
  controllers: [StockMovementController],
  providers: [
    PrismaService,
    StockMovementService,
    StockMovementExportService,
  ],
  exports: [StockMovementService, StockMovementExportService],
})
export class StockMovementModule {}
