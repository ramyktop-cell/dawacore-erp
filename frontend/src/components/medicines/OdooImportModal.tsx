import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
} from 'lucide-react';
import {
  medicinesApi,
  BulkImportItemInput,
  BulkImportResult,
} from '../../api/medicines';

interface OdooImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * محلل CSV / TSV ذكي يدعم علامات الاقتباس والفواصل (Comma / Semicolon / Tab)
 * ويطابق تلقائياً أسماء أعمدة Odoo القياسية (عربي + إنجليزي)
 */
function parseDelimitedText(text: string): Record<string, string>[] {
  const cleanText = text.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return [];

  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // تحديد الفاصل تلقائياً (Tab أو فاصلة منقوطة أو فاصلة عادية)
  const headerLine = lines[0];
  let delimiter = ',';
  if (headerLine.includes('\t')) delimiter = '\t';
  else if (headerLine.split(';').length > headerLine.split(',').length) delimiter = ';';

  const splitRow = (rowStr: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < rowStr.length; i++) {
      const ch = rowStr[i];
      if (ch === '"') {
        if (inQuotes && rowStr[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitRow(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitRow(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] || '').replace(/^"|"$/g, '').trim();
    });
    rows.push(obj);
  }

  return rows;
}

function mapOdooRowToMedicine(raw: Record<string, string>, idx: number): BulkImportItemInput | null {
  const findCol = (candidates: string[]): string => {
    const keys = Object.keys(raw);
    for (const cand of candidates) {
      const foundKey = keys.find(
        (k) => k.toLowerCase().trim() === cand.toLowerCase().trim(),
      );
      if (foundKey && raw[foundKey] !== undefined && raw[foundKey] !== '') {
        return raw[foundKey];
      }
    }
    return '';
  };

  const tradeName = findCol([
    'Name',
    'Product Name',
    'name',
    'tradeName',
    'الاسم',
    'اسم الصنف',
    'اسم المنتج',
    'الاسم التجاري',
  ]);

  if (!tradeName) return null;

  const code = findCol([
    'Internal Reference',
    'default_code',
    'Code',
    'code',
    'كود الصنف',
    'المرجع الداخلي',
    'الكود',
  ]);

  const barcode = findCol([
    'Barcode',
    'barcode',
    'EAN13',
    'الباركود',
    'باركود',
  ]);

  const categoryRaw = findCol([
    'Product Category',
    'categ_id',
    'Category',
    'category',
    'التصنيف',
    'فئة المنتج',
    'القسم',
  ]);
  // في أودو قد يكون التصنيف على شكل "All / Saleable / Medicines" فنأخذ الجزء الأخير
  const category = categoryRaw.includes('/')
    ? categoryRaw.split('/').pop()!.trim()
    : categoryRaw || 'عام';

  const scientificName =
    findCol([
      'Scientific Name',
      'scientificName',
      'Description',
      'Brand',
      'الاسم العلمي',
      'العلامة التجارية',
      'الوصف',
    ]) || tradeName;

  const parseNum = (val: string, fallback = 0): number => {
    if (!val) return fallback;
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : fallback;
  };

  const salePrice = parseNum(
    findCol([
      'Sales Price',
      'list_price',
      'lst_price',
      'Sale Price',
      'Price',
      'salePrice',
      'سعر البيع',
      'السعر',
    ]),
    0,
  );

  const costPrice = parseNum(
    findCol([
      'Cost',
      'standard_price',
      'Cost Price',
      'costPrice',
      'التكلفة',
      'سعر التكلفة',
      'سعر الشراء',
    ]),
    salePrice > 0 ? Number((salePrice * 0.8).toFixed(2)) : 0,
  );

  const quantityOnHand = Math.max(
    0,
    Math.round(
      parseNum(
        findCol([
          'Quantity On Hand',
          'qty_available',
          'On Hand',
          'Quantity',
          'quantityOnHand',
          'الكمية المتاحة',
          'الكمية باليد',
          'الرصيد',
          'الكمية',
        ]),
        0,
      ),
    ),
  );

  const minStockLevel = Math.max(
    0,
    Math.round(
      parseNum(
        findCol(['Min Stock', 'minStockLevel', 'حد الطلب', 'الحد الأدنى']),
        5,
      ),
    ),
  );

  const expiryDate = findCol([
    'Expiry Date',
    'expiryDate',
    'Expiration Date',
    'تاريخ الصلاحية',
    'الصلاحية',
  ]);

  return {
    tradeName,
    scientificName,
    code: code || `ODOO-${String(idx + 1).padStart(4, '0')}`,
    barcode: barcode || `628000${String(idx + 1).padStart(6, '0')}`,
    category,
    salePrice,
    costPrice,
    quantityOnHand,
    minStockLevel,
    expiryDate: expiryDate || undefined,
  };
}

export const OdooImportModal: React.FC<OdooImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedItems, setParsedItems] = useState<BulkImportItemInput[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg(null);
    setImportResult(null);

    try {
      const text = await file.text();
      const rawRows = parseDelimitedText(text);
      const mapped = rawRows
        .map((r, i) => mapOdooRowToMedicine(r, i))
        .filter((item): item is BulkImportItemInput => item !== null);

      if (mapped.length === 0) {
        setErrorMsg(
          'لم يتم العثور على صفوف صالحة في الملف. تأكد من وجود عمود الاسم (Name / اسم الصنف).',
        );
        setParsedItems([]);
        return;
      }

      setParsedItems(mapped);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر قراءة الملف المرفوع');
    }
  };

  const handleDownloadSampleOdooCsv = () => {
    const sampleCsv = [
      '\uFEFFName,Internal Reference,Barcode,Product Category,Scientific Name,Sales Price,Cost,Quantity On Hand,Expiry Date',
      '"Panadol Extra 500mg","ODOO-101","628100000101","All / مسكنات","Paracetamol + Caffeine",1200,900,50,"2028-06-30"',
      '"Augmentin 1g Tablets","ODOO-102","628100000102","All / مضادات حيوية","Amoxicillin + Clavulanic Acid",4500,3600,30,"2027-12-31"',
      '"حليب كابو بودرة 1 كجم","SUP-201","628200000201","الألبان والأغذية","Kabo Milk Powder 1KG",8500,7200,100,"2027-09-15"',
      '"زيت طعام صافولا 1.5 لتر","SUP-202","628200000202","الزيوت والتموينات","Savola Cooking Oil",6200,5400,80,"2027-11-20"',
    ].join('\n');

    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'odoo_products_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExecuteImport = async () => {
    if (parsedItems.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await medicinesApi.bulkImport({ items: parsedItems });
      setImportResult(res);
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'فشل استيراد البيانات';
      setErrorMsg(Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      dir="rtl"
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-base">
                استيراد الأصناف والأسعار والأرصدة من نظام Odoo / Excel
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يدعم ملفات التصدير المباشرة من Odoo (`Name`, `Internal Reference`, `Barcode`, `Sales Price`, `Cost`, `Quantity On Hand`)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload & Template Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="md:col-span-2 border-2 border-dashed border-teal-400 bg-teal-50/40 hover:bg-teal-50/80 dark:bg-slate-900/50 rounded-xl p-4 flex items-center justify-between cursor-pointer transition"
          >
            <div className="flex items-center gap-3">
              <Upload className="w-7 h-7 text-[#00A8A8]" />
              <div>
                <div className="text-xs font-black text-slate-800 dark:text-white">
                  {fileName
                    ? `الملف المختار: ${fileName} (${parsedItems.length} صنف جاهز)`
                    : 'اضغط هنا لرفع ملف Odoo أو Excel المحفوظ بصيغة CSV'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  في Odoo: اختر Products ثم Action &rarr; Export &rarr; CSV
                </div>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-[#00A8A8] text-white text-xs font-bold">
              اختيار ملف
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <button
            type="button"
            onClick={handleDownloadSampleOdooCsv}
            className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 rounded-xl p-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#582949] dark:text-teal-400" />
            <span>تنزيل نموذج Odoo جاهز للتجربة</span>
          </button>
        </div>

        {/* Error or Result Banner */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {importResult && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
            <div className="font-black text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>تم استيراد وترحيل بيانات Odoo إلى النظام بنجاح!</span>
            </div>
            <div className="flex flex-wrap gap-4 pt-1 font-bold">
              <span>إجمالي الأصناف المعالجة: {importResult.totalProcessed}</span>
              <span className="text-emerald-700">أصناف جديدة: {importResult.createdCount}</span>
              <span className="text-teal-700">أصناف محدّثة: {importResult.updatedCount}</span>
              <span className="text-[#582949]">
                أرصدة افتتاحية تم إنشاؤها: {importResult.batchesCreatedCount}
              </span>
            </div>
          </div>
        )}

        {/* Preview Table */}
        <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
          {parsedItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2 text-xs">
              <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-bold text-slate-600 dark:text-slate-300">
                جدول المعاينة فارغ حالياً
              </p>
              <p>
                قم بتنزيل «نموذج Odoo جاهز للتجربة» أو ارفع ملف CSV المصدر من نظام Odoo لمعاينة الأصناف قبل حفظها.
              </p>
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold sticky top-0">
                <tr>
                  <th className="p-2.5">#</th>
                  <th className="p-2.5">الاسم التجاري (Name)</th>
                  <th className="p-2.5">الكود (Ref)</th>
                  <th className="p-2.5">الباركود (Barcode)</th>
                  <th className="p-2.5">القسم (Category)</th>
                  <th className="p-2.5">سعر البيع</th>
                  <th className="p-2.5">التكلفة</th>
                  <th className="p-2.5">الرصيد الافتتاحي</th>
                  <th className="p-2.5 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {parsedItems.slice(0, 100).map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="p-2.5 font-mono text-slate-400">{i + 1}</td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                      {item.tradeName}
                    </td>
                    <td className="p-2.5 font-mono text-teal-700">{item.code}</td>
                    <td className="p-2.5 font-mono text-slate-600">{item.barcode}</td>
                    <td className="p-2.5">{item.category}</td>
                    <td className="p-2.5 font-mono font-bold text-emerald-700">
                      {Number(item.salePrice || 0).toLocaleString()}
                    </td>
                    <td className="p-2.5 font-mono text-slate-500">
                      {Number(item.costPrice || 0).toLocaleString()}
                    </td>
                    <td className="p-2.5 font-mono font-bold text-[#582949]">
                      {Number(item.quantityOnHand || 0).toLocaleString()}
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setParsedItems((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-rose-500 hover:text-rose-700 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
          <span className="text-slate-500">
            إجمالي الصفوف الجاهزة للاستيراد:{' '}
            <strong className="text-slate-900 dark:text-white">{parsedItems.length}</strong> صنف
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="button"
              disabled={parsedItems.length === 0 || isSubmitting}
              onClick={handleExecuteImport}
              className="px-6 py-2.5 rounded-xl bg-[#00A8A8] hover:bg-[#008f8f] text-white font-bold shadow-md disabled:opacity-40 transition flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'جاري الاستيراد والترحيل...'
                  : `بدء استيراد (${parsedItems.length}) صنف إلى النظام`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
