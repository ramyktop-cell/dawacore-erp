import { DEFAULT_SCALE_SETTINGS, validateScaleSettings, parseScaleBarcodeValue, ean13CheckDigit, ScaleBarcodeSettings } from '../../../src/shared/scale-core';
export { DEFAULT_SCALE_SETTINGS, validateScaleSettings, scaleQuantity } from '../../../src/shared/scale-core';
export type { ScaleBarcodeSettings } from '../../../src/shared/scale-core';
export type ScaleBarcodeParseResult = NonNullable<ReturnType<typeof parseScaleBarcodeValue>>;
const key=()=>`dawacore_scale_barcode_settings:${JSON.parse(localStorage.getItem('dawacore_user')||'null')?.companyId||'none'}`;
export function getScaleBarcodeSettings(): ScaleBarcodeSettings {
  try { const raw=localStorage.getItem(key()); return raw?validateScaleSettings(JSON.parse(raw)):DEFAULT_SCALE_SETTINGS; }
  catch { return {...DEFAULT_SCALE_SETTINGS,enabled:false}; }
}
export function hasScaleBarcodeSettings(): boolean { try { const raw=localStorage.getItem(key()); if (!raw) return false; validateScaleSettings(JSON.parse(raw)); return true; } catch { return false; } }
export function saveScaleBarcodeSettings(input: Partial<ScaleBarcodeSettings>): ScaleBarcodeSettings {
  const cfg=validateScaleSettings({...getScaleBarcodeSettings(),...input});
  localStorage.setItem(key(),JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent('dawacore-scale-settings-changed',{detail:cfg}));
  return cfg;
}
export function parseScaleBarcode(raw: string, input?: Partial<ScaleBarcodeSettings>) {
  return parseScaleBarcodeValue(raw,{...getScaleBarcodeSettings(),...input});
}
export function buildSampleScaleBarcode(itemCode='10001',weightGrams=1500,prefix='20'): string {
  if(!/^\d{1,5}$/.test(itemCode)||!/^2\d$/.test(prefix)||!Number.isInteger(weightGrams)||weightGrams<1||weightGrams>99999)throw new Error('مثال الميزان يحتاج كوداً حتى 5 أرقام ووزناً من 1 إلى 99999 جرام');
  const body=prefix+itemCode.padStart(5,'0')+String(weightGrams).padStart(5,'0');
  return body+ean13CheckDigit(body);
}
