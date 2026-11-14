import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LicensingService } from './licensing.service';
import { LicensingController } from './licensing.controller';
import { LicensingGuard } from './licensing.guard';

@Global()
@Module({
  controllers: [LicensingController],
  providers: [
    LicensingService,
    LicensingGuard,
    {
      provide: APP_GUARD,
      useClass: LicensingGuard,
    },
  ],
  exports: [LicensingService, LicensingGuard],
})
export class LicensingModule {}
