import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { SettingsModule } from 'src/modules/settings';
import { FiscalYearService } from './services/fiscal-year.service';
import { FiscalYearController } from './controllers/fiscal-year.controller';

@Module({
  imports: [SettingsModule],
  controllers: [FiscalYearController],
  providers: [PrismaService, FiscalYearService],
  exports: [FiscalYearService],
})
export class FiscalModule {}
