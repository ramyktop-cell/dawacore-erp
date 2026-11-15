import { AuthenticatedUser, Permission } from '../auth/security.policy';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';

@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Post()
  @Permission('companies:write')
  @ApiOperation({ summary: 'إضافة شركة جديدة' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الشركة بنجاح' })
  create(@Body() dto: CreateCompanyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Get()
  @Permission('companies:read')
  @ApiOperation({ summary: 'استعراض قائمة الشركات والبحث والصفحات' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(
      {
        search,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
      },
      actor,
    );
  }

  @Get(':id')
  @Permission('companies:read')
  @ApiOperation({ summary: 'استعلام عن شركة محددة وفروعها' })
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Put(':id')
  @Permission('companies:write')
  @ApiOperation({ summary: 'تحديث بيانات الشركة' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @Permission('companies:write')
  @ApiOperation({ summary: 'حذف شركة وفروعها' })
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.remove(id, actor);
  }
}
