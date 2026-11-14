export interface SettingResponse {
  key: string;
  value: string;
  dataType: string;
  category: string;
  description: string | null;
  isEditable: boolean;
  updatedAt: string;
}

export interface SettingsByCategory {
  [category: string]: SettingResponse[];
}

export const DEFAULT_SETTINGS = [
  { key: 'defaultCashAccountCode', value: '1101', dataType: 'STRING', category: 'ACCOUNTING', description: 'حساب الصندوق' },
  { key: 'defaultBankAccountCode', value: '1102', dataType: 'STRING', category: 'ACCOUNTING', description: 'حساب البنك' },
  { key: 'defaultARAccountCode', value: '1105', dataType: 'STRING', category: 'ACCOUNTING', description: 'حساب العملاء' },
  { key: 'defaultAPAccountCode', value: '2101', dataType: 'STRING', category: 'ACCOUNTING', description: 'حساب الموردين' },
  { key: 'defaultRevenueAccountCode', value: '4101', dataType: 'STRING', category: 'ACCOUNTING', description: 'حساب الإيرادات' },
  { key: 'defaultCOGSAccountCode', value: '5101', dataType: 'STRING', category: 'ACCOUNTING', description: 'حساب COGS' },
  { key: 'defaultInventoryAccountCode', value: '1104', dataType: 'STRING', category: 'ACCOUNTING', description: 'حساب المخزون' },
  { key: 'defaultRetainedEarningsAccountCode', value: '3-1-02', dataType: 'STRING', category: 'ACCOUNTING', description: 'حساب الأرباح المحتجزة' },
  { key: 'fiscalYearStartMonth', value: '1', dataType: 'NUMBER', category: 'ACCOUNTING', description: 'شهر بداية السنة' },
  { key: 'defaultCreditLimit', value: '0', dataType: 'NUMBER', category: 'SALES', description: 'حد الائتمان الافتراضي' },
  { key: 'allowNegativeStock', value: 'false', dataType: 'BOOLEAN', category: 'SALES', description: 'البيع بالرصيد السالب' },
  { key: 'requireShiftOpen', value: 'true', dataType: 'BOOLEAN', category: 'SALES', description: 'إلزامية الوردية' },
  { key: 'maxItemDiscountPercent', value: '50', dataType: 'NUMBER', category: 'SALES', description: 'أقصى خصم بند' },
  { key: 'maxInvoiceDiscountPercent', value: '20', dataType: 'NUMBER', category: 'SALES', description: 'أقصى خصم فاتورة' },
  { key: 'reportHeaderText', value: '', dataType: 'STRING', category: 'REPORTS', description: 'ترويسة التقارير' },
  { key: 'reportFooterText', value: '', dataType: 'STRING', category: 'REPORTS', description: 'تذييل التقارير' },
  { key: 'reportPrimaryColor', value: '#0f766e', dataType: 'STRING', category: 'REPORTS', description: 'اللون الأساسي' },
  { key: 'language', value: 'ar', dataType: 'STRING', category: 'SYSTEM', description: 'اللغة' },
  { key: 'timezone', value: 'Africa/Cairo', dataType: 'STRING', category: 'SYSTEM', description: 'المنطقة الزمنية' },
  { key: 'currencySymbol', value: 'ج.س', dataType: 'STRING', category: 'SYSTEM', description: 'رمز العملة' },
  { key: 'businessType', value: 'PHARMACY', dataType: 'STRING', category: 'SYSTEM', description: 'نوع النشاط التجاري (PHARMACY / SUPERMARKET / TRADING)' },
];
