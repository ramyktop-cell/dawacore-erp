import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/create-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    const company = await this.prisma.company.create({
      data: {
        name: dto.name.trim(),
        taxNumber: dto.taxNumber?.trim() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        address: dto.address?.trim() || null,
        logoUrl: dto.logoUrl || '/logo.png',
        isActive: dto.isActive ?? true,
      },
    });

    // إنشاء فرع رئيسي تلقائياً للشركة الجديدة لتكون جاهزة للعمل فوراً
    await this.prisma.branch.create({
      data: {
        name: `الفرع الرئيسي - ${company.name}`,
        code: 'MAIN-01',
        address: company.address || 'المقر الرئيسي',
        phone: company.phone || null,
        isMain: true,
        isActive: true,
        companyId: company.id,
      },
    }).catch(() => null);

    return this.findOne(company.id);
  }

  async findAll(params: { search?: string; page?: number; limit?: number }) {
    const { search, page = 1, limit = 20 } = params;
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { taxNumber: { contains: search } },
            { phone: { contains: search } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: { _count: { select: { branches: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { branches: true },
    });
    if (!company) throw new NotFoundException('الشركة غير موجودة');
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id);
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.company.delete({ where: { id } });
  }
}
