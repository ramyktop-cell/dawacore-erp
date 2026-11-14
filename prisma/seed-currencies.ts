import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const C = [
  { code: 'SDG', nameEn: 'Sudanese Pound', nameAr: 'الجنيه السوداني', symbol: 'ج.س' },
  { code: 'USD', nameEn: 'US Dollar', nameAr: 'الدولار الأمريكي', symbol: '$' },
  { code: 'SAR', nameEn: 'Saudi Riyal', nameAr: 'الريال السعودي', symbol: 'ر.س' },
  { code: 'AED', nameEn: 'UAE Dirham', nameAr: 'الدرهم الإماراتي', symbol: 'د.إ' },
  { code: 'EUR', nameEn: 'Euro', nameAr: 'اليورو', symbol: '€' },
];

async function main() {
  console.log('🌐 تهيئة الدليل العام للعملات...');
  for (const c of C) {
    const ex = await prisma.currency.findUnique({ where: { code: c.code } });
    if (!ex) {
      await prisma.currency.create({ data: c });
      console.log('➕ ' + c.code + ' (' + c.nameAr + ')');
    } else {
      console.log('✔️ ' + c.code + ' موجودة مسبقاً');
    }
  }

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const sdg = await prisma.currency.findUnique({ where: { code: 'SDG' } });
  const usd = await prisma.currency.findUnique({ where: { code: 'USD' } });

  if (!sdg || !usd) {
    throw new Error('لم يتم العثور على العملات الأساسية SDG أو USD');
  }

  for (const c of companies) {
    console.log('📊 ' + c.name);
    const hasSDG = await prisma.companyCurrency.findUnique({
      where: { companyId_currencyId: { companyId: c.id, currencyId: sdg.id } },
    });
    if (!hasSDG) {
      await prisma.companyCurrency.create({
        data: {
          companyId: c.id,
          currencyId: sdg.id,
          isBase: true,
          exchangeRate: 1,
          createdBy: 'system',
        },
      });
      console.log('  ✅ SDG (عملة أساسية - سعر 1.0)');
    } else {
      console.log('  ✔️ SDG مربوطة مسبقاً');
    }

    const hasUSD = await prisma.companyCurrency.findUnique({
      where: { companyId_currencyId: { companyId: c.id, currencyId: usd.id } },
    });
    if (!hasUSD) {
      await prisma.companyCurrency.create({
        data: {
          companyId: c.id,
          currencyId: usd.id,
          isBase: false,
          exchangeRate: 600,
          createdBy: 'system',
        },
      });
      console.log('  ✅ USD (عملة ثانوية - سعر 600)');
    } else {
      console.log('  ✔️ USD مربوطة مسبقاً');
    }
  }
}

main()
  .catch((e) => {
    console.error('❌ Error during currency seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
