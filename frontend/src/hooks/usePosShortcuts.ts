import { useEffect, useRef } from 'react';

interface ShortcutHandlers {
  onBarcodeScanned: (barcode: string) => void;
  onFocusSearch: () => void;
  onOpenPayment: () => void;
  onHoldCart: () => void;
  onResumeCart: () => void;
  onClearCart: () => void;
}

export const usePosShortcuts = (handlers: ShortcutHandlers) => {
  const barcodeBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();

      // معالجة اختصارات الوظائف (F-Keys)
      if (e.key === 'F1') {
        e.preventDefault();
        handlers.onFocusSearch();
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        handlers.onHoldCart();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        handlers.onResumeCart();
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        handlers.onOpenPayment();
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        handlers.onClearCart();
        return;
      }

      // التقاط مدخلات ماسح الباركود عالي السرعة (Buffer Detection)
      if (now - lastKeyTime.current > 60) {
        barcodeBuffer.current = ''; // إعادة تعيين إذا تأخر الحرف (كتابة بشرية)
      }
      lastKeyTime.current = now;

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length >= 3) {
          e.preventDefault();
          handlers.onBarcodeScanned(barcodeBuffer.current.trim());
          barcodeBuffer.current = '';
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
};
