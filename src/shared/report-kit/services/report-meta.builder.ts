import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReportMeta } from '../interfaces/report-meta.interface';
import { DateTzUtil } from '../utils/date-tz.util';

/**
 * خيارات بناء الـ meta.
 */
export interface BuildMetaOptions {
  /** عنوان التقرير بالعربية */
  title: string;

  /** معرف الشركة (من JWT) */
  companyId: string;

  /** معرف المستخدم (من JWT) */
  userId: string;

  /** فلتر اختياري بالفرع */
  branchId?: string;

  /** تاريخ البداية (اختياري) */
  fromDate?: string;

  /** تاريخ النهاية (اختياري) */
  toDate?: string;

  /** لقطة من الفلاتر (للتخزين في meta) */
  filters?: Record<string, unknown>;
}

/**
 * نتيجة بناء الـ meta.
 */
export interface BuildMetaResult {
  meta: ReportMeta;
  timezone: string;
  currency: string;
}

/**
 * ReportMetaBuilder
 * ─────────────────
 * مسؤول عن:
 *   1. جلب بيانات الشركة (name, timezone, currency, logo)
 *   2. جلب اسم الفرع (لو محدد)
 *   3. جلب بيانات المستخدم
 *   4. بناء كائن meta موحّد
 *
 * يُستخدم تلقائياً من BaseReportService — لا تحتاج لاستدعائه يدوياً.
 */
@Injectable()
export class ReportMetaBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(options: BuildMetaOptions): Promise<BuildMetaResult> {
    // ─── 1. جلب الشركة (إلزامي)
    const company = await this.prisma.company.findUnique({
      where: { id: options.companyId },
      select: {
        name: true,
        timezone: true,
        currency: true,
        logoUrl: true,
      },
    });

    if (!company) {
      throw new NotFoundException(
        `الشركة غير موجودة (id=${options.companyId})`,
      );
    }

    const tz = company.timezone || 'Africa/Cairo';
    const currency = company.currency || 'SDG';

    // ─── 2. جلب الفرع والمستخدم على التوازي
    const [branch, user] = await Promise.all([
      options.branchId
        ? this.prisma.branch.findFirst({
            where: { id: options.branchId, companyId: options.companyId },
            select: { name: true },
          })
        : Promise.resolve(null),

      this.prisma.user.findUnique({
        where: { id: options.userId },
        select: { id: true, name: true },
      }),
    ]);

    // ─── 3. حساب التواريخ الافتراضية
    const todayStr = DateTzUtil.todayInTz(tz);
    const fromDate = options.fromDate || todayStr;
    const toDate = options.toDate || todayStr;

    // ─── 4. بناء الـ meta
    let companyLogo: string | undefined = (company as any).logoUrl ?? undefined;
    if (companyLogo && companyLogo.startsWith('/')) {
      const candidates = [
        path.resolve(process.cwd(), 'frontend', 'public', companyLogo.slice(1)),
        path.resolve(process.cwd(), 'public', companyLogo.slice(1)),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          try {
            const ext = path.extname(p).replace('.', '') || 'png';
            const base64 = fs.readFileSync(p).toString('base64');
            companyLogo = `data:image/${ext};base64,${base64}`;
            break;
          } catch {
            // ignore
          }
        }
      }
    }

    const meta: ReportMeta = {
      title: options.title,
      companyName: company.name,
      companyLogo,
      branchName: branch?.name,
      fromDate,
      toDate,
      timezone: tz,
      generatedAt: new Date(),
      generatedBy: {
        id: user?.id || options.userId,
        name: user?.name || 'النظام',
      },
      filters: options.filters,
    };

    return { meta, timezone: tz, currency };
  }
}
