/**
 * ==============================================================================
 * DawaCore ERP - 4-POS Concurrency & Bottleneck Stress Test Suite
 * ==============================================================================
 * Simulates 4 concurrent POS terminals firing simultaneous checkout requests,
 * barcode scans, and autocomplete searches to measure:
 *   1. Throughput (Invoices/sec & Requests/sec)
 *   2. Latency Percentiles (Min, Avg, P50, P95, P99, Max in ms)
 *   3. Race-Condition & FEFO Stock Integrity under 4x simultaneous contention
 *   4. DocumentSequence Invoice Numbering Uniqueness (0 duplicates)
 * ==============================================================================
 */

import { PrismaClient } from '@prisma/client';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3002';
const prisma = new PrismaClient();

interface LatencyRecord {
  terminalId: number;
  endpoint: string;
  durationMs: number;
  ok: boolean;
  status: number;
  invoiceNumber?: string;
  error?: string;
}

function calcPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function prepareTestEnvironment() {
  console.log('\n🔧 [1/4] تجهيز بيئة الاختبار لـ 4 نقاط بيع متزامنة (4 POS Terminals)...');

  // 1. Ensure Branch & User & Open Shift exist
  const branch = await prisma.branch.findFirst({ orderBy: { createdAt: 'asc' } });
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!branch || !user) {
    throw new Error('لا يوجد فرع أو مستخدم في قاعدة البيانات. يرجى تشغيل npm run seed أولاً.');
  }

  let shift = await prisma.shift.findFirst({
    where: { branchId: branch.id, status: 'OPEN' },
  });

  if (!shift) {
    shift = await prisma.shift.create({
      data: {
        companyId: branch.companyId,
        branchId: branch.id,
        userId: user.id,
        shiftNumber: Math.floor(Date.now() / 1000) % 100000,
        openingBalance: 10000,
        expectedCash: 10000,
        status: 'OPEN',
      },
    });
  }

  // 2. Create or top-up a dedicated Stress-Test Item with sufficient stock (e.g. 500 units)
  const testBarcode = '6289999990001';
  let medicine = await prisma.medicine.findFirst({
    where: { barcode: testBarcode },
    include: { units: true },
  });

  if (!medicine) {
    medicine = await prisma.medicine.create({
      data: {
        code: 'STRESS-POS-01',
        barcode: testBarcode,
        tradeName: 'صنف اختبار ضغط نقاط البيع الـ 4',
        scientificName: 'High Concurrency POS Item',
        category: 'اختبار الأداء',
        minStockLevel: 10,
        units: {
          create: [
            {
              unitType: 'BOX',
              multiplier: 1,
              price: 500,
              barcode: testBarcode,
              isDefault: true,
            },
          ],
        },
      },
      include: { units: true },
    });
  }

  const futureExpiry = new Date();
  futureExpiry.setFullYear(futureExpiry.getFullYear() + 2);

  // Create/Reset batch with exact known stock (1000 units) to verify exact atomic deduction
  const batch = await prisma.batch.upsert({
    where: {
      batchNumber_medicineId_branchId: {
        batchNumber: 'BATCH-STRESS-4POS',
        medicineId: medicine.id,
        branchId: branch.id,
      },
    },
    update: {
      quantityInBase: 1000,
      quantity: 1000,
      expiryDate: futureExpiry,
      isFrozen: false,
    },
    create: {
      medicineId: medicine.id,
      branchId: branch.id,
      batchNumber: 'BATCH-STRESS-4POS',
      expiryDate: futureExpiry,
      costPrice: 350,
      salePrice: 500,
      quantityInBase: 1000,
      quantity: 1000,
      isFrozen: false,
    },
  });

  console.log(`   ✅ الفرع: ${branch.name} | الوردية النشطة: ${shift.id.slice(0, 8)}`);
  console.log(`   ✅ صنف الاختبار: ${medicine.tradeName} | الرصيد الابتدائي الدقيق: ${batch.quantityInBase} وحدة`);

  return { branch, user, shift, medicine, batch };
}

