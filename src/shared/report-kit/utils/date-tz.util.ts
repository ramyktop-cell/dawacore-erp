import { fromZonedTime, toZonedTime, format as formatTz } from 'date-fns-tz';

/**
 * أدوات التعامل مع التواريخ والمناطق الزمنية.
 * كل الدوال static لأن الـ class مجرد namespace.
 *
 * المبدأ الأساسي:
 * - التواريخ القادمة من المستخدم (strings) تُفسَّر في timezone الشركة
 * - التواريخ المخزنة في DB هي UTC
 * - التحويل يتم هنا فقط
 */
export class DateTzUtil {
  /**
   * يُرجع Date يمثل بداية اليوم (00:00:00.000) في timezone معين.
   *
   * @example
   * // لو tz = 'Africa/Cairo' (UTC+2)
   * DateTzUtil.dayStart('2026-09-24', 'Africa/Cairo')
   * // يرجّع Date = 2026-09-23T22:00:00.000Z
   */
  static dayStart(dateStr: string, tz: string): Date {
    return fromZonedTime(`${dateStr} 00:00:00.000`, tz);
  }

  /**
   * يُرجع Date يمثل نهاية اليوم (23:59:59.999) في timezone معين.
   */
  static dayEnd(dateStr: string, tz: string): Date {
    return fromZonedTime(`${dateStr} 23:59:59.999`, tz);
  }

  /**
   * يُرجع نطاقاً زمنياً كاملاً { from, to } بين تاريخين.
   * إذا from > to → يرجّع كما هما (التحقق مسؤولية الـ caller).
   */
  static range(
    fromStr: string,
    toStr: string,
    tz: string,
  ): { from: Date; to: Date } {
    return {
      from: this.dayStart(fromStr, tz),
      to: this.dayEnd(toStr, tz),
    };
  }

  /**
   * تاريخ اليوم بتنسيق YYYY-MM-DD في timezone معين.
   * مفيد كـ default في الـ DTOs.
   */
  static todayInTz(tz: string): string {
    return formatTz(toZonedTime(new Date(), tz), 'yyyy-MM-dd', {
      timeZone: tz,
    });
  }

  /**
   * الساعة (0-23) لتاريخ معين في timezone معين.
   * يُستخدم في التحليل الساعي (hourly breakdown).
   */
  static hourInTz(date: Date, tz: string): number {
    const formatted = formatTz(toZonedTime(date, tz), 'HH', {
      timeZone: tz,
    });
    return Number(formatted) % 24;
  }

  /**
   * تنسيق تاريخ في timezone معين بنمط محدد.
   * الافتراضي: 'yyyy-MM-dd HH:mm'
   */
  static formatInTz(
    date: Date,
    tz: string,
    pattern = 'yyyy-MM-dd HH:mm',
  ): string {
    return formatTz(toZonedTime(date, tz), pattern, { timeZone: tz });
  }

  /**
   * تحقق من صحة string تاريخ (YYYY-MM-DD).
   */
  static isValidDateStr(dateStr: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const d = new Date(`${dateStr}T00:00:00Z`);
    return !isNaN(d.getTime());
  }
}

/**
 * تسمية الساعة بالعربية (12-hour format).
 *
 * @example
 * arabicHourLabel(0)  // "12 ص"
 * arabicHourLabel(1)  // "01 ص"
 * arabicHourLabel(12) // "12 م"
 * arabicHourLabel(13) // "01 م"
 * arabicHourLabel(23) // "11 م"
 */
export function arabicHourLabel(hour24: number): string {
  if (hour24 < 0 || hour24 > 23) {
    throw new RangeError(`hour24 must be between 0 and 23, got ${hour24}`);
  }

  const period = hour24 >= 12 ? 'م' : 'ص';
  const displayHour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(displayHour).padStart(2, '0')} ${period}`;
}
