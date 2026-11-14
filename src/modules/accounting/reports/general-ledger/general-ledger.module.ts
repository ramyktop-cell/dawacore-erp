import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { GeneralLedgerService } from './services/general-ledger.service';
import { GeneralLedgerExportService } from './services/general-ledger-export.service';
import { GeneralLedgerController } from './controllers/general-ledger.controller';

/**
 * GeneralLedgerModule
 * ───────────────────
 * يجمع كل مكونات تقرير دفتر الأستاذ العام.
 */
@Module({
  controllers: [GeneralLedgerController],
  providers: [
    PrismaService,
    GeneralLedgerService,
    GeneralLedgerExportService,
  ],
  exports: [GeneralLedgerService],
})
export class GeneralLedgerModule {}
