import { Global, Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { SettingsService } from './services/settings.service';
import { CurrencyService } from './services/currency.service';
import { SettingsController } from './controllers/settings.controller';
import { CurrencyController } from './controllers/currency.controller';

@Global()
@Module({
  controllers: [SettingsController, CurrencyController],
  providers: [PrismaService, SettingsService, CurrencyService],
  exports: [SettingsService, CurrencyService],
})
export class SettingsModule {}
