import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// ✅ تحميل .env.test بدلاً من .env مع فرض الاستبدال
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true });

// ✅ حماية صارمة: منع تشغيل الاختبارات على قاعدة الإنتاج
const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl.includes('_test') && !dbUrl.includes('test')) {
  console.error('\n🚨🚨🚨 خطر أمني 🚨🚨🚨');
  console.error('قاعدة البيانات ليست قاعدة اختبار!');
  console.error(`DATABASE_URL: ${dbUrl}`);
  console.error('يجب أن يحتوي على "_test" في الاسم.');
  console.error('تم إيقاف الاختبارات لحماية بياناتك.\n');
  process.exit(1);
}

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
  console.log(`✅ متصل بقاعدة اختبار: ${dbUrl.split('/').pop()?.split('?')[0]}`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
