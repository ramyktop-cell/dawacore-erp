import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { medicinesApi, Medicine } from '../../api/medicines';
import { companiesApi, Company } from '../../api/companies';
import { settingsApi } from '../../api/settings';
import { getCurrentUser } from '../../utils/permissions';
import { useBusinessTerminology } from '../../hooks/useBusinessTerminology';
import {
  X,
  Printer,
  FileSpreadsheet,
  Search,
  Building2,
  Layers,
  Phone,
  Eye,
  EyeOff,
} from 'lucide-react';

interface PriceListReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PriceListReportModal: React.FC<PriceListReportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const terms = useBusinessTerminology();
  const currentUser = getCurrentUser();

  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [groupByField, setGroupByField] = useState<'category' | 'scientificName'>('category');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);
  const [showQuantityCol, setShowQuantityCol] = useState<boolean>(true);

  // جلب جميع الأصناف لقائمة الأسعار
  const { data: medicinesData, isLoading } = useQuery({
    queryKey: ['medicines-price-list'],
    queryFn: () => medicinesApi.getAll({ page: 1, limit: 5000 }),
    enabled: isOpen,
  });

  // جلب بيانات الشركة الحالية (الاسم، اللوقو، الأرقام)
  const { data: companiesData } = useQuery({
    queryKey: ['companies-header-info'],
    queryFn: () => companiesApi.getAll({ page: 1, limit: 20 }),
    enabled: isOpen,
  });

  // جلب إعدادات الشركة الإضافية في حال وجودها
  const { data: settingsList = [] } = useQuery({
    queryKey: ['settings-header-info'],
    queryFn: () => settingsApi.getAll(),
    enabled: isOpen,
  });

  const companyInfo = useMemo(() => {
    const companies: Company[] = companiesData?.items || (Array.isArray(companiesData) ? companiesData : []);
    const matched = currentUser?.companyId
      ? companies.find((c) => c.id === currentUser.companyId) || null
      : null;

    const getSetting = (key: string) =>
      settingsList.find((s) => s.key === key)?.value || '';

    return {
      name:
        matched?.name ||
        currentUser?.companyName ||
        getSetting('company.name') ||
        getSetting('COMPANY_NAME') ||
        'MadarCore ERP',
      phone:
        matched?.phone ||
        getSetting('company.phone') ||
        getSetting('COMPANY_PHONE') ||
        '—',
      taxNumber:
        matched?.taxNumber ||
        getSetting('company.tax_number') ||
        getSetting('COMPANY_TAX_NUMBER') ||
        '',
      address:
        matched?.address ||
        getSetting('company.address') ||
        getSetting('COMPANY_ADDRESS') ||
        '',
      logoUrl: matched?.logoUrl || (currentUser as any)?.companyLogoUrl || '/logo.png',
    };
  }, [companiesData, settingsList, currentUser?.companyId, currentUser?.companyName]);

  // استخراج بيانات الوحدة، سعر البيع (الجملة)، وسعر التجزئة، والكمية لكل صنف
  const resolvePricingRow = (item: Medicine) => {
    const units = item.units || [];
    const unitPiece = units.find((u) => u.unitType === 'UNIT');
    const unitStrip = units.find((u) => u.unitType === 'STRIP');
    const unitBox = units.find((u) => u.unitType === 'BOX');
    const defaultUnit = units.find((u) => u.isDefault) || unitBox || unitStrip || unitPiece || units[0];

    // وحدة الجملة / البيع الكبرى (BOX أو STRIP أو الافتراضية)
    const wholesaleUnit = unitBox || unitStrip || defaultUnit;
    // وحدة التجزئة / القطاعي (UNIT أو STRIP أو الأصغر)
    const retailUnit = unitPiece || unitStrip || defaultUnit;

    const getUnitLabel = (u: any) => {
      if (!u) return terms.units.PIECE;
      if (u.label) {
        return u.multiplier > 1 ? `${u.label} (${u.multiplier})` : u.label;
      }
      if (u.unitType === 'BOX') {
        return u.multiplier > 1 ? `${terms.units.BOX} (${u.multiplier})` : terms.units.BOX;
      }
      if (u.unitType === 'STRIP') {
        return u.multiplier > 1 ? `${terms.units.STRIP} (${u.multiplier})` : terms.units.STRIP;
      }
      return terms.units.PIECE;
    };

    // بناء نص واضح للوحدة
    const unitDisplay =
      wholesaleUnit && retailUnit && wholesaleUnit.unitType !== retailUnit.unitType
        ? `${getUnitLabel(wholesaleUnit)} / ${getUnitLabel(retailUnit)}`
        : getUnitLabel(defaultUnit);

    const wholesalePrice = Number(wholesaleUnit?.price ?? 0);
    const retailPrice = Number(retailUnit?.price ?? 0);

    // حساب الكمية بالوحدة الكبرى أو الأساسية
    const baseQty = Number(item.totalStockInBase ?? 0);
    const wholesaleMultiplier = Number(wholesaleUnit?.multiplier ?? 1) || 1;
    const formattedQty =
      wholesaleMultiplier > 1
        ? `${Math.floor(baseQty / wholesaleMultiplier)} ${wholesaleUnit?.label || terms.units.BOX}${
            baseQty % wholesaleMultiplier > 0
              ? ` + ${baseQty % wholesaleMultiplier} ${retailUnit?.label || terms.units.PIECE}`
              : ''
          } (${baseQty.toLocaleString()})`
        : `${baseQty.toLocaleString()} ${item.isWeighed ? 'جرام' : getUnitLabel(retailUnit)}`;

    return {
      id: item.id,
      code: item.code,
      barcode: item.barcode,
      tradeName: item.tradeName,
      scientificName: item.scientificName,
      category: item.category || 'عام',
      unitDisplay,
      wholesalePrice,
      retailPrice,
      baseQty,
      formattedQty,
    };
  };

  // تجميع الأصناف حسب الشركة التابعة لها (التصنيف أو العلامة التجارية/الاسم العلمي)
  const { groupedData, allGroupNames, totalMatchedItems } = useMemo(() => {
    const rawItems = medicinesData?.items || [];
    const groupSet = new Set<string>();

    rawItems.forEach((item) => {
      const gName =
        groupByField === 'category'
          ? (item.category || 'غير مصنف').trim()
          : (item.scientificName || item.category || 'غير مصنف').trim();
      if (gName) groupSet.add(gName);
    });

    const filtered = rawItems.filter((item) => {
      const gName =
        groupByField === 'category'
          ? (item.category || 'غير مصنف').trim()
          : (item.scientificName || item.category || 'غير مصنف').trim();

      if (selectedGroup !== 'ALL' && gName !== selectedGroup) {
        return false;
      }
      if (onlyInStock && (item.totalStockInBase || 0) <= 0) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTrade = item.tradeName?.toLowerCase().includes(q);
        const matchSci = item.scientificName?.toLowerCase().includes(q);
        const matchCat = item.category?.toLowerCase().includes(q);
        const matchCode = item.code?.toLowerCase().includes(q);
        const matchBarcode = item.barcode?.toLowerCase().includes(q);
        if (!matchTrade && !matchSci && !matchCat && !matchCode && !matchBarcode) {
          return false;
        }
      }
      return true;
    });

    const groupsMap = new Map<string, ReturnType<typeof resolvePricingRow>[]>();
    filtered.forEach((item) => {
      const gName =
        groupByField === 'category'
          ? (item.category || 'غير مصنف').trim()
          : (item.scientificName || item.category || 'غير مصنف').trim();

      if (!groupsMap.has(gName)) {
        groupsMap.set(gName, []);
      }
      groupsMap.get(gName)!.push(resolvePricingRow(item));
    });

    const sortedGroups = Array.from(groupsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'ar'))
      .map(([groupName, items]) => ({
        groupName,
        items: items.sort((x, y) => x.tradeName.localeCompare(y.tradeName, 'ar')),
      }));

    return {
      groupedData: sortedGroups,
      allGroupNames: Array.from(groupSet).sort((a, b) => a.localeCompare(b, 'ar')),
      totalMatchedItems: filtered.length,
    };
  }, [medicinesData, groupByField, selectedGroup, onlyInStock, searchQuery, terms]);

  // تصدير إلى ملف CSV / Excel
  const handleExportExcel = () => {
    const rows: string[][] = [
      [companyInfo.name, `الهاتف: ${companyInfo.phone}`, `التاريخ: ${new Date().toLocaleDateString('ar-EG')}`],
      [],
      [
        'الشركة / المجموعة',
        'كود الصنف',
        'اسم الصنف',
        'الوحدة',
        'سعر البيع (جملة)',
        'سعر التجزئة',
        ...(showQuantityCol ? ['الكمية المتاحة'] : []),
      ],
    ];

    groupedData.forEach((group) => {
      group.items.forEach((item) => {
        rows.push([
          group.groupName,
          item.code,
          item.tradeName,
          item.unitDisplay,
          item.wholesalePrice.toFixed(2),
          item.retailPrice.toFixed(2),
          ...(showQuantityCol ? [String(item.baseQty)] : []),
        ]);
      });
    });

    const csvContent =
      '\uFEFF' +
      rows
        .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `price-list-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      {/* تنسيق الطباعة المخصص لورق A4 */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #price-list-printable,
          #price-list-printable * {
            visibility: visible !important;
          }
          #price-list-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 12px !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          .company-group-block {
            break-inside: avoid-page;
            margin-bottom: 18px !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          tr {
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* شريط التحكم العلوي (لا يظهر في الطباعة) */}
        <div className="no-print bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-black">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800">
                تقرير قائمة الأسعار (حسب الشركة)
              </h2>
              <p className="text-xs text-slate-500">
                اسم الصنف • الوحدة • سعر البيع (الجملة) • سعر التجزئة • الكمية — مجمّع حسب الشركة
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl bg-[#00A8A8] hover:bg-[#008f8f] text-white px-4 py-2 text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* شريط الفلاتر وخيارات العرض (لا يظهر في الطباعة) */}
        <div className="no-print bg-white border-b border-slate-200 px-4 sm:px-6 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          {/* البحث */}
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم الصنف أو الشركة..."
              className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          {/* طريقة التجميع */}
          <div>
            <select
              value={groupByField}
              onChange={(e) => {
                setGroupByField(e.target.value as 'category' | 'scientificName');
                setSelectedGroup('ALL');
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
            >
              <option value="category">تجميع حسب: الشركة / التصنيف ({terms.categoryLabel})</option>
              <option value="scientificName">تجميع حسب: العلامة التجارية / البيان</option>
            </select>
          </div>

          {/* اختيار شركة محددة أو الكل */}
          <div>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
            >
              <option value="ALL">جميع الشركات ({allGroupNames.length} شركة/مجموعة)</option>
              {allGroupNames.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* خيارات إظهار الكمية والأرصدة المتاحة */}
          <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span>المتوفر فقط</span>
            </label>

            <button
              type="button"
              onClick={() => setShowQuantityCol((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                showQuantityCol
                  ? 'bg-teal-50 text-teal-800 border-teal-200'
                  : 'bg-slate-200 text-slate-600 border-slate-300'
              }`}
              title="إظهار أو إخفاء عمود الكمية في الطباعة"
            >
              {showQuantityCol ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>عمود الكمية</span>
            </button>
          </div>
        </div>

        {/* منطقة التقرير القابلة للطباعة */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/70">
          <div
            id="price-list-printable"
            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-8 max-w-5xl mx-auto space-y-6"
          >
            {/* 1. ترويسة التقرير العلوية: اسم الشركة + اللوقو + الأرقام */}
            <div className="border-b-2 border-slate-800 pb-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* بيانات الشركة (يمين) */}
              <div className="flex items-center gap-4 text-center sm:text-right">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-slate-200 bg-white p-1.5 flex items-center justify-center shrink-0 shadow-xs">
                  <img
                    src={companyInfo.logoUrl}
                    alt={companyInfo.name}
                    className="w-full h-full object-contain rounded-xl"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/logo.png';
                    }}
                  />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {companyInfo.name}
                  </h1>
                  <div className="mt-1.5 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-xs font-bold text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-teal-600" />
                      <span>الهاتف / الأرقام:</span>
                      <span dir="ltr" className="font-mono text-slate-900">
                        {companyInfo.phone}
                      </span>
                    </span>
                    {companyInfo.taxNumber && (
                      <span>
                        الرقم الضريبي:{' '}
                        <strong className="font-mono text-slate-900">{companyInfo.taxNumber}</strong>
                      </span>
                    )}
                  </div>
                  {companyInfo.address && (
                    <p className="text-xs text-slate-500 mt-1">{companyInfo.address}</p>
                  )}
                </div>
              </div>

              {/* عنوان التقرير والتاريخ (يسار) */}
              <div className="text-center sm:text-left bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 shrink-0">
                <div className="text-base sm:text-lg font-black text-[#582949]">
                  قائمة الأسعار المعتمدة
                </div>
                <div className="text-xs font-bold text-slate-500 mt-0.5">
                  تاريخ الإصدار:{' '}
                  <span className="font-mono text-slate-800">
                    {new Date().toLocaleDateString('ar-EG', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    })}
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-teal-700 mt-1">
                  عدد الشركات: {groupedData.length} | إجمالي الأصناف: {totalMatchedItems}
                </div>
              </div>
            </div>

            {/* 2. جداول الأصناف مقسمة على شكل قروبات حسب الشركة */}
            {isLoading ? (
              <div className="py-16 text-center text-slate-500 font-bold">
                جارٍ تحميل قائمة الأصناف والأسعار...
              </div>
            ) : groupedData.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-bold">
                لا توجد أصناف مطابقة للفلتر المحدد.
              </div>
            ) : (
              <div className="space-y-6">
                {groupedData.map((group, groupIdx) => (
                  <div
                    key={group.groupName}
                    className="company-group-block rounded-xl border border-slate-300 overflow-hidden"
                  >
                    {/* رأس القروب: اسم الشركة التابعة لها الأصناف */}
                    <div className="bg-slate-100 border-b border-slate-300 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#582949]" />
                        <span className="text-sm font-black text-slate-900">
                          {groupIdx + 1}. شركة / مجموعة: {group.groupName}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                        {group.items.length} صنف
                      </span>
                    </div>

                    {/* جدول أصناف الشركة */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-300 text-slate-700 text-xs font-black">
                            <th className="py-2.5 px-3 border-l border-slate-200 w-10 text-center">
                              #
                            </th>
                            <th className="py-2.5 px-3 border-l border-slate-200">
                              اسم الصنف
                            </th>
                            <th className="py-2.5 px-3 border-l border-slate-200 w-44 text-center">
                              الوحدة
                            </th>
                            <th className="py-2.5 px-3 border-l border-slate-200 w-36 text-center bg-teal-50/50 text-teal-900">
                              سعر البيع (جملة)
                            </th>
                            <th className="py-2.5 px-3 border-l border-slate-200 w-36 text-center bg-amber-50/50 text-amber-900">
                              سعر التجزئة
                            </th>
                            {showQuantityCol && (
                              <th className="py-2.5 px-3 w-40 text-center">
                                الكمية
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-xs">
                          {group.items.map((item, idx) => (
                            <tr
                              key={item.id}
                              className="hover:bg-slate-50/80 transition"
                            >
                              <td className="py-2 px-3 border-l border-slate-200 text-center font-mono text-slate-500">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 border-l border-slate-200">
                                <div className="font-bold text-slate-900 text-xs sm:text-sm">
                                  {item.tradeName}
                                </div>
                                {item.scientificName &&
                                  groupByField !== 'scientificName' && (
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                      {item.scientificName}
                                    </div>
                                  )}
                              </td>
                              <td className="py-2 px-3 border-l border-slate-200 text-center font-semibold text-slate-700">
                                {item.unitDisplay}
                              </td>
                              <td className="py-2 px-3 border-l border-slate-200 text-center font-mono font-black text-teal-800 bg-teal-50/20 text-sm">
                                {item.wholesalePrice.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td className="py-2 px-3 border-l border-slate-200 text-center font-mono font-black text-amber-800 bg-amber-50/20 text-sm">
                                {item.retailPrice.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              {showQuantityCol && (
                                <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                                  {item.formattedQty}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* تذييل التقرير */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span>{companyInfo.name} — قائمة الأسعار المعتمدة</span>
              <span>تم استخراج التقرير آلياً عبر منصة MadarCore ERP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
