import React from 'react';
import { X, CheckCircle2, BookOpen, Calculator, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const LandedCostHelpModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">
                دليل المعالجة المحاسبية وتكليف المخزون (Landed Cost Guide)
              </h3>
              <p className="text-xs text-slate-500">
                شرح الفرق بين خيارات توزيع المصاريف الإضافية (نولون، عتالة، رسوم محلية) والقيود المتولدة آلياً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-5 text-xs text-slate-700 leading-relaxed">
          {/* Card: Option 2 (Default / Recommended) */}
          <div className="rounded-xl border-2 border-teal-500 bg-teal-50/40 p-4 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                  2
                </span>
                <h4 className="font-bold text-teal-900 text-sm">
                  الخيار الثاني [الأساس والموصى به]: تحميل على تكلفة الأصناف وتعلية المخزون (Landed Cost)
                </h4>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-600 text-white shadow-sm">
                ⭐ الخيار الافتراضي المعتمد
              </span>
            </div>

            <p className="text-slate-600">
              وفقاً للمعيار المحاسبي الدولي <strong>(IAS 2 - تقييم المخزون)</strong>، تُوزع مصاريف الشحن والعتالة والرسوم نسبياً على سعر تكلفة كل دواء بحسب وزنه المالي في الفاتورة.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-teal-200">
              <div>
                <span className="font-bold text-teal-800 block mb-1">📦 الأثر على المخزون وبطاقة الصنف:</span>
                <p className="text-slate-600">
                  ترتفع تكلفة الوحدة (Unit Cost) في دفعة المخزون (مثلاً: دواء سعره 10 ج.س تصبح تكلفته التوريدية الفعلية 11 ج.س بعد إضافة نصيبه من النولون).
                </p>
              </div>
              <div>
                <span className="font-bold text-teal-800 block mb-1">⚖️ القيد المحاسبي المتولد تلقائياً:</span>
                <div className="bg-slate-50 p-2 rounded font-mono text-[11px] text-slate-800 space-y-1 border border-slate-200">
                  <div className="text-emerald-700 font-bold">من حـ/ مخزون الأدوية (1104) [التكلفة الكلية]</div>
                  <div className="text-slate-600 pr-3">إلى حـ/ الموردين (2101) [قيمة البضاعة الآجلة]</div>
                  <div className="text-slate-600 pr-3">إلى حـ/ الصندوق (1101) [سداد النولون والعتالة نقداً]</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-teal-800 text-[11px] font-semibold">
              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
              <span>يحمي هوامش ربح الصيدلية ويمنع بيع الدواء بربح وهمي، لأن تكلفة البضاعة المباعة (COGS) تكون حقيقية 100%.</span>
            </div>
          </div>

          {/* Card: Option 1 */}
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-500 text-white flex items-center justify-center font-bold text-xs">
                  1
                </span>
                <h4 className="font-bold text-slate-900 text-sm">
                  الخيار الأول: تسجيل كمصروف تشغيلي مستقل (Period Expense)
                </h4>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200 text-slate-700">
                مناسب للمصاريف الطفيفة
              </span>
            </div>

            <p className="text-slate-600">
              تبقى تكلفة شراء الدواء في المستودع كما جاءت في فاتورة المورد، وتُقيد المصاريف الإضافية كمصروف تشغيلي عام للفترة في قائمة الدخل.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-slate-200">
              <div>
                <span className="font-bold text-slate-800 block mb-1">📦 الأثر على المخزون:</span>
                <p className="text-slate-600">
                  لا تتغير تكلفة الأدوية في كرت الصنف (تبقى 10 ج.س)، وتبقى التشغيلة مسجلة بسعر الشراء الأساسي فقط.
                </p>
              </div>
              <div>
                <span className="font-bold text-slate-800 block mb-1">⚖️ القيد المحاسبي المتولد تلقائياً:</span>
                <div className="bg-slate-50 p-2 rounded font-mono text-[11px] text-slate-800 space-y-1 border border-slate-200">
                  <div className="text-emerald-700 font-bold">من حـ/ مخزون الأدوية (1104) [سعر الشراء]</div>
                  <div className="text-amber-700 font-bold">من حـ/ مصاريف نقل ومشتريات (5204) [النولون]</div>
                  <div className="text-slate-600 pr-3">إلى حـ/ الموردين (2101) [استحقاق المورد]</div>
                  <div className="text-slate-600 pr-3">إلى حـ/ الصندوق (1101) [سداد النولون نقداً]</div>
                </div>
              </div>
            </div>
          </div>

          {/* Example Calculation Table */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <h5 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <Calculator className="w-4 h-4 text-teal-600" />
              <span>مثال توضيحي بالأرقام (فاتورة بـ 4,000 ج.س + مصاريف نولون وعتالة 400 ج.س):</span>
            </h5>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px] border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="p-2 border-b">وجه المقارنة</th>
                    <th className="p-2 border-b text-teal-800 bg-teal-50/70">الخيار الثاني (Landed Cost) - الأساس</th>
                    <th className="p-2 border-b text-slate-700">الخيار الأول (Period Expense)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-2 font-semibold text-slate-600">تكلفة الدواء (أ) الأساسية 10 ج.س</td>
                    <td className="p-2 font-bold text-teal-700 bg-teal-50/30">11.00 ج.س (ارتفعت بنصيب النولون)</td>
                    <td className="p-2 font-semibold text-slate-700">10.00 ج.س (دون تغيير)</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-semibold text-slate-600">تكلفة الدواء (ب) الأساسية 30 ج.س</td>
                    <td className="p-2 font-bold text-teal-700 bg-teal-50/30">33.00 ج.س (ارتفعت بنصيب النولون)</td>
                    <td className="p-2 font-semibold text-slate-700">30.00 ج.س (دون تغيير)</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-semibold text-slate-600">قيد المخزون المدين</td>
                    <td className="p-2 font-mono text-teal-700 bg-teal-50/30">4,400 ج.س (شامل المصاريف)</td>
                    <td className="p-2 font-mono text-slate-700">4,000 ج.س فقط (+ 400 ج.س كمصروف)</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-semibold text-slate-600">هامش الربح عند البيع بـ 15 ج.س</td>
                    <td className="p-2 font-bold text-teal-700 bg-teal-50/30">4.00 ج.س (ربح فعلي حقيقي)</td>
                    <td className="p-2 font-semibold text-rose-600">5.00 ج.س (ربح ظاهري غير دقيق)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
          >
            فهمت، إغلاق الدليل
          </button>
        </div>
      </div>
    </div>
  );
};
