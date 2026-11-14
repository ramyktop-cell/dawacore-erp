require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const defaultMedicines = [
  {
    code: 'EGY-001',
    barcode: '6221123456011',
    tradeName: 'أوجمنتين 1 جم أقراص (Augmentin 1g)',
    scientificName: 'Amoxicillin + Clavulanic Acid 1000mg',
    category: 'مضادات حيوية',
    minStockLevel: 15,
    units: [
      { unitType: 'BOX', multiplier: 14, barcode: '6221123456011', price: 135.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 7, barcode: '6221123456012', price: 67.5, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221123456013', price: 9.65, isDefault: false },
    ],
    batch: { batchNumber: 'AUG26E01', costPrice: 7.2, salePrice: 135.0, expiryDate: new Date('2027-11-30'), quantityInBase: 140 },
  },
  {
    code: 'EGY-002',
    barcode: '6221500001021',
    tradeName: 'كونجستال أقراص (Congestal Tablets)',
    scientificName: 'Paracetamol + Pseudoephedrine + Chlorpheniramine',
    category: 'نزلات البرد والإنفلونزا',
    minStockLevel: 20,
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '6221500001021', price: 31.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221500001022', price: 15.5, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221500001023', price: 1.55, isDefault: false },
    ],
    batch: { batchNumber: 'CNG26A05', costPrice: 1.1, salePrice: 31.0, expiryDate: new Date('2028-02-28'), quantityInBase: 200 },
  },
  {
    code: 'EGY-003',
    barcode: '6221234005031',
    tradeName: 'أنتينال 200 مجم كبسول (Antinal 200mg)',
    scientificName: 'Nifuroxazide 200mg',
    category: 'مطهرات معوية',
    minStockLevel: 25,
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '6221234005031', price: 36.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 12, barcode: '6221234005032', price: 18.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221234005033', price: 1.5, isDefault: false },
    ],
    batch: { batchNumber: 'ANT25H09', costPrice: 1.05, salePrice: 36.0, expiryDate: new Date('2027-08-31'), quantityInBase: 240 },
  },
  {
    code: 'EGY-004',
    barcode: '7680489910041',
    tradeName: 'كتفلام 50 مجم أقراص (Cataflam 50mg)',
    scientificName: 'Diclofenac Potassium 50mg',
    category: 'مسكنات ومضادات الالتهاب',
    minStockLevel: 20,
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '7680489910041', price: 58.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '7680489910042', price: 29.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '7680489910043', price: 2.9, isDefault: false },
    ],
    batch: { batchNumber: 'CAT26C12', costPrice: 2.1, salePrice: 58.0, expiryDate: new Date('2027-12-31'), quantityInBase: 300 },
  },
  {
    code: 'EGY-005',
    barcode: '6221156001051',
    tradeName: 'ألفنتيرن أقراص (Alphintern Tablets)',
    scientificName: 'Chymotrypsin + Trypsin',
    category: 'مضادات التورم والالتهاب',
    minStockLevel: 30,
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6221156001051', price: 54.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221156001052', price: 18.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221156001053', price: 1.8, isDefault: false },
    ],
    batch: { batchNumber: 'ALP26F02', costPrice: 1.25, salePrice: 54.0, expiryDate: new Date('2028-04-30'), quantityInBase: 300 },
  },
  {
    code: 'EGY-006',
    barcode: '6221054002061',
    tradeName: 'جلوكوفاج 1000 مجم (Glucophage 1000mg)',
    scientificName: 'Metformin Hydrochloride 1000mg',
    category: 'أدوية السكري',
    minStockLevel: 20,
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6221054002061', price: 60.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221054002062', price: 20.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221054002063', price: 2.0, isDefault: false },
    ],
    batch: { batchNumber: 'GLU26D18', costPrice: 1.4, salePrice: 60.0, expiryDate: new Date('2028-09-30'), quantityInBase: 450 },
  },
  {
    code: 'EGY-007',
    barcode: '6221189003071',
    tradeName: 'كونكور 5 مجم بلس (Concor 5mg Plus)',
    scientificName: 'Bisoprolol 5mg + Hydrochlorothiazide 12.5mg',
    category: 'أدوية القلب وضغط الدم',
    minStockLevel: 15,
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6221189003071', price: 72.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221189003072', price: 24.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221189003073', price: 2.4, isDefault: false },
    ],
    batch: { batchNumber: 'CON26J04', costPrice: 1.7, salePrice: 72.0, expiryDate: new Date('2028-01-31'), quantityInBase: 300 },
  },
  {
    code: 'EGY-008',
    barcode: '6221345004081',
    tradeName: 'فلاجيل 500 مجم أقراص (Flagyl 500mg)',
    scientificName: 'Metronidazole 500mg',
    category: 'مطهرات ومضادات طفيليات',
    minStockLevel: 25,
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '6221345004081', price: 26.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221345004082', price: 13.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221345004083', price: 1.3, isDefault: false },
    ],
    batch: { batchNumber: 'FLG26B14', costPrice: 0.9, salePrice: 26.0, expiryDate: new Date('2027-10-31'), quantityInBase: 400 },
  },
  {
    code: 'SUD-001',
    barcode: '6251234567011',
    tradeName: 'كوارتم 20/120 مجم أقراص (Coartem 20/120mg)',
    scientificName: 'Artemether 20mg + Lumefantrine 120mg',
    category: 'أدوية الملاريا',
    minStockLevel: 50,
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '6251234567011', price: 4200.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 6, barcode: '6251234567012', price: 1050.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251234567013', price: 175.0, isDefault: false },
    ],
    batch: { batchNumber: 'CRT26M01', costPrice: 120.0, salePrice: 4200.0, expiryDate: new Date('2028-06-30'), quantityInBase: 480 },
  },
  {
    code: 'SUD-002',
    barcode: '6251234567021',
    tradeName: 'ارتيسونات 50 مجم أقراص (Artesunate 50mg)',
    scientificName: 'Artesunate 50mg',
    category: 'أدوية الملاريا',
    minStockLevel: 30,
    units: [
      { unitType: 'BOX', multiplier: 12, barcode: '6251234567021', price: 2800.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 6, barcode: '6251234567022', price: 1400.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251234567023', price: 233.33, isDefault: false },
    ],
    batch: { batchNumber: 'ART26K09', costPrice: 160.0, salePrice: 2800.0, expiryDate: new Date('2027-12-31'), quantityInBase: 240 },
  },
  {
    code: 'SUD-003',
    barcode: '6251000002031',
    tradeName: 'أموكلان 1 جم أقراص (Amoclan 1g)',
    scientificName: 'Amoxicillin + Clavulanic Acid 1000mg',
    category: 'مضادات حيوية',
    minStockLevel: 25,
    units: [
      { unitType: 'BOX', multiplier: 14, barcode: '6251000002031', price: 6500.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 7, barcode: '6251000002032', price: 3250.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251000002033', price: 464.28, isDefault: false },
    ],
    batch: { batchNumber: 'AMC26L03', costPrice: 320.0, salePrice: 6500.0, expiryDate: new Date('2028-03-31'), quantityInBase: 280 },
  },
  {
    code: 'SUD-004',
    barcode: '6251111003041',
    tradeName: 'فلودريكس أقراص (Fludrex Tablets)',
    scientificName: 'Paracetamol + Pseudoephedrine + Chlorpheniramine',
    category: 'نزلات البرد والإنفلونزا',
    minStockLevel: 40,
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '6251111003041', price: 3600.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 6, barcode: '6251111003042', price: 900.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251111003043', price: 150.0, isDefault: false },
    ],
    batch: { batchNumber: 'FDX26S07', costPrice: 100.0, salePrice: 3600.0, expiryDate: new Date('2028-05-31'), quantityInBase: 480 },
  },
  {
    code: 'SUD-005',
    barcode: '6251444004051',
    tradeName: 'بروفين 400 مجم أقراص (Brufen 400mg)',
    scientificName: 'Ibuprofen 400mg',
    category: 'مسكنات ومضادات الالتهاب',
    minStockLevel: 35,
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6251444004051', price: 4500.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6251444004052', price: 1500.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251444004053', price: 150.0, isDefault: false },
    ],
    batch: { batchNumber: 'BRF26H11', costPrice: 105.0, salePrice: 4500.0, expiryDate: new Date('2028-08-31'), quantityInBase: 600 },
  },
  {
    code: 'SUD-006',
    barcode: '6251555005061',
    tradeName: 'سبترين فورت أقراص (Septrin Forte Tablets)',
    scientificName: 'Sulfamethoxazole 800mg + Trimethoprim 160mg',
    category: 'مضادات حيوية واسعة المجال',
    minStockLevel: 20,
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '6251555005061', price: 3200.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6251555005062', price: 1600.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251555005063', price: 160.0, isDefault: false },
    ],
    batch: { batchNumber: 'SPT26V05', costPrice: 110.0, salePrice: 3200.0, expiryDate: new Date('2027-11-30'), quantityInBase: 300 },
  },
  {
    code: 'SUD-007',
    barcode: '6251666006071',
    tradeName: 'سالينال أقراص مضغ (Salinal Tablets)',
    scientificName: 'Simethicone 42mg',
    category: 'أدوية الجهاز الهضمي والغازات',
    minStockLevel: 25,
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6251666006071', price: 2100.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6251666006072', price: 700.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251666006073', price: 70.0, isDefault: false },
    ],
    batch: { batchNumber: 'SAL26N10', costPrice: 48.0, salePrice: 2100.0, expiryDate: new Date('2028-07-31'), quantityInBase: 450 },
  },
  {
    code: 'PAN-001',
    barcode: '5000347060111',
    tradeName: 'بنادول أزرق 500 مجم (Panadol Blue 500mg)',
    scientificName: 'Paracetamol 500mg',
    category: 'مسكنات وخافضات حرارة',
    minStockLevel: 40,
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '5000347060111', price: 48.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 12, barcode: '5000347060112', price: 24.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '5000347060113', price: 2.0, isDefault: false },
    ],
    batch: { batchNumber: 'PAN26A01', costPrice: 1.2, salePrice: 48.0, expiryDate: new Date('2028-10-31'), quantityInBase: 480 },
  },
  {
    code: 'PAN-002',
    barcode: '5000347060222',
    tradeName: 'بنادول إكسترا أقراص (Panadol Extra)',
    scientificName: 'Paracetamol 500mg + Caffeine 65mg',
    category: 'مسكنات وخافضات حرارة',
    minStockLevel: 40,
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '5000347060222', price: 60.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 12, barcode: '5000347060223', price: 30.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '5000347060224', price: 2.5, isDefault: false },
    ],
    batch: { batchNumber: 'PEX26D03', costPrice: 1.6, salePrice: 60.0, expiryDate: new Date('2028-11-30'), quantityInBase: 480 },
  },
  {
    code: 'OME-001',
    barcode: '6221567890111',
    tradeName: 'أوميز 20 مجم كبسول (Omez 20mg)',
    scientificName: 'Omeprazole 20mg',
    category: 'أدوية الحموضة وقرحة المعدة',
    minStockLevel: 25,
    units: [
      { unitType: 'BOX', multiplier: 28, barcode: '6221567890111', price: 65.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 14, barcode: '6221567890112', price: 32.5, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221567890113', price: 2.32, isDefault: false },
    ],
    batch: { batchNumber: 'OMZ26B08', costPrice: 1.45, salePrice: 65.0, expiryDate: new Date('2028-05-31'), quantityInBase: 420 },
  },
  {
    code: 'CIP-001',
    barcode: '6221890123456',
    tradeName: 'سيبروفار 500 مجم أقراص (Ciprofar 500mg)',
    scientificName: 'Ciprofloxacin 500mg',
    category: 'مضادات حيوية',
    minStockLevel: 20,
    units: [
      { unitType: 'BOX', multiplier: 10, barcode: '6221890123456', price: 36.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221890123457', price: 36.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221890123458', price: 3.6, isDefault: false },
    ],
    batch: { batchNumber: 'CPR26H01', costPrice: 2.2, salePrice: 36.0, expiryDate: new Date('2028-07-31'), quantityInBase: 200 },
  },
  {
    code: 'DIA-001',
    barcode: '6221999888777',
    tradeName: 'أماريل 2 مجم أقراص (Amaryl 2mg)',
    scientificName: 'Glimepiride 2mg',
    category: 'أدوية السكري',
    minStockLevel: 20,
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6221999888777', price: 55.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221999888778', price: 18.33, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221999888779', price: 1.83, isDefault: false },
    ],
    batch: { batchNumber: 'AMR26G02', costPrice: 1.1, salePrice: 55.0, expiryDate: new Date('2028-09-30'), quantityInBase: 300 },
  },
  {
    code: 'ALL-001',
    barcode: '6221444555666',
    tradeName: 'زيرتك 10 مجم أقراص (Zyrtec 10mg)',
    scientificName: 'Cetirizine Hydrochloride 10mg',
    category: 'مضادات الحساسية والهيستامين',
    minStockLevel: 25,
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '6221444555666', price: 45.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221444555667', price: 22.5, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221444555668', price: 2.25, isDefault: false },
    ],
    batch: { batchNumber: 'ZYR26E10', costPrice: 1.3, salePrice: 45.0, expiryDate: new Date('2028-08-31'), quantityInBase: 300 },
  },
];

