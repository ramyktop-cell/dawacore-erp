import { StateStorage } from 'zustand/middleware';

const INTEGRITY_SALT = 'DAWACORE_POS_ZERO_TRUST_2026_#9918';

/**
 * حساب بصمة النزاهة (Tamper-Evident Checksum) لسلة المبيعات
 * لمنع تعديل الأسعار أو الكميات أو الخصومات عبر LocalStorage أو Console
 */
export function computeCartSignature(stateObj: any): string {
  const state = stateObj?.state || stateObj || {};
  const items = Array.isArray(state.items) ? state.items : [];
  const canonical = items
    .map((item: any) => {
      const officialUnit = Array.isArray(item.availableUnits)
        ? item.availableUnits.find((u: any) => u.unitType === item.unitType)
        : null;
      const officialPrice = Number(officialUnit?.price ?? item.unitPrice ?? 0);
      const minSalePrice =
        officialUnit?.minSalePrice !== undefined
          ? Number(officialUnit.minSalePrice)
          : officialPrice;
      const reason = typeof item.priceOverrideReason === 'string' ? item.priceOverrideReason.trim() : '';

      const hasValidOverride =
        !item.isWeighed &&
        item.isPriceOverridden &&
        reason.length >= 3 &&
        reason.length <= 500 &&
        typeof item.unitPrice === 'number' &&
        !isNaN(item.unitPrice) &&
        item.unitPrice >= 0 &&
        item.unitPrice >= minSalePrice;

      const effectivePrice = hasValidOverride ? Number(item.unitPrice).toFixed(2) : officialPrice.toFixed(2);
      const effectiveReason = hasValidOverride ? reason : '';

      return `${item.id}|${item.medicineId}|${item.unitType}|${Number(item.quantity)}|${effectivePrice}|${effectiveReason}|${Number(item.discountAmount || 0).toFixed(2)}`;
    })
    .join(';;');

  const payload = `${INTEGRITY_SALT}::${canonical}::DISC=${Number(state.discountTotal || 0).toFixed(2)}`;

  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = (Math.imul(h2, 33) ^ ch) >>> 0;
  }
  return `DC-${(h1 >>> 0).toString(16).padStart(8, '0')}-${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * مخزن محمي لبيانات سلة الكاشير يكتشف أي تلاعب يتم عبر الكونسول (localStorage)
 * ويقوم بتصفير السلة المتلاعب بها فوراً.
 */
export const securePosStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      const raw = localStorage.getItem(name);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const expectedSig = computeCartSignature(parsed);

      if (parsed._sig && parsed._sig !== expectedSig) {
        console.error('🚨 [DawaCore Security] تم اكتشاف تلاعب ببيانات سلة المبيعات من الكونسول! تم إبطال السلة.');
        localStorage.removeItem(name);
        return null;
      }

      if (parsed?.state?.items && Array.isArray(parsed.state.items)) {
        parsed.state.items = parsed.state.items.map((item: any) => {
          const officialUnit = Array.isArray(item.availableUnits)
            ? item.availableUnits.find((u: any) => u.unitType === item.unitType)
            : null;
          const officialPrice =
            officialUnit && Number(officialUnit.price) > 0
              ? Number(officialUnit.price)
              : Math.max(0, Number(item.unitPrice || 0));
          const minSalePrice =
            officialUnit && officialUnit.minSalePrice !== undefined
              ? Number(officialUnit.minSalePrice)
              : officialPrice;

          const reason = typeof item.priceOverrideReason === 'string' ? item.priceOverrideReason.trim() : '';
          const hasValidOverride =
            !item.isWeighed &&
            item.isPriceOverridden &&
            reason.length >= 3 &&
            reason.length <= 500 &&
            typeof item.unitPrice === 'number' &&
            !isNaN(item.unitPrice) &&
            item.unitPrice >= 0 &&
            item.unitPrice >= minSalePrice;

          const safeUnitPrice = hasValidOverride ? Number(item.unitPrice) : officialPrice;
          const safeReason = hasValidOverride ? reason : undefined;
          const safeIsOverridden = hasValidOverride && safeUnitPrice !== officialPrice;

          const safeQty = item.isWeighed ? Math.max(0.001, Number(item.quantity || 1)) : Math.max(1, Number(item.quantity || 1));
          const safeTotal = Number((safeQty * safeUnitPrice).toFixed(2));
          const safeDisc = Math.min(Math.max(0, Number(item.discountAmount || 0)), safeTotal);
          return {
            ...item,
            quantity: safeQty,
            unitPrice: safeUnitPrice,
            originalUnitPrice: officialPrice,
            minSalePrice,
            priceOverrideReason: safeReason,
            isPriceOverridden: safeIsOverridden,
            totalPrice: safeTotal,
            discountAmount: safeDisc,
          };
        });
      }

      return JSON.stringify(parsed);
    } catch {
      localStorage.removeItem(name);
      return null;
    }
  },

  setItem: (name: string, value: string): void => {
    try {
      const parsed = JSON.parse(value);
      parsed._sig = computeCartSignature(parsed);
      localStorage.setItem(name, JSON.stringify(parsed));
    } catch {
      // Ignore malformed writes
    }
  },

  removeItem: (name: string): void => {
    localStorage.removeItem(name);
  },
};

/**
 * فحص ما إذا كانت نافذة أدوات المطورين (DevTools / Console) مفتوحة حالياً في المتصفح
 */
export function isBrowserDevToolsOpen(): boolean {
  if (typeof window === 'undefined') return false;
  const threshold = 175;
  const widthDiff = window.outerWidth - window.innerWidth;
  const heightDiff = window.outerHeight - window.innerHeight;
  return widthDiff > threshold || heightDiff > threshold;
}

/**
 * تفعيل درع حماية شاشة المبيعات:
 * 1. يرصد فتح الكونسول (سواء عبر F12 أو من قائمة المتصفح) ويقفل شاشة المبيعات فوراً
 * 2. يرصد أي تلاعب بـ localStorage ويبطل السلة
 */
export function installPosConsoleGuard(
  onTamperDetected?: () => void,
  onConsoleLockChange?: (locked: boolean, reason?: string) => void,
): () => void {
  try {
    console.log(
      '%c🛡️ تحذير أمني - DawaCore Financial Anti-Tamper Guard',
      'color: #ffffff; background: #be123c; font-size: 15px; font-weight: bold; padding: 6px 12px; border-radius: 6px;',
    );
    console.log(
      '%cفتح الكونسول أثناء عمل نقطة البيع يؤدي إلى قفل شاشة المبيعات تلقائياً لحماية العمليات المالية.',
      'color: #e11d48; font-size: 12px; font-weight: bold;',
    );
  } catch {
    // ignore
  }

  // الفحص المبدئي عند فتح الشاشة
  if (isBrowserDevToolsOpen()) {
    onConsoleLockChange?.(true, 'تم رصد نافذة أدوات المطورين (DevTools / Console) مفتوحة في المتصفح.');
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key?.toUpperCase();
    const isF12 = e.key === 'F12';
    const isDevToolsShortcut =
      (e.ctrlKey && e.shiftKey && (key === 'I' || key === 'J' || key === 'C')) ||
      (e.ctrlKey && key === 'U');

    if (isF12 || isDevToolsShortcut) {
      e.preventDefault();
      e.stopPropagation();
      onConsoleLockChange?.(
        true,
        `تمت محاولة فتح وحدة التحكم البرمجية (${isF12 ? 'F12' : `Ctrl+Shift+${key}`}) أثناء جلسة البيع.`,
      );
      return false;
    }
  };

  // رصد مستمر لفتح الكونسول من قائمة المتصفح (Resize / Docked DevTools Detection)
  const checkDevToolsInterval = window.setInterval(() => {
    if (isBrowserDevToolsOpen()) {
      onConsoleLockChange?.(
        true,
        'تم فتح نافذة الكونسول (DevTools) في المتصفح. تم تعطيل البيع مؤقتاً لحين إغلاق الكونسول.',
      );
    }
  }, 800);

  const handleResize = () => {
    if (isBrowserDevToolsOpen()) {
      onConsoleLockChange?.(
        true,
        'تم فتح نافذة الكونسول (DevTools) في المتصفح. تم تعطيل البيع مؤقتاً لحين إغلاق الكونسول.',
      );
    }
  };

  const handleStorageTamper = (e: StorageEvent) => {
    if (e.key === 'dawacore-pos-active-cart' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        const expectedSig = computeCartSignature(parsed);
        if (parsed._sig !== expectedSig) {
          localStorage.removeItem('dawacore-pos-active-cart');
          onTamperDetected?.();
          onConsoleLockChange?.(true, 'تم رصد محاولة حقن أو تعديل قيم المبيعات عبر الذاكرة المحلية (LocalStorage).');
        }
      } catch {
        localStorage.removeItem('dawacore-pos-active-cart');
        onTamperDetected?.();
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('resize', handleResize);
  window.addEventListener('storage', handleStorageTamper);

  return () => {
    window.clearInterval(checkDevToolsInterval);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('storage', handleStorageTamper);
  };
}

const LOCAL_SECURITY_ALERTS_KEY = 'dawacore_pos_security_alerts_log';
let lastReportedAt = 0;
let lastReportedReason = '';

/**
 * 🚨 إرسال إشعار أمني فوري للمدير عند فتح الكونسول أو محاولة التلاعب
 * يجمع بين التسجيل في قاعدة البيانات (AuditLog) والبث اللحظي عبر BroadcastChannel والتخزين المحلي (Offline Fallback)
 */
export async function reportPosSecurityIncident(params: {
  alertType: 'CONSOLE_OPENED' | 'SHORTCUT_BLOCKED' | 'STORAGE_TAMPERED';
  reason: string;
  companyId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  cashierName?: string | null;
  shiftId?: string | null;
  cartItemsCount?: number;
  cartTotal?: number;
}): Promise<void> {
  const now = Date.now();
  // منع تكرار نفس الإشعار خلال 15 ثانية لتجنب الإغراق أثناء بقاء الكونسول مفتوحاً
  if (now - lastReportedAt < 15000 && lastReportedReason === params.reason) {
    return;
  }
  lastReportedAt = now;
  lastReportedReason = params.reason;

  let userObj: any = null;
  try {
    const rawUser = localStorage.getItem('dawacore_user');
    if (rawUser) userObj = JSON.parse(rawUser);
  } catch {
    // ignore
  }

  const incident = {
    id: `local-sec-${now}-${Math.random().toString(36).slice(2, 7)}`,
    companyId: params.companyId || userObj?.companyId || '11111111-0000-0000-0000-000000000001',
    branchId: params.branchId || userObj?.branchId || null,
    userId: params.userId || userObj?.id || userObj?.username || 'pos-cashier',
    cashierName:
      params.cashierName ||
      userObj?.name ||
      userObj?.username ||
      'كاشير نقطة البيع',
    shiftId: params.shiftId || null,
    alertType: params.alertType,
    reason: params.reason,
    cartItemsCount: Number(params.cartItemsCount || 0),
    cartTotal: Number(params.cartTotal || 0),
    acknowledged: false,
    createdAt: new Date().toISOString(),
  };

  // 1. حفظ فوري في السجل المحلي وبث الحدث لكل النوافذ المفتوحة (حتى في وضع الأوفلاين)
  try {
    const existingRaw = localStorage.getItem(LOCAL_SECURITY_ALERTS_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const updated = [incident, ...(Array.isArray(existing) ? existing : [])].slice(0, 40);
    localStorage.setItem(LOCAL_SECURITY_ALERTS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('dawacore-security-alert', { detail: incident }));

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('dawacore_security_alerts_channel');
      bc.postMessage({ type: 'NEW_SECURITY_ALERT', alert: incident });
      bc.close();
    }
  } catch {
    // ignore storage errors
  }

  // 2. إرسال للسيرفر لحفظه في سجل التدقيق الرسمي (AuditLog) ليظهر في جميع أجهزة المديرين على الشبكة
  try {
    await fetch('/api/dashboard/security-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incident),
    });
  } catch {
    // في حال انقطاع الشبكة يبقى التنبيه محفوظاً محلياً
  }
}

export function getLocalSecurityAlerts(): any[] {
  try {
    const raw = localStorage.getItem(LOCAL_SECURITY_ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function acknowledgeLocalSecurityAlert(id?: string): void {
  try {
    const list = getLocalSecurityAlerts();
    const updated = list.map((item) => {
      if (!id || item.id === id) {
        return { ...item, acknowledged: true, acknowledgedAt: new Date().toISOString() };
      }
      return item;
    });
    localStorage.setItem(LOCAL_SECURITY_ALERTS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('dawacore-security-alert-updated'));
  } catch {
    // ignore
  }
}

/**
 * 🔊 تشغيل صافرة تنبيه أمنية قصيرة للمدير عند وصول إشعار فتح الكونسول
 */
export function playManagerSecurityAlarmSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.14);
    osc.frequency.setValueAtTime(980, ctx.currentTime + 0.28);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // ignore if browser blocks autoplay audio
  }
}

