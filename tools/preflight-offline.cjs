const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env'), override: true });

const required = [
  ['.env', fs.existsSync(path.join(root, '.env'))],
  ['dist/main.js', fs.existsSync(path.join(root, 'dist', 'main.js'))],
  ['frontend/dist', fs.existsSync(path.join(root, 'frontend', 'dist'))],
  ['license-public.pem', fs.existsSync(path.join(root, 'license-public.pem'))],
  ['prisma/migrations', fs.existsSync(path.join(root, 'prisma', 'migrations'))],
];
const failures = required.filter(([, ok]) => !ok).map(([name]) => `${name} is missing`);

if (!process.env.DATABASE_URL) failures.push('DATABASE_URL is not configured');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 48) failures.push('JWT_SECRET must contain at least 48 characters');
if (process.env.NODE_ENV !== 'production') failures.push('NODE_ENV must be production');
if (process.env.ENABLE_SWAGGER === 'true') failures.push('ENABLE_SWAGGER must be false in production');

async function main() {
  if (failures.length) {
    console.error('[FAIL] Readiness check failed:');
    failures.forEach((item) => console.error(` - ${item}`));
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('[OK] DawaCore is ready for offline operation.');
  } catch (error) {
    console.error('[FAIL] Cannot connect to the database:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error('[FAIL]', error.message); process.exitCode = 1; });
