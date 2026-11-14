import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 بدء Backfill للسنة المالية...\n');

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });

  for (const company of companies) {
    console.log(`\n📊 شركة: ${company.name}`);

    const orphanEntries = await prisma.journalEntry.findMany({
      where: {
        companyId: company.id,
        fiscalYearId: null,
      },
      select: { id: true, date: true },
    });

    if (orphanEntries.length === 0) {
      console.log('  ✅ لا توجد قيود بدون سنة');
      continue;
    }

    console.log(`  📋 ${orphanEntries.length} قيد`);

    const byYear = new Map<number, string[]>();
    for (const entry of orphanEntries) {
      const year = entry.date.getUTCFullYear();
      const list = byYear.get(year) ?? [];
      list.push(entry.id);
      byYear.set(year, list);
    }

    for (const [year, entryIds] of byYear) {
      let fy = await prisma.fiscalYear.findUnique({
        where: { companyId_year: { companyId: company.id, year } },
      });

      if (!fy) {
        fy = await prisma.fiscalYear.create({
          data: {
            companyId: company.id,
            year,
            startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
            endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
            status: 'OPEN',
            openedAt: new Date(),
            openedBy: 'system-backfill',
            notes: 'أُنشئت تلقائياً',
          },
        });
        console.log(`  ✅ أُنشئت السنة ${year}`);
      }

      await prisma.journalEntry.updateMany({
        where: { id: { in: entryIds } },
        data: { fiscalYearId: fy.id },
      });

      console.log(`  🔗 ${entryIds.length} قيد → السنة ${year}`);
    }
  }

  console.log('\n✅ اكتمل Backfill');
}

main()
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
