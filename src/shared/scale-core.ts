export interface ScaleBarcodeSettings {
  enabled: boolean; barcodeLength: number; prefixes: string;
  itemCodeStart: number; itemCodeLength: number; weightStart: number; weightLength: number;
  weightDivisor: number; valueType: 'WEIGHT' | 'PRICE';
  connectionMode: 'BARCODE' | 'NETWORK'; networkHost: string; networkPort: number;
}
export const DEFAULT_SCALE_SETTINGS: ScaleBarcodeSettings = {
  enabled: true, barcodeLength: 13, prefixes: '20,21,22,23,24,27,28,29',
  itemCodeStart: 3, itemCodeLength: 5, weightStart: 8, weightLength: 5,
  weightDivisor: 1000, valueType: 'WEIGHT', connectionMode: 'BARCODE', networkHost: '', networkPort: 0,
};
export function validateScaleSettings(input: Partial<ScaleBarcodeSettings>): ScaleBarcodeSettings {
  const cfg = { ...DEFAULT_SCALE_SETTINGS, ...input };
  if (typeof cfg.enabled !== 'boolean' || cfg.barcodeLength !== 13) throw new Error('الطول المدعوم هو EAN-13 فقط');
  const prefixes = cfg.prefixes.split(/[,\s;]+/).filter(Boolean);
  if (!prefixes.length || prefixes.some(p => !/^2\d$/.test(p)) || new Set(prefixes).size !== prefixes.length) throw new Error('البادئات يجب أن تكون رقمين من 20 إلى 29 دون تكرار');
  if (cfg.itemCodeLength !== 5) throw new Error('PLU مدعوم بخمس خانات؛ طابق برمجة الميزان مع تعريف الصنف');
  const bounds = [cfg.itemCodeStart,cfg.itemCodeLength,cfg.weightStart,cfg.weightLength];
  if (bounds.some(n => !Number.isInteger(n) || n < 1)) throw new Error('مواقع الحقول وأطوالها يجب أن تكون أعداداً صحيحة موجبة');
  const a=cfg.itemCodeStart, b=a+cfg.itemCodeLength-1, c=cfg.weightStart, d=c+cfg.weightLength-1;
  if (a<3 || c<3 || b>12 || d>12 || !(b<c || d<a)) throw new Error('حقول الصنف والوزن يجب ألا تتداخل مع بعضها أو البادئة أو رقم التحقق');
  if (![1,10,100,1000].includes(cfg.weightDivisor)) throw new Error('معامل القسمة المدعوم: 1 أو 10 أو 100 أو 1000');
  if (!['WEIGHT','PRICE'].includes(cfg.valueType)) throw new Error('نوع قيمة الميزان غير صالح');
  if (!['BARCODE','NETWORK'].includes(cfg.connectionMode)) throw new Error('نوع الاتصال غير صالح');
  if (cfg.connectionMode==='NETWORK') {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(cfg.networkHost) || cfg.networkHost.split('.').some(p=>Number(p)>255)) throw new Error('أدخل عنوان IPv4 صحيحاً للميزان');
    if (!Number.isInteger(cfg.networkPort) || cfg.networkPort<1 || cfg.networkPort>65535) throw new Error('منفذ الميزان غير صالح');
  }
  return {...cfg,prefixes:prefixes.join(',')};
}
export function ean13CheckDigit(body: string): string {
  if (!/^\d{12}$/.test(body)) throw new Error('يلزم 12 رقماً لحساب رقم التحقق');
  const sum=[...body].reduce((n,v,i)=>n+Number(v)*(i%2?3:1),0);
  return String((10-sum%10)%10);
}
export function parseScaleBarcodeValue(raw: string, input: Partial<ScaleBarcodeSettings> = {}) {
  const cfg=validateScaleSettings(input), clean=String(raw||'').trim();
  if (!cfg.enabled) return null;
  const prefix=cfg.prefixes.split(',').find(p=>clean.startsWith(p));
  if (!prefix) return null;
  if (!/^\d{13}$/.test(clean) || ean13CheckDigit(clean.slice(0,12))!==clean[12]) throw new Error('باركود الميزان تالف: الطول أو رقم التحقق غير صحيح');
  const itemCode=clean.slice(cfg.itemCodeStart-1,cfg.itemCodeStart-1+cfg.itemCodeLength);
  const rawValueStr=clean.slice(cfg.weightStart-1,cfg.weightStart-1+cfg.weightLength);
  const rawValue=Number(rawValueStr), extractedQuantity=rawValue/cfg.weightDivisor;
  if (!(extractedQuantity>0)) throw new Error('الوزن أو القيمة يجب أن تكون أكبر من الصفر');
  return {isScaleBarcode:true as const,originalBarcode:clean,prefix,itemCode,itemCodeTrimmed:itemCode,prefixPlusItem:clean.slice(0,cfg.itemCodeStart-1+cfg.itemCodeLength),rawValueStr,rawValue,extractedQuantity,valueType:cfg.valueType,candidateBarcodes:[itemCode]};
}
export function scaleQuantity(parsed: {extractedQuantity:number;valueType:string}, pricePerKg: number): number {
  if (!Number.isFinite(pricePerKg) || pricePerKg<=0) throw new Error('سعر الكيلو يجب أن يكون أكبر من الصفر');
  const kg=parsed.valueType==='PRICE'?parsed.extractedQuantity/pricePerKg:parsed.extractedQuantity;
  const grams=kg*1000;
  if (!Number.isFinite(grams)||grams<1||Math.abs(grams-Math.round(grams))>1e-7) throw new Error('الوزن يجب أن يكون جراماً كاملاً على الأقل؛ قيمة السعر لا تحدد وزناً دقيقاً');
  return Math.round(grams)/1000;
}
