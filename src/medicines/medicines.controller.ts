import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { MedicinesService } from './medicines.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, Permission } from '../auth/security.policy';
import {
  CreateMedicineDto,
  UpdateMedicineDto,
  BulkImportMedicinesDto,
} from './dto/create-medicine.dto';

@ApiTags('Medicines')
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Get()
  @Permission('medicines:read')
  @ApiOperation({ summary: 'جلب جميع الأدوية مع الفلترة والترقيم وحساب أرصدة المخزون' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('branchId') branchId?: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    const scopedBranchId = await this.medicinesService.resolveBranchScope(branchId, actor);
    return await this.medicinesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      category,
      branchId: scopedBranchId,
    });
  }

  @Get('categories')
  @Permission('medicines:read')
  @ApiOperation({ summary: 'جلب قائمة التصنيفات الدوائية المسجلة' })
  async getCategories() {
    return await this.medicinesService.getCategories();
  }

  @Get('search')
  @Permission('medicines:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'البحث عن الأدوية بالاسم التجاري أو العلمي أو الكود' })
  @ApiQuery({ name: 'q', description: 'نص البحث', required: true })
  async search(@Query('q') q: string, @Query('branchId') branchId?: string, @CurrentUser() actor?: AuthenticatedUser) {
    const scopedBranchId = await this.medicinesService.resolveBranchScope(branchId, actor, true);
    return await this.medicinesService.search(q, scopedBranchId);
  }

  @Get('scan')
  @Permission('medicines:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'مطابقة الباركود الممسوح مع وحدة أو دواء' })
  @ApiQuery({ name: 'barcode', description: 'الباركود الممسوح', required: true })
  async scan(@Query('barcode') barcode: string, @Query('branchId') branchId?: string, @CurrentUser() actor?: AuthenticatedUser) {
    const scopedBranchId = await this.medicinesService.resolveBranchScope(branchId, actor, true);
    return await this.medicinesService.scan(barcode, scopedBranchId, actor?.companyId);
  }

  @Get(['pos', 'pos-search'])
  @Permission('medicines:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'استعلام الأدوية والتشغيلات المتاحة للفرع بنظام FEFO' })
  @ApiQuery({ name: 'branchId', description: 'معرف الفرع', required: false })
  @ApiQuery({ name: 'q', description: 'نص البحث أو الباركود', required: false })
  @ApiQuery({ name: 'search', description: 'نص البحث أو الباركود', required: false })
  async findForPos(
    @Query('branchId') branchId?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    const query = q || search || '';
    const scopedBranchId = await this.medicinesService.resolveBranchScope(branchId, actor, true);
    return await this.medicinesService.findForPos(scopedBranchId, query);
  }

  @Get('top-selling')
  @Permission('medicines:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب أكثر الأصناف مبيعاً (Top 20 Best Sellers) مع أرصدة المخزون والأسعار' })
  @ApiQuery({ name: 'limit', description: 'عدد الأصناف المطلوبة (افتراضي 20)', required: false })
  @ApiQuery({ name: 'branchId', description: 'معرف الفرع', required: false })
  async getTopSelling(
    @Query('limit') limit?: string,
    @Query('branchId') branchId?: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    const parsed = limit ? Number.parseInt(limit, 10) : 20;
    const take = Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 20;
    const scopedBranchId = await this.medicinesService.resolveBranchScope(branchId, actor, true);
    return await this.medicinesService.getTopSelling(take, scopedBranchId);
  }

  @Get(':id')
  @Permission('medicines:read')
  @ApiOperation({ summary: 'جلب تفاصيل دواء محدد مع وحداته وتشغيلاته' })
  async findOne(@Param('id') id: string) {
    return await this.medicinesService.findOne(id);
  }

  @Post()
  @Permission('medicines:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إضافة دواء جديد مع وحدات القياس (علبة، شريط، حبة)' })
  async create(@Body() dto: CreateMedicineDto, @CurrentUser() actor: AuthenticatedUser) {
    return await this.medicinesService.create(dto, actor);
  }

  @Post('bulk-import')
  @Permission('medicines:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'استيراد جماعي للأصناف والأرصدة من Odoo أو Excel/CSV' })
  async bulkImport(@Body() dto: BulkImportMedicinesDto) {
    return await this.medicinesService.bulkImport(dto);
  }

  @Put(':id')
  @Permission('medicines:write')
  @ApiOperation({ summary: 'تعديل بيانات دواء ووحداته' })
  async update(@Param('id') id: string, @Body() dto: UpdateMedicineDto, @CurrentUser() actor: AuthenticatedUser) {
    return await this.medicinesService.update(id, dto, actor);
  }

  @Delete(':id')
  @Permission('medicines:write')
  @ApiOperation({ summary: 'حذف دواء بشرط عدم ارتباطه بحركات سابقة' })
  async remove(@Param('id') id: string) {
    return await this.medicinesService.remove(id);
  }
}
