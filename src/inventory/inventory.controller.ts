import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StockReservationService } from './stock-reservation.service';
import { ReserveStockDto } from './dto/reserve-stock.dto';
import { Permission } from '../auth/security.policy';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly stockService: StockReservationService) {}

  @Post('reserve')
  @Permission('inventory:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'حجز المخزون الذري وفق نظام FEFO والقفل الحصري' })
  @ApiResponse({ status: 200, description: 'تم تخصيص وحجز المخزون بنجاح' })
  @ApiResponse({ status: 409, description: 'الرصيد المتاح لا يكفي' })
  async reserveStock(@Body() dto: ReserveStockDto) {
    const result = await this.stockService.executeReservationWithLock(
      dto.medicineId,
      dto.branchId,
      dto.unitType,
      dto.quantity,
      dto.userId,
      dto.invoiceNumber,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'تم حجز وتخصيص المخزون بنجاح وفق معايير FEFO والقفل الحصري',
      data: result,
    };
  }
}
