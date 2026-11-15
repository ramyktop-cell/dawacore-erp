import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  // Keep every API endpoint under /api and serve the compiled SPA from the
  // same process. Production therefore needs one service and one LAN port.
  app.setGlobalPrefix('api');

  // Enable CORS for frontend integration
  app.enableCors({ origin: (process.env.CORS_ORIGINS || 'http://localhost:5174,http://127.0.0.1:5174').split(',').map(s => s.trim()), credentials: false });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configure OpenAPI / Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('MadarCore API')
    .setDescription('MadarCore - Core ERP, Inventory, POS, Purchasing & Returns Engine')
    .setVersion('1.0.0')
    .addTag('Inventory', 'نواة المخزون وحجز الـ FEFO')
    .addTag('Purchasing', 'وحدة المشتريات وإدارة الموردين')
    .addTag('Shifts', 'إدارة ورديات الكاشير ومطابقة العهدة النقدية')
    .addTag('Sales', 'وحدة المبيعات ونقاط البيع (POS) والسلات المعلقة')
    .addTag('Returns', 'وحدة المرتجعات واسترداد المدفوعات')
    .build();

  if (process.env.ENABLE_SWAGGER === 'true' && process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const frontendDirectory = join(process.cwd(), 'frontend', 'dist');
  if (existsSync(join(frontendDirectory, 'index.html'))) {
    app.useStaticAssets(frontendDirectory);
    app.use((request, response, next) => {
      if (request.method === 'GET' && !request.path.startsWith('/api')) {
        return response.sendFile('index.html', { root: frontendDirectory });
      }
      next();
    });
  }

  const port = process.env.PORT || 3002;
  await app.listen(port, process.env.HOST || '127.0.0.1');
  console.log(`\n==================================================`);
  console.log(`🚀 MadarCore Server running on: http://localhost:${port}`);
  console.log(`📚 Swagger Interactive API Docs: http://localhost:${port}/api/docs`);
  console.log(`==================================================\n`);
}
bootstrap();
