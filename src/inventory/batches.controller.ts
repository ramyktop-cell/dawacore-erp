import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BatchesService } from './batches.service';
import { CreateBatchDto, UpdateBatchDto } from './dto/create-batch.dto';
import { Permission } from '../auth/security.policy';

@ApiTags('Batches')
@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get()
  @Permission('batches:read')
  @ApiOperation({ summary: 'جلب جميع التشغيلات والدفعات مع الفلترة حسب الصلاحية والفرع' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('branchId') branchId?: string,
    @Query('medicineId') medicineId?: string,
    @Query('expiryFilter') expiryFilter?: 'ALL' | 'EXPIRED' | 'EXPIRING_SOON' | 'VALID',
  ) {
    return await this.batchesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      branchId,
      medicineId,
      expiryFilter,
    });
  }

  @Get(':id')
  @Permission('batches:read')
  @ApiOperation({ summary: 'جلب تفاصيل تشغيلة محددة' })
  async findOne(@Param('id') id: string) {
    return await this.batchesService.findOne(id);
  }

  @Post()
  @Permission('batches:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إضافة تشغيلة ورصيد جديد' })
  async create(@Body() dto: CreateBatchDto) {
    return await this.batchesService.create(dto);
  }

  @Put(':id')
  @Permission('batches:write')
  @ApiOperation({ summary: 'تعديل بيانات التشغيلة' })
  async update(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return await this.batchesService.update(id, dto);
  }

  @Patch(':id/freeze')
  @Permission('batches:write')
  @ApiOperation({ summary: 'تجميد أو إلغاء تجميد تشغيلة' })
  async toggleFreeze(@Param('id') id: string) {
    return await this.batchesService.toggleFreeze(id);
  }

  @Delete(':id')
  @Permission('batches:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'حذف تشغيلة (إذا لم ترتبط بحركات صرف سابقة)' })
  async remove(@Param('id') id: string) {
    return await this.batchesService.remove(id);
  }
}
