#!/usr/bin/env node
/**
 * ====================================================================
 * DawaCore - أداة المطور لتوليد مفاتيح التفعيل وترخيص الصيدليات
 * Vendor License Key Generator (Keygen)
 * ====================================================================
 * 
 * الاستخدام السريع:
 *   node tools/keygen.js --hwid "DWA-8974-9242-D890-3EA9" --client "صيدلية الأمل" --days 365
 *   أو لترخيص دائم:
 *   node tools/keygen.js --hwid "DWA-8974-9242-D890-3EA9" --client "صيدلية الأمل" --lifetime
 * 
 * أو تشغيله مباشرة دون معطيات للتفاعل خطوة بخطوة:
 *   node tools/keygen.js
 */

const crypto = require('crypto');
const readline = require('readline');

const VENDOR_SECRET =
  process.env.VENDOR_SECRET || 'DAWACORE_MASTER_VENDOR_SECRET_KEY_PROD_2026_SECURE';

function generateKey(hwid, clientName, days = 0) {
  const cleanHwid = hwid.trim().toUpperCase();
  const cleanClient = clientName.trim();
  const isLifetime = !days || days === 0 || days === '0' || days === 'lifetime';

  let expiryTimestamp = 0;
  let licenseType = 'LIFETIME';

  if (!isLifetime) {
    const numDays = parseInt(days, 10);
    expiryTimestamp = Date.now() + numDays * 24 * 60 * 60 * 1000;
    licenseType = numDays >= 365 ? 'ANNUAL' : 'TRIAL';
  }

  const payload = {
    h: cleanHwid,
    c: cleanClient,
    t: licenseType,
    e: expiryTimestamp,
    i: Date.now(),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto
    .createHmac('sha256', VENDOR_SECRET)
    .update(payloadBase64)
    .digest('hex')
    .substring(0, 24)
    .toUpperCase();

  const fullKey = `${payloadBase64}.${signature}`;

  return {
    fullKey,
    payload,
    expiryDate: expiryTimestamp === 0 ? 'دائم مدى الحياة (Lifetime)' : new Date(expiryTimestamp).toLocaleDateString('ar-EG'),
  };
}

// قراءة المدخلات من CLI
const args = process.argv.slice(2);
let argHwid = '';
let argClient = '';
let argDays = 0;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--hwid' && args[i + 1]) argHwid = args[i + 1];
  if (args[i] === '--client' && args[i + 1]) argClient = args[i + 1];
  if (args[i] === '--days' && args[i + 1]) argDays = parseInt(args[i + 1], 10);
  if (args[i] === '--lifetime') argDays = 0;
}

if (argHwid && argClient) {
  const result = generateKey(argHwid, argClient, argDays);
  printBanner(result, argHwid, argClient);
  process.exit(0);
}

// الوضع التفاعلي (Interactive Mode)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('\n======================================================');
console.log('       🔑 DawaCore - مولد تراخيص البرمجيات للمطور');
console.log('======================================================\n');

rl.question('1. أدخل كود جهاز العميل (Hardware ID e.g. DWA-XXXX-XXXX-XXXX-XXXX): ', (hwid) => {
  if (!hwid.trim()) {
    console.error('❌ خطأ: كود الجهاز مطلوب!');
    rl.close();
    process.exit(1);
  }

  rl.question('2. أدخل اسم المنشأة / الصيدلية: ', (clientName) => {
    if (!clientName.trim()) {
      console.error('❌ خطأ: اسم الصيدلية مطلوب!');
      rl.close();
      process.exit(1);
    }

    rl.question('3. مدة الترخيص بالأيام (0 أو اتركها فارغة لترخيص دائم مدى الحياة): ', (days) => {
      const result = generateKey(hwid, clientName, days ? parseInt(days, 10) : 0);
      printBanner(result, hwid, clientName);
      rl.close();
    });
  });
});

function printBanner(result, hwid, clientName) {
  console.log('\n======================================================');
  console.log('           🎉 تم توليد مفتاح الترخيص بنجاح!');
  console.log('======================================================');
  console.log(`🏢 العميل:       ${clientName}`);
  console.log(`🖥️  كود الجهاز:    ${hwid}`);
  console.log(`⏳ الصلاحية:     ${result.expiryDate}`);
  console.log('------------------------------------------------------');
  console.log('📋 انسخ المفتاح التالي وأرسله للعميل:');
  console.log('------------------------------------------------------');
  console.log(`\x1b[32m${result.fullKey}\x1b[0m`);
  console.log('------------------------------------------------------\n');
}
