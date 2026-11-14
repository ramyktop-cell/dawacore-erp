if (process.env.ALLOW_DEMO_SEED !== 'true' || process.env.NODE_ENV === 'production') { throw new Error('Demo seed is disabled. Use the bootstrap-admin tool for production.'); }
import { PrismaClient, UnitType, AccountType, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

interface MedicineSeed {
  code: string;
  barcode: string;
  tradeName: string;
  scientificName: string;
  category: string;
  minStockLevel: number;
  country: 'مصر' | 'السودان' | 'مشترك';
  units: {
    unitType: UnitType;
    multiplier: number;
    barcode: string;
    price: number;
    isDefault: boolean;
  }[];
  batch: {
    batchNumber: string;
    costPrice: number;
    salePrice: number;
    expiryDate: Date;
    quantityInBase: number;
  };
}

const medicinesData: MedicineSeed[] = [
  // ==================== أدوية مصر الشائعة ====================
  {
    code: 'EGY-001',
    barcode: '6221123456011',
    tradeName: 'أوجمنتين 1 جم أقراص (Augmentin 1g)',
    scientificName: 'Amoxicillin + Clavulanic Acid 1000mg',
    category: 'مضادات حيوية',
    minStockLevel: 15,
    country: 'مصر',
    units: [
      { unitType: 'BOX', multiplier: 14, barcode: '6221123456011', price: 135.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 7, barcode: '6221123456012', price: 67.5, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221123456013', price: 9.65, isDefault: false },
    ],
    batch: {
      batchNumber: 'AUG26E01',
      costPrice: 7.2,
      salePrice: 135.0,
      expiryDate: new Date('2027-11-30'),
      quantityInBase: 140, // 10 علب
    },
  },
  {
    code: 'EGY-002',
    barcode: '6221500001021',
    tradeName: 'كونجستال أقراص (Congestal Tablets)',
    scientificName: 'Paracetamol + Pseudoephedrine + Chlorpheniramine',
    category: 'نزلات البرد والإنفلونزا',
    minStockLevel: 20,
    country: 'مصر',
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '6221500001021', price: 31.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221500001022', price: 15.5, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221500001023', price: 1.55, isDefault: false },
    ],
    batch: {
      batchNumber: 'CNG26A05',
      costPrice: 1.1,
      salePrice: 31.0,
      expiryDate: new Date('2028-02-28'),
      quantityInBase: 200, // 10 علب
    },
  },
  {
    code: 'EGY-003',
    barcode: '6221234005031',
    tradeName: 'أنتينال 200 مجم كبسول (Antinal 200mg)',
    scientificName: 'Nifuroxazide 200mg',
    category: 'مطهرات معوية',
    minStockLevel: 25,
    country: 'مصر',
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '6221234005031', price: 36.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 12, barcode: '6221234005032', price: 18.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221234005033', price: 1.5, isDefault: false },
    ],
    batch: {
      batchNumber: 'ANT25H09',
      costPrice: 1.05,
      salePrice: 36.0,
      expiryDate: new Date('2027-08-31'),
      quantityInBase: 240,
    },
  },
  {
    code: 'EGY-004',
    barcode: '7680489910041',
    tradeName: 'كتفلام 50 مجم أقراص (Cataflam 50mg)',
    scientificName: 'Diclofenac Potassium 50mg',
    category: 'مسكنات ومضادات الالتهاب',
    minStockLevel: 20,
    country: 'مصر',
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '7680489910041', price: 58.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '7680489910042', price: 29.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '7680489910043', price: 2.9, isDefault: false },
    ],
    batch: {
      batchNumber: 'CAT26C12',
      costPrice: 2.1,
      salePrice: 58.0,
      expiryDate: new Date('2027-12-31'),
      quantityInBase: 300,
    },
  },
  {
    code: 'EGY-005',
    barcode: '6221156001051',
    tradeName: 'ألفنتيرن أقراص (Alphintern Tablets)',
    scientificName: 'Chymotrypsin + Trypsin',
    category: 'مضادات التورم والالتهاب',
    minStockLevel: 30,
    country: 'مصر',
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6221156001051', price: 54.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221156001052', price: 18.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221156001053', price: 1.8, isDefault: false },
    ],
    batch: {
      batchNumber: 'ALP26F02',
      costPrice: 1.25,
      salePrice: 54.0,
      expiryDate: new Date('2028-04-30'),
      quantityInBase: 300,
    },
  },
  {
    code: 'EGY-006',
    barcode: '6221054002061',
    tradeName: 'جلوكوفاج 1000 مجم (Glucophage 1000mg)',
    scientificName: 'Metformin Hydrochloride 1000mg',
    category: 'أدوية السكري',
    minStockLevel: 20,
    country: 'مصر',
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6221054002061', price: 60.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221054002062', price: 20.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221054002063', price: 2.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'GLU26D18',
      costPrice: 1.4,
      salePrice: 60.0,
      expiryDate: new Date('2028-09-30'),
      quantityInBase: 450,
    },
  },
  {
    code: 'EGY-007',
    barcode: '6221189003071',
    tradeName: 'كونكور 5 مجم بلس (Concor 5mg Plus)',
    scientificName: 'Bisoprolol 5mg + Hydrochlorothiazide 12.5mg',
    category: 'أدوية القلب وضغط الدم',
    minStockLevel: 15,
    country: 'مصر',
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6221189003071', price: 72.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221189003072', price: 24.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221189003073', price: 2.4, isDefault: false },
    ],
    batch: {
      batchNumber: 'CON26J04',
      costPrice: 1.7,
      salePrice: 72.0,
      expiryDate: new Date('2028-01-31'),
      quantityInBase: 300,
    },
  },
  {
    code: 'EGY-008',
    barcode: '6221345004081',
    tradeName: 'فلاجيل 500 مجم أقراص (Flagyl 500mg)',
    scientificName: 'Metronidazole 500mg',
    category: 'مطهرات ومضادات طفيليات',
    minStockLevel: 25,
    country: 'مصر',
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '6221345004081', price: 26.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6221345004082', price: 13.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221345004083', price: 1.3, isDefault: false },
    ],
    batch: {
      batchNumber: 'FLG26B14',
      costPrice: 0.9,
      salePrice: 26.0,
      expiryDate: new Date('2027-10-31'),
      quantityInBase: 400,
    },
  },

  // ==================== أدوية السودان الشائعة ====================
  {
    code: 'SUD-001',
    barcode: '6251234567011',
    tradeName: 'كوارتم 20/120 مجم أقراص (Coartem 20/120mg)',
    scientificName: 'Artemether 20mg + Lumefantrine 120mg',
    category: 'أدوية الملاريا',
    minStockLevel: 50,
    country: 'السودان',
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '6251234567011', price: 4200.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 6, barcode: '6251234567012', price: 1050.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251234567013', price: 175.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'CRT26M01',
      costPrice: 120.0,
      salePrice: 4200.0,
      expiryDate: new Date('2028-06-30'),
      quantityInBase: 480, // 20 علبة
    },
  },
  {
    code: 'SUD-002',
    barcode: '6251234567021',
    tradeName: 'ارتيسونات 50 مجم أقراص (Artesunate 50mg)',
    scientificName: 'Artesunate 50mg',
    category: 'أدوية الملاريا',
    minStockLevel: 30,
    country: 'السودان',
    units: [
      { unitType: 'BOX', multiplier: 12, barcode: '6251234567021', price: 2800.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 6, barcode: '6251234567022', price: 1400.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251234567023', price: 233.33, isDefault: false },
    ],
    batch: {
      batchNumber: 'ART26K09',
      costPrice: 160.0,
      salePrice: 2800.0,
      expiryDate: new Date('2027-12-31'),
      quantityInBase: 240,
    },
  },
  {
    code: 'SUD-003',
    barcode: '6251000002031',
    tradeName: 'أموكلان 1 جم أقراص (Amoclan 1g - Dar Al Dawa)',
    scientificName: 'Amoxicillin + Clavulanic Acid 1000mg',
    category: 'مضادات حيوية',
    minStockLevel: 25,
    country: 'السودان',
    units: [
      { unitType: 'BOX', multiplier: 14, barcode: '6251000002031', price: 6500.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 7, barcode: '6251000002032', price: 3250.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251000002033', price: 464.28, isDefault: false },
    ],
    batch: {
      batchNumber: 'AMC26L03',
      costPrice: 320.0,
      salePrice: 6500.0,
      expiryDate: new Date('2028-03-31'),
      quantityInBase: 280,
    },
  },
  {
    code: 'SUD-004',
    barcode: '6251111003041',
    tradeName: 'فلودريكس أقراص (Fludrex Tablets)',
    scientificName: 'Paracetamol + Pseudoephedrine + Chlorpheniramine',
    category: 'نزلات البرد والإنفلونزا',
    minStockLevel: 40,
    country: 'السودان',
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '6251111003041', price: 3600.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 6, barcode: '6251111003042', price: 900.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251111003043', price: 150.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'FDX26S07',
      costPrice: 100.0,
      salePrice: 3600.0,
      expiryDate: new Date('2028-05-31'),
      quantityInBase: 480,
    },
  },
  {
    code: 'SUD-005',
    barcode: '6251444004051',
    tradeName: 'بروفين 400 مجم أقراص (Brufen 400mg Abbott)',
    scientificName: 'Ibuprofen 400mg',
    category: 'مسكنات ومضادات الالتهاب',
    minStockLevel: 35,
    country: 'السودان',
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6251444004051', price: 4500.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6251444004052', price: 1500.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251444004053', price: 150.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'BRF26H11',
      costPrice: 105.0,
      salePrice: 4500.0,
      expiryDate: new Date('2028-08-31'),
      quantityInBase: 600,
    },
  },
  {
    code: 'SUD-006',
    barcode: '6251555005061',
    tradeName: 'سبترين فورت أقراص (Septrin Forte Tablets)',
    scientificName: 'Sulfamethoxazole 800mg + Trimethoprim 160mg',
    category: 'مضادات حيوية واسعة المجال',
    minStockLevel: 20,
    country: 'السودان',
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '6251555005061', price: 3200.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6251555005062', price: 1600.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251555005063', price: 160.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'SPT26V05',
      costPrice: 110.0,
      salePrice: 3200.0,
      expiryDate: new Date('2027-11-30'),
      quantityInBase: 300,
    },
  },
  {
    code: 'SUD-007',
    barcode: '6251666006071',
    tradeName: 'سالينال أقراص مضغ (Salinal Chewable Tablets)',
    scientificName: 'Simethicone 42mg',
    category: 'أدوية الجهاز الهضمي والغازات',
    minStockLevel: 25,
    country: 'السودان',
    units: [
      { unitType: 'BOX', multiplier: 30, barcode: '6251666006071', price: 2100.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '6251666006072', price: 700.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6251666006073', price: 70.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'SAL26N10',
      costPrice: 48.0,
      salePrice: 2100.0,
      expiryDate: new Date('2028-07-31'),
      quantityInBase: 450,
    },
  },

  // ==================== أدوية مشتركة دولية وعربية ====================
  {
    code: 'COM-001',
    barcode: '5000456012011',
    tradeName: 'بانادول إكسترا أحمر (Panadol Extra Red)',
    scientificName: 'Paracetamol 500mg + Caffeine 65mg',
    category: 'مسكنات الصداع والألم',
    minStockLevel: 50,
    country: 'مشترك',
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '5000456012011', price: 48.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 8, barcode: '5000456012012', price: 16.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '5000456012013', price: 2.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'PAN26X01',
      costPrice: 1.35,
      salePrice: 48.0,
      expiryDate: new Date('2028-12-31'),
      quantityInBase: 720, // 30 علبة
    },
  },
  {
    code: 'COM-002',
    barcode: '5000456012021',
    tradeName: 'بانادول أدفانس أزرق (Panadol Advance Blue)',
    scientificName: 'Paracetamol 500mg Optizorb',
    category: 'مسكنات الصداع وخافض حرارة',
    minStockLevel: 50,
    country: 'مشترك',
    units: [
      { unitType: 'BOX', multiplier: 24, barcode: '5000456012021', price: 42.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 8, barcode: '5000456012022', price: 14.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '5000456012023', price: 1.75, isDefault: false },
    ],
    batch: {
      batchNumber: 'PAN26B08',
      costPrice: 1.2,
      salePrice: 42.0,
      expiryDate: new Date('2028-10-31'),
      quantityInBase: 720,
    },
  },
  {
    code: 'COM-003',
    barcode: '7680456789031',
    tradeName: 'فولتارين 50 مجم أقراص (Voltaren 50mg)',
    scientificName: 'Diclofenac Sodium 50mg',
    category: 'مسكنات ومضادات الروماتيزم',
    minStockLevel: 25,
    country: 'مشترك',
    units: [
      { unitType: 'BOX', multiplier: 20, barcode: '7680456789031', price: 62.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 10, barcode: '7680456789032', price: 31.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '7680456789033', price: 3.1, isDefault: false },
    ],
    batch: {
      batchNumber: 'VLT26R04',
      costPrice: 2.2,
      salePrice: 62.0,
      expiryDate: new Date('2028-02-28'),
      quantityInBase: 400,
    },
  },
  {
    code: 'COM-004',
    barcode: '6221888004041',
    tradeName: 'أوميبرازول 20 مجم كبسول (Omeprazole 20mg)',
    scientificName: 'Omeprazole 20mg Gastro-resistant',
    category: 'أدوية المعدة والحموضة',
    minStockLevel: 30,
    country: 'مشترك',
    units: [
      { unitType: 'BOX', multiplier: 14, barcode: '6221888004041', price: 38.0, isDefault: true },
      { unitType: 'STRIP', multiplier: 7, barcode: '6221888004042', price: 19.0, isDefault: false },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221888004043', price: 2.71, isDefault: false },
    ],
    batch: {
      batchNumber: 'OMP26Y12',
      costPrice: 1.85,
      salePrice: 38.0,
      expiryDate: new Date('2028-04-30'),
      quantityInBase: 350,
    },
  },
  {
    code: 'COM-005',
    barcode: '5000123999051',
    tradeName: 'بخاخ فنتولين 100 ميكروجرام (Ventolin Inhaler 100mcg)',
    scientificName: 'Salbutamol 100mcg / dose',
    category: 'أدوية الجهاز التنفسي والربو',
    minStockLevel: 15,
    country: 'مشترك',
    units: [
      { unitType: 'BOX', multiplier: 1, barcode: '5000123999051', price: 45.0, isDefault: true },
      { unitType: 'UNIT', multiplier: 1, barcode: '5000123999052', price: 45.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'VNT26W01',
      costPrice: 32.0,
      salePrice: 45.0,
      expiryDate: new Date('2028-07-31'),
      quantityInBase: 50,
    },
  },
  {
    code: 'COM-006',
    barcode: '6221999005061',
    tradeName: 'أزيثروميسين 500 مجم أقراص (Azithromycin 500mg)',
    scientificName: 'Azithromycin Dihydrate 500mg',
    category: 'مضادات حيوية تنفسية',
    minStockLevel: 20,
    country: 'مشترك',
    units: [
      { unitType: 'BOX', multiplier: 3, barcode: '6221999005061', price: 45.0, isDefault: true },
      { unitType: 'UNIT', multiplier: 1, barcode: '6221999005062', price: 15.0, isDefault: false },
    ],
    batch: {
      batchNumber: 'AZT26Q03',
      costPrice: 10.5,
      salePrice: 45.0,
      expiryDate: new Date('2028-06-30'),
      quantityInBase: 90,
    },
  },
];