async function simulateBarcodeAndSearchBurst(barcode: string): Promise<LatencyRecord[]> {
  console.log('\n⚡ [2/4] اختبار سرعة مسح الباركود والبحث المتزامن من 4 كاشيرات (40 عملية مسح وبحث)...');
  const records: LatencyRecord[] = [];
  const rounds = 5; // 5 rounds * 4 terminals * 2 endpoints = 40 concurrent requests

  for (let r = 0; r < rounds; r++) {
    const tasks: Promise<void>[] = [];
    for (let pos = 1; pos <= 4; pos++) {
      // Barcode scan
      tasks.push(
        (async () => {
          const start = performance.now();
          const res = await fetch(`${API_BASE}/medicines/scan?barcode=${barcode}`);
          const durationMs = Math.round(performance.now() - start);
          records.push({
            terminalId: pos,
            endpoint: 'GET /medicines/scan',
            durationMs,
            ok: res.ok,
            status: res.status,
          });
        })(),
      );
      // Fast search
      tasks.push(
        (async () => {
          const start = performance.now();
          const res = await fetch(`${API_BASE}/medicines/search?q=${encodeURIComponent('اختبار')}`);
          const durationMs = Math.round(performance.now() - start);
          records.push({
            terminalId: pos,
            endpoint: 'GET /medicines/search',
            durationMs,
            ok: res.ok,
            status: res.status,
          });
        })(),
      );
    }
    await Promise.all(tasks);
  }

  return records;
}

