/**
 * DawaCore ERP - Dynamic Business Type & Terminology Engine
 * Supports:
 *   - PHARMACY:     صيدلية ومستودع أدوية
 *   - SUPERMARKET:  سوبر ماركت وهايبر ماركت وتموينات
 *   - TRADING:      شركة تجارية وتوزيع وجملة
 */

export type BusinessType = 'PHARMACY' | 'SUPERMARKET' | 'TRADING';

export interface BusinessTerminology {
  type: BusinessType;
  labelAr: string;
  icon: string;
  systemSubtitle: string;
  inventorySectionTitle: string;
  catalogMenuTitle: string;
  catalogPageTitle: string;
  catalogPageSubtitle: string;
  addNewItemButton: string;
  itemSingular: string;
  itemPlural: string;
  scientificNameLabel: string;
  categoryLabel: string;
  batchesMenuTitle: string;
  units: {
    BOX: string;
    STRIP: string;
    PIECE: string;
    baseUnitPlural: string;
  };
}

export const BUSINESS_PROFILES: Record<BusinessType, BusinessTerminology> = {
  PHARMACY: {
    type: 'PHARMACY',
    labelAr: 'صيدلية ومستودع طبي',
    icon: '💊',
    systemSubtitle: 'نظام إدارة الصيدليات والمستودعات الطبية',
    inventorySectionTitle: 'المخزون والصيدلية',
    catalogMenuTitle: 'دليل الأدوية والوحدات',
    catalogPageTitle: 'دليل الأدوية ووحدات القياس (Medicines Catalog)',
    catalogPageSubtitle:
      'إدارة الأصناف الدوائية، الأسماء العلمية، تعدد تسعير الوحدات (علبة / شريط / حبة)، وحدود الطلب',
    addNewItemButton: 'إضافة صنف دوائي جديد',
    itemSingular: 'دواء',
    itemPlural: 'الأدوية',
    scientificNameLabel: 'الاسم العلمي / المادة الفعالة',
    categoryLabel: 'التصنيف الدوائي',
    batchesMenuTitle: 'الأرصدة والدفعات وتواريخ الصلاحية',
    units: {
      BOX: 'علبة',
      STRIP: 'شريط',
      PIECE: 'حبة',
      baseUnitPlural: 'حبة',
    },
  },
  SUPERMARKET: {
    type: 'SUPERMARKET',
    labelAr: 'سوبر ماركت وتموينات',
    icon: '🛒',
    systemSubtitle: 'نظام إدارة السوبر ماركت والهايبر ماركت ونقاط البيع',
    inventorySectionTitle: 'المخزون والمنتجات',
    catalogMenuTitle: 'دليل المنتجات والأصناف',
    catalogPageTitle: 'دليل المنتجات والسلع الاستهلاكية (Products Catalog)',
    catalogPageSubtitle:
      'إدارة السلع والمنتجات، العلامات التجارية، تعدد تسعير الوحدات (كرتونة / باكت / قطعة)، وحدود الطلب',
    addNewItemButton: 'إضافة منتج / سلعة جديدة',
    itemSingular: 'منتج',
    itemPlural: 'المنتجات',
    scientificNameLabel: 'العلامة التجارية / الوصف',
    categoryLabel: 'قسم المنتجات',
    batchesMenuTitle: 'الأرصدة والتشغيلات وتواريخ الصلاحية',
    units: {
      BOX: 'كرتونة',
      STRIP: 'باكت / عبوة',
      PIECE: 'قطعة',
      baseUnitPlural: 'قطعة',
    },
  },
  TRADING: {
    type: 'TRADING',
    labelAr: 'شركة تجارية وتوزيع',
    icon: '🏢',
    systemSubtitle: 'نظام إدارة الشركات التجارية والتوريد والمبيعات',
    inventorySectionTitle: 'المستودعات والأصناف',
    catalogMenuTitle: 'دليل الأصناف والبضائع',
    catalogPageTitle: 'دليل الأصناف التجارية والوحدات (Items Catalog)',
    catalogPageSubtitle:
      'إدارة الأصناف التجارية، المواصفات، تعدد تسعير الوحدات (طرد / دستة / وحدة)، وحدود الطلب',
    addNewItemButton: 'إضافة صنف تجاري جديد',
    itemSingular: 'صنف',
    itemPlural: 'الأصناف',
    scientificNameLabel: 'المواصفات / الموديل / المنشأ',
    categoryLabel: 'مجموعة الأصناف',
    batchesMenuTitle: 'الدفعات المخزنية وتواريخ الصلاحية',
    units: {
      BOX: 'طرد / كرتونة',
      STRIP: 'دستة / عبوة',
      PIECE: 'وحدة',
      baseUnitPlural: 'وحدة',
    },
  },
};

const STORAGE_KEY = 'dawacore_business_type';
const DEFAULT_BUSINESS_TYPE: BusinessType = 'PHARMACY';

export function getBusinessType(): BusinessType {
  if (typeof window === 'undefined') return DEFAULT_BUSINESS_TYPE;
  const saved = localStorage.getItem(STORAGE_KEY) as BusinessType | null;
  if (saved && BUSINESS_PROFILES[saved]) {
    return saved;
  }
  return DEFAULT_BUSINESS_TYPE;
}

export function setBusinessType(type: BusinessType) {
  if (typeof window === 'undefined') return;
  const valid: BusinessType = BUSINESS_PROFILES[type] ? type : DEFAULT_BUSINESS_TYPE;
  localStorage.setItem(STORAGE_KEY, valid);
  window.dispatchEvent(new CustomEvent('dawacore-business-type-changed', { detail: valid }));
}

export function getBusinessTerminology(type?: BusinessType): BusinessTerminology {
  const active = type || getBusinessType();
  return BUSINESS_PROFILES[active] || BUSINESS_PROFILES[DEFAULT_BUSINESS_TYPE];
}

export function getUnitLabel(unitType: string, type?: BusinessType): string {
  const terms = getBusinessTerminology(type);
  if (unitType === 'BOX') return terms.units.BOX;
  if (unitType === 'STRIP') return terms.units.STRIP;
  return terms.units.PIECE;
}
