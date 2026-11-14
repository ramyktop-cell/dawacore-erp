import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ نجح الاتصال بقاعدة بيانات PostgreSQL');
    } catch (error) {
      this.logger.warn(
        `⚠️ تعذر الاتصال التلقائي بقاعدة البيانات (${error.message}). يرجى التأكد من كلمة مرور PostgreSQL في ملف .env`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
