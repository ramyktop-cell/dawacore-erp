import { useEffect, useRef } from 'react';

interface BarcodeScannerOptions {
  onBarcodeScanned: (barcode: string) => void;
  enabled?: boolean;
  minLength?: number;
  maxDelay?: number;
}

/**
 * خطاف لاعتراض مدخلات قارئ الباركود (HID Keyboard Emulator)
 * يعمل تلقائياً دون الحاجة للتركيز على حقل إدخال مخصص
 */
export const useBarcodeScanner = ({
  onBarcodeScanned,
  enabled = true,
  minLength = 3,
  maxDelay = 60,
}: BarcodeScannerOptions) => {
  const buffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // تجاهل أزرار التعديل والاختصارات
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // تجاهل أزرار التحكم والأسهم
      const ignoredKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Shift', 'Escape', 'Backspace'];
      if (ignoredKeys.includes(e.key) || e.key.startsWith('F')) return;

      const now = Date.now();

      // إعادة تعيين المخزن إذا زادت المدة عن مهلة محاكي الباركود (إدخال بشري)
      if (now - lastKeyTime.current > maxDelay) {
        buffer.current = '';
      }
      lastKeyTime.current = now;

      if (e.key === 'Enter') {
        if (buffer.current.length >= minLength) {
          e.preventDefault();
          onBarcodeScanned(buffer.current.trim());
          buffer.current = '';
        }
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBarcodeScanned, enabled, minLength, maxDelay]);
};
