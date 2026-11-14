import React from 'react';
import { StockCount } from '../../api/stock-count';
import { User, ClipboardCheck, Calculator, ShieldCheck, Clock } from 'lucide-react';

interface Props {
  stockCount: StockCount;
}

export const CountTimeline: React.FC<Props> = ({ stockCount }) => {
  const steps = [
    {
      icon: <User size={16} />,
      label: 'إنشاء الجرد',
      user: stockCount.createdBy?.name,
      date: stockCount.startedAt,
      color: 'text-violet-600 bg-violet-50 border-violet-200',
      completed: true,
    },
    {
      icon: <ClipboardCheck size={16} />,
      label: 'تسجيل العد الفعلي',
      user: stockCount.countedBy?.name,
      date: stockCount.countedAt,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      completed: !!stockCount.countedAt,
    },
    {
      icon: <Calculator size={16} />,
      label: 'مطابقة الفروقات',
      user: stockCount.reconciledBy?.name,
      date: stockCount.reconciledAt,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      completed: !!stockCount.reconciledAt,
    },
    {
      icon: <ShieldCheck size={16} />,
      label: 'الاعتماد النهائي والترحيل',
      user: stockCount.approvedBy?.name,
      date: stockCount.approvedAt,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      completed: !!stockCount.approvedAt,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Clock size={18} className="text-slate-500" />
        سلسلة المسؤوليات والرقابة (Audit Trail)
      </h3>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
                step.completed ? step.color : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              {step.icon}
            </div>
            <div className="flex-1 pt-1">
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${step.completed ? 'text-slate-800' : 'text-slate-400'}`}>
                  {step.label}
                </p>
                {step.date && (
                  <span className="text-xs text-slate-400 font-mono">
                    {new Date(step.date).toLocaleString('ar-EG')}
                  </span>
                )}
              </div>
              {step.user && (
                <p className="text-xs text-slate-500 mt-0.5">👤 المسؤول: {step.user}</p>
              )}
              {!step.completed && (
                <p className="text-xs text-slate-400 mt-0.5">في انتظار الإجراء</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {stockCount.cancelReason && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
          <p className="text-xs font-bold text-rose-700 mb-1">سبب الإلغاء المسجل:</p>
          <p className="text-sm text-rose-800">{stockCount.cancelReason}</p>
        </div>
      )}
    </div>
  );
};
