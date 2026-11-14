/**
 * أدوات تقريب الأرقام المالية.
 * كل الدوال نقية (pure) — لا side effects.
 */

/**
 * تقريب رقم لخانتين عشريتين (للمبالغ المالية).
 * يستخدم Number.EPSILON لتجنب أخطاء الفاصلة العائمة.
 *
 * @example
 * round2(1.005)  // 1.01
 * round2(1.004)  // 1.00
 * round2(-1.005) // -1.01
 */
export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * تقريب رقم لعدد خانات عشري محدد.
 *
 * @example
 * roundTo(1.23456, 3)  // 1.235
 * roundTo(1.23456, 0)  // 1
 */
export function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * تحويل آمن لأي قيمة إلى رقم.
 * لو القيمة NaN أو Infinity أو غير رقمية → يرجّع fallback.
 *
 * @example
 * safeNumber('123.45')     // 123.45
 * safeNumber(null, 0)      // 0
 * safeNumber('abc', -1)    // -1
 */
export function safeNumber(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * جمع مصفوفة أرقام بأمان (بدون NaN).
 */
export function sumSafe(values: unknown[]): number {
  return values.reduce<number>((acc, v) => acc + safeNumber(v, 0), 0);
}
