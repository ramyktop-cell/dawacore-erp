import React, { useState, useEffect } from 'react';
import { Printer, X, Tag, Layers, Calendar, CheckSquare } from 'lucide-react';
import {
  ThermalPrinterService,
  BarcodeLabelSize,
  generateCode128Svg,
} from '../../services/printer.service';

export interface BarcodeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    tradeName: string;
    scientificName?: string;
    barcode: string;
    defaultPrice: number;
    units?: Array<{ unitType: string; price: number; multiplier: number; isDefault?: boolean }>;
    batchNumber?: string;
    expiryDate?: string;
  } | null;
}

const UNIT_NAMES: Record<string, string> = {
  BOX: 'علبة',
  STRIP: 'شريط',
  PIECE: 'حبة',
};

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  const [labelSize, setLabelSize] = useState<BarcodeLabelSize>('38x25');
  const [copies, setCopies] = useState<number>(1);
  const [selectedUnitType, setSelectedUnitType] = useState<string>('DEFAULT');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [pharmacyName, setPharmacyName] = useState<string>('مجموعة صيدليات DawaCore');
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showExpiry, setShowExpiry] = useState<boolean>(true);
  const [showPharmacyName, setShowPharmacyName] = useState<boolean>(true);

  useEffect(() => {
    if (item) {
      const defUnit =
        item.units?.find((u) => u.isDefault) || item.units?.[0] || null;
      const initialPrice = defUnit ? Number(defUnit.price) : Number(item.defaultPrice || 0);
      setSelectedUnitType(defUnit ? defUnit.unitType : 'DEFAULT');
      setCustomPrice(initialPrice.toFixed(2));
      setBatchNumber(item.batchNumber || '');
      if (item.expiryDate) {
        try {
          const d = new Date(item.expiryDate);
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yy = String(d.getFullYear()).slice(-2);
          setExpiryDate(`${mm}/${yy}`);
        } catch {
          setExpiryDate(item.expiryDate);
        }
      } else {
        setExpiryDate('');
      }
      setCopies(1);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleUnitChange = (unitType: string) => {
    setSelectedUnitType(unitType);
    const found = item.units?.find((u) => u.unitType === unitType);
    if (found) {
      setCustomPrice(Number(found.price).toFixed(2));
    }
  };

  const unitLabel = UNIT_NAMES[selectedUnitType] || '';

  const barcodeSvgPreview = generateCode128Svg(item.barcode || '00000000', {
    height: 32,
    barWidth: 1.35,
    showText: true,
    fontSize: 10,
  });

  const handlePrint = () => {
    ThermalPrinterService.printBarcodeLabels({
      pharmacyName,
      tradeName: item.tradeName,
      scientificName: item.scientificName,
      barcode: item.barcode || '00000000',
      price: parseFloat(customPrice) || 0,
      currencySymbol: 'ج.س',
      unitLabel,
      batchNumber: batchNumber.trim() || undefined,
      expiryDate: expiryDate.trim() || undefined,
      copies,
      labelSize,
      showPrice,
      showExpiry,
      showPharmacyName,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      dir="rtl"
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                طباعة ملصقات الباركود الحرارية (Barcode Labels)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                متوافق مع طابعات الملصقات الحرارية (Zebra / Xprinter / TSC)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Thermal Label Preview */}
        <div className="bg-slate-100 dark:bg-slate-900/90 p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center">
          <span className="text-[11px] font-bold text-slate-400 mb-2">
            معاينة الملصق الحقيقية ({labelSize} mm)
          </span>
          <div className="bg-white text-black border border-slate-300 rounded-md shadow-md px-4 py-2.5 w-64 flex flex-col items-center justify-between space-y-1">
            {showPharmacyName && (
              <div className="text-[10px] font-extrabold border-b border-black/80 w-full text-center pb-0.5 truncate">
                {pharmacyName || 'صيدلية DawaCore'}
              </div>
            )}
            <div className="text-xs font-black text-center truncate w-full">
              {item.tradeName}
            </div>
            <div
              className="w-full flex justify-center py-0.5"
              dangerouslySetInnerHTML={{ __html: barcodeSvgPreview }}
            />
            <div className="w-full flex items-center justify-between text-[10px] font-mono font-extrabold border-t border-dashed border-black/70 pt-1">
              {showPrice ? (
                <span>
                  {Number(customPrice || 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  ج.س {unitLabel ? `/ ${unitLabel}` : ''}
                </span>
              ) : (
                <span />
              )}
              {showExpiry && (expiryDate || batchNumber) && (
                <span dir="ltr" className="text-[9px]">
                  {expiryDate ? `EXP:${expiryDate}` : ''}
                  {batchNumber ? ` B:${batchNumber}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          {/* Size Selection */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-teal-600" />
              مقاس الملصق الحراري:
            </label>
            <select
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value as BarcodeLabelSize)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold focus:ring-2 focus:ring-teal-500 outline-none"
            >
              <option value="38x25">38 × 25 مم (قياسي للصيدليات)</option>
              <option value="50x25">50 × 25 مم (متوسط عريض)</option>
              <option value="40x30">40 × 30 مم (كبير للعبوات)</option>
            </select>
          </div>

          {/* Copies Count */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              عدد الملصقات المطلوب طباعتها:
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={200}
                value={copies}
                onChange={(e) =>
                  setCopies(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1)))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-center text-sm text-teal-700 dark:text-teal-400 focus:ring-2 focus:ring-teal-500 outline-none"
              />
              {[1, 5, 10, 20].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCopies(preset)}
                  className={`px-2 py-2 rounded-lg font-mono font-bold border transition ${
                    copies === preset
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Unit & Price */}
          {item.units && item.units.length > 0 && (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-teal-600" />
                الوحدة المسعرة:
              </label>
              <select
                value={selectedUnitType}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold focus:ring-2 focus:ring-teal-500 outline-none"
              >
                {item.units.map((u) => (
                  <option key={u.unitType} value={u.unitType}>
                    {UNIT_NAMES[u.unitType] || u.unitType} ({Number(u.price).toFixed(2)} ج.س)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              السعر المطبوع (ج.س):
            </label>
            <input
              type="number"
              step="0.01"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          {/* Batch & Expiry */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              تاريخ الصلاحية (MM/YY):
            </label>
            <input
              type="text"
              placeholder="مثال: 08/27"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              رقم التشغيلة (Batch):
            </label>
            <input
              type="text"
              placeholder="اختياري..."
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-slate-800 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
        </div>

        {/* Display Checkboxes */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showPharmacyName}
              onChange={(e) => setShowPharmacyName(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span>إظهار اسم الصيدلية</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(e) => setShowPrice(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span>إظهار السعر</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showExpiry}
              onChange={(e) => setShowExpiry(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span>إظهار الصلاحية والتشغيلة</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-6 py-2.5 rounded-xl bg-[#00A8A8] hover:bg-[#008f8f] text-white text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة ({copies}) ملصق حراري الآن</span>
          </button>
        </div>
      </div>
    </div>
  );
};