async function main() {
  const companyName = process.env.BOOTSTRAP_COMPANY_NAME?.trim() || 'صيدلية دواء كور';
  const branchName = process.env.BOOTSTRAP_BRANCH_NAME?.trim() || 'الفرع الرئيسي';
  const username = process.env.BOOTSTRAP_USERNAME?.trim() || 'admin';
  const password = process.env.BOOTSTRAP_PASSWORD || '123456';

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  console.log(`[BOOTSTRAP] Initializing DawaCore for company: "${companyName}", branch: "${branchName}"...`);

  const passwordHash = await bcrypt.hash(password, 12);

  let company = await prisma.company.findFirst();
  if (!company) {
    company = await prisma.company.create({
      data: { name: companyName },
    });
    console.log(`[OK] Created company: ${company.name} (${company.id})`);
  } else {
    console.log(`[INFO] Existing company found: ${company.name} (${company.id})`);
  }

  let branch = await prisma.branch.findFirst({
    where: { companyId: company.id, isMain: true },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: branchName,
        code: 'MAIN',
        isMain: true,
        isActive: true,
      },
    });
    console.log(`[OK] Created main branch: ${branch.name} (${branch.id})`);
  } else {
    console.log(`[INFO] Existing main branch found: ${branch.name} (${branch.id})`);
  }

  // 1. Chart of Accounts (دليل الحسابات القياسي)
  console.log('[BOOTSTRAP] Checking Chart of Accounts...');
  const accountsToCreate = [
    { code: '1000', name: 'الأصول المتداولة', type: 'ASSET', isLeaf: false },
    { code: '1101', name: 'الصندوق الرئيسي', type: 'ASSET', isLeaf: true, parentCode: '1000' },
    { code: '1102', name: 'البنك / نقاط البيع', type: 'ASSET', isLeaf: true, parentCode: '1000' },
    { code: '1104', name: 'مخزون الأدوية', type: 'ASSET', isLeaf: true, parentCode: '1000' },
    { code: '1105', name: 'العملاء (الذمم المدينة)', type: 'ASSET', isLeaf: true, parentCode: '1000' },
    { code: '2000', name: 'الخصوم المتداولة', type: 'LIABILITY', isLeaf: false },
    { code: '2101', name: 'الموردين (الذمم الدائنة)', type: 'LIABILITY', isLeaf: true, parentCode: '2000' },
    { code: '3000', name: 'حقوق الملكية', type: 'EQUITY', isLeaf: false },
    { code: '3101', name: 'رأس المال', type: 'EQUITY', isLeaf: true, parentCode: '3000' },
    { code: '4000', name: 'الإيرادات', type: 'REVENUE', isLeaf: false },
    { code: '4101', name: 'إيرادات مبيعات الأدوية', type: 'REVENUE', isLeaf: true, parentCode: '4000' },
    { code: '4201', name: 'أرباح فروق الصندوق', type: 'REVENUE', isLeaf: true, parentCode: '4000' },
    { code: '5000', name: 'المصروفات', type: 'EXPENSE', isLeaf: false },
    { code: '5101', name: 'تكلفة البضاعة المباعة (COGS)', type: 'EXPENSE', isLeaf: true, parentCode: '5000' },
    { code: '5102', name: 'عجز الصندوق', type: 'EXPENSE', isLeaf: true, parentCode: '5000' },
    { code: '5103', name: 'خسائر فروق الجرد', type: 'EXPENSE', isLeaf: true, parentCode: '5000' },
  ];

  const accountMap = {};
  for (const acc of accountsToCreate) {
    let parentId = acc.parentCode ? accountMap[acc.parentCode] : undefined;
    const existing = await prisma.account.findUnique({
      where: { companyId_code: { companyId: company.id, code: acc.code } },
    });
    if (!existing) {
      const created = await prisma.account.create({
        data: {
          companyId: company.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          isLeaf: acc.isLeaf,
          parentId,
          balance: 0,
        },
      });
      accountMap[acc.code] = created.id;
    } else {
      accountMap[acc.code] = existing.id;
    }
  }
  console.log('[OK] Chart of Accounts verified.');

  // 2. BranchAccountMapping
  console.log('[BOOTSTRAP] Checking BranchAccountMapping...');
  const mapping = await prisma.branchAccountMapping.findUnique({
    where: { branchId: branch.id },
  });
  if (!mapping) {
    await prisma.branchAccountMapping.create({
      data: {
        branchId: branch.id,
        cashAccountId: accountMap['1101'],
        bankAccountId: accountMap['1102'],
        inventoryAccountId: accountMap['1104'],
        salesAccountId: accountMap['4101'],
        cogsAccountId: accountMap['5101'],
        arAccountId: accountMap['1105'],
        apAccountId: accountMap['2101'],
        shortageAccountId: accountMap['5102'],
        surplusAccountId: accountMap['4201'],
      },
    });
    console.log('[OK] Branch Account Mapping created.');
  }

  // 3. Open FiscalYear
  const currentYear = new Date().getFullYear();
  const fiscalYear = await prisma.fiscalYear.findUnique({
    where: { companyId_year: { companyId: company.id, year: currentYear } },
  });
  if (!fiscalYear) {
    await prisma.fiscalYear.create({
      data: {
        companyId: company.id,
        year: currentYear,
        startDate: new Date(`${currentYear}-01-01T00:00:00.000Z`),
        endDate: new Date(`${currentYear}-12-31T23:59:59.999Z`),
        status: 'OPEN',
        notes: `السنة المالية ${currentYear} الافتتاحية`,
      },
    });
    console.log(`[OK] Open FiscalYear ${currentYear} created.`);
  }

  // 4. Seed Standard Staff Users (RBAC)
  console.log('[BOOTSTRAP] Checking system users...');
  const usersToSeed = [
    { username, name: `${username} (مدير النظام)`, role: 'SUPER_ADMIN', branchId: branch.id },
    { username: 'company_admin', name: 'مدير الشركة والفرع العام', role: 'COMPANY_ADMIN', branchId: null },
    { username: 'mohamed_mgr', name: 'محمد عمر (مدير الفرع)', role: 'BRANCH_MANAGER', branchId: branch.id },
    { username: 'cashier_01', name: 'أحمد صالح (كاشير رئيسي)', role: 'CASHIER', branchId: branch.id },
    { username: 'sara_pharma', name: 'د. سارة عثمان (مسؤول مخزن)', role: 'INVENTORY', branchId: branch.id },
    { username: 'hassan_acc', name: 'حسن علي (محاسب مالي)', role: 'ACCOUNTANT', branchId: branch.id },
  ];

  for (const u of usersToSeed) {
    const existingUser = await prisma.user.findUnique({ where: { username: u.username } });
    if (!existingUser) {
      await prisma.user.create({
        data: {
          companyId: company.id,
          branchId: u.branchId,
          name: u.name,
          username: u.username,
          passwordHash,
          role: u.role,
          isActive: true,
        },
      });
      console.log(`[OK] Created user: ${u.username} (${u.role})`);
    }
  }

  // 5. Seed Top 20 Best-Selling Medicines if table is empty
  const medCount = await prisma.medicine.count();
  if (medCount === 0) {
    console.log(`[BOOTSTRAP] Seeding ${defaultMedicines.length} top medicines with stock batches...`);
    for (const med of defaultMedicines) {
      const createdMed = await prisma.medicine.create({
        data: {
          code: med.code,
          barcode: med.barcode,
          tradeName: med.tradeName,
          scientificName: med.scientificName,
          category: med.category,
          minStockLevel: med.minStockLevel,
        },
      });

      for (const unit of med.units) {
        await prisma.medicineUnit.create({
          data: {
            medicineId: createdMed.id,
            unitType: unit.unitType,
            multiplier: unit.multiplier,
            barcode: unit.barcode,
            price: unit.price,
            isDefault: unit.isDefault,
          },
        });
      }

      await prisma.batch.create({
        data: {
          batchNumber: med.batch.batchNumber,
          medicineId: createdMed.id,
          branchId: branch.id,
          costPrice: med.batch.costPrice,
          salePrice: med.batch.salePrice,
          expiryDate: med.batch.expiryDate,
          quantityInBase: med.batch.quantityInBase,
        },
      });
    }
    console.log(`[OK] ${defaultMedicines.length} top medicines and initial inventory batches seeded!`);
  } else {
    console.log(`[INFO] Medicine catalog already has ${medCount} medicines. Skipping medicine seed.`);
  }

  console.log('========================================================');
  console.log('🎉 DawaCore initialization and bootstrap completed successfully!');
  console.log(`Administrator: ${username}`);
  console.log('========================================================');
}

main()
  .catch((error) => {
    console.error(`[FAIL] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
