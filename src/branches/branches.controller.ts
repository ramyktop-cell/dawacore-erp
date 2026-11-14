import { Permission } from '../auth/security.policy';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';

@ApiTags('Branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  @Post()
  @Permission('branches:write')
  @ApiOperation({ summary: 'إضافة فرع جديد لشركة' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الفرع بنجاح' })
  create(@Body() dto: CreateBranchDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @Permission('branches:read')
  @ApiOperation({ summary: 'استعراض قائمة الفروع مع التصفية بالشركة والبحث' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Req() req: any,
    @Query('companyId') companyId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      companyId,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    }, req.user);
  }

  @Get(':id')
  @Permission('branches:read')
  @ApiOperation({ summary: 'استعلام عن فرع محدد' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  @Put(':id')
  @Permission('branches:write')
  @ApiOperation({ summary: 'تحديث بيانات الفرع' })
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto, @Req() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permission('branches:write')
  @ApiOperation({ summary: 'حذف فرع' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }
}