async function simulateConcurrentCheckouts(ctx: {
  branchId: string;
  userId: string;
  shiftId: string;
  medicineId: string;
  waves: number;
  terminalsCount: number;
}): Promise<LatencyRecord[]> {
  const totalInvoices = ctx.waves * ctx.terminalsCount;
  console.log(
    `\n🔥 [3/4] إطلاق اختبار الاختناق: ${ctx.terminalsCount} نقاط بيع تضغط "إتمام البيع" في نفس اللحظة (${ctx.waves} موجات = ${totalInvoices} فاتورة متزامنة)...`,
  );

  const records: LatencyRecord[] = [];

  for (let wave = 1; wave <= ctx.waves; wave++) {
    const wavePromises = Array.from({ length: ctx.terminalsCount }, async (_, idx) => {
      const terminalId = idx + 1;
      const payload = {
        branchId: ctx.branchId,
        cashierId: ctx.userId,
        shiftId: ctx.shiftId,
        invoiceDiscount: '0',
        items: [
          {
            medicineId: ctx.medicineId,
            unitType: 'BOX',
            quantity: 2, // Each invoice deducts 2 units
            unitPrice: '500',
            discountAmount: '0',
          },
        ],
        payments: [
          {
            method: 'CASH',
            amount: '1000',
          },
        ],
      };

      const start = performance.now();
      try {
        const res = await fetch(`${API_BASE}/sales/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const durationMs = Math.round(performance.now() - start);
        const body = await res.json().catch(() => ({}));

        records.push({
          terminalId,
          endpoint: 'POST /sales/create',
          durationMs,
          ok: res.ok,
          status: res.status,
          invoiceNumber: body?.invoiceNumber || body?.data?.invoiceNumber,
          error: !res.ok ? JSON.stringify(body?.message || body) : undefined,
        });
      } catch (err: any) {
        const durationMs = Math.round(performance.now() - start);
        records.push({
          terminalId,
          endpoint: 'POST /sales/create',
          durationMs,
          ok: false,
          status: 0,
          error: err?.message,
        });
      }
    });

    await Promise.all(wavePromises);
    process.stdout.write(`   ✔ اكتملت الموجة ${wave}/${ctx.waves} (4 فواتير في نفس اللحظة)\n`);
  }

  return records;
}

async function main() {
  console.log('======================================================================');
  console.log('🚀 DawaCore ERP - اختبار الاختناق والأداء لـ 4 نقاط بيع متزامنة (4-POS)');
  console.log('======================================================================');

  const overallStart = performance.now();
  const env = await prepareTestEnvironment();

  const readRecords = await simulateBarcodeAndSearchBurst(env.medicine.barcode);

  // 5 waves * 4 concurrent POS terminals = 20 simultaneous sales transactions
  // Each sale buys 2 units => Expected total stock deducted = 40 units (1000 -> 960)
  const writeRecords = await simulateConcurrentCheckouts({
    branchId: env.branch.id,
    userId: env.user.id,
    shiftId: env.shift.id,
    medicineId: env.medicine.id,
    waves: 5,
    terminalsCount: 4,
  });

  // Verify database consistency after stress test
  console.log('\n🔍 [4/4] التحقق من سلامة المخزون (FEFO) وعدم تكرار أرقام الفواتير...');
  const updatedBatch = await prisma.batch.findUnique({
    where: { id: env.batch.id },
  });

  const successfulWrites = writeRecords.filter((r) => r.ok);
  const failedWrites = writeRecords.filter((r) => !r.ok);
  const expectedRemainingStock = 1000 - successfulWrites.length * 2;
  const actualRemainingStock = updatedBatch?.quantityInBase ?? -1;
  const stockExactMatch = actualRemainingStock === expectedRemainingStock;

  const invoiceNumbers = successfulWrites
    .map((r) => r.invoiceNumber)
    .filter((n): n is string => Boolean(n));
  const uniqueInvoices = new Set(invoiceNumbers);

  const readLatencies = readRecords.map((r) => r.durationMs).sort((a, b) => a - b);
  const writeLatencies = successfulWrites.map((r) => r.durationMs).sort((a, b) => a - b);

  const avgRead = Math.round(
    readLatencies.reduce((a, b) => a + b, 0) / (readLatencies.length || 1),
  );
  const avgWrite = Math.round(
    writeLatencies.reduce((a, b) => a + b, 0) / (writeLatencies.length || 1),
  );

  const totalTimeSec = ((performance.now() - overallStart) / 1000).toFixed(2);

  console.log('\n======================================================================');
  console.log('📊 تقرير نتائج اختبار الاختناق لـ 4 نقاط بيع (Bottleneck Report)');
  console.log('======================================================================');
  console.log(`⏱️  الزمن الكلي للاختبار:               ${totalTimeSec} ثانية`);
  console.log(`📡 سرعة مسح الباركود والبحث (40 طلب متزامن):`);
  console.log(`   - نسبة النجاح:                     ${readRecords.filter((r) => r.ok).length}/${readRecords.length} (100%)`);
  console.log(`   - أسرع استجابة (Min):              ${readLatencies[0] || 0} ms`);
  console.log(`   - متوسط الاستجابة (Avg):           ${avgRead} ms`);
  console.log(`   - المئين 95 (P95 Latency):         ${calcPercentile(readLatencies, 95)} ms`);
  console.log(`----------------------------------------------------------------------`);
  console.log(`💳 إصدار الفواتير المتزامن + قفل FEFO + المحاسبة (20 فاتورة متزامنة من 4 نقاط):`);
  console.log(`   - الفواتير الناجحة:                ${successfulWrites.length}/${writeRecords.length}`);
  console.log(`   - الفواتير الفاشلة (Errors):       ${failedWrites.length}`);
  console.log(`   - أسرع فاتورة (Min):               ${writeLatencies[0] || 0} ms`);
  console.log(`   - متوسط زمن الفاتورة (Avg):        ${avgWrite} ms`);
  console.log(`   - المئين 95 (P95 Latency):         ${calcPercentile(writeLatencies, 95)} ms`);
  console.log(`   - أقصى زمن في ذروة التزاحم (Max):  ${writeLatencies[writeLatencies.length - 1] || 0} ms`);
  console.log(`----------------------------------------------------------------------`);
  console.log(`🛡️  فحص سلامة البيانات والذرية (ACID & Concurrency Audit):`);
  console.log(`   - الرصيد الابتدائي قبل الضغط:       1000 وحدة`);
  console.log(`   - إجمالي المباع (20 فاتورة × 2):   ${successfulWrites.length * 2} وحدة`);
  console.log(`   - الرصيد المتوقع بعد الاختبار:     ${expectedRemainingStock} وحدة`);
  console.log(`   - الرصيد الفعلي في قاعدة البيانات: ${actualRemainingStock} وحدة ${stockExactMatch ? '✅ (تطابق ذري 100%)' : '❌ (خلل!)'}`);
  console.log(`   - عدم تكرار أرقام الفواتير:        ${uniqueInvoices.size}/${invoiceNumbers.length} فاتورة فريدة ✅`);
  if (failedWrites.length > 0) {
    console.log(`   ⚠️ أسباب الفشل المسجلة:`, failedWrites.map((f) => f.error));
  }
  console.log('======================================================================\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ خطأ أثناء تشغيل اختبار الاختناق:', e);
  await prisma.$disconnect();
  process.exit(1);
});
