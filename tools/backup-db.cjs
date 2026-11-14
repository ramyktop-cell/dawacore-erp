const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env'), override: false });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL غير مضبوط في .env');
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.searchParams.delete('schema');

const backupDir = process.env.BACKUP_DIR || 'C:\\DawaCore_Backups';
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(backupDir, `dawacore_${stamp}.sql`);
const candidates = [
  'pg_dump',
  'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
  'C:\\Program Files (x86)\\Odoo 11.0\\PostgreSQL\\bin\\pg_dump.exe',
];
const executable = candidates.slice(1).find((candidate) => fs.existsSync(candidate)) || 'pg_dump';
if (!executable) throw new Error('pg_dump غير موجود. ثبّت أدوات PostgreSQL أو أضف مجلد bin إلى PATH');
const result = spawnSync(executable, ['--dbname', databaseUrl.toString(), '--format', 'plain', '--no-owner', '--file', output], { stdio: 'inherit', windowsHide: true });
if (result.error) throw new Error('تعذر تشغيل pg_dump. تحقق من تثبيت PostgreSQL وصلاحياته');
if (result.status !== 0 || !fs.existsSync(output) || fs.statSync(output).size === 0) throw new Error('فشل إنشاء النسخة الاحتياطية');
console.log(`[OK] تم إنشاء النسخة: ${output}`);
