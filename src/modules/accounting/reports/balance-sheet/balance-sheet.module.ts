import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { BalanceSheetService } from './services/balance-sheet.service';
import { BalanceSheetExportService } from './services/balance-sheet-export.service';
import { BalanceSheetController } from './controllers/balance-sheet.controller';

/**
 * BalanceSheetModule
 * ──────────────────
 * يجمع كل مكونات تقرير الميزانية العمومية.
 */
@Module({
  controllers: [BalanceSheetController],
  providers: [
    PrismaService,
    BalanceSheetService,
    BalanceSheetExportService,
  ],
  exports: [BalanceSheetService],
})
export class BalanceSheetModule {}
