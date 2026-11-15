/**
 * MadarCore ERP - Dynamic Business Type & Terminology Engine
 * Supports:
 *   - PHARMACY:     صيدلية ومستودع أدوية
 *   - SUPERMARKET:  سوبر ماركت وهايبر ماركت وتموينات
 *   - TRADING:      شركة تجارية وتوزيع وجملة
 *   - CLOTHING:     معرض ملابس وأزياء
 */

import { useAuthStore } from '../stores/auth.store';

export type BusinessType = 'PHARMACY' | 'SUPERMARKET' | 'TRADING' | 'CLOTHING';

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
  CLOTHING: {
    type: 'CLOTHING',
    labelAr: 'معرض ملابس وأزياء',
    icon: '👔',
    systemSubtitle: 'نظام إدارة معارض الملابس والأزياء ونقاط البيع',
    inventorySectionTitle: 'المخزون والأصناف',
    catalogMenuTitle: 'دليل الأصناف والموديلات',
    catalogPageTitle: 'دليل الأصناف والملابس (Apparel Catalog)',
    catalogPageSubtitle:
      'إدارة أصناف الملابس، الموديلات والمقاسات، تعدد تسعير الوحدات (كرتونة / دستة / قطعة)، وحدود الطلب',
    addNewItemButton: 'إضافة صنف ملابس جديد',
    itemSingular: 'صنف',
    itemPlural: 'الأصناف',
    scientificNameLabel: 'اسم الصنف / الموديل واللون والمقاس',
    categoryLabel: 'قسم الملابس / الفئة',
    batchesMenuTitle: 'الأرصدة والدفعات المخزنية',
    units: {
      BOX: 'كرتونة / بالة',
      STRIP: 'دستة / طقم',
      PIECE: 'قطعة',
      baseUnitPlural: 'قطعة',
    },
  },
};

const DEFAULT_BUSINESS_TYPE: BusinessType = 'PHARMACY';

export function normalizeFrontendBusinessType(raw?: string | null): BusinessType {
  const clean = (raw || '').trim().toUpperCase() as BusinessType;
  if (clean && BUSINESS_PROFILES[clean]) {
    return clean;
  }
  return DEFAULT_BUSINESS_TYPE;
}

export function getBusinessType(): BusinessType {
  const storeUser = useAuthStore.getState().user;
  if (storeUser?.businessType) {
    return normalizeFrontendBusinessType(storeUser.businessType);
  }

  if (typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('dawacore_user');
      if (rawUser) {
        const parsedUser = JSON.parse(rawUser);
        if (parsedUser?.businessType) {
          return normalizeFrontendBusinessType(parsedUser.businessType);
        }
      }
    } catch {}
  }

  return DEFAULT_BUSINESS_TYPE;
}

/**
 * Commits a server-verified businessType into the authenticated user context.
 * Must only be called after reading from the server or after a successful server save.
 */
export function setBusinessType(type: BusinessType) {
  const valid: BusinessType = normalizeFrontendBusinessType(type);
  useAuthStore.getState().updateUserCompanyContext({ businessType: valid });
}

export function getBusinessTerminology(type?: BusinessType | string | null): BusinessTerminology {
  const active = type ? normalizeFrontendBusinessType(type) : getBusinessType();
  return BUSINESS_PROFILES[active] || BUSINESS_PROFILES[DEFAULT_BUSINESS_TYPE];
}

export function getUnitLabel(unitType: string, type?: BusinessType): string {
  const terms = getBusinessTerminology(type);
  if (unitType === 'BOX') return terms.units.BOX;
  if (unitType === 'STRIP') return terms.units.STRIP;
  return terms.units.PIECE;
}
