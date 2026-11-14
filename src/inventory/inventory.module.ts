import { Module } from '@nestjs/common';
import { StockReservationService } from './stock-reservation.service';
import { InventoryController } from './inventory.controller';
import { BatchesService } from './batches.service';
import { BatchesController } from './batches.controller';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';

@Module({
  controllers: [
    InventoryController,
    BatchesController,
    TransfersController,
  ],
  providers: [
    StockReservationService,
    BatchesService,
    TransfersService,
  ],
  exports: [
    StockReservationService,
    BatchesService,
    TransfersService,
  ],
})
export class InventoryModule {}
