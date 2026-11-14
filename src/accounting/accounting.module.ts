import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { AccountingEventListener } from './accounting.listener';
import { OutboxProcessorService } from './outbox.processor.service';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, AccountingEventListener, OutboxProcessorService],
  exports: [AccountingService],
})
export class AccountingModule {}