async function main() {
  console.log('🌱 بدء حقن بيانات الأدوية لمصر والسودان في نظام DawaCore...');

  // 0. ضمان وجود الشركة الأم
  const company = await prisma.company.upsert({
    where: { id: '11111111-0000-0000-0000-000000000001' },
    update: {
      name: 'مجموعة صيدليات داواكور العالمية',
      taxNumber: 'TX-99887766',
      phone: '+249912345678',
      email: 'info@dawacore.com',
      address: 'الخرطوم / القاهرة',
    },
    create: {
      id: '11111111-0000-0000-0000-000000000001',
      name: 'مجموعة صيدليات داواكور العالمية',
      taxNumber: 'TX-99887766',
      phone: '+249912345678',
      email: 'info@dawacore.com',
      address: 'الخرطوم / القاهرة',
      isActive: true,
    },
  });
  console.log(`🏢 تم التحقق من الشركة: ${company.name}`);

  // 1. ضمان وجود الفرع الرئيسي
  const branch = await prisma.branch.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: 'MAIN_BRANCH',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      code: 'MAIN_BRANCH',
      name: 'فرع الصيدلية الرئيسي',
      phone: '+249123456789',
      address: 'الخرطوم / القاهرة - الفرع الرئيسي',
      isMain: true,
      isActive: true,
    },
  });

  console.log(`📍 تم التحقق من الفرع: ${branch.name} (${branch.id})`);

  let addedCount = 0;

  for (const medData of medicinesData) {
    // إنشاء أو تحديث الدواء
    const medicine = await prisma.medicine.upsert({
      where: { code: medData.code },
      update: {
        barcode: medData.barcode,
        tradeName: medData.tradeName,
        scientificName: medData.scientificName,
        category: medData.category,
        minStockLevel: medData.minStockLevel,
      },
      create: {
        code: medData.code,
        barcode: medData.barcode,
        tradeName: medData.tradeName,
        scientificName: medData.scientificName,
        category: medData.category,
        minStockLevel: medData.minStockLevel,
      },
    });

    // إنشاء / تحديث الوحدات (علبة / شريط / حبة)
    for (const u of medData.units) {
      await prisma.medicineUnit.upsert({
        where: {
          medicineId_unitType: {
            medicineId: medicine.id,
            unitType: u.unitType,
          },
        },
        update: {
          multiplier: u.multiplier,
          barcode: u.barcode,
          price: u.price,
          isDefault: u.isDefault,
        },
        create: {
          medicineId: medicine.id,
          unitType: u.unitType,
          multiplier: u.multiplier,
          barcode: u.barcode,
          price: u.price,
          isDefault: u.isDefault,
        },
      });
    }

    // إنشاء / تحديث الدفعة المخزنية الأولية للـ FEFO
    await prisma.batch.upsert({
      where: {
        batchNumber_medicineId_branchId: {
          batchNumber: medData.batch.batchNumber,
          medicineId: medicine.id,
          branchId: branch.id,
        },
      },
      update: {
        costPrice: medData.batch.costPrice,
        salePrice: medData.batch.salePrice,
        expiryDate: medData.batch.expiryDate,
        quantityInBase: medData.batch.quantityInBase,
      },
      create: {
        batchNumber: medData.batch.batchNumber,
        medicineId: medicine.id,
        branchId: branch.id,
        costPrice: medData.batch.costPrice,
        salePrice: medData.batch.salePrice,
        expiryDate: medData.batch.expiryDate,
        quantityInBase: medData.batch.quantityInBase,
      },
    });

    addedCount++;
    console.log(`✅ [${medData.country}] تم إدخال الصنف: ${medData.tradeName} (كود: ${medData.code})`);
  }

  console.log(`\n🎉 اكتمل حقن بيانات الأدوية بنجاح! إجمالي الأصناف المدخلة: ${addedCount} صنف مع وحداتها ودفعاتها المخزنية.`);

  // 2. إنشاء شجرة الحسابات القياسية (Standard Chart of Accounts)
  console.log('\n🌱 بدء إنشاء شجرة الحسابات المالية (Double-Entry Chart of Accounts)...');
  const accounts = [
    // الأصول (ASSET)
    { code: '1000', name: 'الأصول المتداولة', type: AccountType.ASSET, isLeaf: false },
    { code: '1101', name: 'الصندوق الرئيسي', type: AccountType.ASSET, isLeaf: true, parentCode: '1000' },
    { code: '1102', name: 'البنك / نقاط البيع', type: AccountType.ASSET, isLeaf: true, parentCode: '1000' },
    { code: '1104', name: 'مخزون الأدوية', type: AccountType.ASSET, isLeaf: true, parentCode: '1000' },
    { code: '1105', name: 'العملاء (الذمم المدينة)', type: AccountType.ASSET, isLeaf: true, parentCode: '1000' },

    // الخصوم (LIABILITY)
    { code: '2000', name: 'الخصوم المتداولة', type: AccountType.LIABILITY, isLeaf: false },
    { code: '2101', name: 'الموردين (الذمم الدائنة)', type: AccountType.LIABILITY, isLeaf: true, parentCode: '2000' },

    // حقوق الملكية (EQUITY)
    { code: '3000', name: 'حقوق الملكية', type: AccountType.EQUITY, isLeaf: false },
    { code: '3101', name: 'رأس المال', type: AccountType.EQUITY, isLeaf: true, parentCode: '3000' },

    // الإيرادات (REVENUE)
    { code: '4000', name: 'الإيرادات', type: AccountType.REVENUE, isLeaf: false },
    { code: '4101', name: 'إيرادات مبيعات الأدوية', type: AccountType.REVENUE, isLeaf: true, parentCode: '4000' },
    { code: '4201', name: 'أرباح فروق الصندوق', type: AccountType.REVENUE, isLeaf: true, parentCode: '4000' },

    // المصروفات (EXPENSE)
    { code: '5000', name: 'المصروفات', type: AccountType.EXPENSE, isLeaf: false },
    { code: '5101', name: 'تكلفة البضاعة المباعة (COGS)', type: AccountType.EXPENSE, isLeaf: true, parentCode: '5000' },
    { code: '5102', name: 'عجز الصندوق', type: AccountType.EXPENSE, isLeaf: true, parentCode: '5000' },
    { code: '5103', name: 'خسائر فروق الجرد', type: AccountType.EXPENSE, isLeaf: true, parentCode: '5000' },
  ];

  const accountMap: Record<string, string> = {};

  for (const acc of accounts) {
    let parentId: string | undefined = undefined;
    if (acc.parentCode) {
      parentId = accountMap[acc.parentCode];
    }

    const created = await prisma.account.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: acc.code,
        },
      },
      update: {
        name: acc.name,
        type: acc.type,
        isLeaf: acc.isLeaf,
      },
      create: {
        companyId: company.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        isLeaf: acc.isLeaf,
        parentId: parentId,
        balance: new Decimal(0),
      },
    });
    accountMap[acc.code] = created.id;
    console.log(`✅ تم إنشاء الحساب: ${acc.code} - ${acc.name}`);
  }

  console.log('✅ تم إنشاء شجرة الحسابات الأساسية بنجاح!');

  // 3. ربط الحسابات بالفرع الرئيسي
  await prisma.branchAccountMapping.upsert({
    where: { branchId: branch.id },
    update: {
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
    create: {
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
  console.log(`✅ تم ربط شجرة الحسابات بالفرع: ${branch.name} (${branch.code})`);

  // 4. حقن العملاء والموردين وربطهم بالحسابات الفرعية
  const sampleCustomers = [
    { name: 'أحمد عثمان علي (عميل مباشر)', phone: '0912345678', nationalId: '1012345678', creditLimit: 50000, initialBalance: 12500, address: 'الخرطوم - شارع الستين' },
    { name: 'د. سارة عبد المنعم', phone: '0922334455', nationalId: '1022334455', creditLimit: 30000, initialBalance: 4200, address: 'بحري - الصافية' },
    { name: 'شركة التأمين الصحي الوطنية', phone: '0183556677', nationalId: '1083556677', creditLimit: 200000, initialBalance: 45000, address: 'أم درمان - الشهداء' },
  ];

  for (const cust of sampleCustomers) {
    const existing = await prisma.customer.findFirst({
      where: { companyId: company.id, branchId: branch.id, phone: cust.phone },
    });

    let customerId: string;
    if (existing) {
      const updated = await prisma.customer.update({
        where: { id: existing.id },
        data: {
          name: cust.name,
          nationalId: cust.nationalId,
          creditLimit: new Decimal(cust.creditLimit),
          currentDebt: new Decimal(cust.initialBalance),
          address: cust.address,
        },
      });
      customerId = updated.id;
    } else {
      const created = await prisma.customer.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          name: cust.name,
          phone: cust.phone,
          nationalId: cust.nationalId,
          creditLimit: new Decimal(cust.creditLimit),
          currentDebt: new Decimal(cust.initialBalance),
          address: cust.address,
          isActive: true,
        },
      });
      customerId = created.id;

      if (cust.initialBalance > 0) {
        await prisma.customerTransaction.create({
          data: {
            customerId: created.id,
            type: 'OPENING_BALANCE',
            amount: new Decimal(cust.initialBalance),
            balanceAfter: new Decimal(cust.initialBalance),
            description: 'الرصيد الافتتاحي للعميل عند إنشاء الحساب',
            createdBy: 'system-seed',
          },
        });
      }
    }
    console.log(`✅ تم إنشاء/تحديث العميل: ${cust.name} (هاتف: ${cust.phone})`);
  }

  const sampleSuppliers = [
    { name: 'شركة الخرطوم للكيماويات الطبية', phone: '0183112233', currentDebt: 65000, address: 'الخرطوم بحري - المنطقة الصناعية' },
    { name: 'الشركة المتحدة لتوزيع الأدوية (مصر)', phone: '0223456789', currentDebt: 120000, address: 'القاهرة - مدينة نصر' },
  ];

  for (const supp of sampleSuppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { companyId: company.id, branchId: branch.id, phone: supp.phone },
    });

    if (existing) {
      await prisma.supplier.update({
        where: { id: existing.id },
        data: {
          name: supp.name,
          currentDebt: new Decimal(supp.currentDebt),
          address: supp.address,
        },
      });
    } else {
      await prisma.supplier.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          name: supp.name,
          phone: supp.phone,
          currentDebt: new Decimal(supp.currentDebt),
          address: supp.address,
          isActive: true,
        },
      });
    }
    console.log(`✅ تم إنشاء/تحديث المورد: ${supp.name} (هاتف: ${supp.phone})`);
  }

  // 5. حقن المستخدمين الأساسيين (RBAC)
  console.log('🌱 بدء حقن المستخدمين بنظام الأدوار والصلاحيات (RBAC)...');

  const bcrypt = require('bcryptjs');
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword || seedPassword.length < 16) throw new Error('SEED_ADMIN_PASSWORD must be supplied explicitly (16+ characters)');
  const defaultPasswordHash = await bcrypt.hash(seedPassword, 12);

  const usersList = [
    {
      username: 'admin',
      name: 'د. عثمان أحمد (المدير العام)',
      email: 'admin@dawacore.com',
      phone: '+249912345678',
      role: Role.SUPER_ADMIN,
      branchId: branch.id,
    },
    {
      username: 'company_admin',
      name: 'المهندس طارق خالد (مدير الشركة)',
      email: 'tareq@dawacore.com',
      phone: '+249912000001',
      role: Role.COMPANY_ADMIN,
      branchId: null,
    },
    {
      username: 'mohamed_mgr',
      name: 'محمد عمر (مدير الفرع)',
      email: 'mohamed@dawacore.com',
      phone: '+249912000002',
      role: Role.BRANCH_MANAGER,
      branchId: branch.id,
    },
    {
      username: 'cashier_01',
      name: 'أحمد صالح (كاشير رئيسي)',
      email: 'ahmed.cashier@dawacore.com',
      phone: '+249912000003',
      role: Role.CASHIER,
      branchId: branch.id,
    },
    {
      username: 'sara_pharma',
      name: 'د. سارة عثمان (مسؤول مخزن)',
      email: 'sara@dawacore.com',
      phone: '+249912000004',
      role: Role.INVENTORY,
      branchId: branch.id,
    },
    {
      username: 'hassan_acc',
      name: 'حسن علي (محاسب مالي)',
      email: 'hassan@dawacore.com',
      phone: '+249912000005',
      role: Role.ACCOUNTANT,
      branchId: branch.id,
    },
  ];

  for (const u of usersList) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        name: u.name,
        email: u.email,
        phone: u.phone,
        passwordHash: defaultPasswordHash,
        companyId: company.id,
        branchId: u.branchId,
        role: u.role,
        isActive: true,
      },
    });

    console.log(`✅ تم إنشاء/تحديث المستخدم: ${u.username} (${u.name}) - دور: ${u.role}`);
  }

  // ------------------- زراعة شجرة الحسابات الهرمية (5 مستويات) -------------------
  console.log('🌱 زراعة دليل الحسابات الهرمي (5 مستويات)...');

  const accountsHierarchy = [
    // المستوى 1: المجموعات الرئيسية
    { code: '1', name: 'الأصول', type: AccountType.ASSET, level: 1, isLeaf: false },
    { code: '2', name: 'الخصوم', type: AccountType.LIABILITY, level: 1, isLeaf: false },
    { code: '3', name: 'حقوق الملكية', type: AccountType.EQUITY, level: 1, isLeaf: false },
    { code: '4', name: 'الإيرادات', type: AccountType.REVENUE, level: 1, isLeaf: false },
    { code: '5', name: 'المصروفات', type: AccountType.EXPENSE, level: 1, isLeaf: false },

    // المستوى 2: المجموعات الفرعية
    { code: '1-1', name: 'الأصول المتداولة', type: AccountType.ASSET, level: 2, parentCode: '1', isLeaf: false },
    { code: '1-2', name: 'الأصول الثابتة', type: AccountType.ASSET, level: 2, parentCode: '1', isLeaf: false },
    { code: '2-1', name: 'الخصوم المتداولة', type: AccountType.LIABILITY, level: 2, parentCode: '2', isLeaf: false },
    { code: '2-2', name: 'الخصوم طويلة الأجل', type: AccountType.LIABILITY, level: 2, parentCode: '2', isLeaf: false },
    { code: '3-1', name: 'حقوق الملكية الأساسية', type: AccountType.EQUITY, level: 2, parentCode: '3', isLeaf: false },
    { code: '4-1', name: 'إيرادات النشاط الرئيسي', type: AccountType.REVENUE, level: 2, parentCode: '4', isLeaf: false },
    { code: '5-1', name: 'تكاليف ومصروفات التشغيل', type: AccountType.EXPENSE, level: 2, parentCode: '5', isLeaf: false },

    // المستوى 3: الحسابات التفصيلية
    { code: '1-1-01', name: 'النقدية وما في حكمها (الصناديق)', type: AccountType.ASSET, level: 3, parentCode: '1-1', isLeaf: false },
    { code: '1-1-02', name: 'البنوك ونقاط البيع الإلكترونية', type: AccountType.ASSET, level: 3, parentCode: '1-1', isLeaf: false },
    { code: '1-1-03', name: 'مخزون الأدوية والمستلزمات الطبية', type: AccountType.ASSET, level: 3, parentCode: '1-1', isLeaf: true },
    { code: '1-1-04', name: 'العملاء (الذمم المدينة)', type: AccountType.ASSET, level: 3, parentCode: '1-1', isLeaf: true },
    { code: '1-2-01', name: 'مخزون البضاعة والأدوية', type: AccountType.ASSET, level: 3, parentCode: '1-1', isLeaf: true },
    { code: '1-3-01', name: 'الأصول الثابتة', type: AccountType.ASSET, level: 3, parentCode: '1-2', isLeaf: true },
    { code: '2-1-01', name: 'الموردين (الذمم الدائنة)', type: AccountType.LIABILITY, level: 3, parentCode: '2-1', isLeaf: true },
    { code: '2-2-01', name: 'القروض والالتزامات طويلة الأجل', type: AccountType.LIABILITY, level: 3, parentCode: '2-2', isLeaf: true },
    { code: '3-1-01', name: 'رأس المال المدفوع', type: AccountType.EQUITY, level: 3, parentCode: '3-1', isLeaf: true },
    { code: '3-1-02', name: 'الأرباح المحتجزة / المدورة', type: AccountType.EQUITY, level: 3, parentCode: '3-1', isLeaf: true },
    { code: '3-1-99', name: 'رأس المال الافتتاحي', type: AccountType.EQUITY, level: 3, parentCode: '3-1', isLeaf: true },
    { code: '4-1-01', name: 'إيرادات مبيعات الأدوية', type: AccountType.REVENUE, level: 3, parentCode: '4-1', isLeaf: true },
    { code: '4-1-02', name: 'أرباح فروق تسوية الصندوق', type: AccountType.REVENUE, level: 3, parentCode: '4-1', isLeaf: true },
    { code: '5-1-01', name: 'تكلفة البضاعة المباعة (COGS)', type: AccountType.EXPENSE, level: 3, parentCode: '5-1', isLeaf: true },
    { code: '5-1-02', name: 'مصروفات التشغيل والإيجارات', type: AccountType.EXPENSE, level: 3, parentCode: '5-1', isLeaf: true },
    { code: '5-1-03', name: 'عجز تسوية الصندوق', type: AccountType.EXPENSE, level: 3, parentCode: '5-1', isLeaf: true },
    { code: '5-1-04', name: 'خسائر تسويات الجرد التالف', type: AccountType.EXPENSE, level: 3, parentCode: '5-1', isLeaf: true },

    // المستوى 4: حسابات تحليلية
    { code: '1-1-01-01', name: 'صندوق الفرع الرئيسي (نقدية)', type: AccountType.ASSET, level: 4, parentCode: '1-1-01', isLeaf: true },
    { code: '1-1-01-02', name: 'صندوق العهدة والمصروفات النثرية', type: AccountType.ASSET, level: 4, parentCode: '1-1-01', isLeaf: true },
    { code: '1-1-02-01', name: 'حساب بنك الخرطوم (تطبيق بنكك)', type: AccountType.ASSET, level: 4, parentCode: '1-1-02', isLeaf: false },
    { code: '1-1-02-02', name: 'حساب بنك فيصل الإسلامي (فوري)', type: AccountType.ASSET, level: 4, parentCode: '1-1-02', isLeaf: true },

    // المستوى 5: حسابات تشغيلية
    { code: '1-1-02-01-01', name: 'نقطة بيع POS بنكك - كاشير الصيدلية 1', type: AccountType.ASSET, level: 5, parentCode: '1-1-02-01', isLeaf: true },
    { code: '1-1-02-01-02', name: 'نقطة بيع POS بنكك - كاشير الصيدلية 2', type: AccountType.ASSET, level: 5, parentCode: '1-1-02-01', isLeaf: true },
  ];

  for (const acc of accountsHierarchy) {
    let parentId: string | null = null;
    if (acc.parentCode) {
      const parent = await prisma.account.findUnique({
        where: { companyId_code: { companyId: company.id, code: acc.parentCode } },
      });
      if (parent) {
        parentId = parent.id;
      }
    }

    await prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: acc.code } },
      update: {
        name: acc.name,
        type: acc.type,
        level: acc.level,
        parentId,
        isLeaf: acc.isLeaf,
        isActive: true,
      },
      create: {
        companyId: company.id,
        branchId: branch.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        level: acc.level,
        parentId,
        isLeaf: acc.isLeaf,
        isActive: true,
        balance: 0,
      },
    });
  }

  console.log(`✅ تم إنشاء وتحديث ${accountsHierarchy.length} حساب في شجرة الحسابات الهرمية.`);
}

main()
  .catch((e) => {
    console.error('❌ خطأ أثناء حقن البيانات:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

