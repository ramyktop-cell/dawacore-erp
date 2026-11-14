/**
 * أداة ضغط وتصغير الصور محلياً في المتصفح قبل التخزين
 * تقوم بتصغير الأبعاد وضغط الجودة لتحقيق أقصى توفير في المساحة (توفير 90% - 98%)
 * الناتج النموذجي لشعار 300x300 بكسل يتراوح بين 10KB إلى 25KB فقط!
 */

export interface CompressionResult {
  dataUrl: string;
  originalSize: number; // بالبايت
  compressedSize: number; // بالبايت
  compressionRatio: number; // نسبة التوفير المئوية
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  maxDimension = 300,
  quality = 0.82,
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشل قراءة ملف الصورة'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح أو تالف'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // الحفاظ على النسبة والتناسب وتصغير الأبعاد
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('فشل إنشاء محرك معالجة الصورة'));
        }

        // تفعيل تنعيم الصورة وجودة التحجيم
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // الضغط بصيغة WebP الحديثة (أو JPEG كـ Fallback)
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        // احتساب الحجم المضغوط
        const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
        const compressedSize = Math.round((base64Length * 3) / 4);
        const originalSize = file.size;
        const compressionRatio =
          originalSize > 0
            ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
            : 0;

        resolve({
          dataUrl,
          originalSize,
          compressedSize,
          compressionRatio,
          width,
          height,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
