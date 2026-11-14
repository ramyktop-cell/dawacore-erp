const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env'), override: false });
const file = process.argv[2];
if (!file || !fs.existsSync(file)) throw new Error('استخدم: restore-db.bat <backup.sql>');
if (process.argv.includes('--confirm') === false) throw new Error('الاستعادة مدمرة للبيانات الحالية. أعد التشغيل مع --confirm');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL غير مضبوط في .env');
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.searchParams.delete('schema');
const candidates = [
  'psql',
  'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
  'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
  'C:\\Program Files (x86)\\Odoo 11.0\\PostgreSQL\\bin\\psql.exe',
];
const executable = candidates.slice(1).find((candidate) => fs.existsSync(candidate)) || 'psql';
if (!executable) throw new Error('psql غير موجود. ثبّت أدوات PostgreSQL أو أضف مجلد bin إلى PATH');
const result = spawnSync(executable, ['--dbname', databaseUrl.toString(), '--set', 'ON_ERROR_STOP=1', '--file', path.resolve(file)], { stdio: 'inherit', windowsHide: true });
if (result.error) throw new Error('تعذر تشغيل psql. ثبّت أدوات PostgreSQL أو أضف مجلد bin إلى PATH');
if (result.status !== 0) throw new Error('فشل استعادة النسخة الاحتياطية');
console.log('[OK] تمت استعادة النسخة الاحتياطية. أعد تشغيل النظام ثم نفذ فحص الجاهزية.');
